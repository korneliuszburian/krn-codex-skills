import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import { unfencedLines } from "../../scripts/lib/rules/content-rules.mjs";

const SKILL_ROOT = join("skills", "frontend");
const FRONTEND_SKILLS = [
  "frontend-components",
  "frontend-tokens",
  "frontend-process",
  "frontend-library",
];

const REPO_ROOTS = new Set(["skills", ".agents", "scripts", "config", "test"]);
const SKILL_RESOURCES = new Set(["references", "library", "scripts", "agents"]);

function repoPathCandidates(line) {
  const candidates = [];
  for (const match of line.matchAll(/`([^`]+)`/g)) {
    const value = match[1].trim();
    if (!value.includes("/")) continue;
    if (/[<>*$…\s]/.test(value)) continue;
    if (value.includes("://") || value.startsWith("--")) continue;
    candidates.push(value);
  }
  return candidates;
}

function skillReferencePathErrors(content, { label, root, skillDir, exists = existsSync }) {
  const errors = [];
  for (const { line, number } of unfencedLines(content)) {
    for (const candidate of repoPathCandidates(line)) {
      const value = candidate.split(/[#?]/)[0].replace(/\/+$/, "");
      const first = value.split("/")[0];
      const base = REPO_ROOTS.has(first) ? root : SKILL_RESOURCES.has(first) ? skillDir : null;
      if (!base) continue;
      if (!exists(resolve(base, value))) {
        errors.push(`${label}:${number}: backticked path does not exist: ${candidate}`);
      }
    }
  }
  return errors;
}

function markdownFiles(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith(".md")) files.push(path);
    }
  }
  return files.sort();
}

function sectionPhaseNumbers(content) {
  const phases = [];
  for (const line of content.split("\n")) {
    if (!/^###\s/.test(line)) continue;
    for (const match of line.matchAll(/Phase\s+(\d+(?:\.\d+)?)/g)) phases.push(Number(match[1]));
  }
  return phases;
}

function statedPhaseRanges(content) {
  return [...content.matchAll(/Phases?\s+(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/g)].map(
    (match) => [Number(match[1]), Number(match[2])],
  );
}

test("skillReferencePathErrors reports only unresolvable repo and skill-resource paths", () => {
  const root = "/repo";
  const skillDir = "/repo/skills/frontend/demo";
  const existing = new Set([
    "/repo/skills/frontend/library/library/css/blocks",
    "/repo/skills/frontend/demo/references/notes.md",
  ]);
  const content = [
    "Good `references/notes.md` and `skills/frontend/library/library/css/blocks/`.",
    "Bad `skills/frontend/missing/library/css/blocks/` and `references/ghost.md`.",
    "Ignore the project path `src/css/blocks/<slug>.css`.",
    "Ignore `https://example.com/a/b` and the custom property `--button-bg`.",
    "```",
    "Fenced `references/ghost.md` is not a reference.",
    "```",
  ].join("\n");
  assert.deepEqual(
    skillReferencePathErrors(content, {
      label: "demo/SKILL.md",
      root,
      skillDir,
      exists: (path) => existing.has(path),
    }),
    [
      "demo/SKILL.md:2: backticked path does not exist: skills/frontend/missing/library/css/blocks/",
      "demo/SKILL.md:2: backticked path does not exist: references/ghost.md",
    ],
  );
});

test("the frontend skills cite no broken backticked repo path", () => {
  const root = process.cwd();
  const errors = [];
  for (const name of FRONTEND_SKILLS) {
    const skillDir = join(SKILL_ROOT, name);
    for (const file of markdownFiles(skillDir)) {
      const content = readFileSync(file, "utf8");
      errors.push(
        ...skillReferencePathErrors(content, {
          label: file,
          root,
          skillDir: join(root, skillDir),
        }),
      );
      assert.ok(
        !content.includes(".agents/skills/frontend-library/"),
        `${file} cites the non-installed frontend-library export`,
      );
      assert.ok(!content.includes("AGENTS.frontend.md"), `${file} cites the nonexistent AGENTS.frontend.md`);
    }
  }
  assert.deepEqual(errors, []);
});

test("frontend-process states one phase range consistent with its sections", () => {
  const file = join(SKILL_ROOT, "frontend-process", "SKILL.md");
  const content = readFileSync(file, "utf8");
  const ranges = statedPhaseRanges(content);
  assert.equal(ranges.length, 1, "exactly one phase range is stated");
  const [start, end] = ranges[0];
  const defined = sectionPhaseNumbers(content);
  assert.ok(defined.length > 0, "the file defines phase sections");
  const last = Math.max(...defined);
  assert.equal(start, 1, "the executable range starts at Phase 1");
  assert.equal(end, last, `the stated range must reach the last defined section (Phase ${last})`);
});
