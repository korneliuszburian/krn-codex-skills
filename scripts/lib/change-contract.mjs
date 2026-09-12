import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { runGit } from "./git-cli.mjs";
import { parseLessons, parseLessonText, recallLessons, recallLines, recallBindings, globToRegex } from "./lessons.mjs";
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

function scriptTestFilesRedefined(root, base, git, command, scripts = {}, seen = new Set()) {
  for (const match of command.matchAll(/npm run ([\w:-]+)/g)) {
    const inner = match[1];
    if (!seen.has(inner) && Object.hasOwn(scripts, inner)) {
      seen.add(inner);
      if (scriptTestFilesRedefined(root, base, git, scripts[inner], scripts, seen)) return true;
    }
  }
  const tokens = new Set([
    ...[...command.matchAll(/test[\\/][^\s"']+\.mjs/g)].map((match) => match[0]),
    ...[...command.matchAll(/"([^"]+\.mjs)"/g)].map((match) => match[1]),
    ...[...command.matchAll(/'([^']+\.mjs)'/g)].map((match) => match[1]),
  ]);
  const list = (pattern) => {
    const regex = globToRegex(pattern);
    const names = new Set();
    for (const ref of [base, "HEAD"]) {
      const result = git(root, ["ls-tree", "-r", "-z", "--name-only", ref]);
      if (result.ok) for (const name of result.out.split("\0")) if (name.trim()) names.add(name.trim());
    }
    return [...names].filter((name) => regex.test(name));
  };
  for (const raw of tokens) {
    const token = raw.replace(/\\/g, "/");
    if (!/[*?\[]/.test(token) || git(root, ["rev-parse", `${base}:${token}`]).ok) {
      if (checkFileRedefined(root, base, git, token)) return true;
      continue;
    }
    for (const rel of list(token)) if (checkFileRedefined(root, base, git, rel)) return true;
  }
  const testArgs = command.replace(/^.*?--test\b/, "").split(/\s+/).filter((arg) => arg && !arg.startsWith("-"));
  for (const arg of testArgs) {
    const dir = arg.replace(/^["']|["']$/g, "").replace(/\\/g, "/").replace(/\/+$/, "");
    if (!dir || dir.endsWith(".mjs")) continue;
    for (const rel of list(`${dir}/**/*.mjs`)) if (checkFileRedefined(root, base, git, rel)) return true;
  }
  return false;
}

function outputTail(output) {
  if (!output) return "";
  const lines = output.trim().split("\n");
  const failing = lines.filter((line) => /^not ok /.test(line)).slice(0, 3);
  const tail = lines.slice(-4);
  return `; output: ${[...new Set([...failing, ...tail])].join("\n")}`;
}

export function checkChangeContract({ root, base, head = "HEAD", git = runGit, run = runCheck } = {}) {
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
  const atRiskTargets = new Map();
  for (const commit of commits) {
    const changed = git(root, ["show", "--no-renames", "--name-only", "-z", "--format=", commit.sha]);
    const files = changed.ok ? changed.out.split("\0").map((entry) => entry.trim()).filter(Boolean) : [];
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
        const requiredTests = [...new Set([falsifierFile, ...ids.filter((id) => /^test\/.*\.mjs$/.test(id))].filter(Boolean))];
        const declaredRefs = [...contract.contracts.map((entry) => entry.ref), ...contract.atRisk];
        if (requiredTests.length > 0 && !requiredTests.some((test) => declaredRefs.includes(test))) {
          errors.push({ rule: "unused-recall", commit: commit.sha, ref: hit.lesson, detail: `declare At-risk: ${requiredTests.join(" or ")} so the recalled lesson's test is exercised` });
        }
      }
    }
    const falsifiable = contract.contracts.some((entry) => entry.before !== entry.after);
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
      const redefined = target.kind === "script"
        ? (baseScripts !== null && Object.hasOwn(baseScripts, target.name) && baseScripts[target.name] !== scripts[target.name])
          || scriptTestFilesRedefined(root, base, git, scripts[target.name] ?? "", scripts)
        : checkFileRedefined(root, base, git, target.name);
      if (redefined) {
        errors.push({ rule: "self-authorized-check", commit: commit.sha, ref: entry.ref, detail: "the check was redefined in this range" });
        return;
      }
      (label === "risk" ? atRiskTargets : targets).set(entry.ref, { target, after: label === "risk" ? "green" : entry.after });
    };
    for (const entry of contract.contracts) admit(entry, "contract");
    for (const ref of contract.atRisk) admit({ ref, before: "green", after: "green" }, "risk");
  }
  const results = [];
  const verify = (ref, label) => {
    const entry = label === "risk" ? atRiskTargets.get(ref) : targets.get(ref);
    const outcome = run({ root, target: entry.target });
    results.push({ ref, after: label === "risk" ? "green" : entry.after, status: outcome.ok ? "green" : "red" });
    if (label === "risk" ? !outcome.ok : (entry.after === "green" ? !outcome.ok : outcome.ok)) {
      errors.push({ rule: label === "risk" ? "regressed-at-risk" : "unmet-prediction", ref, detail: `predicted ${label === "risk" ? "green" : entry.after}, observed ${outcome.ok ? "green" : "red"}${outputTail(outcome.output)}` });
    }
  };
  for (const ref of targets.keys()) verify(ref, "contract");
  for (const ref of atRiskTargets.keys()) if (!targets.has(ref)) verify(ref, "risk");
  return { root, commits: commits.map((commit) => commit.sha), results, errors };
}
