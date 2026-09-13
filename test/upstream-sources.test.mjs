import assert from "node:assert/strict";
import test from "node:test";

import { isSafeRelativePath } from "../scripts/lib/path-rules.mjs";
import { upstreamSkillNamesFrom, upstreamSourceErrors } from "../scripts/lib/upstream-sources.mjs";

const validSource = () => ({
  schema_version: 1,
  sources: [
    {
      id: "mattpocock/skills",
      repository: "https://github.com/mattpocock/skills.git",
      commit: "a".repeat(40),
      required_paths: ["skills/grp/alpha/SKILL.md"],
    },
  ],
});

test("upstreamSourceErrors accepts a canonical document", () => {
  assert.deepEqual(upstreamSourceErrors(validSource()), []);
});

test("upstreamSourceErrors reports structural and policy violations", () => {
  const cases = [
    [(doc) => (doc.schema_version = 2), /schema_version must be 1/],
    [(doc) => (doc.sources = []), /sources must be a non-empty array/],
    [
      (doc) => doc.sources.push({ ...doc.sources[0], commit: "b".repeat(40) }),
      /duplicate source id/,
    ],
    [(doc) => (doc.sources[0].repository = "git@github.com:x"), /invalid repository/],
    [(doc) => (doc.sources[0].commit = "short"), /invalid commit/],
    [(doc) => (doc.sources[0].required_paths = []), /required_paths must be non-empty/],
    [(doc) => (doc.sources[0].required_paths = ["../escape"]), /unsafe required path/],
    [
      (doc) => doc.sources[0].required_paths.push("skills/grp/alpha/SKILL.md"),
      /duplicate required path/,
    ],
    [
      (doc) => (doc.sources[0].harness_paths = ["skills/grp/other/SKILL.md"]),
      /harness path .* is not in required_paths/,
    ],
    [(doc) => (doc.sources[0].id = "other/skills"), /missing mattpocock\/skills source/],
  ];
  for (const [mutate, pattern] of cases) {
    const document = validSource();
    mutate(document);
    const errors = upstreamSourceErrors(document);
    assert.ok(
      errors.some((message) => pattern.test(message)),
      `expected ${pattern} in ${JSON.stringify(errors)}`,
    );
  }
});

test("upstreamSkillNamesFrom derives skill directory names", () => {
  const document = validSource();
  document.sources[0].required_paths.push("skills/grp/beta/SKILL.md");
  assert.deepEqual(upstreamSkillNamesFrom(document), ["alpha", "beta"]);
  assert.deepEqual(upstreamSkillNamesFrom({ sources: [{ id: "x" }] }), []);
});

test("isSafeRelativePath rejects absolute and escaping paths", () => {
  assert.equal(isSafeRelativePath("skills/a/SKILL.md"), true);
  assert.equal(isSafeRelativePath("/abs"), false);
  assert.equal(isSafeRelativePath("a/../b"), false);
  assert.equal(isSafeRelativePath("  "), false);
  assert.equal(isSafeRelativePath("a\\..\\b"), false);
  assert.equal(isSafeRelativePath("a\\b"), false);
});

test("upstreamSkillNamesFrom tolerates a malformed document", () => {
  assert.deepEqual(upstreamSkillNamesFrom({}), []);
  assert.deepEqual(upstreamSkillNamesFrom({ sources: "nope" }), []);
  assert.deepEqual(upstreamSkillNamesFrom({ sources: [{ required_paths: "nope" }] }), []);
  assert.deepEqual(upstreamSkillNamesFrom(validSource()), ["alpha"]);
});
