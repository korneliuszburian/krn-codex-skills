import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  assertAllowedRoot,
  canonicalSkills,
  derivedRolloutDay,
  forbiddenName,
  isRolloutFile,
} from "../scripts/lib/catalog/catalog-usage-paths.mjs";

test("forbiddenName flags quarantined and private path families", () => {
  for (const name of ["superpowers", "logs", "history.jsonl", "state.db", "state.sqlite-wal"]) {
    assert.equal(forbiddenName(name), true, name);
  }
  assert.equal(forbiddenName("skills"), false);
});

test("assertAllowedRoot rejects forbidden segments", () => {
  assert.doesNotThrow(() => assertAllowedRoot("/home/u/.codex/sessions"));
  assert.throws(
    () => assertAllowedRoot("/home/u/.codex/logs/sessions"),
    /forbidden path family/,
  );
});

test("isRolloutFile matches rollout jsonl names", () => {
  assert.equal(isRolloutFile("rollout-2026-01-02T00-00-00.jsonl"), true);
  assert.equal(isRolloutFile("other.jsonl"), false);
});

test("derivedRolloutDay derives a single dated day", () => {
  const root = "/sessions";
  assert.equal(
    derivedRolloutDay(root, path.join(root, "2026", "01", "02", "rollout-2026-01-02T00-00-00.jsonl")),
    "2026-01-02",
  );
  assert.equal(
    derivedRolloutDay(root, path.join(root, "2026", "01", "02", "rollout-2026-01-03T00-00-00.jsonl")),
    null,
  );
});

test("canonicalSkills normalizes absolute SKILL.md paths", () => {
  const byPath = canonicalSkills([
    "/skills/alpha/SKILL.md",
    { id: "beta-id", path: "/skills/beta/SKILL.md" },
  ]);
  assert.equal(byPath.get(path.normalize("/skills/alpha/SKILL.md")), "alpha");
  assert.equal(byPath.get(path.normalize("/skills/beta/SKILL.md")), "beta-id");
  assert.throws(() => canonicalSkills(["relative/SKILL.md"]), /absolute SKILL.md path/);
  assert.throws(() => canonicalSkills([{ id: "bad id", path: "/skills/b/SKILL.md" }]), /safe catalog identifier/);
  assert.throws(() => canonicalSkills(["/logs/alpha/SKILL.md"]), /forbidden path family/);
});
