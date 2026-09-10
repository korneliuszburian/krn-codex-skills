#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applyInstall, createInstallPlan, inspectInstall } from "./lib/install-release.mjs";
import { inspectSpineState } from "./lib/state-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = `Usage:
  krn-codex install plan [--source REF|PATH] [--json]
  krn-codex install apply [--source REF|PATH] --yes [--json]
  krn-codex install check [--json]
  krn-codex doctor [--json]
  krn-codex capability <inventory|usage|profile|plan|apply|check> [...args]
  krn-codex repo <inspect|apply> [...args]
  krn-codex state check [PATH] [--json]`;

function fail(message, code = 64) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}

function parseOptions(args) {
  const positional = [];
  const options = { json: false, yes: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--source") {
      options.source = args[++index];
      if (!options.source) fail("--source requires REF or PATH");
    } else if (arg.startsWith("--")) fail(`unknown option: ${arg}`);
    else positional.push(arg);
  }
  return { positional, options };
}

function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === "string") process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function delegate(script, args) {
  const result = spawnSync(process.execPath, [path.join(root, script), ...args], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
}

try {
  const raw = process.argv.slice(2);
  if (raw[0] === "capability") {
    delegate("scripts/catalog.mjs", raw.slice(1));
  } else if (raw[0] === "repo") {
    delegate("skills/engineering/setup-repository-workflow/scripts/init-repository-workflow.mjs", raw.slice(1));
  } else if (raw[0] === "state") {
    const { positional, options } = parseOptions(raw.slice(1));
    if (positional[0] !== "check" || positional.length > 2 || options.source || options.yes) fail(usage);
    let report;
    try {
      report = inspectSpineState({ repo: positional[1] ?? process.cwd() });
    } catch (error) {
      fail(error.message, 64);
    }
    print(report, options.json);
    if (report.status === "divergent") process.exitCode = 1;
  } else {
  const { positional, options } = parseOptions(raw);
  if (positional[0] === "install") {
    if (positional.length !== 2) fail(usage);
    const command = positional[1];
    if (command === "check") {
      const report = inspectInstall();
      print(report, options.json);
      if (report.filesystem.status !== "filesystem_installed") process.exitCode = 3;
    } else if (command === "plan" || command === "apply") {
      const plan = createInstallPlan({ source: options.source, cwd: process.cwd() });
      if (command === "plan") {
        print({ source: plan.source, commit: plan.commit, release: plan.release, runtimePaths: plan.runtimePaths }, options.json);
      } else {
        if (!options.yes) fail("install apply requires --yes");
        const applied = applyInstall(plan);
        print({ commit: applied.commit, release: applied.release, current: applied.current, backup: applied.backup, idempotent: applied.idempotent }, options.json);
      }
    } else fail(usage);
  } else if (positional[0] === "doctor") {
    if (positional.length !== 1 || options.source || options.yes) fail(usage);
    print(inspectInstall(), options.json);
  } else {
    print(usage, false);
    process.exitCode = 64;
  }
  }
} catch (error) {
  process.stderr.write(`krn-codex: ${error.message}\n`);
  process.exitCode = error.exitCode || 1;
}
