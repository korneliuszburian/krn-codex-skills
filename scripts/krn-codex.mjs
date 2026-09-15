#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { posixRelative } from "./lib/support/path-rules.mjs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { applyInstall, createInstallPlan, inspectInstall, pruneReleases } from "./lib/install/install-release.mjs";
import { inspectSpineState } from "./lib/state/state-check.mjs";
import { compileCapsule, resumeBrief } from "./lib/state/state-brief.mjs";
import { checkSkills, exportSkills } from "./lib/install/skills-export.mjs";
import { checkLessons, lessonUsage, recallLessons } from "./lib/lessons/lessons.mjs";
import { churnHot } from "./lib/support/churn.mjs";
import { runGit } from "./lib/support/git-cli.mjs";
import { reanchorLessons, verifyLessons } from "./lib/lessons/lessons-verify.mjs";
import { checkChangeContract, contractGuardActive } from "./lib/contract/change-contract.mjs";
import { EXIT_CODES, fail as baseFail, renderDiagnostics } from "./lib/support/diagnostics.mjs";

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
  krn-codex install prune [--keep N] [--json]
  krn-codex doctor [--json]
  krn-codex capability <inventory|usage|profile|plan|apply|check> [...args]
  krn-codex repo <inspect|apply> [...args]
  krn-codex state <check|compile|resume> [PATH|--root PATH] [--json]
  krn-codex skills <export|check> --root DIR [--upstream PATH] [--json]
  krn-codex lessons <check|verify|reanchor> --root DIR [--json]
  krn-codex changes check --base REF [--head REF] --root DIR [--before] [--strict-recall] [--json]
  krn-codex memory <recall|usage> --root DIR [--changed PATH[,PATH...] | --symbol NAME[,NAME...]] [--json]`;

const fail = (message, code = EXIT_CODES.USAGE) => baseFail(message, code);

function parseOptions(args) {
  const positional = [];
  const options = { json: false, yes: false };
  const take = (index, flag) => {
    const value = args[index + 1];
    if (value === undefined || value === "" || value.startsWith("--")) fail(`${flag} requires a value`);
    return value;
  };
  const setOnce = (key, flag, value) => {
    if (options[key] !== undefined) fail(`duplicate option: ${flag}`);
    options[key] = value;
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--yes") options.yes = true;
    else if (arg === "--before") options.before = true;
    else if (arg === "--strict-recall") options.strictRecall = true;
    else if (arg === "--source") setOnce("source", "--source", take(index++, "--source"));
    else if (arg === "--root") setOnce("root", "--root", take(index++, "--root"));
    else if (arg === "--base") setOnce("base", "--base", take(index++, "--base"));
    else if (arg === "--changed") {
      options.changed = [...(options.changed ?? []), ...take(index++, "--changed").split(",").map((entry) => entry.trim()).filter(Boolean)];
    } else if (arg === "--symbol") {
      options.symbols = [...(options.symbols ?? []), ...take(index++, "--symbol").split(",").map((entry) => entry.trim()).filter(Boolean)];
    } else if (arg === "--keep") setOnce("keep", "--keep", take(index++, "--keep"));
    else if (arg === "--head") setOnce("head", "--head", take(index++, "--head"));
    else if (arg === "--upstream") setOnce("upstream", "--upstream", take(index++, "--upstream"));
    else if (arg.startsWith("--")) fail(`unknown option: ${arg}`);
    else positional.push(arg);
  }
  return { positional, options };
}

function requireDirectory(root) {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) fail(`root is not a directory: ${root}`);
}

const OPTION_FLAG = {
  strictRecall: "--strict-recall",
  symbols: "--symbol",
  source: "--source",
  root: "--root",
  base: "--base",
  changed: "--changed",
  keep: "--keep",
  head: "--head",
  upstream: "--upstream",
  before: "--before",
  yes: "--yes",
  json: "--json",
};

function rejectForeignOptions(options, allowed) {
  const permitted = new Set(["json", ...allowed]);
  for (const key of Object.keys(options)) {
    if (options[key] === undefined || options[key] === false) continue;
    if (!permitted.has(key)) fail(`unknown option for this command: ${OPTION_FLAG[key] ?? `--${key}`}`);
  }
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

function renderInstallReport(report) {
  const lines = [`filesystem: ${report.filesystem.status}${report.filesystem.detail ? ` (${report.filesystem.detail})` : ""}`];
  if (report.hookPolicy) lines.push(`hook policy: ${report.hookPolicy.status}${report.hookPolicy.detail ? ` (${report.hookPolicy.detail})` : ""}`);
  if (report.commit) lines.push(`release: ${report.commit.slice(0, 12)}`);
  if (report.session) lines.push(`session: ${report.session.status}`);
  if (report.legacyHooks?.length) lines.push(`legacy hooks: ${report.legacyHooks.join(", ")}`);
  for (const target of report.targets ?? []) lines.push(`  ${String(target.status).padEnd(22)} ${target.target}`);
  return lines.join("\n");
}

try {
  const raw = process.argv.slice(2);
  if (["-h", "--help", "help"].includes(raw[0])) {
    process.stdout.write(`${usage}\n`);
    process.exit(0);
  }
  if (raw[0] === "capability") {
    delegate("scripts/catalog.mjs", raw.slice(1));
  } else if (raw[0] === "repo") {
    delegate("skills/engineering/setup-repository-workflow/scripts/init-repository-workflow.mjs", raw.slice(1));
  } else if (raw[0] === "skills") {
    const { positional, options } = parseOptions(raw.slice(1));
    rejectForeignOptions(options, ["root", "upstream"]);
    if ((positional[0] !== "export" && positional[0] !== "check") || positional.length > 1 || options.source || options.yes || (positional[0] === "check" && options.upstream) || !options.root) fail(usage);
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
    rejectForeignOptions(options, ["root"]);
    if (!["check", "verify", "reanchor"].includes(positional[0]) || positional.length > 1 || options.source || options.yes || !options.root) fail(usage);
    requireDirectory(options.root);
    if (positional[0] === "check") {
      const report = checkLessons({ root: options.root });
      print(report, options.json);
      for (const warning of report.warnings ?? []) process.stderr.write(`warning: ${warning}\n`);
      if (report.errors.length) process.exitCode = 1;
    } else if (positional[0] === "reanchor") {
      const report = reanchorLessons({ root: options.root });
      print(report, options.json);
      if (!options.json) {
        for (const entry of report.updated) process.stdout.write(`reanchored ${entry.lesson}: ${entry.file} ${entry.from} -> ${entry.to}\n`);
        for (const entry of report.skipped ?? []) process.stderr.write(`skipped ${entry.lesson ?? ""}${entry.lesson ? ": " : ""}${entry.reason}\n`);
        for (const message of report.errors ?? []) process.stderr.write(`error: ${message}\n`);
      }
      if ((report.errors ?? []).length > 0 || (report.skipped ?? []).some((entry) => entry.blocking)) process.exitCode = 1;
    } else {
      const report = verifyLessons({ root: options.root, force: true });
      print(report, options.json);
      if (!options.json) {
        for (const result of report.results) process.stdout.write(`${result.status}\t${result.file}::${result.case}\n`);
        for (const result of report.failures) process.stderr.write(`error: lesson "${result.lesson}" proof failed: ${result.file}::${result.case}${result.detail ? ` (${result.detail})` : ""}\n`);
        for (const message of report.errors ?? []) process.stderr.write(`error: ${message}\n`);
      }
      if (report.failures.length || (report.errors?.length ?? 0) > 0) process.exitCode = 1;
    }
  } else if (raw[0] === "changes") {
    const { positional, options } = parseOptions(raw.slice(1));
    rejectForeignOptions(options, ["root", "base", "head", "before", "strictRecall"]);
    if (positional[0] !== "check" || positional.length > 1 || options.source || options.yes || !options.root || !options.base) fail(usage);
    const report = contractGuardActive()
      ? { root: options.root, commits: [], results: [], errors: [], warnings: [{ rule: "change-contract-skipped", detail: "KRN_CHANGE_CONTRACT=0" }], skipped: true }
      : checkChangeContract({ root: options.root, base: options.base, head: options.head ?? "HEAD", verifyBefore: options.before === true, strictRecall: options.strictRecall === true, requireCleanHead: true });
    print(report, options.json);
    if (!options.json) {
      for (const warning of report.warnings ?? []) process.stderr.write(`warning: ${warning.rule}${warning.ref ? ` ${warning.ref}` : ""}${warning.commit ? ` ${warning.commit}` : ""}${warning.detail ? `: ${warning.detail}` : ""}\n`);
      for (const failure of report.errors) process.stderr.write(`error: ${failure.rule}${failure.ref ? ` ${failure.ref}` : ""}${failure.commit ? ` ${failure.commit}` : ""}${failure.detail ? `: ${failure.detail}` : ""}\n`);
      if (report.errors.some((failure) => failure.commit)) process.stderr.write("revert or repair the offending commit(s) before proceeding\n");
    }
    if (report.errors.length) process.exitCode = 1;
  } else if (raw[0] === "memory") {
    const { positional, options } = parseOptions(raw.slice(1));
    if (!["recall", "usage"].includes(positional[0]) || positional.length > 1 || options.source || options.yes || !options.root) fail(usage);
    requireDirectory(options.root);
    if (positional[0] === "usage") {
      rejectForeignOptions(options, ["root"]);
      const report = lessonUsage({ root: options.root });
      if (options.json) {
        print(report, true);
      } else {
        for (const entry of report.usage) process.stdout.write(`${entry.recalls}\t${entry.lesson}\n`);
        if (report.neverRecalled?.length) process.stdout.write(`never recalled: ${report.neverRecalled.length}\n`);
      }
    } else {
      rejectForeignOptions(options, ["root", "changed", "symbols"]);
      if (!(options.changed?.length || options.symbols?.length)) fail(usage);
      const changed = [];
      for (const entry of options.changed ?? []) {
        const rel = posixRelative(path.resolve(options.root), path.resolve(options.root, entry));
        if (!rel || rel.startsWith("..")) fail(`memory recall --changed ${entry} is empty or outside --root`);
        changed.push(rel);
      }
      const hot = changed.length > 0 ? churnHot({ root: options.root, git: runGit, sha: "HEAD", files: changed }) : [];
      const hits = recallLessons({ root: options.root, files: changed, symbols: options.symbols ?? [], hot });
      if (options.json) print({ root: options.root, changed, symbols: options.symbols ?? [], hot, hits }, true);
      else for (const hit of hits) process.stdout.write(`${hit.lesson}\n  ${hit.trigger} matched ${hit.matched.join(", ")}; gate ${hit.gate}\n`);
    }
  } else if (raw[0] === "state") {
    const { positional, options } = parseOptions(raw.slice(1));
    rejectForeignOptions(options, ["root"]);
    const command = positional[0];
    if (!["check", "compile", "resume"].includes(command) || positional.length > 2 || options.source || options.yes || (options.root && positional[1])) fail(usage);
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
      rejectForeignOptions(options, []);
      const report = inspectInstall();
      print(report, options.json);
      if (report.filesystem.status !== "filesystem_installed" || report.hookPolicy?.status?.startsWith("hook_inert_")) process.exitCode = 3;
    } else if (command === "prune") {
      rejectForeignOptions(options, ["keep"]);
      const keep = options.keep ? Number(options.keep) : 3;
      if (!Number.isInteger(keep) || keep < 1) fail("install prune --keep must be a positive integer");
      const pruneReport = pruneReleases({ keep });
      print(pruneReport, options.json);
      if (pruneReport.refused) process.exitCode = 3;
    } else if (command === "plan" || command === "apply") {
      rejectForeignOptions(options, command === "apply" ? ["source", "yes"] : ["source"]);
      if (command === "apply" && !options.yes) fail("install apply requires --yes");
      const plan = createInstallPlan({ source: options.source, cwd: process.cwd() });
      if (command === "plan") {
        print({ source: plan.source, commit: plan.commit, release: plan.release, runtimePaths: plan.runtimePaths }, options.json);
      } else {
        const applied = applyInstall(plan);
        print({ commit: applied.commit, release: applied.release, current: applied.current, backup: applied.backup, idempotent: applied.idempotent }, options.json);
      }
    } else fail(usage);
  } else if (positional[0] === "doctor") {
    rejectForeignOptions(options, []);
    if (positional.length !== 1 || options.source || options.yes) fail(usage);
    const report = inspectInstall();
    print(options.json ? report : renderInstallReport(report), options.json);
  } else {
    print(usage, false);
    process.exitCode = EXIT_CODES.USAGE;
  }
  }
} catch (error) {
  process.stderr.write(`krn-codex: ${error.message}\n`);
  process.exitCode = error.exitCode || 1;
}
