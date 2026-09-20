import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { runProcess } from "../kernel/proc.mjs";

const COMMIT_ENV = {
  GIT_AUTHOR_NAME: "krn-conformance",
  GIT_AUTHOR_EMAIL: "conformance@krn.invalid",
  GIT_COMMITTER_NAME: "krn-conformance",
  GIT_COMMITTER_EMAIL: "conformance@krn.invalid",
  GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
};

const DEFAULT_PROGRAM = "scripts/krn.mjs";
const LEGACY_PROGRAM = "scripts/krn-codex.mjs";

// A candidate installed before the rename carries only the legacy shim, so the
// default program accepts `scripts/krn-codex.mjs` when the canonical entry is absent.
function resolveProgram(candidate, requested = DEFAULT_PROGRAM) {
  const canonical = path.join(candidate, requested);
  if (fs.existsSync(canonical)) return canonical;
  if (requested === DEFAULT_PROGRAM) {
    const legacy = path.join(candidate, LEGACY_PROGRAM);
    if (fs.existsSync(legacy)) return legacy;
  }
  return canonical;
}

export function loadCases(file) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  const cases = parsed?.cases;
  if (!Array.isArray(cases) || cases.length === 0) throw new Error(`${file} declares no conformance cases`);
  const program = parsed.program ?? DEFAULT_PROGRAM;
  if (typeof program !== "string" || !program.trim()) throw new Error(`${file}: program must be a non-empty relative path`);
  const rootArg = parsed.rootArg === undefined ? "--root" : parsed.rootArg;
  if (rootArg !== null && (typeof rootArg !== "string" || !rootArg.trim())) throw new Error(`${file}: rootArg must be a flag string or null`);
  const ids = new Set();
  for (const entry of cases) {
    if (!entry || typeof entry.id !== "string" || !entry.id.trim()) throw new Error(`${file}: a case needs a non-empty id`);
    if (!Array.isArray(entry.steps) || entry.steps.length === 0) throw new Error(`${file}: case ${entry.id} needs steps`);
    if (!Array.isArray(entry.run)) throw new Error(`${file}: case ${entry.id} needs run argv`);
    if (!entry.expect || typeof entry.expect.exit !== "number") throw new Error(`${file}: case ${entry.id} needs expect.exit`);
    if (entry.program !== undefined && (typeof entry.program !== "string" || !entry.program.trim())) throw new Error(`${file}: case ${entry.id} program must be a non-empty relative path`);
    if (entry.rootArg !== undefined && entry.rootArg !== null && (typeof entry.rootArg !== "string" || !entry.rootArg.trim())) throw new Error(`${file}: case ${entry.id} rootArg must be a flag string or null`);
    if (ids.has(entry.id)) throw new Error(`${file}: duplicate case id ${entry.id}`);
    ids.add(entry.id);
  }
  return cases.map((entry) => ({
    ...entry,
    program: entry.program ?? program,
    rootArg: entry.rootArg === undefined ? rootArg : entry.rootArg,
  }));
}

export function caseIds(file) {
  if (!fs.existsSync(file)) return null;
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  return new Set((parsed?.cases ?? []).map((entry) => entry?.id).filter((id) => typeof id === "string"));
}

function git(dir, args) {
  return runProcess("git", args, { cwd: dir, env: { ...process.env, ...COMMIT_ENV } });
}

function buildFixture(dir, steps) {
  fs.mkdirSync(dir, { recursive: true });
  const init = git(dir, ["init", "-q"]);
  if (init.status !== 0) throw new Error(`git init failed: ${init.err}`);
  for (const step of steps) {
    for (const [relative, content] of Object.entries(step.files ?? {})) {
      const target = path.join(dir, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    if (step.remove) for (const relative of step.remove) fs.rmSync(path.join(dir, relative), { force: true });
    const added = git(dir, ["add", "-A"]);
    if (added.status !== 0) throw new Error(`git add failed: ${added.err}`);
    const committed = git(dir, ["commit", "-q", "-m", step.message ?? "chore: step"]);
    if (committed.status !== 0) throw new Error(`git commit failed: ${committed.err}`);
  }
}

function evaluate(entry, outcome) {
  const problems = [];
  if (outcome.exit !== entry.expect.exit) problems.push(`exit ${outcome.exit}, expected ${entry.expect.exit}`);
  for (const needle of entry.expect.stderrIncludes ?? []) {
    if (!outcome.stderr.includes(needle)) problems.push(`stderr missing "${needle}"`);
  }
  for (const needle of entry.expect.stderrExcludes ?? []) {
    if (outcome.stderr.includes(needle)) problems.push(`stderr unexpectedly contains "${needle}"`);
  }
  for (const needle of entry.expect.stdoutIncludes ?? []) {
    if (!outcome.stdout.includes(needle)) problems.push(`stdout missing "${needle}"`);
  }
  for (const needle of entry.expect.stdoutExcludes ?? []) {
    if (outcome.stdout.includes(needle)) problems.push(`stdout unexpectedly contains "${needle}"`);
  }
  return problems;
}

function runCase({ candidate, entry, workRoot = os.tmpdir() }) {
  const dir = fs.mkdtempSync(path.join(workRoot, "krn-conformance-"));
  try {
    buildFixture(dir, entry.steps);
    if (entry.after) {
      const head = git(dir, ["rev-parse", "HEAD"]);
      const sha = head.status === 0 ? head.out.trim() : "";
      if (!sha) throw new Error("fixture has no HEAD to substitute");
      for (const [relative, content] of Object.entries(entry.after)) {
        const target = path.join(dir, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content.replaceAll("{{HEAD}}", sha).replaceAll("{{HEAD7}}", sha.slice(0, 7)));
      }
    }
    const program = resolveProgram(candidate, entry.program ?? DEFAULT_PROGRAM);
    const rootArg = entry.rootArg === undefined ? "--root" : entry.rootArg;
    const argv = rootArg ? [...entry.run, rootArg, dir] : [...entry.run];
    const run = runProcess(process.execPath, [program, ...argv], {
      cwd: dir,
      timeout: entry.timeoutMs ?? 120000,
      env: { ...process.env, KRN_CHANGE_CONTRACT: "1" },
    });
    const outcome = { exit: run.status ?? -1, stdout: run.out, stderr: run.err };
    const problems = evaluate(entry, outcome);
    if (run.errorCode) problems.push(`spawn error: ${run.errorMessage}`);
    return { id: entry.id, ok: problems.length === 0, detail: problems.join("; "), exit: outcome.exit };
  } catch (error) {
    return { id: entry.id, ok: false, detail: error.message, exit: -1 };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function runConformance({ candidate, cases, workRoot = os.tmpdir() } = {}) {
  return cases.map((entry) => runCase({ candidate, entry, workRoot }));
}
