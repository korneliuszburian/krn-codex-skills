import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { posixRelative } from "../support/path-rules.mjs";
import { escapeRegExp } from "../support/regexp.mjs";
import { spawnSync } from "node:child_process";

import { checkLessons } from "./lessons.mjs";
import { tapName } from "../support/tap.mjs";
import { gitText as git } from "../support/git-cli.mjs";

const ALLOWED = /^test\/[A-Za-z0-9_./-]+\.mjs$/;
const TOKEN = /^((?:test|scripts)\/[A-Za-z0-9_./-]+\.mjs)::(.+?)@([0-9a-f]{7})$/;

function contained(root, file) {
  if (!ALLOWED.test(file) || file.includes("..")) return false;
  try {
    const real = posixRelative(fs.realpathSync(root), fs.realpathSync(path.resolve(root, file)));
    return ALLOWED.test(real) && !real.startsWith("..") && !path.isAbsolute(real);
  } catch {
    return false;
  }
}

export function tapCasePassed(output, name) {
  return output.split("\n").some((line) => {
    const t = tapName(line);
    return Boolean(t && t.pass && t.name === name);
  });
}



function runCase({ root, file, name, timeout }) {
  const env = { ...process.env, KRN_LESSONS_VERIFY: "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-name-pattern=^${escapeRegExp(name)}$`, file], {
    cwd: root,
    timeout,
    encoding: "utf8",
    env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { ok: result.status === 0 && tapCasePassed(output, name), status: result.status, output };
}

export function verifyLessons({ root, timeout = 120000, runner = runCase, force = false } = {}) {
  if (!force && process.env.KRN_LESSONS_VERIFY === "0") return { root, results: [], failures: [], errors: [], skipped: true };
  const report = checkLessons({ root });
  const errors = report.errors ?? [];
  const results = [];
  for (const lesson of report.lessons.filter((entry) => !entry.status)) {
    const raw = (lesson.falsifier ?? "").replace(/`/g, "").trim();
    if (!raw) continue;
    const match = TOKEN.exec(raw);
    if (!match) {
      results.push({ lesson: lesson.lesson, status: "fail", reason: "falsifier does not parse as <file>::<case>@<sha>" });
      continue;
    }
    const [, file, name] = match;
    if (name === file || name === path.basename(file) || name === path.join(root, file) || name === path.resolve(root, file)) {
      results.push({ lesson: lesson.lesson, file, case: name, status: "fail", reason: "falsifier must name a test case, not the file path" });
      continue;
    }
    if (/[\u0000-\u001f\u007f]/.test(name) || !contained(root, file)) {
      results.push({ lesson: lesson.lesson, file, case: name, status: "fail", reason: "unsafe or uncontained proof target" });
      continue;
    }
    const outcome = runner({ root, file: path.join(root, file), name, timeout });
    const result = { lesson: lesson.lesson, file, case: name, status: outcome.ok ? "pass" : "fail", code: outcome.status };
    if (!outcome.ok) result.detail = failureExcerpt(outcome.output);
    results.push(result);
  }
  return { root, results, failures: results.filter((result) => result.status === "fail"), errors };
}

function failureExcerpt(output) {
  const lines = String(output ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
  const assertion = lines.find((line) => /(AssertionError|Error:|expected|boom)/.test(line)) ?? lines[0] ?? "";
  return assertion.slice(0, 300);
}

export function reanchorLessons({ root, timeout = 120000, runner = runCase, gitImpl = git } = {}) {
  const report = checkLessons({ root });
  const pageFile = path.join(root, "docs", "research", "workflow-lessons.md");
  const updated = [];
  const skipped = [];
  if (!fs.existsSync(pageFile)) return { root, updated, skipped, errors: report.errors ?? [] };
  let text = fs.readFileSync(pageFile, "utf8");
  const dirty = String(gitImpl(root, ["status", "--porcelain"]) ?? "").trim();
  if (dirty) return { root, updated, skipped: [{ reason: "working tree is dirty; commit before reanchor", blocking: true }], errors: report.errors ?? [] };
  for (const lesson of report.lessons.filter((entry) => !entry.status)) {
    const raw = (lesson.falsifier ?? "").replace(/`/g, "").trim();
    const match = TOKEN.exec(raw);
    if (!match) {
      skipped.push({ lesson: lesson.lesson, reason: "falsifier is not a token", blocking: false });
      continue;
    }
    const [, file, name, sha] = match;
    if (name === file || name === path.basename(file) || name === path.join(root, file) || name === path.resolve(root, file)) {
      skipped.push({ lesson: lesson.lesson, reason: "falsifier must name a test case, not the file path", blocking: true });
      continue;
    }
    if (!contained(root, file)) {
      skipped.push({ lesson: lesson.lesson, reason: "unsafe or uncontained proof target", blocking: true });
      continue;
    }
    const gates = (lesson.resolved ?? []).map((entry) => entry.path).filter(Boolean).filter((gate) => gate !== file);
    const latest = String(gitImpl(root, ["log", "-1", "--format=%H", `${sha}..HEAD`, "--", file, ...gates]) ?? "").trim().slice(0, 7);
    if (!latest) continue;
    const outcome = runner({ root, file: path.join(root, file), name, timeout });
    if (!outcome.ok) {
      skipped.push({ lesson: lesson.lesson, reason: "proof did not re-run green", blocking: true });
      continue;
    }
    const candidateDir = fs.mkdtempSync(path.join(os.tmpdir(), "krn-reanchor-"));
    let candidateOk = false;
    try {
      gitImpl(root, ["worktree", "add", "--detach", candidateDir, latest]);
      if (fs.existsSync(path.join(candidateDir, file))) {
        candidateOk = runner({ root: candidateDir, file: path.join(candidateDir, file), name, timeout }).ok;
      }
    } finally {
      gitImpl(root, ["worktree", "remove", "--force", candidateDir]);
      fs.rmSync(candidateDir, { recursive: true, force: true });
    }
    if (!candidateOk) {
      skipped.push({ lesson: lesson.lesson, reason: `proof is not green at the candidate anchor ${latest}`, blocking: true });
      continue;
    }
    const from = `${file}::${name}@${sha}`;
    const lines = text.split("\n");
    let replaced = false;
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].startsWith(`| ${lesson.lesson} `) && lines[index].includes(from)) {
        lines[index] = lines[index].replace(from, `${file}::${name}@${latest}`);
        replaced = true;
        break;
      }
    }
    if (replaced) {
      text = lines.join("\n");
      updated.push({ lesson: lesson.lesson, file, from: sha, to: latest });
    } else {
      skipped.push({ lesson: lesson.lesson, reason: "anchor not found in its own row", blocking: true });
    }
  }
  if (updated.length > 0) fs.writeFileSync(pageFile, text);
  const after = updated.length > 0 ? checkLessons({ root }) : report;
  return { root, updated, skipped, errors: after.errors ?? [] };
}
