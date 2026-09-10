import assert from "node:assert/strict";
import test from "node:test";

import { ABI_LABELS, commitTokens, parseCleanup, renderCapsule, stripMarkup } from "../scripts/lib/capsule-abi.mjs";

test("renderCapsule refuses to emit a capsule with a missing label", () => {
  const values = Object.fromEntries(ABI_LABELS.map((label) => [label, "value"]));
  assert.match(renderCapsule(values), /^[^:]+: value/);
  delete values[ABI_LABELS[3]];
  assert.throws(() => renderCapsule(values), /missing labels: Publication state/);
});

test("parseCleanup parses well-formed entries and reports malformed ones", () => {
  const parsed = parseCleanup("[.krn/runs/slice-work/one; slice-work; owner; trigger; ACTIVE]");
  assert.deepEqual(parsed, { entries: [{ pointer: ".krn/runs/slice-work/one", state: "ACTIVE" }], malformed: [] });
  const broken = parseCleanup("[pointer; workflow; owner; trigger; DONE]");
  assert.equal(broken.entries.length, 0);
  assert.equal(broken.malformed.length, 1);
});

test("commitTokens extracts fixed-point commits and stripMarkup removes markers", () => {
  assert.deepEqual(commitTokens("base=ffc3f987ded091b37448bd0481f8ad248f1e86a6; HEAD=21902f0"), ["ffc3f987ded091b37448bd0481f8ad248f1e86a6"]);
  assert.equal(stripMarkup("`value`"), "value");
});
