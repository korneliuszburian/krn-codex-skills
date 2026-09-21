import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const INDEX = path.join(root, "skills", "advisory", "ask-gpt", "scripts", "project-index.mjs");
const RENDER = path.join(root, "skills", "advisory", "ask-gpt", "scripts", "render-prompt.mjs");

// Lazy so the base overlay reports a real assertion failure, not a module-load
// setup error, when the index script does not exist yet.
const loadIndex = async () => {
  try {
    return await import("../../skills/advisory/ask-gpt/scripts/project-index.mjs");
  } catch {
    return null;
  }
};

const gitIn = (dir, args) => spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });

const seedRepo = (dir) => {
  gitIn(dir, ["init", "-q"]);
  gitIn(dir, ["config", "user.email", "lab@krn.local"]);
  gitIn(dir, ["config", "user.name", "lab"]);
  gitIn(dir, ["remote", "add", "origin", "https://example.invalid/example.git"]);
  writeFileSync(path.join(dir, "a.mjs"), "export const a = 1;\n");
  gitIn(dir, ["add", "-A"]);
  gitIn(dir, ["commit", "-q", "-m", "chore: base"]);
};

test("the project index appends entries and recalls the latest", async () => {
  const index = await loadIndex();
  assert.ok(index, "scripts/project-index.mjs must exist");
  const dir = mkdtempSync(path.join(tmpdir(), "krn-ask-gpt-index-"));
  try {
    const file = path.join(dir, "projects.md");
    index.appendEntry({ index: file, entry: { at: "2026-09-20", project: "one", repository: "https://example.invalid/example", instructions: "existing", paths: "a", standards: "b" } });
    const entries = index.appendEntry({ index: file, entry: { at: "2026-09-21", project: "two", repository: "https://example.invalid/example", instructions: "missing", paths: "", standards: "" } });
    assert.equal(entries.length, 2, "both entries must be present");
    assert.deepEqual(entries.map((cells) => cells[1]), ["one", "two"], "entries stay in append order");
    assert.deepEqual(index.latestFor({ index: file, repository: "https://example.invalid/example" }), ["2026-09-21", "two", "https://example.invalid/example", "missing", "", ""]);
    assert.equal(index.latestFor({ index: file, repository: "https://other.invalid/x" }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the renderer carries the project context into the prompt", async () => {
  const index = await loadIndex();
  assert.ok(index, "scripts/project-index.mjs must exist");
  assert.ok(existsSync(RENDER), "render-prompt.mjs must exist");
  const dir = mkdtempSync(path.join(tmpdir(), "krn-ask-gpt-project-"));
  try {
    seedRepo(dir);
    const file = path.join(dir, "projects.md");
    index.appendEntry({ index: file, entry: { at: "2026-09-20", project: "krn", repository: "https://example.invalid/example", instructions: "existing", paths: "docs/research", standards: "ADR 0001" } });
    const result = spawnSync(process.execPath, [RENDER, "--root", dir, "--base", "HEAD", "--question", "q", "--allow-unpushed", "--index", file], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /## Project/);
    assert.match(result.stdout, /- project: krn/);
    assert.match(result.stdout, /- project instructions: existing/);
    assert.match(result.stdout, /- project standards: ADR 0001/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the skill carries the intake step and the append-only reference", () => {
  const skill = readFileSync(path.join(root, "skills", "advisory", "ask-gpt", "SKILL.md"), "utf8");
  assert.match(skill, /Run the project intake/);
  assert.match(skill, /references\/project-intake\.md/);
  const reference = readFileSync(path.join(root, "skills", "advisory", "ask-gpt", "references", "project-intake.md"), "utf8");
  for (const question of ["Create a project or reuse one", "Are the project instructions written", "Which files and standards belong to the project"]) {
    assert.ok(reference.includes(question), `the intake reference must ask: ${question}`);
  }
  assert.match(reference, /never rewrite/i, "the reference must state the append-only rule");
});
