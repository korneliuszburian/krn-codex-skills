import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { runGit } from "./git-cli.mjs";
import { parseLessons, recallLessons } from "./lessons.mjs";
import { touchedSymbols } from "./symbol-triggers.mjs";
import { churnHot } from "./churn.mjs";

const SURFACE = [
  /^scripts\//,
  /^test\//,
  /^package\.json$/,
  /^config\//,
  /^skills\/manifest\.json$/,
  /^\.github\/workflows\//,
];
const DENY = new Set(["changes:check"]);
const CONTRACT = /^(?:Change-contract|Prediction):\s*(.+?):\s*(red|green)\s*->\s*(red|green)\s*$/i;
const NO_CHECK = /^No-check:\s*(.+?)\s*$/i;

export function contractSurface(files) {
  return files.some((file) => SURFACE.some((pattern) => pattern.test(file)));
}

export function parseChangeContract(message) {
  const contracts = [];
  const atRisk = [];
  const falsifiers = [];
  let noCheck = "";
  for (const line of message.split("\n").map((entry) => entry.trim())) {
    const contract = CONTRACT.exec(line);
    if (contract) {
      contracts.push({ ref: contract[1].trim(), before: contract[2].toLowerCase(), after: contract[3].toLowerCase() });
      continue;
    }
    const risk = /^At-risk:\s*(.+?)(?::\s*(?:red|green)\s*->\s*(?:red|green))?\s*$/i.exec(line);
    if (risk) atRisk.push(risk[1].trim());
    const falsifier = /^Falsifier:\s*(.+?@[0-9a-f]{7})\s*$/i.exec(line);
    if (falsifier) falsifiers.push(falsifier[1].trim());
    const skip = NO_CHECK.exec(line);
    if (skip) noCheck = skip[1].trim();
  }
  return { contracts, atRisk, falsifiers, noCheck };
}

function resolveCheck(root, scripts, ref) {
  if (DENY.has(ref)) return null;
  const name = ref.startsWith("npm run ") ? ref.slice("npm run ".length).trim() : ref;
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
  return { ok: result.status === 0, status: result.status };
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
  const lessonsFile = path.join(root, "docs", "research", "workflow-lessons.md");
  const malformed = fs.existsSync(lessonsFile) ? parseLessons(lessonsFile).malformed : [];
  if (!fs.existsSync(lessonsFile) && commits.some((commit) => {
    const changed = git(root, ["show", "--no-renames", "--name-only", "--format=", commit.sha]);
    return changed.ok && contractSurface(changed.out.split("\n").map((entry) => entry.trim()).filter(Boolean));
  })) {
    errors.push({ rule: "missing-lessons", detail: "a surface change requires the workflow-lessons page for trigger delivery" });
  }
  if (malformed.length > 0) {
    errors.push({ rule: "malformed-lessons", detail: `${malformed.length} row(s); trigger delivery is unreliable` });
  }
  const targets = new Map();
  const atRiskTargets = new Map();
  for (const commit of commits) {
    const changed = git(root, ["show", "--no-renames", "--name-only", "--format=", commit.sha]);
    const files = changed.ok ? changed.out.split("\n").map((entry) => entry.trim()).filter(Boolean) : [];
    const contract = parseChangeContract(`${commit.subject}\n${commit.body}`);
    const surface = contractSurface(files);
    const symbols = touchedSymbols({ root, git, sha: commit.sha });
    const hot = churnHot({ root, git, sha: commit.sha, files });
    const recallLines = [...`${commit.subject}\n${commit.body}`.matchAll(/^Recall:\s*(.+?)\s*$/gim)].map((match) => match[1]);
    for (const hit of recallLessons({ root, files, symbols, hot })) {
      const ids = [...hit.gate.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
      const falsifierFile = (/(test\/[A-Za-z0-9_./-]+\.mjs)/.exec(hit.falsifier) ?? [])[1];
      const named = [...ids, falsifierFile].filter(Boolean);
      const namesId = (text, id) => new RegExp(`(^|[\\s,;])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s,;]|$)`).test(text);
      const changedTargets = [...files, ...symbols];
      const reconstructed = recallLines.some((line) => {
        const [left, right] = line.split("=>").map((part) => part?.trim() ?? "");
        if (!right || !named.some((id) => namesId(left, id))) return false;
        return right.split(/[\s,;]+/).filter(Boolean).some((target) => changedTargets.includes(target));
      });
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
    const justified = Boolean(contract.noCheck) && contract.atRisk.length > 0;
    if (surface && contract.contracts.length === 0 && !justified) {
      errors.push({ rule: "missing-change-contract", commit: commit.sha, detail: files.filter((file) => SURFACE.some((pattern) => pattern.test(file))).join(", ") });
    } else if (surface && contract.contracts.length > 0 && !contract.contracts.some((entry) => entry.before !== entry.after) && !justified) {
      errors.push({ rule: "non-falsifiable-prediction", commit: commit.sha, detail: "declare a red->green flip, or a No-check reason plus an At-risk check" });
    }
    const parentSha = `${commit.sha}^`;
    const parentPackage = git(root, ["show", `${parentSha}:package.json`]);
    let parentScripts = null;
    if (parentPackage.ok) {
      try {
        parentScripts = JSON.parse(parentPackage.out).scripts ?? {};
      } catch {
        parentScripts = null;
      }
    }
    const admit = (ref, label) => {
      const target = resolveCheck(root, scripts, ref);
      if (!target) {
        errors.push({ rule: "unknown-check", commit: commit.sha, ref, detail: label === "risk" ? "at-risk ref is denied, unknown, or unsafe" : "ref is denied, unknown, or unsafe" });
        return;
      }
      const authoredNow = target.kind === "script"
        ? (parentScripts !== null ? !Object.hasOwn(parentScripts, target.name) : git(root, ["rev-parse", "--git-dir"]).ok)
        : !git(root, ["cat-file", "-e", `${parentSha}:${target.name}`]).ok;
      if (authoredNow) {
        errors.push({ rule: "self-authorized-check", commit: commit.sha, ref, detail: "the check did not exist before this commit" });
        return;
      }
      (label === "risk" ? atRiskTargets : targets).set(ref, { target, after: label === "risk" ? "green" : contract.contracts.find((entry) => entry.ref === ref)?.after ?? "green" });
    };
    for (const entry of contract.contracts) admit(entry.ref, "contract");
    for (const ref of contract.atRisk) admit(ref, "risk");
  }
  const results = [];
  const verify = (ref, label) => {
    const entry = label === "risk" ? atRiskTargets.get(ref) : targets.get(ref);
    const outcome = run({ root, target: entry.target });
    results.push({ ref, after: label === "risk" ? "green" : entry.after, status: outcome.ok ? "green" : "red" });
    if (label === "risk" ? !outcome.ok : (entry.after === "green" ? !outcome.ok : outcome.ok)) {
      errors.push({ rule: label === "risk" ? "regressed-at-risk" : "unmet-prediction", ref, detail: `predicted ${label === "risk" ? "green" : entry.after}, observed ${outcome.ok ? "green" : "red"}` });
    }
  };
  for (const ref of targets.keys()) verify(ref, "contract");
  for (const ref of atRiskTargets.keys()) if (!targets.has(ref)) verify(ref, "risk");
  return { root, commits: commits.map((commit) => commit.sha), results, errors };
}
