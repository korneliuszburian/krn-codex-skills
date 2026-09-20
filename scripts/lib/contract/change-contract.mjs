import fs from "node:fs";
import path from "node:path";

import { GIT_LOG_FORMAT, commitChangedFiles, parseGitLogRecords } from "../kernel/git.mjs";
import { readJson } from "../kernel/json.mjs";
import { parseLessons, parseLessonText, recallLessons, recallLines, recallBindings, triggerEntries as lessonTriggerEntries } from "../lessons/lessons.mjs";
import { globToRegex } from "../kernel/text.mjs";
import { withWorktree } from "../kernel/worktree.mjs";
import { churnHot } from "../support/churn.mjs";
import { runGit } from "../kernel/git.mjs";
import { maskLiterals, stripComments, touchedSymbolFiles } from "../kernel/js.mjs";
import {
  changedFilesUnder, checkFileRedefined, frozenNodeArgs, frozenRedOk, frozenTestsFor,
  isTestFile, listTestFiles, listTestFilesIn, normalizeRef, outputTail, resolveCheck, runCheck,
  scriptChangedFiles, scriptCommand, scriptRedefinition, tapSummary,
} from "./change-contract-runs.mjs";

const SURFACE = [
  /^scripts\//,
  /^test\//,
  /^package\.json$/,
  /^config\//,
  /^skills\/manifest\.json$/,
  /^skills\/.*\/scripts\//,
  /^skills\/.*\/SKILL\.md$/,
  /^skills\/.*\/references\//,
  /^docs\/research\/workflow-lessons\.md$/,
  /^\.github\/workflows\//,
];
const CONTRACT = /^(?:Change-contract|Prediction):\s*(.+?)\s*$/i;
const CONTRACT_PART = /^(.+?):\s*(red|green)\s*->\s*(red|green)\s*$/i;
const APPLICABILITY_CHANGE = /^Applicability-change:\s*(.+?)\s*$/i;

function triggerEntries(trigger) {
  return [...new Set(String(trigger ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim().replace(/^\.\//, ""))
    .filter(Boolean))];
}

export function contractSurface(files) {
  return files.some((file) => SURFACE.some((pattern) => pattern.test(file)));
}

export function contractGuardActive(env = process.env) {
  return env.KRN_CHANGE_CONTRACT === "0";
}

export function parseChangeContract(message) {
  const contracts = [];
  const atRisk = [];
  for (const line of message.split("\n").map((entry) => entry.trim())) {
    const contract = CONTRACT.exec(line);
    if (contract) {
      const parts = contract[1].split(",").map((part) => part.trim()).filter(Boolean);
      const entries = parts.map((part) => CONTRACT_PART.exec(part));
      if (entries.length > 0 && entries.every(Boolean)) {
        for (const entry of entries) {
          contracts.push({ ref: entry[1].trim(), before: entry[2].toLowerCase(), after: entry[3].toLowerCase() });
        }
      }
      continue;
    }
    const risk = /^At-risk:\s*(.+?)(?::\s*(?:red|green)\s*->\s*(?:red|green))?\s*$/i.exec(line);
    if (risk) {
      atRisk.push(...risk[1]
        .split(",")
        .map((ref) => ref.trim().replace(/:\s*(?:red|green)\s*->\s*(?:red|green)\s*$/i, "").trim())
        .filter(Boolean));
    }
  }
  return { contracts, atRisk };
}

// A path or symbol trigger that matched the changed diff is an obligation: it
// fails the contract unless the commit reconstructs the lesson or declines it
// with a reasoned `Recall: none (<reason>)`. Churn is a heuristic over history,
// so a churn-only hit stays advisory unless the caller opts into strict recall.
function diffRecallHit(hit, { files, symbols }) {
  const pathHit = lessonTriggerEntries(hit.trigger, "path:").some((glob) => {
    const pattern = globToRegex(glob);
    return files.some((file) => pattern.test(file));
  });
  if (pathHit) return true;
  return lessonTriggerEntries(hit.trigger, "symbol:").some((name) => symbols.includes(name));
}

function recallObligation({ strictRecall, hit, files, symbols }) {
  if (strictRecall === true) return true;
  if (strictRecall === false) return false;
  return diffRecallHit(hit, { files, symbols });
}

const RECALL_NONE = /^none\s*\(\s*(.*?)\s*\)\s*$/i;
const TICKET_DIRS = [".scratch", ".krn/tickets"];
const cleanAnchor = (value) => String(value ?? "").trim().replace(/`/g, "").replace(/^['"]|['"]$/g, "").trim();
const triggerValues = (trigger) => (trigger ?? "").split(/[;,]/).map((entry) => cleanAnchor(entry.replace(/^(?:path|symbol|churn):/, ""))).filter(Boolean);
const fieldValue = (text, name) => text.split("\n").map((line) => line.trim()).find((line) => line.startsWith(`${name}:`))?.slice(name.length + 1).trim();

// A waiver is only accountable when its reason names something the repository
// already holds: a path, a live lesson anchor, or a ticket in the queue. The
// resolved tokens scope the waiver to the hit that names the same anchor, so a
// reason for one lesson never discharges the rest.
function lessonAnchorTokens(root) {
  return parseLessons(path.join(root, "docs", "research", "workflow-lessons.md")).rows
    .filter((row) => !row.status)
    .map((row) => [
      row.lesson, cleanAnchor(row.falsifier), ...triggerValues(row.trigger),
      ...[...row.gate.matchAll(/`([^`]+)`/g)].map((match) => cleanAnchor(match[1]).replace(/^(?:npm run|node)\s+/, "").replace(/^--test\s+/, "")),
    ].filter(Boolean));
}

function queueTicketTokens(root, id) {
  for (const dir of TICKET_DIRS) {
    let files = [];
    try { files = fs.readdirSync(path.join(root, dir), { recursive: true }); } catch { continue; }
    for (const file of files) {
      let text;
      try { text = fs.readFileSync(path.join(root, dir, file), "utf8"); } catch { continue; }
      if (fieldValue(text, "Id") !== id) continue;
      return [id, ...(fieldValue(text, "Scope") ?? "").split(",").map(cleanAnchor).filter(Boolean)];
    }
  }
  return null;
}

function resolveRecallWaiver(root, reason) {
  const anchor = cleanAnchor(reason);
  if (!anchor) return null;
  const absolute = !anchor.startsWith("..") && !path.isAbsolute(anchor) ? path.resolve(root, anchor) : null;
  const relative = absolute ? path.relative(root, absolute).split(path.sep).join("/") : "";
  if (absolute && relative && !relative.startsWith("..") && fs.existsSync(absolute)) return [relative];
  for (const tokens of lessonAnchorTokens(root)) if (tokens.includes(anchor)) return [anchor];
  return queueTicketTokens(root, anchor);
}

function waiverCoversHit(tokens, hit) {
  const { named, falsifierFile } = recallBindings({ hit, lines: [] });
  const anchors = [hit.lesson, falsifierFile, ...named, ...(hit.matched ?? []), ...triggerValues(hit.trigger)].filter(Boolean);
  return anchors.some((anchor) => tokens.includes(anchor));
}

function recallWaivers(root, lines) {
  const waivers = [];
  const errors = [];
  for (const line of lines) {
    const match = RECALL_NONE.exec(String(line).trim());
    if (!match) continue;
    const reason = match[1].trim();
    const resolved = resolveRecallWaiver(root, reason);
    if (resolved) waivers.push(resolved);
    else errors.push({ rule: "recall-waiver-unresolved", detail: `Recall: none (${reason || "no reason"}) names no repository path, lesson anchor, or queued ticket` });
  }
  return { waivers, errors };
}

export function runCheckAtBase({ root, base, target, git = runGit, overlay = null }) {
  const result = withWorktree({ root, ref: base, git, prefix: "krn-base-" }, (dir) => {
    const overlays = Array.isArray(overlay) ? overlay : overlay ? [overlay] : [];
    const rootReal = fs.realpathSync(root);
    for (const rel of overlays) {
      const from = path.join(root, rel);
      const real = fs.existsSync(from) && !fs.lstatSync(from).isSymbolicLink() ? path.relative(rootReal, fs.realpathSync(from)) : "..";
      if (!fs.existsSync(from) || real.startsWith("..") || path.isAbsolute(real)) return { unavailable: true };
      try {
        fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
        fs.copyFileSync(from, path.join(dir, rel));
      } catch { return { unavailable: true }; }
    }
    const frozenTests = frozenTestsFor(root, target, () => listTestFilesIn(dir));
    const frozenArgs = target.kind === "script" ? frozenNodeArgs(scriptCommand(root, target) ?? "") : [];
    return { outcome: runCheck({ root: dir, target, frozenTests, frozenArgs }) };
  });
  return result ?? { unavailable: true };
}

const isRuntimeModule = (rel) => rel.startsWith("scripts/") && rel.endsWith(".mjs") && !isTestFile(rel);

function importSpecifiers(source) {
  const code = stripComments(source);
  const masked = maskLiterals(code);
  const specifiers = [];
  const push = (match) => specifiers.push(code.slice(match.indices[2][0], match.indices[2][1]));
  for (const match of masked.matchAll(/(?:^|[;\n}])\s*import\s+([^;]*?)\s+from\s+["']([^"']+)["']/dg)) push(match);
  for (const match of masked.matchAll(/export\s*\{([^}]*)\}\s*from\s+["']([^"']+)["']/dg)) push(match);
  for (const match of masked.matchAll(/import\s*\(/g)) {
    const specifier = /^import\s*\(\s*["']([^"']+)["']/.exec(code.slice(match.index))?.[1];
    if (specifier) specifiers.push(specifier);
  }
  return specifiers;
}

function importCone(root) {
  const graph = new Map();
  const relative = (file) => path.relative(root, file).split(path.sep).join("/");
  const record = (file) => {
    let source;
    try { source = fs.readFileSync(file, "utf8"); } catch { return; }
    const from = relative(file);
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const target = relative(path.resolve(path.dirname(file), specifier));
      if (target === from) continue;
      if (!graph.has(target)) graph.set(target, new Set());
      graph.get(target).add(from);
    }
  };
  const visit = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && entry.name.endsWith(".mjs")) record(full);
    }
  };
  for (const top of ["scripts", "test", "skills"]) visit(path.join(root, top));
  return graph;
}

function uncoveredImporterWarnings({ graph, changed, namedRisks, commit }) {
  const warnings = [];
  for (const file of changed) for (const importer of graph.get(file) ?? []) {
    if (!isRuntimeModule(importer)) continue;
    const tests = [...(graph.get(importer) ?? [])].filter(isTestFile).sort();
    if (tests.length === 0 || tests.some((test) => namedRisks.includes(test))) continue;
    warnings.push({ rule: "uncovered-importer", commit, ref: importer, detail: `changed ${file} reaches ${importer}; declare At-risk: ${tests.join(" or ")}` });
  }
  return warnings;
}

export function checkChangeContract({ root, base, head = "HEAD", git = runGit, run = runCheck, verifyBefore = false, runAtBase = null, strictRecall = null, requireCleanHead = false } = {}) {
  const errors = [];
  const warnings = [];
  let graph = null;
  const importGraph = () => (graph ??= importCone(root));
  const requestedHead = git(root, ["rev-parse", "--verify", `${head}^{commit}`]);
  const checkoutHead = git(root, ["rev-parse", "--verify", "HEAD^{commit}"]);
  const early = (errors) => ({ root, commits: [], results: [], errors, warnings: [] });
  if (requireCleanHead && !requestedHead.ok) return early([{ rule: "unreadable-range", detail: `head ${head} is not resolvable` }]);
  if (requireCleanHead && requestedHead.ok && checkoutHead.ok && requestedHead.out === checkoutHead.out) {
    const status = git(root, ["status", "--porcelain", "--untracked-files=no"]);
    if (!status.ok) return early([{ rule: "unreadable-status", detail: "git status could not be read; fix the checkout before `changes check`" }]);
    if (status.out !== "") return early([{ rule: "dirty-tree", detail: "commit the working tree before `changes check`" }]);
  }
  const ancestry = git(root, ["merge-base", "--is-ancestor", base, head]);
  if (ancestry.status === 1) return early([{ rule: "unreadable-range", detail: `${base} is not an ancestor of ${head}` }]);
  const baseCommit = git(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  if (requestedHead.ok && baseCommit.ok && baseCommit.out !== "" && baseCommit.out === requestedHead.out) {
    errors.push({ rule: "vacuous-range", detail: `${base}..${head} is empty; nothing to evaluate` });
  }
  const log = git(root, ["log", GIT_LOG_FORMAT, `${base}..${head}`]);
  if (!log.ok) return { root, commits: [], results: [], errors: [{ rule: "unreadable-range", detail: `${base}..${head}` }] };
  const commits = parseGitLogRecords(log.out);
  const packageFile = path.join(root, "package.json");
  let scripts = {};
  if (fs.existsSync(packageFile)) {
    try { scripts = readJson(packageFile).scripts ?? {}; } catch { errors.push({ rule: "unreadable-package", detail: "package.json is not valid JSON" }); }
  }
  const basePackage = git(root, ["show", `${base}:package.json`]);
  let baseScripts = null;
  if (basePackage.ok) {
    try {
      baseScripts = JSON.parse(basePackage.out).scripts ?? {};
    } catch {
      baseScripts = null;
    }
  }
  const lessonsFile = path.join(root, "docs", "research", "workflow-lessons.md");
  const lessonsExist = fs.existsSync(lessonsFile);
  const localLessons = lessonsExist ? parseLessons(lessonsFile) : null;
  const malformed = localLessons?.malformed ?? [];
  if (!lessonsExist && commits.some((commit) => {
    const changed = commitChangedFiles(root, git, commit.sha);
    return changed.ok && contractSurface(changed.files);
  })) {
    errors.push({ rule: "missing-lessons", detail: "a surface change requires the workflow-lessons page for trigger delivery" });
  }
  if (malformed.length > 0) errors.push({ rule: "malformed-lessons", detail: `${malformed.length} row(s); trigger delivery is unreliable` });
  const churnEnabled = lessonsExist && localLessons.rows.some((row) => (row.trigger ?? "").includes("churn:"));
  const basePage = git(root, ["show", `${base}:docs/research/workflow-lessons.md`]);
  if (basePage.ok && lessonsExist) {
    const headByLesson = new Map();
    for (const row of localLessons.rows) {
      if (!headByLesson.has(row.lesson)) headByLesson.set(row.lesson, row);
    }
    const declared = [];
    for (const commit of commits) {
      for (const line of `${commit.subject}\n${commit.body}`.split("\n")) {
        const match = APPLICABILITY_CHANGE.exec(line.trim());
        if (match) declared.push(match[1]);
      }
    }
    const permitted = (lesson) => declared.some((entry) => /^all$/i.test(entry) || entry.includes(lesson) || lesson.includes(entry));
    for (const row of parseLessonText(basePage.out).rows.filter((entry) => !entry.status)) {
      const head = headByLesson.get(row.lesson);
      if (!head) { errors.push({ rule: "lesson-shrinkage", detail: row.lesson.slice(0, 60) }); continue; }
      // A preserved lesson text whose trigger loses an entry withdraws a recall
      // obligation without changing the text, so require an explicit declaration.
      const lost = triggerEntries(row.trigger).filter((entry) => !triggerEntries(head.trigger).includes(entry));
      if (lost.length > 0 && !permitted(row.lesson)) {
        errors.push({ rule: "applicability-withdrawn", detail: `${row.lesson.slice(0, 60)}: dropped ${lost.join(", ")}; declare Applicability-change: <reason>` });
      }
    }
  }
  if (head !== "HEAD" && requestedHead.ok && checkoutHead.ok && requestedHead.out !== checkoutHead.out) {
    errors.push({ rule: "head-mismatch", detail: `requested ${head} (${requestedHead.out}) but the checkout is at ${checkoutHead.out}` });
    return { root, commits: [], results: [], errors, warnings: [], skipped: false };
  }
  const targets = new Map();
  for (const commit of commits) {
    const changed = commitChangedFiles(root, git, commit.sha);
    if (!changed.ok) {
      errors.push({ rule: "unreadable-changed-files", commit: commit.sha, detail: "git could not list the commit's files; the contract cannot be evaluated" });
      continue;
    }
    const files = changed.files;
    const contract = parseChangeContract(`${commit.subject}\n${commit.body}`);
    const surface = contractSurface(files);
    const changedModules = files.filter((file) => isRuntimeModule(file) && fs.existsSync(path.join(root, file)));
    if (changedModules.length > 0) {
      warnings.push(...uncoveredImporterWarnings({
        graph: importGraph(),
        changed: changedModules,
        namedRisks: contract.atRisk.map((ref) => normalizeRef(ref)),
        commit: commit.sha,
      }));
    }
    const symbolFiles = touchedSymbolFiles({ root, git, sha: commit.sha });
    const symbols = [...symbolFiles.keys()];
    const hot = churnEnabled ? churnHot({ root, git, sha: commit.sha, files }) : [];
    const recallTrailers = recallLines(`${commit.subject}\n${commit.body}`);
    const { waivers, errors: waiverErrors } = recallWaivers(root, recallTrailers);
    for (const waiverError of waiverErrors) errors.push({ ...waiverError, commit: commit.sha });
    for (const hit of recallLessons({ root, files, symbols, hot, symbolFiles })) {
      if (waivers.some((tokens) => waiverCoversHit(tokens, hit))) continue;
      const { falsifierFile, named, reconstructed } = recallBindings({ hit, lines: recallTrailers });
      const record = recallObligation({ strictRecall, hit, files, symbols }) ? errors : warnings;
      if (!reconstructed) {
        record.push({ rule: "unreconstructed-recall", commit: commit.sha, ref: hit.lesson, detail: `trigger ${hit.trigger} matched ${hit.matched.join(", ")}; add Recall: <${named.join(" or ") || "gate"}> => <changed file or symbol>` });
      } else {
        const testRefs = named.flatMap((value) => {
          const whole = normalizeRef(value);
          if (!/^[A-Za-z][\w-]*\s/.test(whole) && isTestFile(whole)) return [whole];
          return [...whole.matchAll(/[\w./-]+\.mjs/g)]
            .map((match) => normalizeRef(match[0]))
            .filter((reference) => isTestFile(reference));
        });
        const requiredTests = [...new Set([falsifierFile, ...testRefs].filter(Boolean))].map(normalizeRef);
        const declaredRefs = [
          ...contract.contracts.filter((entry) => entry.after === "green").map((entry) => normalizeRef(entry.ref)),
          ...contract.atRisk.map((ref) => normalizeRef(ref)),
        ];
        if (requiredTests.length > 0 && !requiredTests.some((test) => declaredRefs.includes(test))) {
          record.push({ rule: "unused-recall", commit: commit.sha, ref: hit.lesson, detail: `declare At-risk: ${requiredTests.join(" or ")} so the recalled lesson's test is exercised` });
        }
      }
    }
    const falsifiable = contract.contracts.some((entry) => entry.before === "red" && entry.after === "green");
    // A behavior-preserving surface change keeps an unchanged check green and must
    // not fabricate a flip; a behavioral change must show a red->green.
    const preserved = contract.contracts.length > 0 && contract.contracts.every((entry) => entry.before === "green" && entry.after === "green");
    if (surface && !falsifiable && !preserved) {
      errors.push(contract.contracts.length === 0
        ? { rule: "missing-change-contract", commit: commit.sha, detail: files.filter((file) => SURFACE.some((pattern) => pattern.test(file))).join(", ") }
        : { rule: "non-falsifiable-prediction", commit: commit.sha, detail: "declare a red->green flip" });
    }
    const admit = (entry, label) => {
      const target = resolveCheck(root, scripts, entry.ref);
      if (!target) {
        errors.push({ rule: "unknown-check", commit: commit.sha, ref: entry.ref, detail: label === "risk" ? "at-risk ref is denied, unknown, or unsafe" : "ref is denied, unknown, or unsafe" });
        return;
      }
      const authoredNow = target.kind === "script"
        ? (baseScripts !== null ? !Object.hasOwn(baseScripts, target.name) : git(root, ["rev-parse", "--git-dir"]).ok)
        : !git(root, ["cat-file", "-e", `${base}:${target.name}`]).ok;
      const commandChanged = target.kind === "script"
        && baseScripts !== null && Object.hasOwn(baseScripts, target.name) && baseScripts[target.name] !== scripts[target.name];
      const scriptState = target.kind === "script" ? scriptRedefinition(root, base, git, scripts[target.name] ?? "") : null;
      const fileChanged = (target.kind === "test" || target.kind === "node") ? checkFileRedefined(root, base, git, target.name) : false;
      const changedScriptFiles = target.kind === "script" && scriptState !== "non-literal" ? scriptChangedFiles(root, base, git, scripts[target.name] ?? "") : [];
      const changedTests = changedScriptFiles.filter(isTestFile);
      const changedOther = changedScriptFiles.filter((rel) => !isTestFile(rel));
      const changedUnderTest = changedFilesUnder(root, base, git, "test/").filter((rel) => fs.existsSync(path.join(root, rel)));
      let frozenObserver = false;
      let overlays = [];
      if (target.kind === "test" && verifyBefore && (authoredNow || fileChanged)) {
        frozenObserver = true;
        overlays = [...new Set([target.name, ...changedUnderTest])];
      } else if (target.kind === "script" && verifyBefore && !authoredNow && !commandChanged && scriptState !== "non-literal" && changedOther.length === 0 && changedTests.length > 0) {
        frozenObserver = true;
        overlays = [...new Set([...changedTests, ...changedUnderTest])];
      }
      if (!frozenObserver) {
        if (authoredNow) {
          errors.push({ rule: "self-authorized-check", commit: commit.sha, ref: entry.ref, detail: "the check did not exist before this range" });
          return;
        }
        if (commandChanged || fileChanged || changedTests.length > 0 || changedOther.length > 0 || scriptState === "non-literal") {
          const detail = scriptState === "non-literal" && !commandChanged ? "the declared check is not a literal invocation" : "the check was redefined in this range";
          errors.push({ rule: "self-authorized-check", commit: commit.sha, ref: entry.ref, detail });
          return;
        }
      }
      const reach = (() => { const seen = new Set(); for (let queue = [...files]; queue.length > 0;) for (const next of importGraph().get(queue.pop()) ?? []) if (!seen.has(next)) { seen.add(next); queue.push(next); } return seen; })();
      const observers = target.kind === "script" ? frozenTestsFor(root, target, () => listTestFiles(root, base, git)) : [target.name];
      const exercised = frozenObserver || (target.kind === "script" ? commandChanged || scriptState === "redefined" || changedTests.length > 0 || changedOther.length > 0 : fileChanged) || (observers ?? []).some((rel) => reach.has(rel) || files.includes(rel));
      if (verifyBefore && surface && label === "contract" && entry.before === "green" && entry.after === "green" && !exercised) errors.push({ rule: "non-falsifiable-prediction", commit: commit.sha, ref: entry.ref, detail: `the green->green check ${entry.ref} is unchanged, unfrozen, and not reached by a changed file` });
      const key = `${target.kind}:${target.name}`;
      const record = targets.get(key) ?? { target, obligations: [] };
      const after = label === "risk" ? "green" : entry.after;
      if (record.obligations.some((obligation) => obligation.after !== after)) {
        const seen = [...new Set([...record.obligations.map((obligation) => obligation.after), after])];
        errors.push({ rule: "conflicting-obligations", commit: commit.sha, ref: entry.ref, detail: `the same check (${key}) is predicted both ${seen.join(" and ")} across the range` });
        return;
      }
      record.obligations.push({ commit: commit.sha, after, label, before: label === "risk" ? "green" : entry.before, ref: entry.ref, frozenObserver });
      record.overlays = frozenObserver ? overlays : (record.overlays ?? []);
      targets.set(key, record);
    };
    for (const entry of contract.contracts) admit(entry, "contract");
    for (const ref of contract.atRisk) admit({ ref, before: "green", after: "green" }, "risk");
  }
  const results = [];
  const baseRunner = runAtBase ?? ((args) => runCheckAtBase({ ...args, git }));
  for (const record of targets.values()) {
    const overlays = record.overlays ?? [];
    const headFrozen = frozenTestsFor(root, record.target, () => listTestFiles(root, "HEAD", git));
    const headArgs = record.target.kind === "script" ? frozenNodeArgs(scriptCommand(root, record.target) ?? "") : [];
    const outcome = run({ root, target: record.target, frozenTests: headFrozen, frozenArgs: headArgs });
    const baseCache = new Map();
    const baseOnce = (value) => {
      const key = value && value.length ? value.join(",") : "\u0000";
      if (!baseCache.has(key)) baseCache.set(key, baseRunner({ root, base, target: record.target, overlay: value }));
      return baseCache.get(key);
    };
    for (const obligation of record.obligations) {
      results.push({ ref: obligation.ref, commit: obligation.commit, after: obligation.after, status: outcome.ok ? "green" : "red" });
      const failed = obligation.after === "green" ? !outcome.ok : outcome.ok;
      if (failed) {
        errors.push({ rule: obligation.label === "risk" ? "regressed-at-risk" : "unmet-prediction", commit: obligation.commit, ref: obligation.ref, detail: `predicted ${obligation.after}, observed ${outcome.ok ? "green" : "red"}${outputTail(outcome.output)}` });
      }
      if (verifyBefore && obligation.label === "contract" && obligation.before === "red" && obligation.after === "green" && outcome.ok) {
        const baseRun = baseOnce(overlays.length ? overlays : null);
        const baseOutput = baseRun.outcome?.output ?? "";
        if (baseRun.unavailable || baseRun.outcome?.spawnFailed) {
          errors.push({ rule: "before-state-unverified", commit: obligation.commit, ref: obligation.ref, detail: "the base check did not complete; its before-state is unproven" });
        } else if (tapSummary(baseOutput).setup) {
          errors.push({ rule: "before-state-unverified", commit: obligation.commit, ref: obligation.ref, detail: "the base check failed to load (setup error), so red is unproven" });
        } else {
          const red = obligation.frozenObserver ? frozenRedOk(baseOutput) : !baseRun.outcome.ok;
          results.push({ ref: obligation.ref, commit: obligation.commit, phase: "base", after: "red", status: red ? "red" : "green" });
          if (!red) {
            errors.push({ rule: "before-state-not-red", commit: obligation.commit, ref: obligation.ref, detail: "the check already passed at base; the declared red->green is not a real flip" });
          } else if (obligation.frozenObserver) {
            const headPass = new Set(tapSummary(outcome.output).passing);
            const missing = tapSummary(baseOutput).failing.filter((name) => !headPass.has(name));
            if (missing.length > 0) errors.push({ rule: "frozen-observer-mismatch", commit: obligation.commit, ref: obligation.ref, detail: `cases failing at base do not pass at head: ${missing.join(", ")}` });
            const baseObserver = baseOnce(null);
            if (!baseObserver.unavailable && !baseObserver.outcome?.spawnFailed) {
              const baseSummary = tapSummary(baseObserver.outcome.output);
              const baseCases = [...new Set([...baseSummary.passing, ...baseSummary.failing])].filter(Boolean);
              const lost = baseCases.filter((name) => !headPass.has(name));
              if (lost.length > 0) errors.push({ rule: "observer-shrinkage", commit: obligation.commit, ref: obligation.ref, detail: `the observer dropped previously existing cases: ${lost.join(", ")}` });
            }
          }
        }
      }
      // A green->green obligation over a check that changed in the range is only
      // trustworthy when the changed check was also green at base: otherwise an
      // unrelated pre-existing red rides along under a behavior-preserving claim.
      if (verifyBefore && obligation.before === "green" && obligation.after === "green" && obligation.frozenObserver && outcome.ok) {
        const baseRun = baseOnce(overlays.length ? overlays : null);
        const baseOutput = baseRun.outcome?.output ?? "";
        if (baseRun.unavailable || baseRun.outcome?.spawnFailed) {
          errors.push({ rule: "before-state-unverified", commit: obligation.commit, ref: obligation.ref, detail: "the base check did not complete; its before-state is unproven" });
        } else if (tapSummary(baseOutput).setup) {
          errors.push({ rule: "before-state-unverified", commit: obligation.commit, ref: obligation.ref, detail: "the base check failed to load (setup error), so green is unproven" });
        } else {
          const green = baseRun.outcome.ok;
          results.push({ ref: obligation.ref, commit: obligation.commit, phase: "base", after: "green", status: green ? "green" : "red" });
          if (!green) errors.push({ rule: "before-state-unverified", commit: obligation.commit, ref: obligation.ref, detail: "the check is red at base; the declared green->green before-state is unverified" });
        }
      }
    }
  }
  return { root, commits: commits.map((commit) => commit.sha), results, errors, warnings };
}

export { frozenNodeArgs };
