import assert from "node:assert/strict";
import test from "node:test";
import { stalenessExit } from "./scripts/lib/lessons/staleness.mjs";
test("a stale marker fails closed", () => {
  assert.equal(stalenessExit({ marker: "a", current: "a" }), 0);
  assert.notEqual(stalenessExit({ marker: "a", current: "b" }), 0);
});
