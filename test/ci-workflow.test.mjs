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
  assert.match(workflow, /PUSH_BASE:\s*\$\{\{\s*github\.event\.before\s*\}\}/, "push runs must evaluate the whole pushed range, not just HEAD~1");
});

test("every gate named in AGENTS.md runs in the workflow", () => {
  const agents = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  const gates = new Set([...agents.matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
  assert.ok(gates.size >= 15, `expected the AGENTS.md gate block to parse, found ${gates.size}`);
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
