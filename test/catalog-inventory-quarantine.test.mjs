import assert from "node:assert/strict";
import test from "node:test";

import {
  compareInventoryRecords,
  createQuarantineCollector,
} from "../scripts/lib/catalog-inventory-quarantine.mjs";

test("createQuarantineCollector matches the fixed family and reports none by default", () => {
  const quarantine = createQuarantineCollector([], []);
  assert.equal(quarantine.matches("superpowers@market"), true);
  assert.equal(quarantine.matches("skills"), false);
  assert.equal(quarantine.familyFor("x-superpowers-y"), "superpowers");
  assert.equal(quarantine.familyFor("skills"), undefined);
  assert.deepEqual(quarantine.values(), []);
});

test("createQuarantineCollector records sanitized unique evidence", () => {
  const quarantine = createQuarantineCollector(
    [{ kind: "plugin", id: "superpowers@market", evidence: "dir", sourceId: "root", path: "/x/superpowers" }],
    [],
  );
  assert.deepEqual(quarantine.values(), [
    {
      kind: "plugin",
      id: "superpowers@market",
      evidence: "dir",
      sourceId: "root",
      path: "/x/superpowers",
    },
  ]);
  quarantine.add("skill", "superpowers", "lexical", "root", "/p/superpowers");
  quarantine.add("skill", "superpowers", "lexical", "root", "/p/superpowers");
  quarantine.add("skill", "clean-name", "lexical", "root", "/p/clean");
  assert.equal(quarantine.values().length, 2);
});

test("createQuarantineCollector validates and lowercases additional families", () => {
  const quarantine = createQuarantineCollector([], ["MyFam"]);
  assert.equal(quarantine.matches("MYFAM-thing"), true);
  assert.equal(quarantine.familyFor("myfam-thing"), "myfam");
  assert.throws(() => createQuarantineCollector([], "nope"), /non-empty strings/);
  assert.throws(() => createQuarantineCollector([], [""]), /non-empty strings/);
  assert.throws(() => createQuarantineCollector([], [1]), /non-empty strings/);
});

test("sanitized labels drop control characters and cap length", () => {
  const quarantine = createQuarantineCollector([], []);
  quarantine.add("plugin", `superpowers\n\t${"x".repeat(400)}`, "dir\nname", "root");
  const [record] = quarantine.values();
  assert.equal(record.id.includes("\n"), false);
  assert.equal(record.id.includes("\t"), false);
  assert.equal(record.evidence, "dir name");
  assert.equal(record.id.length <= 160, true);
});

test("compareInventoryRecords sorts by kind, id, and sourceId", () => {
  const records = [
    { kind: "tool", id: "b", sourceId: "s" },
    { kind: "tool", id: "a", sourceId: "s" },
    { kind: "plugin", id: "z", sourceId: "s" },
  ];
  assert.deepEqual(
    [...records].sort(compareInventoryRecords).map((record) => `${record.kind}:${record.id}`),
    ["plugin:z", "tool:a", "tool:b"],
  );
});
