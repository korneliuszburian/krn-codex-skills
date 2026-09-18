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

const FAST = ["changes:check", "quality:audit", "test:lib", "test:repro", "validate"];
const DEEP = [
  "lessons:verify",
  "skills:check",
  "test:bootstrap",
  "test:catalog",
  "test:change-contract",
  "test:conformance",
  "test:durable-pages",
  "test:frontend",
  "test:hooks",
  "test:install",
  "test:lessons",
  "test:lessons-verify",
  "test:setup",
  "test:skill-scripts",
  "test:skills",
  "test:state",
];

test("gate:fast runs the cheap rejector gates", () => {
  const command = scripts()["gate:fast"];
  assert.ok(command, "gate:fast must exist");
  assert.deepEqual(sorted(stepsIn(command)), FAST, "gate:fast must run exactly the fast tier");
  assert.ok(!stepsIn(command).has("test:bootstrap"), "the fast tier must not absorb the deep suites");
});

test("gate:deep runs the install, bootstrap, and seal suites", () => {
  const command = scripts()["gate:deep"];
  assert.ok(command, "gate:deep must exist");
  assert.deepEqual(sorted(stepsIn(command)), DEEP, "gate:deep must run exactly the deep tier");
  for (const gate of ["test:bootstrap", "test:install", "test:conformance"]) {
    assert.ok(stepsIn(command).has(gate), `gate:deep must run ${gate}`);
  }
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

test("the workflow fans the tiers out as separate jobs with fail-fast disabled", () => {
  const text = workflow();
  assert.match(text, /fail-fast:\s*false/, "the workflow must disable fail-fast so one tier cannot cancel the other");
  assert.match(text, /matrix:/, "the workflow must use a matrix to fan the tiers out");
  assert.match(text, /tier:\s*\[\s*fast\s*,\s*deep\s*\]/, "the matrix must enumerate the fast and deep tiers");

  const chunks = text.split(/\n {6}- /).slice(1);
  const guardOf = (chunk) =>
    /if:\s*matrix\.tier\s*==\s*'fast'/.test(chunk) ? "fast"
      : /if:\s*matrix\.tier\s*==\s*'deep'/.test(chunk) ? "deep"
        : null;
  const byTier = { fast: new Set(), deep: new Set() };
  let fastRunsChanges = false;
  let deepRunsShellCheck = false;
  for (const chunk of chunks) {
    const tier = guardOf(chunk);
    if (!tier) continue;
    for (const match of chunk.matchAll(/npm run ([a-z:-]+)/g)) byTier[tier].add(match[1]);
    if (tier === "fast" && /krn\.mjs changes check/.test(chunk)) fastRunsChanges = true;
    if (tier === "deep" && /bash -n scripts\/install\.sh/.test(chunk)) deepRunsShellCheck = true;
  }
  assert.deepEqual(sorted(byTier.deep), DEEP, "the deep job must run exactly the deep tier");
  assert.ok(fastRunsChanges, "the fast job must run changes:check");
  for (const gate of ["validate", "quality:audit", "test:lib", "test:repro"]) {
    assert.ok(byTier.fast.has(gate), `the fast job must run ${gate}`);
  }
  const reproAt = text.indexOf("npm run test:repro");
  const changesAt = text.indexOf("node scripts/krn.mjs changes check");
  assert.ok(reproAt !== -1 && changesAt !== -1 && reproAt < changesAt, "the fast job must run test:repro before changes:check");
  assert.ok(deepRunsShellCheck, "the deep job must run the shell syntax check");
});
