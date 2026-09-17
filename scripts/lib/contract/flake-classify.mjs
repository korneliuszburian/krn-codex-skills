import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SUSPECTED_FLAKE = "suspected-flake";
const REGRESSION = "regression";
const COVERAGE_VARIABLE = "NODE_V8_COVERAGE";

const toPosix = (file) => String(file).split(sep).join("/");

const underRoot = (url, root) => {
  if (typeof url !== "string" || !url.startsWith("file://")) return null;
  let file;
  try {
    file = fileURLToPath(url);
  } catch {
    return null;
  }
  const rel = toPosix(relative(root, file));
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel;
};

const coverageScripts = (coverage) => {
  const items = Array.isArray(coverage) ? coverage : [coverage];
  const scripts = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    if (Array.isArray(item.result)) scripts.push(...item.result);
    else if (typeof item.url === "string") scripts.push(item);
  }
  return scripts;
};

const wasExecuted = (script) =>
  (script.functions ?? []).some((fn) =>
    (fn.ranges ?? []).some((range) => Number(range.count ?? 0) > 0),
  );

export function parseCoverage(coverage, { root = process.cwd() } = {}) {
  const files = new Set();
  for (const script of coverageScripts(coverage)) {
    if (!wasExecuted(script)) continue;
    const file = underRoot(script.url, root);
    if (file) files.add(file);
  }
  return files;
}

export function classifyFailures({ failures = [], changedFiles = [], executed: ran = [] } = {}) {
  const changed = new Set(changedFiles.map(toPosix));
  const executedSet = ran instanceof Set ? ran : new Set([...ran].map(toPosix));
  return failures.map((failure) => {
    const name = typeof failure === "string" ? failure : failure?.name;
    const evidence = [...changed].filter((file) => executedSet.has(file)).sort();
    return { name, label: evidence.length === 0 ? SUSPECTED_FLAKE : REGRESSION, evidence };
  });
}

export function retryCandidates(classifications = []) {
  return classifications
    .filter((entry) => entry.label === SUSPECTED_FLAKE)
    .map((entry) => entry.name);
}

export function applyRetryOutcomes(classifications = [], { passed = [] } = {}) {
  const passedOnRetry = new Set(passed);
  return classifications.map((entry) => {
    if (entry.label === REGRESSION) return { ...entry, status: "failed", retried: false };
    if (passedOnRetry.has(entry.name)) return { ...entry, status: "resolved", retried: true };
    return { ...entry, label: REGRESSION, status: "failed", retried: true, escalated: true };
  });
}

export function flakeReport(classifications = []) {
  return classifications.map((entry) => `${entry.name}: ${entry.label}`);
}

const readCoverage = (directory) => {
  let names = [];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  const payloads = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      payloads.push(JSON.parse(readFileSync(join(directory, name), "utf8")));
    } catch {
      continue;
    }
  }
  return payloads;
};

export function collectCoverage({ root = process.cwd(), run, env = process.env } = {}) {
  const directory = mkdtempSync(join(tmpdir(), "krn-flake-coverage-"));
  try {
    run?.({ ...env, [COVERAGE_VARIABLE]: directory });
    return parseCoverage(readCoverage(directory), { root });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const tapNames = (output, keyword) => {
  const names = new Set();
  const pattern = new RegExp(`^${keyword} \\d+ - (.+?)(?: #.*)?$`, "gm");
  for (const match of String(output ?? "").matchAll(pattern)) names.add(match[1].trim());
  return names;
};

const runSuiteOnce = ({ root, command, spawn, env }) => {
  let result;
  const executed = collectCoverage({
    root,
    env,
    run: (runEnv) => {
      result = spawn(command[0], command.slice(1), { cwd: root, encoding: "utf8", env: runEnv });
    },
  });
  return {
    status: typeof result?.status === "number" ? result.status : 1,
    output: `${result?.stdout ?? ""}${result?.stderr ?? ""}`,
    executed,
  };
};

export function runFlakeAwareSuite({
  root = process.cwd(),
  command = ["node", "--test"],
  changedFiles = [],
  retry = true,
  spawn = spawnSync,
  write = (text) => process.stdout.write(text),
  env = process.env,
} = {}) {
  const first = runSuiteOnce({ root, command, spawn, env });
  const failures = [...tapNames(first.output, "not ok")];
  if (failures.length === 0) {
    return { status: first.status, classifications: [], retried: [], output: first.output };
  }
  const classifications = classifyFailures({ failures, changedFiles, executed: first.executed });
  const candidates = retry ? retryCandidates(classifications) : [];
  const passed =
    candidates.length > 0 ? tapNames(runSuiteOnce({ root, command, spawn, env }).output, "ok") : new Set();
  const final = applyRetryOutcomes(classifications, { passed });
  write(`${flakeReport(final).join("\n")}\n`);
  const unresolved = final.filter((entry) => entry.status !== "resolved");
  return {
    status: unresolved.length > 0 ? first.status || 1 : 0,
    classifications: final,
    retried: candidates,
    output: first.output,
  };
}
