import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  assertAllowedRoot,
  canonicalSkillEntries,
  canonicalSkills,
  derivedRolloutDay,
  forbiddenName,
  isRolloutFile,
} from "../../scripts/lib/catalog/catalog-usage-paths.mjs";

test("canonicalSkillEntries drops target paths that are not canonical SKILL.md paths", () => {
  const entries = canonicalSkillEntries({
    skills: [
      { id: "shared", path: "/x/shared/SKILL.md", targetPath: "/x/shared-skill.md" },
      { id: "linked", path: "/x/linked/SKILL.md", targetPath: "/x/real/SKILL.md" },
      { id: "hist", path: "/x/hist/SKILL.md", targetPath: "/x/history/SKILL.md" },
    ],
    plugins: [],
  });
  assert.deepEqual(entries, [
    { id: "shared", path: "/x/shared/SKILL.md" },
    { id: "linked", path: "/x/linked/SKILL.md" },
    { id: "linked", path: "/x/real/SKILL.md" },
    { id: "hist", path: "/x/hist/SKILL.md" },
  ]);
  assert.doesNotThrow(() => canonicalSkills(entries));
});

test("canonicalSkillEntries drops non-canonical plugin and primary paths without throwing", () => {
  const entries = canonicalSkillEntries({
    skills: [{ id: "bad", path: "/x/logs/SKILL.md", targetPath: "/x/shared-skill.md" }],
    plugins: [
      {
        id: "demo@market",
        allSkillPaths: [
          "/cache/market/demo/1.0.0/skills/logs/SKILL.md",
          "/cache/market/demo/1.0.0/skills/ok/SKILL.md",
        ],
      },
    ],
  });
  assert.deepEqual(entries, [
    { id: "demo@market:ok", path: "/cache/market/demo/1.0.0/skills/ok/SKILL.md" },
  ]);
  assert.doesNotThrow(() => canonicalSkills(entries));
});

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
