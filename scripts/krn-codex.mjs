#!/usr/bin/env node

import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applyInstall, createInstallPlan, inspectInstall } from "./lib/install-release.mjs";
import { inspectSpineState } from "./lib/state-check.mjs";
import { compileCapsule, resumeBrief } from "./lib/state-brief.mjs";
import { checkSkills, exportSkills } from "./lib/skills-export.mjs";
import { checkLessons, lessonUsage, recallLessons } from "./lib/lessons.mjs";
import { churnHot } from "./lib/churn.mjs";
import { runGit } from "./lib/git-cli.mjs";
import { verifyLessons } from "./lib/lessons-verify.mjs";
import { checkChangeContract, contractGuardActive } from "./lib/change-contract.mjs";
import { EXIT_CODES, renderDiagnostics } from "./lib/diagnostics.mjs";

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
});
process.stderr.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = `Usage:
  krn-codex install plan [--source REF|PATH] [--json]
  krn-codex install apply [--source REF|PATH] --yes [--json]
  krn-codex install check [--json]
  krn-codex doctor [--json]
  krn-codex capability <inventory|usage|profile|plan|apply|check> [...args]
  krn-codex repo <inspect|apply> [...args]
  krn-codex state <check|compile|resume> [PATH|--root PATH] [--json]
  krn-codex skills <export|check> --root DIR [--upstream PATH] [--json]
  krn-codex lessons <check|verify> --root DIR [--json]
  krn-codex changes check --base REF [--head REF] --root DIR [--json]
  krn-codex memory <recall|usage> --root DIR [--changed PATH[,PATH...]] [--symbol NAME[,NAME...]] [--json]`;

function fail(message, code = EXIT_CODES.USAGE) {
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
    } else if (arg === "--base") {
      options.base = args[++index];
      if (!options.base) fail("--base requires a revision");
    } else if (arg === "--changed") {
      const value = args[++index];
      if (!value) fail("--changed requires a path list");
      options.changed = [...(options.changed ?? []), ...value.split(",").map((entry) => entry.trim()).filter(Boolean)];
    } else if (arg === "--symbol") {
      const value = args[++index];
      if (!value) fail("--symbol requires a name list");
      options.symbols = [...(options.symbols ?? []), ...value.split(",").map((entry) => entry.trim()).filter(Boolean)];
    } else if (arg === "--head") {
      options.head = args[++index];
      if (!options.head) fail("--head requires a revision");
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
      fail(error.message, EXIT_CODES.USAGE);
    }
  } else if (raw[0] === "lessons") {
    const { positional, options } = parseOptions(raw.slice(1));
    if (!["check", "verify"].includes(positional[0]) || positional.length > 1 || options.source || options.yes || !options.root) fail(usage);
    if (positional[0] === "check") {
      const report = checkLessons({ root: options.root });
      print(report, options.json);
      for (const warning of report.warnings ?? []) process.stderr.write(`warning: ${warning}\n`);
      if (report.errors.length) process.exitCode = 1;
    } else {
      const report = verifyLessons({ root: options.root, force: true });
      print(report, options.json);
      if (!options.json) {
        for (const result of report.results) process.stdout.write(`${result.status}\t${result.file}::${result.case}\n`);
        for (const result of report.failures) process.stderr.write(`error: lesson "${result.lesson}" proof failed: ${result.file}::${result.case}\n`);
      }
      if (report.failures.length) process.exitCode = 1;
    }
  } else if (raw[0] === "changes") {
    const { positional, options } = parseOptions(raw.slice(1));
    if (positional[0] !== "check" || positional.length > 1 || options.source || options.yes || !options.root || !options.base) fail(usage);
    const report = contractGuardActive()
      ? { root: options.root, commits: [], results: [], errors: [], skipped: true }
      : checkChangeContract({ root: options.root, base: options.base, head: options.head ?? "HEAD" });
    print(report, options.json);
    if (!options.json) {
      for (const failure of report.errors) process.stderr.write(`error: ${failure.rule}${failure.ref ? ` ${failure.ref}` : ""}${failure.commit ? ` ${failure.commit}` : ""}${failure.detail ? `: ${failure.detail}` : ""}\n`);
      if (report.errors.some((failure) => failure.commit)) process.stderr.write("revert or repair the offending commit(s) before proceeding\n");
    }
    if (report.errors.length) process.exitCode = 1;
  } else if (raw[0] === "memory") {
    const { positional, options } = parseOptions(raw.slice(1));
    if (!["recall", "usage"].includes(positional[0]) || positional.length > 1 || options.source || options.yes || !options.root) fail(usage);
    if (positional[0] === "usage") {
      const report = lessonUsage({ root: options.root });
      print(report, options.json);
      if (!options.json) {
        for (const entry of report.usage) process.stdout.write(`${entry.recalls}\t${entry.lesson}\n`);
        if (report.neverRecalled?.length) process.stdout.write(`never recalled: ${report.neverRecalled.length}\n`);
      }
    } else {
      if (!(options.changed?.length || options.symbols?.length)) fail(usage);
      const changed = options.changed ?? [];
      const hot = changed.length > 0 ? churnHot({ root: options.root, git: runGit, sha: "HEAD", files: changed }) : [];
      const hits = recallLessons({ root: options.root, files: changed, symbols: options.symbols ?? [], hot });
      print({ root: options.root, changed, symbols: options.symbols ?? [], hot, hits }, options.json);
      if (!options.json) for (const hit of hits) process.stdout.write(`${hit.lesson}\n  ${hit.trigger} matched ${hit.matched.join(", ")}; gate ${hit.gate}\n`);
    }
  } else if (raw[0] === "state") {
    const { positional, options } = parseOptions(raw.slice(1));
    const command = positional[0];
    if (!["check", "compile", "resume"].includes(command) || positional.length > 2 || options.source || options.yes) fail(usage);
    const repo = options.root ?? positional[1] ?? process.cwd();
    let report;
    try {
      report = command === "check"
        ? inspectSpineState({ repo })
        : command === "compile"
          ? compileCapsule({ repo })
          : resumeBrief({ repo });
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    if (command === "compile" && !options.json) process.stdout.write(`${report.capsule}\n`);
    else if (command === "resume" && !options.json) process.stdout.write(`${report.text}\n`);
    else print(report, options.json);
    const diagnostics = renderDiagnostics(report);
    for (const warning of diagnostics.warnings) process.stderr.write(`warning: ${warning}\n`);
    for (const error of diagnostics.errors) process.stderr.write(`error: ${error}\n`);
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
    process.exitCode = EXIT_CODES.USAGE;
  }
  }
} catch (error) {
  process.stderr.write(`krn-codex: ${error.message}\n`);
  process.exitCode = error.exitCode || 1;
}
