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
import { canonicalSkillEntries } from "./lib/catalog/catalog-usage.mjs";
import {
  configurationStateContract,
  externalStateBoundary,
  printInventory,
  printJson,
  printPlan,
  printProfile,
  printUsage,
  publicPlan,
  usageStateContract,
} from "./lib/catalog/catalog-report.mjs";

import { parseCliArgs } from "./lib/kernel/cli.mjs";
import { EXIT_CODES, fail } from "./lib/support/diagnostics.mjs";

const EXIT_USAGE = EXIT_CODES.USAGE;
const EXIT_DRIFT = 3;

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
  const { options, positional } = parseCliArgs(argv, {
    booleans: { "--json": "json", "--help": "help", "-h": "help" },
    values: {
      "--config": "configPath",
      "--profiles": "profilesPath",
      "--sessions-root": "sessionsRoot",
      "--days": "days",
    },
    defaults: { json: false, days: 30 },
    fail: (message) => fail(message, EXIT_USAGE),
  });
  if (typeof options.days === "string") options.days = Number(options.days);
  if (!Number.isInteger(options.days) || options.days < 1 || options.days > 3650) {
    fail("--days must be an integer from 1 to 3650", EXIT_USAGE);
  }
  return { options, positional };
}

async function main() {
  const { options, positional } = parseArguments(process.argv.slice(2));
  if (options.help || positional[0] === "help") {
    console.log(usage);
    return;
  }
  if (positional.length === 0) {
    console.error(usage);
    process.exitCode = EXIT_USAGE;
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
  process.exitCode = error.exitCode || (/^Unknown capability profile/.test(error.message) ? EXIT_USAGE : 1);
});
