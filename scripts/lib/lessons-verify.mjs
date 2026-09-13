import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { checkLessons } from "./lessons.mjs";

const ALLOWED = /^test\/[A-Za-z0-9_./-]+\.mjs$/;
const TOKEN = /^((?:test|scripts)\/[A-Za-z0-9_./-]+\.mjs)::(.+?)@([0-9a-f]{7})$/;

function contained(root, file) {
  if (!ALLOWED.test(file) || file.includes("..")) return false;
  try {
    const real = path.relative(fs.realpathSync(root), fs.realpathSync(path.resolve(root, file))).split(path.sep).join("/");
    return ALLOWED.test(real) && !real.startsWith("..") && !path.isAbsolute(real);
  } catch {
    return false;
  }
}

export function tapCasePassed(output, name) {
  return output.split("\n").some((line) => {
    const tap = /^\s*ok \d+ - (.+?)\s*$/.exec(line);
    if (!tap) return false;
    return tap[1].trim() === name;
  });
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function runCase({ root, file, name, timeout }) {
  const env = { ...process.env, KRN_LESSONS_VERIFY: "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-name-pattern=^${escapePattern(name)}$`, file], {
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
    if (/[\u0000-\u001f\u007f]/.test(name) || !contained(root, file)) {
      results.push({ lesson: lesson.lesson, file, case: name, status: "fail", reason: "unsafe or uncontained proof target" });
      continue;
    }
    const outcome = runner({ root, file: path.join(root, file), name, timeout });
    results.push({ lesson: lesson.lesson, file, case: name, status: outcome.ok ? "pass" : "fail", code: outcome.status });
  }
  return { root, results, failures: results.filter((result) => result.status === "fail"), errors };
}
