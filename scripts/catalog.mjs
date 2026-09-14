#!/usr/bin/env node

import os from "node:os";
import path from "node:path";
import process from "node:process";

import {
  HARD_QUARANTINE_FAMILIES,
  getCapabilityProfile,
  inventoryCapabilities,
  loadCapabilityProfiles,
} from "./lib/catalog/catalog-inventory.mjs";
import {
  applyCatalogConfigPlan,
  loadCatalogConfigPlan,
} from "./lib/catalog/catalog-config.mjs";
import { resolveProfile } from "./lib/catalog/catalog-profile.mjs";
import { scanCatalogUsage } from "./lib/catalog/catalog-usage.mjs";
import { canonicalSkillEntries } from "./lib/catalog/catalog-usage-paths.mjs";

import { EXIT_CODES, fail } from "./lib/support/diagnostics.mjs";

const EXIT_USAGE = EXIT_CODES.USAGE;
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
const EVIDENCE_CONFIDENCE = Object.freeze({
  confirmed: { label: "high", rank: 3 },
  confirmed_input: { label: "medium", rank: 2 },
  syntactic_only: { label: "lower", rank: 1 },
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

function externalStateBoundary() {
  return {
    loaded_in_current_session: "unknown",
    account_connected_and_authorized: "report-only",
  };
}

function configurationStateContract() {
  return {
    profile: "declared",
    inventory: "discovered_candidate",
    local_configuration: "configured_enabled",
    ...externalStateBoundary(),
  };
}

function usageRows(aggregates) {
  return [...aggregates].sort((left, right) =>
    `${left.kind}:${left.id}`.localeCompare(`${right.kind}:${right.id}`),
  );
}

function usageStateContract(result) {
  const rows = usageRows(result.aggregates);
  const droppedCandidates =
    result.malformed_lines +
    (result.coverage.oversized_candidate_lines || 0) +
    (result.coverage.records_without_usable_date || 0) +
    // A file named for a day before the window is skipped, but a resumed session
    // appends in-window records to it, so its records are unaccounted for.
    (result.coverage.skipped_files_before_window || 0);

  return {
    evidence_window: {
      since_day: result.coverage.since_day,
      through_day: result.coverage.through_day,
    },
    evidence_incomplete: droppedCandidates > 0,
    ...externalStateBoundary(),
    optional_capabilities: Object.entries(OPTIONAL_CAPABILITY_PATTERNS).map(
      ([capability, pattern]) => {
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
        const confidence = matching.reduce((best, row) => {
          const candidate = EVIDENCE_CONFIDENCE[row.confidence];
          if (candidate === undefined || candidate.rank <= (best?.rank || 0)) {
            return best;
          }
          return candidate;
        }, undefined);

        return {
          capability,
          evidence_state: events > 0 ? "observed_used" : "no_evidence",
          evidence_confidence: confidence?.label || null,
          events,
          last_seen_day: lastSeen || null,
        };
      },
    ),
  };
}

function printInventory(inventory) {
  console.log("Capability state: discovered_candidate");
  console.log("Discovery does not prove session loading, account authorization, or use.");
  console.log("");
  console.log(`Discovered skill candidates: ${inventory.skills.length}`);
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
  const state = usageStateContract(result);
  const rows = usageRows(result.aggregates);
  console.log(
    `Evidence window: ${state.evidence_window.since_day} through ` +
      state.evidence_window.through_day,
  );
  console.log(`Evidence incomplete: ${state.evidence_incomplete}`);
  console.log(`loaded_in_current_session: ${state.loaded_in_current_session}`);
  console.log(
    `account_connected_and_authorized: ${state.account_connected_and_authorized}`,
  );
  console.log("");
  console.log("Optional capability observed-use evidence:");
  console.log("CAPABILITY          STATE            EVENTS LAST       CONFIDENCE");
  for (const capability of state.optional_capabilities) {
    console.log(
      `${capability.capability.padEnd(19)} ` +
        `${capability.evidence_state.padEnd(16)} ` +
        `${String(capability.events).padStart(6)} ` +
        `${(capability.last_seen_day || "-").padEnd(10)} ` +
        `${capability.evidence_confidence || "-"}`,
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
  console.log("Capability state: declared");
  console.log(`${name}: ${profile.description}`);
  for (const [surface, policy] of Object.entries(profile)) {
    if (surface === "description") continue;
    console.log("");
    console.log(`${surface}:`);
    for (const [key, values] of Object.entries(policy)) {
      console.log(`  ${key}: ${Array.isArray(values) ? values.join(", ") || "-" : values}`);
    }
  }
  console.log("");
  console.log("loaded_in_current_session: unknown");
  console.log("account_connected_and_authorized: report-only");
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
  console.log("Capability states: declared + discovered_candidate + configured_enabled");
  console.log("loaded_in_current_session: unknown");
  console.log("account_connected_and_authorized: report-only");
  console.log("");
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

  const homeDirectory = path.resolve(os.homedir());
  const codexHome = path.resolve(process.env.CODEX_HOME || path.join(homeDirectory, ".codex"));
  const agentsHome = path.resolve(process.env.AGENTS_HOME || path.join(homeDirectory, ".agents"));
  const configPath = path.resolve(options.configPath || path.join(codexHome, "config.toml"));
  const sessionsRoot = path.resolve(options.sessionsRoot || path.join(codexHome, "sessions"));
  const profilesPath = options.profilesPath === undefined ? undefined : path.resolve(options.profilesPath);
  const profileDocument = await loadCapabilityProfiles(profilesPath);
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
      if (options.json) {
        printJson({
          name,
          capability_states: {
            profile: "declared",
            ...externalStateBoundary(),
          },
          ...profile,
        });
      }
      else printProfile(name, profile);
      return;
    }
    fail("usage: catalog profile list | catalog profile show <name>", EXIT_USAGE);
  }

  const inventory = await inventoryCapabilities({ homeDirectory, codexHome, agentsHome });
  if (command === "inventory" && positional.length === 1) {
    if (options.json) {
      printJson({
        capability_states: {
          inventory: "discovered_candidate",
          ...externalStateBoundary(),
        },
        ...inventory,
      });
    }
    else printInventory(inventory);
    return;
  }

  if (command === "usage" && positional.length === 1) {
    const result = await scanCatalogUsage({
      sessionsRoot,
      sinceDays: options.days,
      canonicalSkillPaths: canonicalSkillEntries(inventory),
    });
    if (options.json) {
      printJson({ ...result, capability_states: usageStateContract(result) });
    }
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
      printJson({
        profile: profileName,
        configPath,
        capability_states: configurationStateContract(),
        resolved,
        plan: publicPlan(plan),
      });
    }
    else printPlan(profileName, resolved, plan);
    return;
  }

  if (command === "check") {
    if (options.json) {
      printJson({
        profile: profileName,
        status: plan.changed ? "drift" : "converged",
        converged: !plan.changed,
        capability_states: configurationStateContract(),
        resolved,
        plan: publicPlan(plan),
      });
    } else {
      printPlan(profileName, resolved, plan);
      console.log(plan.changed
        ? `DRIFT: ${profileName} differs from the desired state; run \`krn-codex capability apply ${profileName}\``
        : `converged: ${profileName} matches the desired state`);
    }
    if (plan.changed) process.exitCode = EXIT_DRIFT;
    return;
  }

  const result = await applyCatalogConfigPlan({ configPath, plan });
  if (options.json) {
    printJson({
      profile: profileName,
      capability_states: configurationStateContract(),
      resolved,
      plan: publicPlan(plan),
      result,
    });
  } else {
    printPlan(profileName, resolved, plan);
    if (result.changed) {
      console.log("");
      console.log(`Applied atomically. Backup: ${result.backupPath}`);
      console.log("Start a new Codex session to observe the new capability surface.");
    }
  }
}

main().catch((error) => {
  console.error(`catalog: ${error.message}`);
  process.exitCode = error.exitCode || 1;
});
