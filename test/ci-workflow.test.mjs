import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the validation workflow runs on every main push as well as pull requests", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  assert.match(workflow, /^\s{2}pull_request:\s*$/m, "must run on pull_request");
  assert.match(workflow, /^\s{2}push:\s*$/m, "must run on push");
  assert.match(workflow, /^\s{4}branches:\s*\[main\]\s*$/m, "the push trigger must target main");
  assert.match(workflow, /group:\s*validate-\$\{\{\s*github\.ref\s*\}\}/, "concurrency must key on the ref so pushes and PRs do not collide");
  assert.match(workflow, /cancel-in-progress:\s*\$\{\{\s*github\.ref\s*!=\s*'refs\/heads\/main'\s*\}\}/, "main runs must not cancel each other, so every main commit keeps a completed check");
  assert.match(workflow, /PUSH_BASE:\s*\$\{\{\s*github\.event\.before\s*\}\}/, "push runs must evaluate the whole pushed range, not just HEAD~1");
  assert.match(workflow, /0000000000000000000000000000000000000000/, "a new branch has no before-commit and must fall back");
});

test("the workflow gives frozen observer fixtures a git identity", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  for (const name of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) {
    assert.match(workflow, new RegExp(`^\\s{6}${name}:\\s*\\S+`, "m"), `the workflow must export ${name} so frozen observer fixtures can commit`);
  }
});

test("the gate job allows the full fast suite to finish", () => {
  // The fast job runs the frozen changes check over the whole pushed range and
  // then test:lib; on a 75-commit range that exceeds a ten-minute budget.
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  const minutes = Number(/timeout-minutes:\s*(\d+)/.exec(workflow)?.[1]);
  assert.ok(minutes >= 20, `the gate job timeout must cover the frozen changes check plus test:lib, found ${minutes} minutes`);
});

test("the declared Node engine floor excludes the EOL Node 20 line", () => {
  const engines = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).engines?.node;
  assert.equal(String(engines).replace(/\s+/g, ""), ">=22", "engines.node must be exactly >=22");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  const pinnedFile = /node-version-file:\s*(["']?)([^\s"']+)\1/.exec(workflow)?.[2];
  const tested = pinnedFile
    ? Number(fs.readFileSync(path.join(root, pinnedFile.replace(/^\.\//, "")), "utf8").trim().split(".")[0])
    : Number(/node-version:\s*(\d+)/.exec(workflow)?.[1]);
  assert.ok(tested >= 22, `CI must exercise a supported LTS, found ${tested}`);
});

test("the gate list does not duplicate a check that validate already runs", () => {
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  assert.doesNotMatch(agents, /npm run lessons:check/, "lessons:check is subsumed by validate");
  assert.doesNotMatch(workflow, /npm run lessons:check/, "lessons:check is subsumed by validate");
});

// The workflow's shell-syntax step is CI-only, so a renamed script must not
// leave a dangling `bash -n` path that fails only on the runner.
test("every workflow bash -n path exists", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  for (const match of workflow.matchAll(/bash -n (\S+)/g)) {
    assert.ok(fs.existsSync(path.join(root, match[1])), `the workflow bash -n path must exist: ${match[1]}`);
  }
});

// The approved conformance base has one owner: CI names it once and the local
// recipe consumes it, instead of CI and the recipe each deriving their own.
test("the conformance base has one owner across the workflow and the npm recipe", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  const recipe = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts["conformance:check"];
  assert.match(workflow, /KRN_CONFORMANCE_BASE/, "CI must name the base env the local recipe consumes");
  assert.match(recipe, /KRN_CONFORMANCE_BASE/, "the conformance:check recipe must honor the CI base env");
});

test("every discovered test file is run by a gate suite", () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const steps = [...String(scripts.gate ?? "").matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]);
  const covered = new Set();
  for (const step of steps) for (const match of String(scripts[step] ?? "").matchAll(/test\/[A-Za-z0-9_./-]+\.test\.mjs/g)) covered.add(match[0]);
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.name.endsWith(".test.mjs") ? [path.relative(root, full).split(path.sep).join("/")] : [];
  });
  for (const file of walk(path.join(root, "test"))) {
    if (file.startsWith("test/bootstrap-fixture/")) continue;
    assert.ok(covered.has(file), `${file} is not run by the gate`);
  }
});
