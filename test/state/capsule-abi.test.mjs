import assert from "node:assert/strict";
import test from "node:test";

import { ABI_LABELS, fixedPointAnchors, parseCleanup, renderCapsule, stripMarkup } from "../../scripts/lib/state/capsule-abi.mjs";

test("renderCapsule refuses to emit a capsule with a missing label", () => {
  const values = Object.fromEntries(ABI_LABELS.map((label) => [label, "value"]));
  assert.match(renderCapsule(values), /^[^:]+: value/);
  delete values[ABI_LABELS[3]];
  assert.throws(() => renderCapsule(values), /missing labels: Publication state/);
});

test("renderCapsule refuses a null label value", () => {
  const values = Object.fromEntries(ABI_LABELS.map((label) => [label, "value"]));
  values[ABI_LABELS[0]] = null;
  assert.throws(() => renderCapsule(values), /missing labels/);
});

test("parseCleanup rejects text that is neither none nor a bracketed list", () => {
  const junk = parseCleanup("GARBAGE-NOT-none [.krn/runs/slice-work/one; slice-work; owner; trigger; ACTIVE]");
  assert.equal(junk.entries.length, 0);
  assert.equal(junk.malformed.length, 1);
});

test("parseCleanup parses well-formed entries and reports malformed ones", () => {
  const parsed = parseCleanup("[.krn/runs/slice-work/one; slice-work; owner; trigger; ACTIVE]");
  assert.deepEqual(parsed, { entries: [{ pointer: ".krn/runs/slice-work/one", workflow: "slice-work", consumer: "owner", trigger: "trigger", state: "ACTIVE" }], malformed: [] });
  const broken = parseCleanup("[pointer; workflow; owner; trigger; DONE]");
  assert.equal(broken.entries.length, 0);
  assert.equal(broken.malformed.length, 1);
});

test("stripMarkup removes markers", () => {
  assert.equal(stripMarkup("`value`"), "value");
});

test("fixedPointAnchors accepts a 64-hex sha256 anchor", () => {
  const sha = "a".repeat(64);
  assert.equal(fixedPointAnchors(`HEAD=${sha}`).head, sha);
});

test("parseCleanup tolerates a missing cleanup value", () => {
  assert.deepEqual(parseCleanup(null), { entries: [], malformed: [] });
  assert.deepEqual(parseCleanup(undefined), { entries: [], malformed: [] });
});
