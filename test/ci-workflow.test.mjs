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

test("the declared Node engine floor excludes the EOL Node 20 line", () => {
  const engines = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).engines?.node;
  assert.equal(String(engines).replace(/\s+/g, ""), ">=22", "engines.node must be exactly >=22");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  const tested = Number(/node-version:\s*(\d+)/.exec(workflow)?.[1]);
  assert.ok(tested >= 22, `CI must exercise a supported LTS, found ${tested}`);
});

test("every gate named in AGENTS.md runs in the workflow", () => {
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  const gates = new Set([...agents.matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
  const canonical = ["changes:check", "gate", "lessons:verify", "skills:check", "test:bootstrap", "test:catalog", "test:change-contract", "test:conformance", "test:durable-pages", "test:hooks", "test:install", "test:lessons", "test:lessons-verify", "test:lib", "test:setup", "test:skill-scripts", "test:skills", "test:state", "validate"];
  assert.deepEqual([...gates].sort(), canonical, "the AGENTS.md gate block must list the canonical gate set exactly");
  const steps = new Set([...workflow.matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
  if (/krn-codex\.mjs changes check/.test(workflow)) steps.add("changes:check");
  const aggregates = new Set(["gate", "test"]);
  for (const gate of gates) {
    if (aggregates.has(gate)) continue;
    assert.ok(steps.has(gate), `AGENTS.md gate ${gate} is missing from the workflow`);
  }
  assert.match(fs.readFileSync(path.join(root, "package.json"), "utf8"), /"gate":/, "the aggregate gate script must exist");
});

test("the gate list does not duplicate a check that validate already runs", () => {
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  assert.doesNotMatch(agents, /npm run lessons:check/, "lessons:check is subsumed by validate");
  assert.doesNotMatch(workflow, /npm run lessons:check/, "lessons:check is subsumed by validate");
});

test("the aggregate gate script covers every AGENTS.md gate", () => {
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const gates = new Set([...agents.matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const expanded = new Set([...String(scripts.gate ?? "").matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
  for (const gate of gates) {
    if (["lessons:check", "gate", "test"].includes(gate)) continue;
    assert.ok(expanded.has(gate), `AGENTS.md gate ${gate} is missing from the gate script`);
  }
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

test("the workflow runs every step of the aggregate gate script", () => {
  // The gate script is the executable owner of the sequence; CI must not omit a step.
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const gateSteps = new Set([...String(scripts.gate ?? "").matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
  assert.ok(gateSteps.size >= 15, `expected the gate script to parse, found ${gateSteps.size}`);
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  const steps = new Set([...workflow.matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
  if (/krn-codex\.mjs changes check/.test(workflow)) steps.add("changes:check");
  for (const step of gateSteps) {
    if (["gate", "test"].includes(step)) continue;
    assert.ok(steps.has(step), `gate step ${step} is missing from the workflow`);
  }
  assert.match(workflow, /bash -n scripts\/install\.sh/, "the workflow must keep the shell syntax checks");
  assert.match(workflow, /git diff --check/, "the workflow must keep the diff hygiene check");
});
