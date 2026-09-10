#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applyInstall, createInstallPlan, inspectInstall } from "./lib/install-release.mjs";
import { inspectSpineState } from "./lib/state-check.mjs";
import { compileCapsule, resumeBrief } from "./lib/state-brief.mjs";
import { checkSkills, exportSkills } from "./lib/skills-export.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = `Usage:
  krn-codex install plan [--source REF|PATH] [--json]
  krn-codex install apply [--source REF|PATH] --yes [--json]
  krn-codex install check [--json]
  krn-codex doctor [--json]
  krn-codex capability <inventory|usage|profile|plan|apply|check> [...args]
  krn-codex repo <inspect|apply> [...args]
  krn-codex state <check|compile|resume> [PATH] [--json]
  krn-codex skills <export|check> --root DIR [--upstream PATH] [--json]`;

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
    } else if (arg === "--root") {
      options.root = args[++index];
      if (!options.root) fail("--root requires a path");
    } else if (arg === "--upstream") {
      options.upstream = args[++index];
      if (!options.upstream) fail("--upstream requires a path");
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
  } else if (raw[0] === "skills") {
    const { positional, options } = parseOptions(raw.slice(1));
    if ((positional[0] !== "export" && positional[0] !== "check") || positional.length > 1 || options.source || options.yes || !options.root) fail(usage);
    try {
      if (positional[0] === "check") {
        const report = checkSkills({ root: options.root });
        print(report, options.json);
        if (report.errors.length) process.exitCode = 1;
      } else {
        const report = exportSkills({ source: root, upstream: options.upstream, root: options.root });
        print(report, options.json);
      }
    } catch (error) {
      fail(error.message, 64);
    }
  } else if (raw[0] === "state") {
    const { positional, options } = parseOptions(raw.slice(1));
    const command = positional[0];
    if (!["check", "compile", "resume"].includes(command) || positional.length > 2 || options.source || options.yes) fail(usage);
    const repo = positional[1] ?? process.cwd();
    let report;
    try {
      report = command === "check"
        ? inspectSpineState({ repo })
        : command === "compile"
          ? compileCapsule({ repo })
          : resumeBrief({ repo });
    } catch (error) {
      fail(error.message, 64);
    }
    if (command === "compile" && !options.json) process.stdout.write(`${report.capsule}\n`);
    else if (command === "resume" && !options.json) process.stdout.write(`${report.text}\n`);
    else print(report, options.json);
    for (const warning of report.warnings) {
      const line = typeof warning === "string" ? warning : [warning.rule, warning.detail].filter(Boolean).join(": ");
      process.stderr.write(`warning: ${line}\n`);
    }
    for (const error of report.errors) {
      const line = typeof error === "string" ? error : [error.rule, error.detail].filter(Boolean).join(": ");
      process.stderr.write(`error: ${line}\n`);
    }
    if (report.errors.length > 0 || report.status === "divergent") process.exitCode = 1;
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
