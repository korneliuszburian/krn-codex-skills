#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { posixRelative } from "./lib/support/path-rules.mjs";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { spawnInherit } from "./lib/kernel/proc.mjs";
import { applyInstall, createInstallPlan, inspectInstall, pruneReleases, sealCurrentRelease } from "./lib/install/install-release.mjs";
import { runStateCommand } from "./lib/state/state-cli.mjs";
import { checkSkills, exportSkills } from "./lib/install/skills-export.mjs";
import { checkLessons, lessonUsage, parseLessons, recallLessons } from "./lib/lessons/lessons.mjs";
import { churnHot } from "./lib/support/churn.mjs";
import { parseCliArgs } from "./lib/kernel/cli.mjs";
import { runGit } from "./lib/kernel/git.mjs";
import { reanchorLessons, verifyLessons } from "./lib/lessons/lessons-verify.mjs";
import { checkChangeContract, contractGuardActive } from "./lib/contract/change-contract.mjs";
import { caseIds, loadCases, runConformance } from "./lib/conformance/conformance.mjs";
import { EXIT_CODES, fail as baseFail } from "./lib/support/diagnostics.mjs";
import { runTicketCommand } from "./lib/ticket/ticket-cli.mjs";
import { runHarnessCommand } from "./lib/harness/e2e-compare.mjs";

process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
});
process.stderr.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const usage = `Usage:
  krn install plan [--source REF|PATH] [--json]
  krn install apply [--source REF|PATH] [--allow-unsealed] --yes [--json]
  krn install check [--json]
  krn install seal [--source REF|PATH] --root REPO [--json]
  krn install prune [--keep N] [--json]
  krn doctor [--json]
  krn capability <inventory|usage|profile|plan|apply|check> [...args]
  krn repo <inspect|apply> [...args]
  krn state <check|compile|resume> [PATH|--root PATH] [--json]
  krn state fields --file FILE [--json]
  krn skills <export|check> --root DIR [--upstream PATH] [--json]
  krn lessons <check|verify|reanchor> --root DIR [--json]
  krn changes check --base REF [--head REF] --root DIR [--before] [--strict-recall | --recall-obligation] [--json]
  krn conformance check --root DIR [--candidate DIR] [--filter ID] [--frozen] [--json]
  krn memory <recall|usage> --root DIR [--changed PATH[,PATH...] | --symbol NAME[,NAME...]] [--json]
  krn ticket <add|list|check|next|ready|claim|renew|comment|close|reopen|release|takeover|edit|fail|reconcile> --root DIR [options]
  krn ticket operation prepare --root DIR --file .krn/runs/FILE.json [--json]
  krn ticket operation apply --root DIR --id ID --worker NAME --expected-epoch N [--json]
  krn ticket operation complete --root DIR --id ID --worker NAME --expected-epoch N [--json]
  krn ticket intent get --root DIR --intent ID [--json]
  krn ticket intent set --root DIR --intent ID --revision N --expected-revision N [--json]
  krn ticket store copy --root SOURCE --to ISOLATED-CLONE [--json]
  krn ticket store export --root DIR [--json]
  krn ticket store restore --root DIR --file ARCHIVE.json [--json]
  krn ticket store migrate --root DIR [--file DECISIONS.json] [--yes --archive FILE --actor NAME --reason TEXT] [--json]
  krn ticket store lock --root DIR [--json]
  krn ticket store unlock --root DIR --token TOKEN --actor NAME --reason TEXT [--json]
  krn ticket add --root DIR --title TEXT [--lane-recipe FILE.json] [--json]
  krn ticket edit --root DIR --id ID [--lane-recipe FILE.json] [content options] [--json]
  krn ticket show <path> [--json] | show --root DIR --id ID [--json]
  krn ticket fields --file FILE [--json] | fields --root DIR --id ID [--json]
  krn ticket env --file FILE | env --root DIR --id ID
  krn ticket claim --root DIR (--id ID | --ready) --worker NAME [--session NAME] [--json]
  krn ticket takeover --root DIR --id ID --worker NAME --expected-epoch N --reason TEXT [--json]
  krn ticket renew --root DIR --id ID --worker NAME --expected-epoch N [--json]
  krn ticket comment --root DIR --id ID --worker NAME --expected-epoch N --body TEXT [--json]
  krn ticket <close|reopen|release> --root DIR --id ID --actor NAME --reason TEXT [--expected-epoch N] [--json]
  krn ticket fail --root DIR --id ID --worker NAME --expected-epoch N --reason TEXT [--json]
  krn harness compare --task FILE --lanes NAME,NAME [--runs N] [--root DIR] [--json]`;

const fail = (message, code = EXIT_CODES.USAGE) => baseFail(message, code);

const BOOLEAN_FLAGS = { "--json": "json", "--yes": "yes", "--before": "before", "--allow-unsealed": "allowUnsealed", "--strict-recall": "strictRecall", "--recall-obligation": "recallObligation", "--frozen": "frozen", "--write": "write", "--check": "check" };
const VALUE_FLAGS = {
  "--source": "source",
  "--root": "root",
  "--base": "base",
  "--keep": "keep",
  "--head": "head",
  "--path": "path",
  "--id": "id",
  "--worker": "worker",
  "--session": "session",
  "--evidence": "evidence",
  "--resolution": "resolution",
  "--candidate": "candidate",
  "--filter": "filter",
  "--upstream": "upstream",
};
const LIST_FLAGS = { "--changed": "changed", "--symbol": "symbols" };

function parseOptions(args) {
  return parseCliArgs(args, {
    booleans: BOOLEAN_FLAGS,
    values: VALUE_FLAGS,
    lists: LIST_FLAGS,
    defaults: { json: false, yes: false },
    fail: (message) => fail(message),
  });
}

function requireDirectory(root) {
  if (!fs.statSync(root, { throwIfNoEntry: false })?.isDirectory()) fail(`root is not a directory: ${root}`);
}

const OPTION_FLAG = {
  strictRecall: "--strict-recall",
  recallObligation: "--recall-obligation",
  symbols: "--symbol",
  source: "--source",
  root: "--root",
  base: "--base",
  changed: "--changed",
  keep: "--keep",
  head: "--head",
  candidate: "--candidate",
  path: "--path",
  id: "--id",
  worker: "--worker",
  session: "--session",
  evidence: "--evidence",
  resolution: "--resolution",
  filter: "--filter",
  frozen: "--frozen",
  upstream: "--upstream",
  before: "--before",
  allowUnsealed: "--allow-unsealed",
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
  process.exitCode = spawnInherit(process.execPath, [path.join(root, script), ...args]).status ?? 1;
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
  // Help is answered wherever it appears, so `krn <command> --help` prints the
  // usage instead of failing on an option the command does not define.
  if (raw.includes("-h") || raw.includes("--help") || raw[0] === "help") {
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
    rejectForeignOptions(options, ["root", "base", "head", "before", "strictRecall", "recallObligation"]);
    if (positional[0] !== "check" || positional.length > 1 || options.source || options.yes || !options.root || !options.base) fail(usage);
    if (options.strictRecall === true && options.recallObligation === true) fail("--strict-recall and --recall-obligation are mutually exclusive");
    // Three explicit recall modes: advisory (default), trigger-based obligation
    // (path/symbol hits block and churn stays advisory), and strict (every hit
    // blocks). The trigger-based mode leaves strictRecall undefined so the
    // library evaluates the actual diff trigger.
    const recallMode = options.strictRecall === true ? true : options.recallObligation === true ? undefined : false;
    const report = contractGuardActive()
      ? { root: options.root, commits: [], results: [], errors: [], warnings: [{ rule: "change-contract-skipped", detail: "KRN_CHANGE_CONTRACT=0" }], skipped: true }
      : checkChangeContract({ root: options.root, base: options.base, head: options.head ?? "HEAD", verifyBefore: options.before === true, strictRecall: recallMode, requireCleanHead: true });
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
        for (const entry of report.usage) process.stdout.write(`${entry.binds}\t${entry.lesson}\t${entry.hits} hits\n`);
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
      const lessonsFile = path.join(options.root, "docs", "research", "workflow-lessons.md");
      const parsed = parseLessons(lessonsFile);
      const source = { present: fs.existsSync(lessonsFile), malformed: parsed.malformed.length, active: parsed.rows.filter((row) => !row.status).length };
      if (options.json) print({ root: options.root, changed, symbols: options.symbols ?? [], hot, hits, source }, true);
      else for (const hit of hits) process.stdout.write(`${hit.lesson}\n  ${hit.trigger} matched ${hit.matched.join(", ")}; gate ${hit.gate}\n`);
    }
  } else if (raw[0] === "ticket") {
    await runTicketCommand(raw.slice(1), { usage, requireDirectory });
  } else if (raw[0] === "conformance") {
    const { positional, options } = parseOptions(raw.slice(1));
    rejectForeignOptions(options, ["root", "candidate", "filter", "frozen"]);
    if (positional[0] !== "check" || positional.length > 1 || options.source || options.yes || !options.root) fail(usage);
    const casesRoot = path.resolve(options.root);
    const candidate = path.resolve(options.candidate ?? options.root);
    requireDirectory(casesRoot);
    requireDirectory(candidate);
    // A frozen run must apply a base case list to a different program under
    // test. Pointing both flags at one tree lets the candidate's own manifest
    // authorize the required set, so that shape is refused before any case runs.
    if (options.frozen === true && options.candidate && casesRoot === candidate) {
      fail("--frozen must evaluate the candidate against a separate approved base; --root and --candidate resolve to the same tree", EXIT_CODES.USAGE);
    }
    const casesFile = path.join(casesRoot, "config", "conformance.json");
    let cases;
    try {
      cases = loadCases(casesFile);
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    const filtered = options.filter ? cases.filter((entry) => entry.id === options.filter) : cases;
    if (options.filter && filtered.length === 0) fail(`no conformance case matched: ${options.filter}`, EXIT_CODES.USAGE);
    // A frozen run always evaluates every required base case; --filter may
    // narrow the advisory cases but can never hide a required one.
    const selected = options.frozen === true && options.filter
      ? cases.filter((entry) => entry.required === true || entry.id === options.filter)
      : filtered;
    // A frozen run applies the approved base case list through the candidate
    // runner. A case the candidate no longer declares is dropped and reported
    // only when it is not required; a required case is part of the approved
    // acceptance policy, and its omission fails the run. Retiring a required
    // case is a visible edit to the approved base policy, never candidate
    // self-authorization.
    const present = options.frozen === true ? caseIds(path.join(candidate, "config", "conformance.json")) : null;
    const runnable = present === null ? selected : selected.filter((entry) => present.has(entry.id));
    const results = runConformance({ candidate, cases: runnable });
    if (options.frozen === true && present === null) {
      results.unshift({ id: "candidate-manifest", ok: false, detail: "the candidate has no config/conformance.json; the frozen acceptance set cannot be applied", exit: -1 });
    } else if (options.frozen === true) {
      for (const entry of selected) {
        if (present.has(entry.id)) continue;
        if (entry.required === true) {
          results.push({ id: entry.id, ok: false, detail: "required case missing: the candidate manifest no longer declares this required case" });
        } else {
          results.push({ id: entry.id, ok: true, detail: "dropped: the candidate manifest no longer declares this case" });
        }
      }
    }
    if (options.json) print({ root: options.root, candidate, frozen: options.frozen === true, results }, true);
    else for (const result of results) process.stdout.write(`${result.ok ? "ok" : "not ok"} ${result.id}${result.detail ? ` - ${result.detail}` : ""}\n`);
    if (results.some((result) => !result.ok)) process.exitCode = 1;
  } else if (raw[0] === "state") {
    runStateCommand(raw.slice(1), { usage });
  } else if (raw[0] === "harness") {
    await runHarnessCommand(raw.slice(1), { usage });
  } else {
  const { positional, options } = parseOptions(raw);
  if (positional[0] === "install") {
    if (positional.length !== 2) fail(usage);
    const command = positional[1];
    if (command === "check") {
      rejectForeignOptions(options, []);
      const report = inspectInstall();
      print(report, options.json);
      const hookPolicy = report.hookPolicy?.status;
      if (report.filesystem.status !== "filesystem_installed" || (hookPolicy && hookPolicy !== "hooks_active" && hookPolicy !== "no_managed_requirements")) process.exitCode = 3;
    } else if (command === "prune") {
      rejectForeignOptions(options, ["keep"]);
      const keep = options.keep ? Number(options.keep) : 3;
      if (!Number.isInteger(keep) || keep < 1) fail("install prune --keep must be a positive integer");
      const pruneReport = pruneReleases({ keep });
      print(pruneReport, options.json);
      if (pruneReport.refused) process.exitCode = 3;
    } else if (command === "seal") {
      rejectForeignOptions(options, ["source", "root"]);
      print(sealCurrentRelease({ root: options.root, source: options.source, cwd: process.cwd() }), options.json);
    } else if (command === "plan" || command === "apply") {
      rejectForeignOptions(options, command === "apply" ? ["source", "yes", "allowUnsealed"] : ["source"]);
      if (command === "apply" && !options.yes) fail("install apply requires --yes");
      const plan = createInstallPlan({ source: options.source, cwd: process.cwd() });
      if (command === "plan") {
        print({ source: plan.source, commit: plan.commit, release: plan.release, runtimePaths: plan.runtimePaths }, options.json);
      } else {
        const applied = applyInstall(plan, { allowUnsealed: options.allowUnsealed === true || !fs.lstatSync(plan.current, { throwIfNoEntry: false }) });
        print({ commit: applied.commit, release: applied.release, current: applied.current, backup: applied.backup, idempotent: applied.idempotent, allowUnsealed: applied.allowUnsealed }, options.json);
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
  process.stderr.write(`krn: ${error.message}\n`);
  process.exitCode = error.exitCode || 1;
}
