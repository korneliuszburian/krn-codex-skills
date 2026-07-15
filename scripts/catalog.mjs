#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import process from "node:process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  HARD_QUARANTINE_FAMILIES,
  getCapabilityProfile,
  inventoryCapabilities,
  loadCapabilityProfiles,
} from "./lib/catalog-inventory.mjs";
import {
  applyCatalogConfigPlan,
  loadCatalogConfigPlan,
} from "./lib/catalog-config.mjs";
import { resolveProfile } from "./lib/catalog-profile.mjs";
import { scanCatalogUsage } from "./lib/catalog-usage.mjs";

const EXIT_USAGE = 64;
const EXIT_DRIFT = 3;
const OPTIONAL_CAPABILITY_PATTERNS = Object.freeze({
  asana: /(?:^|[_@.:-])asana(?:[_@.:-]|$)/i,
  canva: /(?:^|[_@.:-])canva(?:[_@.:-]|$)/i,
  figma: /(?:^|[_@.:-])figma(?:[_@.:-]|$)/i,
  github: /(?:^|[_@.:-])github(?:[_@.:-]|$)/i,
  gmail: /(?:^|[_@.:-])gmail(?:[_@.:-]|$)/i,
  "google-calendar": /(?:google[_-]?calendar|calendar__)/i,
  "hugging-face": /(?:hugging[_-]?face|huggingface)/i,
  gsap: /(?:^|[_@.:-])gsap(?:[_@.:-]|$)/i,
  "agent-browser": /(?:agent[_-]?browser)/i,
  context7: /(?:^|[_@.:-])context7(?:[_@.:-]|$)/i,
  "openai-templates": /(?:openai[_-]?templates)/i,
});

const usage = `KRN Codex capability catalog

Usage:
  catalog inventory [--json]
  catalog usage [--days N] [--json]
  catalog profile list [--json]
  catalog profile show <name> [--json]
  catalog plan <profile> [--json]
  catalog apply <profile> [--json]
  catalog check <profile> [--json]

Options:
  --config PATH         Codex config (default: $CODEX_HOME/config.toml)
  --profiles PATH       capability profile document
  --sessions-root PATH  rollout root (default: $CODEX_HOME/sessions)
  --days N              usage window (default: 30)
  --json                machine-readable output

Mutations happen only through the explicit apply command. A new Codex session
is required before changed plugin, MCP, or skill exposure is observable.`;

function fail(message, exitCode = 1) {
  const error = new Error(message);
  error.exitCode = exitCode;
  throw error;
}

function parseArguments(argv) {
  const options = { json: false, days: 30 };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      options.json = true;
      continue;
    }
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (["--config", "--profiles", "--sessions-root", "--days"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        fail(`${argument} requires a value`, EXIT_USAGE);
      }
      index += 1;
      const key = {
        "--config": "configPath",
        "--profiles": "profilesPath",
        "--sessions-root": "sessionsRoot",
        "--days": "days",
      }[argument];
      options[key] = key === "days" ? Number(value) : value;
      continue;
    }
    if (argument.startsWith("--")) {
      fail(`unknown option: ${argument}`, EXIT_USAGE);
    }
    positional.push(argument);
  }

  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3650) {
    fail("--days must be an integer from 1 to 3650", EXIT_USAGE);
  }
  return { options, positional };
}

function countBy(records, field) {
  return Object.fromEntries(
    [...records.reduce((counts, record) => {
      const key = record[field] || "unknown";
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map())].sort(([left], [right]) => left.localeCompare(right)),
  );
}

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function publicPlan(plan) {
  return {
    changed: plan.changed,
    originalHash: plan.originalHash,
    nextHash: plan.nextHash,
    actions: plan.actions,
  };
}

function printInventory(inventory) {
  console.log(`Skills:  ${inventory.skills.length}`);
  console.log(`Cached plugin candidates: ${inventory.plugins.length}`);
  console.log(`Quarantine evidence: ${inventory.hardQuarantine.length}`);
  console.log("");
  console.log("Skill families:");
  for (const [family, count] of Object.entries(countBy(inventory.skills, "family"))) {
    console.log(`  ${family.padEnd(24)} ${count}`);
  }
  console.log("");
  console.log("Cached plugin candidates (not installation proof):");
  for (const plugin of inventory.plugins) {
    console.log(`  ${plugin.id}${plugin.currentVersion ? ` (${plugin.currentVersion})` : ""}`);
  }
  if (inventory.hardQuarantine.length > 0) {
    console.log("");
    console.log("Hard quarantine is active. Quarantined paths were not inspected.");
  }
}

function printUsage(result, inventory) {
  const rows = [...result.aggregates].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
  );
  console.log("Optional capability evidence:");
  console.log("CAPABILITY          EVENTS LAST");
  for (const [capability, pattern] of Object.entries(OPTIONAL_CAPABILITY_PATTERNS)) {
    const matching = rows.filter((row) => pattern.test(row.id));
    const events = matching.reduce(
      (total, row) =>
        total + row.confirmed_calls + row.observed_calls + row.observed_reads,
      0,
    );
    const lastSeen = matching
      .map((row) => row.last_seen_day)
      .filter(Boolean)
      .sort()
      .at(-1);
    console.log(
      `${capability.padEnd(19)} ${String(events).padStart(6)} ` +
        `${lastSeen || "-"}`,
    );
  }

  const skillRows = rows.filter((row) => row.kind === "skill");
  if (skillRows.length > 0) {
    console.log("");
    console.log("Observed skill-body reads:");
    for (const row of skillRows) {
      console.log(
        `  ${row.id.padEnd(48)} ${String(row.observed_reads).padStart(4)}  ` +
          `${row.last_seen_day || "-"}  ${row.confidence}`,
      );
    }
  }
  const observedSkills = new Set(
    rows.filter((row) => row.kind === "skill").map((row) => row.id),
  );
  const noReadEvidence = inventory.skills.filter(
    (skill) => !observedSkills.has(skill.id),
  ).length;
  console.log("");
  console.log(
    `Coverage: ${result.scanned_files} files, ${result.scanned_bytes} bytes, ` +
      `${noReadEvidence} discovered skills without observed reads.`,
  );
  const oversizedCandidates = result.coverage.oversized_candidate_lines || 0;
  const undatedCandidates = result.coverage.records_without_usable_date || 0;
  console.log(
    `Dropped candidate records: ${result.malformed_lines} malformed, ` +
      `${oversizedCandidates} above ${result.coverage.max_record_bytes} bytes, ` +
      `${undatedCandidates} without a usable date.`,
  );
  if (result.malformed_lines + oversizedCandidates + undatedCandidates > 0) {
    console.log("Evidence is incomplete for the dropped candidate records.");
  }
  console.log(
    "Absence of evidence never disables a capability automatically; implicit skill invocation is not fully observable.",
  );
}

function printProfile(name, profile) {
  console.log(`${name}: ${profile.description}`);
  for (const [surface, policy] of Object.entries(profile)) {
    if (surface === "description") continue;
    console.log("");
    console.log(`${surface}:`);
    for (const [key, values] of Object.entries(policy)) {
      console.log(`  ${key}: ${Array.isArray(values) ? values.join(", ") || "-" : values}`);
    }
  }
}

function displayTarget(action) {
  if (action.resource !== "skill") return action.target;
  return path.basename(path.dirname(action.target));
}

function cachedPluginFamily(skillPath) {
  const match = skillPath.replaceAll("\\", "/").match(
    /\/plugins\/cache\/[^/]+\/([^/]+)\/[^/]+\/skills\//,
  );
  return match?.[1] || "unknown-plugin";
}

function printPlan(name, resolved, plan) {
  console.log(`${name}: ${plan.changed ? `${plan.actions.length} config change(s)` : "already converged"}`);
  const pluginSkillDisables = plan.actions.filter(
    (action) =>
      action.resource === "skill" &&
      action.enabled === false &&
      ["desired-state", "disabled-parent-plugin"].includes(action.reason) &&
      cachedPluginFamily(action.target) !== "unknown-plugin",
  );
  const pluginSkillDisableSet = new Set(pluginSkillDisables);
  for (const action of plan.actions.filter(
    (candidate) => !pluginSkillDisableSet.has(candidate),
  )) {
    const state = typeof action.enabled === "boolean" ? ` -> ${action.enabled ? "on" : "off"}` : "";
    console.log(
      `  ${action.operation.toUpperCase().padEnd(6)} ` +
        `${action.resource.padEnd(11)} ${displayTarget(action)}${state}`,
    );
  }
  if (pluginSkillDisables.length > 0) {
    const grouped = countBy(
      pluginSkillDisables.map((action) => ({ family: cachedPluginFamily(action.target) })),
      "family",
    );
    console.log(
      `  APPLY  ${String(pluginSkillDisables.length).padStart(2)} plugin-cache skill disables: ` +
        Object.entries(grouped)
          .map(([family, count]) => `${family} (${count})`)
          .join(", "),
    );
    console.log("         use --json for every exact version-pinned path");
  }
  if (resolved.unresolved.plugins.length || resolved.unresolved.skills.length) {
    console.log("");
    console.log(
      `Not currently discovered: ${[
        ...resolved.unresolved.plugins,
        ...resolved.unresolved.skills,
      ].join(", ")}`,
    );
  }
  if (resolved.apps.enable.length || resolved.apps.disable.length) {
    console.log("");
    console.log(
      `Apps/connectors are ${resolved.apps.mode}: enable [${resolved.apps.enable.join(", ")}], ` +
        `disable [${resolved.apps.disable.join(", ")}].`,
    );
  }
}

async function main() {
  const { options, positional } = parseArguments(process.argv.slice(2));
  if (options.help || positional.length === 0 || positional[0] === "help") {
    console.log(usage);
    return;
  }

  const homeDirectory = os.homedir();
  const codexHome = process.env.CODEX_HOME || path.join(homeDirectory, ".codex");
  const agentsHome = process.env.KRN_AGENTS_HOME || path.join(homeDirectory, ".agents");
  const configPath = path.resolve(options.configPath || path.join(codexHome, "config.toml"));
  const sessionsRoot = path.resolve(options.sessionsRoot || path.join(codexHome, "sessions"));
  const profileDocument = await loadCapabilityProfiles(options.profilesPath);
  const command = positional[0];

  if (command === "profile") {
    const operation = positional[1];
    if (operation === "list" && positional.length === 2) {
      const result = Object.entries(profileDocument.profiles).map(([name, profile]) => ({
        name,
        description: profile.description,
      }));
      if (options.json) printJson(result);
      else for (const item of result) console.log(`${item.name.padEnd(10)} ${item.description}`);
      return;
    }
    if (operation === "show" && positional.length === 3) {
      const name = positional[2];
      const profile = getCapabilityProfile(profileDocument, name);
      if (options.json) printJson({ name, ...profile });
      else printProfile(name, profile);
      return;
    }
    fail("usage: catalog profile list | catalog profile show <name>", EXIT_USAGE);
  }

  const inventory = await inventoryCapabilities({ homeDirectory, codexHome, agentsHome });
  if (command === "inventory" && positional.length === 1) {
    if (options.json) printJson(inventory);
    else printInventory(inventory);
    return;
  }

  if (command === "usage" && positional.length === 1) {
    const result = await scanCatalogUsage({
      sessionsRoot,
      sinceDays: options.days,
      canonicalSkillPaths: [
        ...inventory.skills.flatMap(({ id, path: skillPath, targetPath }) => [
          { id, path: skillPath },
          ...(targetPath ? [{ id, path: targetPath }] : []),
        ]),
        ...inventory.plugins.flatMap((plugin) =>
          (plugin.allSkillPaths || plugin.skillPaths).map((skillPath) => ({
            id: `${plugin.id}:${path.basename(path.dirname(skillPath))}`,
            path: skillPath,
          })),
        ),
      ],
    });
    if (options.json) printJson(result);
    else printUsage(result, inventory);
    return;
  }

  if (!["plan", "apply", "check"].includes(command) || positional.length !== 2) {
    fail(`unknown command\n\n${usage}`, EXIT_USAGE);
  }

  const profileName = positional[1];
  const profile = getCapabilityProfile(profileDocument, profileName);
  const resolved = resolveProfile(
    profile,
    inventory,
    profileDocument.hardQuarantine,
    profileDocument.pluginSkillAliases,
  );
  const plan = await loadCatalogConfigPlan({
    configPath,
    desired: resolved.desired,
    pluginSkillAliases: profileDocument.pluginSkillAliases,
    quarantineFamilies: HARD_QUARANTINE_FAMILIES,
  });

  if (command === "plan") {
    if (options.json) {
      printJson({ profile: profileName, configPath, resolved, plan: publicPlan(plan) });
    }
    else printPlan(profileName, resolved, plan);
    return;
  }

  if (command === "check") {
    if (options.json) {
      printJson({
        profile: profileName,
        converged: !plan.changed,
        resolved,
        plan: publicPlan(plan),
      });
    }
    else printPlan(profileName, resolved, plan);
    if (plan.changed) process.exitCode = EXIT_DRIFT;
    return;
  }

  const result = await applyCatalogConfigPlan({ configPath, plan });
  if (options.json) {
    printJson({ profile: profileName, resolved, plan: publicPlan(plan), result });
  } else {
    printPlan(profileName, resolved, plan);
    if (result.changed) {
      console.log("");
      console.log(`Applied atomically. Backup: ${result.backupPath}`);
      console.log("Start a new Codex session to observe the new capability surface.");
    }
  }
}

const directEntrypoint = (() => {
  if (!process.argv[1]) return false;
  try {
    return (
      realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
})();
if (directEntrypoint) {
  main().catch((error) => {
    console.error(`catalog: ${error.message}`);
    process.exitCode = error.exitCode || 1;
  });
}
