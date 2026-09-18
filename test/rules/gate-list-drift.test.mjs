import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GATE_STEP = /npm run ([a-z][a-z:-]*)/g;

function readGuarded(relative) {
  try {
    return readFileSync(path.join(ROOT, relative), "utf8");
  } catch {
    return null;
  }
}

function gateSteps(packageJsonText) {
  if (typeof packageJsonText !== "string") return null;
  try {
    const scripts = JSON.parse(packageJsonText).scripts ?? {};
    if (typeof scripts.gate !== "string") return null;
    return new Set([...scripts.gate.matchAll(GATE_STEP)].map((match) => match[1]));
  } catch {
    return null;
  }
}

function localGateSteps(agentsText) {
  if (typeof agentsText !== "string") return null;
  const header = agentsText.indexOf("## Local gates");
  if (header === -1) return null;
  const rest = agentsText.slice(header);
  const open = rest.indexOf("```");
  if (open === -1) return null;
  const body = rest.slice(open + 3);
  const close = body.indexOf("```");
  if (close === -1) return null;
  return new Set([...body.slice(0, close).matchAll(GATE_STEP)].map((match) => match[1]));
}

function drift() {
  const expected = gateSteps(readGuarded("package.json"));
  const actual = localGateSteps(readGuarded("AGENTS.md"));
  assert.ok(expected instanceof Set, "package.json scripts.gate must parse");
  assert.ok(actual instanceof Set, "AGENTS.md must carry a fenced ## Local gates block");
  return { expected, actual };
}

test("the handoff gate list names every step of the gate script", () => {
  const { expected, actual } = drift();
  const missing = [...expected].filter((step) => !actual.has(step)).sort();
  assert.deepEqual(missing, [], `AGENTS.md Local gates omits ${missing.join(", ")}`);
});

test("the handoff gate list names no step the gate script does not run", () => {
  const { expected, actual } = drift();
  const extra = [...actual].filter((step) => !expected.has(step)).sort();
  assert.deepEqual(extra, [], `AGENTS.md Local gates names steps the gate does not run: ${extra.join(", ")}`);
});
