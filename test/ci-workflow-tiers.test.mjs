import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const scripts = () => JSON.parse(read("package.json")).scripts;
const workflow = () => read(path.join(".github", "workflows", "validate.yml"));

const stepsIn = (command) => new Set([...String(command ?? "").matchAll(/npm run ([a-z:-]+)/g)].map((match) => match[1]));
const sorted = (values) => [...values].sort();
const same = (left, right) => JSON.stringify(sorted(left)) === JSON.stringify(sorted(right));

// The tier membership has one owner: package.json's gate:fast and gate:deep.
// The workflow runs the fast tier's changes:check inline (with PR_BASE and
// PUSH_BASE), so it is the one fast step that is not an `npm run` step there.
const fastTier = (map = scripts()) => {
  const steps = stepsIn(map["gate:fast"]);
  steps.delete("changes:check");
  return steps;
};
const deepTier = (map = scripts()) => stepsIn(map["gate:deep"]);

// Exported so the observer itself is falsifiable against a fixture workflow
// that adds or drops a tier step.
export function tierWorkflowErrors(text, map = scripts()) {
  const errors = [];
  if (!/fail-fast:\s*false/.test(text)) errors.push("workflow must disable fail-fast");
  if (!/matrix:/.test(text)) errors.push("workflow must fan the tiers out as a matrix");
  if (!/tier:\s*\[\s*fast\s*,\s*deep\s*\]/.test(text)) errors.push("matrix must enumerate fast and deep");

  const chunks = text.split(/\n {6}- /).slice(1);
  const guardOf = (chunk) =>
    /if:\s*matrix\.tier\s*==\s*'fast'/.test(chunk) ? "fast"
      : /if:\s*matrix\.tier\s*==\s*'deep'/.test(chunk) ? "deep"
        : null;
  const byTier = { fast: new Set(), deep: new Set() };
  let fastRunsChanges = false;
  let deepRunsShellCheck = false;
  let deepRunsDiffCheck = false;
  for (const chunk of chunks) {
    const tier = guardOf(chunk);
    if (!tier) continue;
    for (const match of chunk.matchAll(/npm run ([a-z:-]+)/g)) byTier[tier].add(match[1]);
    if (tier === "fast" && /krn\.mjs changes check/.test(chunk)) fastRunsChanges = true;
    if (tier === "deep" && /bash -n scripts\/install\.sh/.test(chunk)) deepRunsShellCheck = true;
    if (tier === "deep" && /git diff --check/.test(chunk)) deepRunsDiffCheck = true;
  }
  if (!same(byTier.fast, fastTier(map))) errors.push(`the fast job steps do not match gate:fast: ${sorted(byTier.fast)}`);
  if (!same(byTier.deep, deepTier(map))) errors.push(`the deep job steps do not match gate:deep: ${sorted(byTier.deep)}`);
  if (!fastRunsChanges) errors.push("the fast job must run changes:check");
  if (!deepRunsShellCheck) errors.push("the deep job must run the shell syntax check");
  if (!deepRunsDiffCheck) errors.push("the deep job must run the diff hygiene check");
  const reproAt = text.indexOf("npm run test:repro");
  const changesAt = text.indexOf("node scripts/krn.mjs changes check");
  if (!(reproAt !== -1 && changesAt !== -1 && reproAt < changesAt)) errors.push("the fast job must run test:repro before changes:check");
  return errors;
}

test("gate:fast runs the cheap rejector gates", () => {
  const command = scripts()["gate:fast"];
  assert.ok(command, "gate:fast must exist");
  for (const gate of ["validate", "quality:audit", "test:repro", "changes:check", "test:lib", "conformance:check"]) {
    assert.ok(stepsIn(command).has(gate), `gate:fast must run ${gate}`);
  }
  assert.ok(!stepsIn(command).has("test:bootstrap"), "the fast tier must not absorb the deep suites");
});

test("gate:deep runs the install, bootstrap, and seal suites", () => {
  const command = scripts()["gate:deep"];
  assert.ok(command, "gate:deep must exist");
  for (const gate of ["test:bootstrap", "test:install", "test:conformance"]) {
    assert.ok(stepsIn(command).has(gate), `gate:deep must run ${gate}`);
  }
  assert.ok(!stepsIn(command).has("changes:check"), "the deep tier must not absorb the fast tier");
  assert.match(command, /bash -n scripts\/install\.sh/, "the deep tier keeps the shell syntax check");
  assert.match(command, /git diff --check/, "the deep tier keeps the diff hygiene check");
});

test("gate stays the union of the two tiers", () => {
  const commands = scripts();
  const union = new Set([...stepsIn(commands["gate:fast"]), ...stepsIn(commands["gate:deep"])]);
  assert.deepEqual(sorted(stepsIn(commands.gate)), sorted(union), "gate must be exactly the union of gate:fast and gate:deep");
  assert.match(commands.gate, /bash -n scripts\/install\.sh/, "gate must keep the shell syntax checks");
  assert.match(commands.gate, /git diff --check/, "gate must keep the diff hygiene check");
});

test("the workflow fans the tiers out as separate jobs and matches the gate scripts", () => {
  assert.deepEqual(tierWorkflowErrors(workflow(), scripts()), []);
});

test("the observer rejects a workflow that adds or drops a tier step", () => {
  const added = `${workflow()}\n      - name: Sneaky\n        if: matrix.tier == 'fast'\n        run: npm run test:bootstrap\n`;
  assert.ok(tierWorkflowErrors(added, scripts()).some((error) => error.includes("fast job steps")), JSON.stringify(tierWorkflowErrors(added, scripts())));
  const dropped = workflow().replace("        run: npm run test:hooks\n", "");
  assert.ok(tierWorkflowErrors(dropped, scripts()).some((error) => error.includes("deep job steps")), JSON.stringify(tierWorkflowErrors(dropped, scripts())));
});
