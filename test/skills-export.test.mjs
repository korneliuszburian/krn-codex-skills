import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkSkills, exportSkills } from "../scripts/lib/skills-export.mjs";

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
}

function initRepo(root) {
  fs.mkdirSync(root, { recursive: true });
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "user.name", "fixture"]);
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "HEAD"]);
}

function writeSkill(dir, name, description) {
  fs.mkdirSync(path.join(dir, "agents"), { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`);
  fs.writeFileSync(
    path.join(dir, "agents", "openai.yaml"),
    `interface:\n  display_name: "${name}"\npolicy:\n  allow_implicit_invocation: true\n`,
  );
}

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-skills-export-"));
  const upstream = path.join(base, "upstream");
  initRepo(upstream);
  writeSkill(path.join(upstream, "skills", "eng", "one"), "one", "Upstream skill one");
  fs.writeFileSync(path.join(upstream, "LICENSE"), "MIT License\n");
  const upstreamHead = commit(upstream, "upstream");

  const source = path.join(base, "source");
  initRepo(source);
  writeSkill(path.join(source, "skills", "meta", "local"), "local", "Local skill");
  fs.mkdirSync(path.join(source, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(source, "skills", "manifest.json"),
    `${JSON.stringify({ schema_version: 1, skills: [{ name: "local", path: "skills/meta/local", implicit: true }] }, null, 2)}\n`,
  );
  fs.writeFileSync(
    path.join(source, "config", "upstream-sources.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        sources: [
          {
            id: "mattpocock/skills",
            repository: "https://example.invalid/skills.git",
            commit: upstreamHead,
            required_paths: ["skills/eng/one/SKILL.md"],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  commit(source, "source");

  const root = path.join(base, "consumer");
  fs.mkdirSync(root, { recursive: true });
  return { base, upstream, source, root };
}

test("export generates a checked skill set from both pins", () => {
  const f = fixture();
  const report = exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  assert.equal(report.skills, 2);
  assert.ok(fs.existsSync(path.join(f.root, ".agents", "skills", "local", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(f.root, ".agents", "skills", "one", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(f.root, ".agents", "skills", "UPSTREAM-LICENSE")));
  const check = checkSkills({ root: f.root });
  assert.deepEqual(check.errors, [], JSON.stringify(check));
  assert.ok(check.budget > 0);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("check fails when a directory name drifts", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  fs.renameSync(path.join(f.root, ".agents", "skills", "local"), path.join(f.root, ".agents", "skills", "local-x"));
  const check = checkSkills({ root: f.root });
  assert.ok(check.errors.some((error) => error.includes("must equal the directory name")));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("export refuses a foreign destination", () => {
  const f = fixture();
  fs.mkdirSync(path.join(f.root, ".agents", "skills", "foreign"), { recursive: true });
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }), /refusing to overwrite foreign content/);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("export refuses a mismatched upstream pin", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.upstream, "extra.txt"), "drift\n");
  commit(f.upstream, "drift");
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }), /expected/);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("re-export regenerates a previous export", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const second = exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  assert.equal(second.skills, 2);
  const check = checkSkills({ root: f.root });
  assert.deepEqual(check.errors, [], JSON.stringify(check));
  fs.rmSync(f.base, { recursive: true, force: true });
});
