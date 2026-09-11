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

function runCase({ root, file, name, timeout }) {
  const env = { ...process.env, KRN_LESSONS_VERIFY: "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=tap", `--test-name-pattern=${name}`, file], {
    cwd: root,
    timeout,
    encoding: "utf8",
    env,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const matched = output.split("\n").some((line) => {
    const tap = /^ok \d+ - (.*)$/.exec(line);
    return tap && tap[1].trim() === name;
  });
  return { ok: result.status === 0 && matched, status: result.status, output };
}

export function verifyLessons({ root, timeout = 120000, runner = runCase, force = false } = {}) {
  if (!force && process.env.KRN_LESSONS_VERIFY === "0") return { root, results: [], failures: [], skipped: true };
  const report = checkLessons({ root });
  const results = [];
  for (const lesson of report.lessons) {
    const match = TOKEN.exec((lesson.falsifier ?? "").replace(/`/g, "").trim());
    if (!match) continue;
    const [, file, name] = match;
    if (/[\u0000-\u001f\u007f]/.test(name) || !contained(root, file)) {
      results.push({ lesson: lesson.lesson, file, case: name, status: "skipped", reason: "unsafe or uncontained proof target" });
      continue;
    }
    const outcome = runner({ root, file: path.join(root, file), name, timeout });
    results.push({ lesson: lesson.lesson, file, case: name, status: outcome.ok ? "pass" : "fail", code: outcome.status });
  }
  return { root, results, failures: results.filter((result) => result.status === "fail") };
}
