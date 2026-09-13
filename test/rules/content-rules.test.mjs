import assert from "node:assert/strict";
import test from "node:test";

import {
  markdownLinkErrors,
  parseFrontmatterFields,
  readmeSkillsTableErrors,
  readmeSourceOnlyPointerErrors,
  semanticXmlErrors,
  skillMarkdownErrors,
  unfencedLines,
} from "../../scripts/lib/rules/content-rules.mjs";

test("unfencedLines skips fenced blocks", () => {
  assert.deepEqual(
    unfencedLines("a\n```\nb\n```\nc").map((entry) => entry.line),
    ["a", "c"],
  );
});

test("semanticXmlErrors reports unmatched and unclosed tags", () => {
  assert.deepEqual(semanticXmlErrors("<a>\n</a>\n", "f.md"), []);
  const nested = semanticXmlErrors("<a>\n<b>\n</a>\n", "f.md");
  assert.deepEqual(nested, [
    "f.md:3: unmatched </a>",
    "f.md:1: unclosed <a>",
  ]);
  assert.deepEqual(semanticXmlErrors("```\n<a>\n```\n", "f.md"), []);
});

test("markdownLinkErrors resolves relative targets and skips external and anchors", () => {
  const seen = [];
  const errors = markdownLinkErrors("[x](missing.md)\n[y](https://a)\n[z](#intro)", {
    label: "README.md",
    resolveTarget: (target) => {
      seen.push(target);
      return false;
    },
  });
  assert.deepEqual(seen, ["missing.md"]);
  assert.deepEqual(errors, ["README.md:1: broken Markdown link missing.md"]);

  assert.deepEqual(
    markdownLinkErrors("[x](bad%ZZ)", { label: "f.md", resolveTarget: () => true }),
    ["f.md:1: malformed Markdown link target bad%ZZ"],
  );
});

const tableSkill = { name: "alpha", path: "skills/g/alpha/SKILL.md", implicit: false };
const table = [
  "## Skills",
  "",
  "| Skill | Invocation | Owns |",
  "| --- | --- | --- |",
  "| [`alpha`](skills/g/alpha/SKILL.md) | explicit only | thing |",
].join("\n");

test("readmeSkillsTableErrors accepts a canonical table and reports gaps", () => {
  assert.deepEqual(readmeSkillsTableErrors(table, { label: "README.md", skills: [tableSkill] }), []);
  const missing = readmeSkillsTableErrors(table, {
    label: "README.md",
    skills: [tableSkill, { name: "beta", path: "skills/g/beta/SKILL.md" }],
  });
  assert.deepEqual(missing, ["README.md: Skills table is missing manifest skill beta"]);
});

test("readmeSourceOnlyPointerErrors checks pointers and the not-installed statement", () => {
  const content = [
    "### Source-only packs",
    "",
    "[`pack`](skills/g/pack/SKILL.md) is not installed.",
  ].join("\n");
  const skills = [{ name: "pack", path: "skills/g/pack" }];
  assert.deepEqual(
    readmeSourceOnlyPointerErrors(content, { label: "README.md", skills, installableSkills: [] }),
    [],
  );
  assert.deepEqual(
    readmeSourceOnlyPointerErrors(content, {
      label: "README.md",
      skills,
      installableSkills: [{ name: "pack", path: "skills/g/pack" }],
    }),
    ["README.md: installable skill pack must not appear in the Source-only packs section"],
  );
});

test("skillMarkdownErrors flags local script paths and unknown references", () => {
  const known = new Set(["alpha"]);
  assert.deepEqual(
    skillMarkdownErrors("run node scripts/x.mjs with $alpha", {
      label: "SKILL.md",
      name: "alpha",
      knownSkillNames: known,
    }),
    [
      "SKILL.md: runnable global skill scripts must use the installed ~/.agents/skills/alpha/scripts path",
    ],
  );
  assert.deepEqual(
    skillMarkdownErrors("use $nope", { label: "SKILL.md", name: "alpha", knownSkillNames: known }),
    ["SKILL.md: unknown skill reference $nope"],
  );
});

test("parseFrontmatterFields parses and validates keys", () => {
  const valid = parseFrontmatterFields("---\nname: alpha\ndescription: demo\n---\nbody", "SKILL.md");
  assert.deepEqual(valid.errors, []);
  assert.deepEqual(valid.fields, { name: "alpha", description: "demo" });
  assert.deepEqual(parseFrontmatterFields("body", "SKILL.md").errors, ["SKILL.md: missing YAML frontmatter"]);
  assert.deepEqual(
    parseFrontmatterFields("---\r\nname: alpha\ndescription: demo\r\n---\r\nbody", "SKILL.md").fields,
    { name: "alpha", description: "demo" },
  );
  assert.ok(
    parseFrontmatterFields("---\nname: a\nextra: b\n---\n", "SKILL.md").errors.includes(
      "SKILL.md: frontmatter must contain only name and description",
    ),
  );
});

test("inline code links and self-closing or void tags are not errors", () => {
  const errors = markdownLinkErrors("a `[fake](missing.md)` example\n", { label: "README.md", resolveTarget: () => false });
  assert.deepEqual(errors, []);
  assert.deepEqual(semanticXmlErrors("<br />\n<img src=\"x\">\n<hr>\n", "f.md"), []);
});
