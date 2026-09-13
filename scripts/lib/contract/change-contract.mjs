import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { runGit } from "../support/git-cli.mjs";
import { parseLessons, parseLessonText, recallLessons, recallLines, recallBindings } from "../lessons/lessons.mjs";
import { touchedSymbolFiles } from "./symbol-triggers.mjs";
import { churnHot } from "./churn.mjs";

const SURFACE = [
  /^scripts\//,
  /^test\//,
  /^package\.json$/,
  /^config\//,
  /^skills\/manifest\.json$/,
  /^skills\/.*\/scripts\//,
  /^docs\/research\/workflow-lessons\.md$/,
  /^\.github\/workflows\//,
];
const DENY = new Set(["changes:check"]);
const CONTRACT = /^(?:Change-contract|Prediction):\s*(.+?)\s*$/i;
const CONTRACT_PART = /^(.+?):\s*(red|green)\s*->\s*(red|green)\s*$/i;

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
    if (risk) atRisk.push(...risk[1].split(",").map((ref) => ref.trim()).filter(Boolean));
  }
  return { contracts, atRisk };
}

function resolveCheck(root, scripts, ref) {
  const name = ref.startsWith("npm run ") ? ref.slice("npm run ".length).trim() : ref;
  if (DENY.has(ref) || DENY.has(name)) return null;
  if (Object.hasOwn(scripts, name)) return { kind: "script", name };
  const rel = name.replace(/^\.\//, "");
  if (/^(test|scripts)\/.+\.mjs$/.test(rel) && !rel.includes("..")) {
    let real;
    try {
      real = path.relative(fs.realpathSync(root), fs.realpathSync(path.resolve(root, rel))).split(path.sep).join("/");
    } catch {
      return null;
    }
    if (real === rel && fs.statSync(path.resolve(root, rel), { throwIfNoEntry: false })?.isFile()) {
      return { kind: rel.startsWith("test/") ? "test" : "node", name: rel };
    }
  }
  return null;
}

function runCheck({ root, target, frozenTests = null }) {
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = target.kind === "script" && frozenTests?.length
    ? spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...frozenTests], { cwd: root, timeout: 600000, encoding: "utf8", env })
    : target.kind === "script"
      ? spawnSync("npm", ["run", target.name], { cwd: root, timeout: 600000, encoding: "utf8", env })
      : spawnSync(process.execPath, target.kind === "test" ? ["--test", "--test-reporter=tap", target.name] : [target.name], { cwd: root, timeout: 600000, encoding: "utf8", env });
  const spawnFailed = result.error !== undefined && result.error !== null || result.status === null;
  return { ok: result.status === 0, status: result.status, spawnFailed, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function checkFileRedefined(root, base, git, rel) {
  const before = git(root, ["rev-parse", `${base}:${rel}`]);
  const now = git(root, ["hash-object", rel]);
  return before.ok && (!now.ok || before.out.trim() !== now.out.trim());
}

const TEST_FLAG = /(^|\s)--test(\s|$)/;
const testFlagPresent = (command) => TEST_FLAG.test(command.replace(/['\"\\]/g, ""));

const BOOLEAN_TEST_FLAGS = new Set(["--test", "--test-only", "--test-force-exit", "--test-randomize", "--test-update-snapshots", "--test-coverage", "--test-watch"]);
function normalizeRel(rel) {
  const parts = [];
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}
const VALUE_FLAGS = new Set(["-r", "--import", "--require", "--loader", "--experimental-loader", "--test-name-pattern", "--test-reporter", "-e", "--eval"]);
function explicitTestOperands(command) {
  const tokens = command.replace(/\\[ \t]/g, "\u0000").split(/\s+/).filter(Boolean).map((token) => token.replace(/\u0000/g, " "));
  const files = [];
  let hasDirectory = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "node") continue;
    if (token.startsWith("--") && token.includes("=")) continue;
    if (VALUE_FLAGS.has(token)) { index += 1; continue; }
    if (token.startsWith("--test") && !BOOLEAN_TEST_FLAGS.has(token)) { index += 1; continue; }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    const cleaned = normalizeRel(token.replace(/^['"]|['"]$/g, "").replace(/\\(["'])/g, "$1").replace(/\\/g, "/"));
    if (new RegExp(`\\.(?:${CODE_EXT})$`).test(cleaned)) files.push(cleaned.replace(/^\.\//, ""));
    else if (!cleaned.startsWith("-")) hasDirectory = true;
  }
  return { files, hasDirectory };
}
const CODE_EXT = "mjs|js|cjs|sh|ts|mts|cts";
const TEST_FILE_RE = new RegExp(`(?:^|/)(?:test/.+|[^/]*\\.test|[^/]*-test|[^/]*_test|test-[^/]*|test)\\.(?:${CODE_EXT})$`);
const isTestFile = (rel) => TEST_FILE_RE.test(rel);

function literalCommandFiles(command, { positionalOnly = false } = {}) {
  const files = [];
  const safe = command.replace(/\\[ \t]/g, "\u0000");
  const clean = (value) => normalizeRel(value.replace(/\u0000/g, " ").replace(/\\(["'])/g, "$1").replace(/\\/g, "/"));
  const quoted = new RegExp(`"((?:\\\\.|[^"\\\\])+\\.(?:${CODE_EXT}))"|'((?:\\\\.|[^'\\\\])+\\.(?:${CODE_EXT}))'`, "g");
  for (const match of safe.matchAll(quoted)) files.push(clean(match[1] ?? match[2]));
  const prefix = positionalOnly ? "" : "(?:[A-Za-z_][A-Za-z0-9_]*=|--?[^\\s=]+=)?";
  const bare = new RegExp(`(?:^|\\s)${prefix}([^\\s]+\\.(?:${CODE_EXT}))(?=$|\\s)`, "g");
  for (const match of safe.matchAll(bare)) files.push(clean(match[1]));
  return files;
}

function changedFilesUnder(root, base, git, prefix) {
  const result = git(root, ["diff", "--name-only", "--diff-filter=ACMR", base, "--", prefix]);
  if (!result.ok) return [];
  return result.out.split("\n").map((entry) => entry.trim()).filter(Boolean);
}

function listTestFiles(root, base, git) {
  const names = new Set();
  for (const ref of [base, "HEAD"]) {
    const result = git(root, ["ls-tree", "-r", "-z", "--name-only", ref]);
    if (result.ok) for (const name of result.out.split("\0")) if (name.trim()) names.add(name.trim());
  }
  return [...names].filter((name) => TEST_FILE_RE.test(name));
}

function shimCommand(root, command) {
  const first = command.trim().split(/\s+/)[0];
  if (!first || first === "node" || first.includes("/")) return false;
  return fs.existsSync(path.join(root, "node_modules", ".bin", first));
}

function scriptNonLiteral(root, command) {
  return /[*?\[]/.test(command)
    || /[$`|;&<>]/.test(command)
    || /(^|[\s/'"])(?:[^\s/]*\/)*(?:sh|bash|zsh|dash|ash|ksh|busybox)\b[^\n]*?\s-[a-z]*c[a-z]*(\s|$)/.test(command)
    || /\b(?:npm|pnpm|yarn|bun)\s+(?:(?:-{1,2}\S+)(?:\s+\S+)?\s+)*(?:run|exec|test|start|dlx|x)\b/.test(command)
    || /(^|\s)node(?:\s+-{1,2}\S+)*\s+--run(\s|$)/.test(command)
    || /(^|\s)(?:bun|deno)\s+(?:test|bench)(\s|$)/.test(command)
    || /(^|\s)(?:npx|bunx)(\s|$)/.test(command)
    || shimCommand(root, command);
}

function scriptRedefinition(root, base, git, command) {
  if (scriptNonLiteral(root, command)) return "non-literal";
  const files = literalCommandFiles(command);
  const operands = explicitTestOperands(command);
  if (testFlagPresent(command) && (operands.files.filter(isTestFile).length === 0 || operands.hasDirectory)) files.push(...listTestFiles(root, base, git));
  for (const rel of files) if (checkFileRedefined(root, base, git, rel)) return "redefined";
  return "clean";
}

function scriptChangedFiles(root, base, git, command) {
  const files = literalCommandFiles(command);
  const operands = explicitTestOperands(command);
  if (testFlagPresent(command) && (operands.files.filter(isTestFile).length === 0 || operands.hasDirectory)) files.push(...listTestFiles(root, base, git));
  return files.filter((rel) => checkFileRedefined(root, base, git, rel));
}

function literalTestFiles(root, target) {
  if (target.kind !== "script") return null;
  const command = scriptCommand(root, target);
  if (typeof command !== "string" || scriptNonLiteral(root, command)) return null;
  const operands = explicitTestOperands(command);
  if (operands.hasDirectory) return null;
  const tests = operands.files.filter(isTestFile);
  return tests.length > 0 ? tests : null;
}

function frozenTestsFor(root, target, enumerate) {
  if (target.kind !== "script") return null;
  const command = scriptCommand(root, target);
  if (command && testFlagPresent(command)) return literalTestFiles(root, target) ?? enumerate();
  return null;
}

function scriptCommand(root, target) {
  if (target.kind !== "script") return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts?.[target.name] ?? null;
  } catch {
    return null;
  }
}

function listTestFilesIn(dir) {
  const found = [];
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(next);
      else if (isTestFile(next)) found.push(next);
    }
  };
  try {
    walk("");
  } catch {
    return [];
  }
  return found.sort();
}

function tapSummary(output) {
  const text = output ?? "";
  const unescape = (name) => name.replace(/\\([#\\])/g, "$1");
  const tests = Number((/^# tests (\d+)\s*$/m.exec(text)?.[1] ?? "0"));
  const fail = Number((/^#\s*fail[^0-9]*(\d+)\s*$/m.exec(text)?.[1] ?? "0"));
  const passing = [...text.matchAll(/^\s*ok \d+ - (.+?)\s*$/gm)].map((match) => unescape(match[1].trim()));
  const failing = [...text.matchAll(/^\s*not ok \d+ - (.+?)\s*$/gm)].map((match) => unescape(match[1].trim())).filter((name) => !/\.(mjs|js|cjs|ts)$/.test(name));
  const setup = /ERR_MODULE_NOT_FOUND|SyntaxError|Cannot find module|Could not find|MODULE_NOT_FOUND/.test(text);
  return { tests, fail, passing, failing, setup };
}

function frozenRedOk(output) {
  const summary = tapSummary(output);
  return summary.tests >= 1 && summary.fail >= 1 && summary.failing.length >= 1 && !summary.setup;
}


export function runCheckAtBase({ root, base, target, git = runGit, overlay = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krn-base-"));
  const added = git(root, ["worktree", "add", "--detach", dir, base]);
  if (!added.ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { unavailable: true };
  }
  try {
    const overlays = Array.isArray(overlay) ? overlay : overlay ? [overlay] : [];
    const rootReal = fs.realpathSync(root);
    for (const rel of overlays) {
      const from = path.join(root, rel);
      const to = path.join(dir, rel);
      if (!fs.existsSync(from)) return { unavailable: true };
      if (fs.lstatSync(from).isSymbolicLink()) return { unavailable: true };
      const real = path.relative(rootReal, fs.realpathSync(from));
      if (real.startsWith("..") || path.isAbsolute(real)) return { unavailable: true };
      try {
        fs.mkdirSync(path.dirname(to), { recursive: true });
        fs.copyFileSync(from, to);
      } catch {
        return { unavailable: true };
      }
    }
    const frozenTests = frozenTestsFor(root, target, () => listTestFilesIn(dir));
    return { outcome: runCheck({ root: dir, target, frozenTests }) };
  } finally {
    git(root, ["worktree", "remove", "--force", dir]);
    git(root, ["worktree", "prune"]);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function outputTail(output) {
  if (!output) return "";
  const lines = output.trim().split("\n");
  const failing = lines.filter((line) => /^not ok /.test(line)).slice(0, 3);
  const tail = lines.slice(-4);
  return `; output: ${[...new Set([...failing, ...tail])].join("\n")}`;
}

export function checkChangeContract({ root, base, head = "HEAD", git = runGit, run = runCheck, verifyBefore = false, runAtBase = null, strictRecall = false } = {}) {
  const errors = [];
  const warnings = [];
  const log = git(root, ["log", "--format=%H%x1f%s%x1f%b%x1e", `${base}..${head}`]);
  if (!log.ok) return { root, commits: [], results: [], errors: [{ rule: "unreadable-range", detail: `${base}..${head}` }] };
  const commits = log.out
    .split("\u001e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body] = record.split("\u001f");
      return { sha, subject: subject ?? "", body: body ?? "" };
    });
  const packageFile = path.join(root, "package.json");
  let scripts = {};
  if (fs.existsSync(packageFile)) {
    try { scripts = JSON.parse(fs.readFileSync(packageFile, "utf8")).scripts ?? {}; } catch { errors.push({ rule: "unreadable-package", detail: "package.json is not valid JSON" }); }
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
  const malformed = fs.existsSync(lessonsFile) ? parseLessons(lessonsFile).malformed : [];
  if (!fs.existsSync(lessonsFile) && commits.some((commit) => {
    const changed = git(root, ["show", "--no-renames", "--name-only", "-z", "--format=", commit.sha]);
    return changed.ok && contractSurface(changed.out.split("\0").map((entry) => entry.trim()).filter(Boolean));
  })) {
    errors.push({ rule: "missing-lessons", detail: "a surface change requires the workflow-lessons page for trigger delivery" });
  }
  if (malformed.length > 0) {
    errors.push({ rule: "malformed-lessons", detail: `${malformed.length} row(s); trigger delivery is unreliable` });
  }
  const churnEnabled = fs.existsSync(lessonsFile) && parseLessons(lessonsFile).rows.some((row) => (row.trigger ?? "").includes("churn:"));
  const basePage = git(root, ["show", `${base}:docs/research/workflow-lessons.md`]);
  if (basePage.ok && fs.existsSync(lessonsFile)) {
    const headTexts = new Set(parseLessonText(fs.readFileSync(lessonsFile, "utf8")).rows.map((row) => row.lesson));
    for (const row of parseLessonText(basePage.out).rows.filter((entry) => !entry.status)) {
      if (!headTexts.has(row.lesson)) errors.push({ rule: "lesson-shrinkage", detail: row.lesson.slice(0, 60) });
    }
  }
  const targets = new Map();
  for (const commit of commits) {
    const changed = git(root, ["show", "--no-renames", "--name-only", "-z", "--format=", commit.sha]);
    if (!changed.ok) {
      errors.push({ rule: "unreadable-changed-files", commit: commit.sha, detail: "git could not list the commit's files; the contract cannot be evaluated" });
      continue;
    }
    const files = changed.out.split("\0").map((entry) => entry.trim()).filter(Boolean);
    const contract = parseChangeContract(`${commit.subject}\n${commit.body}`);
    const surface = contractSurface(files);
    const symbolFiles = touchedSymbolFiles({ root, git, sha: commit.sha });
    const symbols = [...symbolFiles.keys()];
    const hot = churnEnabled ? churnHot({ root, git, sha: commit.sha, files }) : [];
    const recallTrailers = recallLines(`${commit.subject}\n${commit.body}`);
    for (const hit of recallLessons({ root, files, symbols, hot, symbolFiles })) {
      const { falsifierFile, named, reconstructed } = recallBindings({ hit, lines: recallTrailers });
      const record = strictRecall ? errors : warnings;
      if (!reconstructed) {
        record.push({ rule: "unreconstructed-recall", commit: commit.sha, ref: hit.lesson, detail: `trigger ${hit.trigger} matched ${hit.matched.join(", ")}; add Recall: <${named.join(" or ") || "gate"}> => <changed file or symbol>` });
      } else {
        const testRefs = named.flatMap((value) => [...value.matchAll(/\.?\/?[A-Za-z0-9_./-]*\.mjs/g)].map((match) => match[0].replace(/^\.\//, "")));
        const requiredTests = [...new Set([falsifierFile, ...testRefs].filter(Boolean))];
        const declaredRefs = [...contract.contracts.map((entry) => entry.ref), ...contract.atRisk];
        if (requiredTests.length > 0 && !requiredTests.some((test) => declaredRefs.includes(test))) {
          record.push({ rule: "unused-recall", commit: commit.sha, ref: hit.lesson, detail: `declare At-risk: ${requiredTests.join(" or ")} so the recalled lesson's test is exercised` });
        }
      }
    }
    const falsifiable = contract.contracts.some((entry) => entry.before === "red" && entry.after === "green");
    if (surface && !falsifiable) {
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
    const outcome = run({ root, target: record.target, frozenTests: headFrozen });
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
        errors.push({
          rule: obligation.label === "risk" ? "regressed-at-risk" : "unmet-prediction",
          commit: obligation.commit,
          ref: obligation.ref,
          detail: `predicted ${obligation.after}, observed ${outcome.ok ? "green" : "red"}${outputTail(outcome.output)}`,
        });
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
            if (missing.length > 0) {
              errors.push({ rule: "frozen-observer-mismatch", commit: obligation.commit, ref: obligation.ref, detail: `cases failing at base do not pass at head: ${missing.join(", ")}` });
            }
            const baseObserver = baseOnce(null);
            if (!baseObserver.unavailable && !baseObserver.outcome?.spawnFailed) {
              const baseSummary = tapSummary(baseObserver.outcome.output);
              const baseCases = [...new Set([...baseSummary.passing, ...baseSummary.failing])].filter(Boolean);
              const lost = baseCases.filter((name) => !headPass.has(name));
              if (lost.length > 0) {
                errors.push({ rule: "observer-shrinkage", commit: obligation.commit, ref: obligation.ref, detail: `the observer dropped previously existing cases: ${lost.join(", ")}` });
              }
            }
          }
        }
      }
    }
  }
  return { root, commits: commits.map((commit) => commit.sha), results, errors, warnings };
}
