import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { runGit } from "./git-cli.mjs";

const SURFACE = [
  /^scripts\/lib\/.*\.mjs$/,
  /^scripts\/validate\.mjs$/,
  /^scripts\/krn-codex.*\.mjs$/,
  /^package\.json$/,
  /^\.github\/workflows\/.*\.ya?ml$/,
];

const CONTRACT = /^(?:Change-contract|Prediction):\s*(.+?):\s*(red|green)\s*->\s*(red|green)\s*$/i;

export function contractSurface(files) {
  return files.some((file) => SURFACE.some((pattern) => pattern.test(file)));
}

export function parseChangeContract(message) {
  const contracts = [];
  const atRisk = [];
  const falsifiers = [];
  for (const line of message.split("\n").map((entry) => entry.trim())) {
    const contract = CONTRACT.exec(line);
    if (contract) {
      contracts.push({ ref: contract[1].trim(), after: contract[3].toLowerCase() });
      continue;
    }
    const risk = /^At-risk:\s*(.+?)\s*$/i.exec(line);
    if (risk) atRisk.push(risk[1].trim());
    const falsifier = /^Falsifier:\s*(.+?@[0-9a-f]{7})\s*$/i.exec(line);
    if (falsifier) falsifiers.push(falsifier[1].trim());
  }
  return { contracts, atRisk, falsifiers };
}

function resolveCheck(root, scripts, ref) {
  const name = ref.startsWith("npm run ") ? ref.slice("npm run ".length).trim() : ref;
  if (Object.hasOwn(scripts, name)) return { kind: "script", name };
  const rel = name.replace(/^\.\//, "");
  if (/^(test|scripts)\/.+\.mjs$/.test(rel)) {
    const absolute = path.resolve(root, rel);
    const within = path.relative(root, absolute);
    if (within && !within.startsWith("..") && !path.isAbsolute(within) && fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) {
      return { kind: rel.startsWith("test/") ? "test" : "node", name: rel };
    }
  }
  return null;
}

function runCheck(root, target) {
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
  const result = target.kind === "script"
    ? spawnSync("npm", ["run", target.name], { cwd: root, timeout: 600000, encoding: "utf8", env })
    : spawnSync(process.execPath, target.kind === "test" ? ["--test", target.name] : [target.name], { cwd: root, timeout: 600000, encoding: "utf8", env });
  return { ok: result.status === 0, status: result.status };
}

export function checkChangeContract({ root, base, head = "HEAD", git = runGit, run = runCheck } = {}) {
  if (process.env.KRN_CHANGE_CONTRACT === "0") return { root, commits: [], errors: [], skipped: true };
  const errors = [];
  const log = git(root, ["log", "--format=%H%x1f%s%x1f%b%x1e", `${base}..${head}`]);
  if (!log.ok) return { root, commits: [], errors: [{ rule: "unreadable-range", detail: `${base}..${head}` }] };
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
  const targets = new Map();
  const atRiskTargets = new Map();
  for (const commit of commits) {
    const changed = git(root, ["show", "--no-renames", "--name-only", "--format=", commit.sha]);
    const files = changed.ok ? changed.out.split("\n").map((entry) => entry.trim()).filter(Boolean) : [];
    const contract = parseChangeContract(`${commit.subject}\n${commit.body}`);
    if (contractSurface(files) && contract.contracts.length === 0) {
      errors.push({ rule: "missing-change-contract", commit: commit.sha, detail: files.filter((file) => SURFACE.some((pattern) => pattern.test(file))).join(", ") });
    }
    for (const entry of [...contract.contracts, ...contract.atRisk.map((ref) => ({ ref, after: "green" }))]) {
      const target = resolveCheck(root, scripts, entry.ref);
      if (!target) {
        errors.push({ rule: "unknown-check", commit: commit.sha, detail: entry.ref });
        continue;
      }
      (contract.atRisk.includes(entry.ref) ? atRiskTargets : targets).set(entry.ref, { target, after: entry.after });
    }
  }
  const results = [];
  for (const [ref, { target, after }] of targets) {
    const outcome = run({ root, target });
    const expectedGreen = after === "green";
    const met = expectedGreen ? outcome.ok : !outcome.ok;
    results.push({ ref, after, status: outcome.ok ? "green" : "red" });
    if (!met) errors.push({ rule: "unmet-prediction", ref, detail: `predicted ${after}, observed ${outcome.ok ? "green" : "red"}` });
  }
  for (const [ref, { target }] of atRiskTargets) {
    if (targets.has(ref)) continue;
    const outcome = run({ root, target });
    results.push({ ref, after: "green", status: outcome.ok ? "green" : "red" });
    if (!outcome.ok) errors.push({ rule: "regressed-at-risk", ref, detail: "at-risk check is red" });
  }
  return { root, commits: commits.map((commit) => commit.sha), results, errors };
}
