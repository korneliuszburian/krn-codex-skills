import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { runGit } from "./git-cli.mjs";
import { parseLessons, parseLessonText, recallLessons, recallLines, recallBindings } from "./lessons.mjs";
import { touchedSymbols } from "./symbol-triggers.mjs";
import { churnHot } from "./churn.mjs";

const SURFACE = [
  /^scripts\//,
  /^test\//,
  /^package\.json$/,
  /^config\//,
  /^skills\/manifest\.json$/,
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

function runCheck({ root, target }) {
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
  const result = target.kind === "script"
    ? spawnSync("npm", ["run", target.name], { cwd: root, timeout: 600000, encoding: "utf8", env })
    : spawnSync(process.execPath, target.kind === "test" ? ["--test", target.name] : [target.name], { cwd: root, timeout: 600000, encoding: "utf8", env });
  return { ok: result.status === 0, status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

function checkFileRedefined(root, base, git, rel) {
  const before = git(root, ["rev-parse", `${base}:${rel}`]);
  const now = git(root, ["hash-object", rel]);
  return before.ok && (!now.ok || before.out.trim() !== now.out.trim());
}

function listTestFiles(root, base, git) {
  const names = new Set();
  for (const ref of [base, "HEAD"]) {
    const result = git(root, ["ls-tree", "-r", "-z", "--name-only", ref]);
    if (result.ok) for (const name of result.out.split("\0")) if (name.trim()) names.add(name.trim());
  }
  return [...names].filter((name) => name.startsWith("test/") && name.endsWith(".test.mjs"));
}

function scriptRedefinition(root, base, git, command) {
  if (/[*?\[]/.test(command) || /[$`|;&<>]/.test(command) || /(^|[\s/'"])(?:[^\s/]*\/)*(?:sh|bash|zsh|dash|ash|ksh|busybox)\b[^\n]*?\s-c(\s|$)/.test(command) || /(^|\s)npm\s+run(\s|$)/.test(command)) {
    return "non-literal";
  }
  const files = [];
  for (const match of command.matchAll(/"([^"]+\.(?:mjs|js|cjs|sh))"|'([^']+\.(?:mjs|js|cjs|sh))'/g)) {
    files.push((match[1] ?? match[2]).replace(/^\.\//, ""));
  }
  for (const match of command.matchAll(/(?:^|[\s=])([^\s=]+\.(?:mjs|js|cjs|sh))(?=$|[\s])/g)) {
    files.push(match[1].replace(/\\/g, "/").replace(/^\.\//, ""));
  }
  if (files.length === 0 && /(^|\s)--test(\s|$)/.test(command)) files.push(...listTestFiles(root, base, git));
  for (const rel of files) if (checkFileRedefined(root, base, git, rel)) return "redefined";
  return "clean";
}

function runCheckAtBase({ root, base, target, git = runGit }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krn-base-"));
  const added = git(root, ["worktree", "add", "--detach", dir, base]);
  if (!added.ok) {
    fs.rmSync(dir, { recursive: true, force: true });
    return { unavailable: true };
  }
  try {
    return { outcome: runCheck({ root: dir, target }) };
  } finally {
    git(root, ["worktree", "remove", "--force", dir]);
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

export function checkChangeContract({ root, base, head = "HEAD", git = runGit, run = runCheck, verifyBefore = false, runAtBase = null } = {}) {
  const errors = [];
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
  const scripts = fs.existsSync(packageFile) ? JSON.parse(fs.readFileSync(packageFile, "utf8")).scripts ?? {} : {};
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
    const symbols = touchedSymbols({ root, git, sha: commit.sha });
    const hot = churnEnabled ? churnHot({ root, git, sha: commit.sha, files }) : [];
    const recallTrailers = recallLines(`${commit.subject}\n${commit.body}`);
    for (const hit of recallLessons({ root, files, symbols, hot })) {
      const { ids, falsifierFile, named, reconstructed } = recallBindings({ hit, lines: recallTrailers, targets: [...files, ...symbols] });
      if (!reconstructed) {
        errors.push({ rule: "unreconstructed-recall", commit: commit.sha, ref: hit.lesson, detail: `trigger ${hit.trigger} matched ${hit.matched.join(", ")}; add Recall: <${named.join(" or ") || "gate"}> => <changed file or symbol>` });
      } else {
        const testRefs = named.flatMap((value) => [...value.matchAll(/\.?\/?[A-Za-z0-9_./-]*\.mjs/g)].map((match) => match[0].replace(/^\.\//, "")));
        const requiredTests = [...new Set([falsifierFile, ...testRefs].filter(Boolean))];
        const declaredRefs = [...contract.contracts.map((entry) => entry.ref), ...contract.atRisk];
        if (requiredTests.length > 0 && !requiredTests.some((test) => declaredRefs.includes(test))) {
          errors.push({ rule: "unused-recall", commit: commit.sha, ref: hit.lesson, detail: `declare At-risk: ${requiredTests.join(" or ")} so the recalled lesson's test is exercised` });
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
      if (authoredNow) {
        errors.push({ rule: "self-authorized-check", commit: commit.sha, ref: entry.ref, detail: "the check did not exist before this range" });
        return;
      }
      const commandChanged = target.kind === "script"
        && baseScripts !== null && Object.hasOwn(baseScripts, target.name) && baseScripts[target.name] !== scripts[target.name];
      const scriptState = target.kind === "script" ? scriptRedefinition(root, base, git, scripts[target.name] ?? "") : null;
      const redefined = target.kind === "script" ? commandChanged || scriptState !== "clean" : checkFileRedefined(root, base, git, target.name);
      if (redefined) {
        const detail = scriptState === "non-literal" && !commandChanged ? "the declared check is not a literal invocation" : "the check was redefined in this range";
        errors.push({ rule: "self-authorized-check", commit: commit.sha, ref: entry.ref, detail });
        return;
      }
      const key = `${target.kind}:${target.name}`;
      const record = targets.get(key) ?? { target, obligations: [] };
      const after = label === "risk" ? "green" : entry.after;
      if (record.obligations.some((obligation) => obligation.after !== after)) {
        const seen = [...new Set([...record.obligations.map((obligation) => obligation.after), after])];
        errors.push({ rule: "conflicting-obligations", commit: commit.sha, ref: entry.ref, detail: `the same check (${key}) is predicted both ${seen.join(" and ")} across the range` });
        return;
      }
      record.obligations.push({ commit: commit.sha, after, label, before: label === "risk" ? "green" : entry.before, ref: entry.ref });
      targets.set(key, record);
    };
    for (const entry of contract.contracts) admit(entry, "contract");
    for (const ref of contract.atRisk) admit({ ref, before: "green", after: "green" }, "risk");
  }
  const results = [];
  const baseRunner = runAtBase ?? ((args) => runCheckAtBase({ ...args, git }));
  for (const record of targets.values()) {
    const outcome = run({ root, target: record.target });
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
        const baseRun = baseRunner({ root, base, target: record.target });
        if (baseRun.unavailable) {
          errors.push({ rule: "before-state-unverified", commit: obligation.commit, ref: obligation.ref, detail: "the base revision could not be materialized to prove the before-state" });
        } else {
          results.push({ ref: obligation.ref, commit: obligation.commit, phase: "base", after: "red", status: baseRun.outcome.ok ? "green" : "red" });
          if (baseRun.outcome.ok) {
            errors.push({ rule: "before-state-not-red", commit: obligation.commit, ref: obligation.ref, detail: "the check already passed at base; the declared red->green is not a real flip" });
          }
        }
      }
    }
  }
  return { root, commits: commits.map((commit) => commit.sha), results, errors };
}
