import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { normalizeCommandPath, observedSkillsInShell } from "../../scripts/lib/catalog/catalog-usage-normalize.mjs";

test("normalizeCommandPath resolves absolute and workdir-relative candidates", () => {
  assert.equal(normalizeCommandPath("/a/b/../c", "/w"), path.normalize("/a/c"));
  assert.equal(normalizeCommandPath("skill.md", "/work"), path.resolve("/work", "skill.md"));
  assert.equal(normalizeCommandPath("skill.md", undefined), null);
  assert.equal(normalizeCommandPath("skill.md", "relative"), null);
});

test("observedSkillsInShell reads direct and nested shell commands", () => {
  const skills = new Map([[path.normalize("/skills/alpha/SKILL.md"), "alpha"]]);
  assert.deepEqual(
    [...observedSkillsInShell("cat /skills/alpha/SKILL.md", "/w", skills, "confirmed")],
    [["alpha", "confirmed"]],
  );
  assert.deepEqual(
    [...observedSkillsInShell('bash -c "grep -n foo /skills/alpha/SKILL.md"', "/w", skills, "syntactic_only")],
    [["alpha", "syntactic_only"]],
  );
});

test("observedSkillsInShell ignores non-read and malformed commands", () => {
  const skills = new Map([[path.normalize("/skills/alpha/SKILL.md"), "alpha"]]);
  assert.deepEqual([...observedSkillsInShell("cat 'unterminated", "/w", skills, "confirmed")], []);
  assert.deepEqual([...observedSkillsInShell("echo /skills/alpha/SKILL.md", "/w", skills, "confirmed")], []);
  assert.deepEqual([...observedSkillsInShell("cat relative/SKILL.md", "/w", skills, "confirmed")], []);
});

test("a heredoc body is not tokenized as commands", () => {
  const skills = new Map([["/skills/alpha/SKILL.md", "alpha"]]);
  const found = [...observedSkillsInShell("cat <<'EOF'\ncat /skills/alpha/SKILL.md\nEOF\n", "/w", skills, "confirmed")];
  assert.deepEqual(found, []);
});
