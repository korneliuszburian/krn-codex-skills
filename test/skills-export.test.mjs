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
  writeSkill(path.join(upstream, "skills", "eng", "two"), "two", "Upstream skill two");
  fs.writeFileSync(path.join(upstream, "LICENSE"), "MIT License\n");
  const upstreamHead = commit(upstream, "upstream");

  const source = path.join(base, "source");
  initRepo(source);
  writeSkill(path.join(source, "skills", "meta", "local"), "local", "Local skill");
  writeSkill(path.join(source, "skills", "meta", "extra"), "extra", "Excluded local skill");
  fs.mkdirSync(path.join(source, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(source, "skills", "manifest.json"),
    `${JSON.stringify({ schema_version: 1, harness_skills: ["local"], skills: [{ name: "local", path: "skills/meta/local", implicit: true }, { name: "extra", path: "skills/meta/extra", implicit: false }] }, null, 2)}\n`,
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
            required_paths: ["skills/eng/one/SKILL.md", "skills/eng/two/SKILL.md"],
            harness_paths: ["skills/eng/one/SKILL.md"],
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

test("export includes only the harness subset of upstream paths", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  assert.ok(fs.existsSync(path.join(f.root, ".agents", "skills", "one", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(f.root, ".agents", "skills", "two", "SKILL.md")));
  assert.ok(!fs.existsSync(path.join(f.root, ".agents", "skills", "extra", "SKILL.md")));
  const marker = JSON.parse(fs.readFileSync(path.join(f.root, ".agents", "skills", ".krn-export.json"), "utf8"));
  assert.deepEqual(marker.skills, ["local", "one"]);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("check fails when the marker skill set drifts by name", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const from = path.join(f.root, ".agents", "skills", "one");
  const to = path.join(f.root, ".agents", "skills", "one-x");
  fs.renameSync(from, to);
  const skillFile = path.join(to, "SKILL.md");
  fs.writeFileSync(skillFile, fs.readFileSync(skillFile, "utf8").replace("name: one", "name: one-x"));
  const check = checkSkills({ root: f.root });
  assert.ok(check.errors.some((error) => error.includes("marker lists")), JSON.stringify(check.errors));
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

test("check reports each structural failure in the export tree", () => {
  const f = fixture();
  const skillsDir = path.join(f.root, ".agents", "skills");
  const local = path.join(skillsDir, "local");
  const refresh = () => exportSkills({ source: f.source, upstream: f.upstream, root: f.root });

  refresh();
  fs.renameSync(path.join(local, "agents", "openai.yaml"), path.join(local, "agents", "openai.bak"));
  assert.ok(checkSkills({ root: f.root }).errors.some((e) => e.includes("missing agents/openai.yaml")));
  refresh();

  fs.rmSync(path.join(local, "SKILL.md"));
  assert.ok(checkSkills({ root: f.root }).errors.some((e) => e.includes("missing SKILL.md")));
  refresh();

  fs.rmSync(path.join(skillsDir, "README.md"));
  assert.ok(checkSkills({ root: f.root }).errors.some((e) => e.includes("README.md is missing")));
  refresh();

  fs.rmSync(path.join(skillsDir, "UPSTREAM-LICENSE"));
  assert.ok(checkSkills({ root: f.root }).errors.some((e) => e.includes("UPSTREAM-LICENSE is missing")));
  refresh();

  fs.rmSync(path.join(skillsDir, ".krn-export.json"));
  assert.ok(checkSkills({ root: f.root }).errors.some((e) => e.includes("is not a generated export")));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("check reports drift in any exported file and a harness_skills mismatch", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });

  const yaml = path.join(f.source, "skills", "meta", "local", "agents", "openai.yaml");
  fs.writeFileSync(yaml, `${fs.readFileSync(yaml, "utf8")}# drifted\n`);
  assert.ok(checkSkills({ root: f.source }).errors.some((e) => e.includes("differ from source")), "non-SKILL.md drift");
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });

  const skillFile = path.join(f.source, "skills", "meta", "local", "SKILL.md");
  fs.writeFileSync(skillFile, fs.readFileSync(skillFile, "utf8").replace("Local skill", "Drifted local skill"));
  assert.ok(checkSkills({ root: f.source }).errors.some((e) => e.includes("differ from source")), "SKILL.md drift");

  const manifestPath = path.join(f.source, "skills", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.harness_skills = ["local", "extra"];
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.ok(checkSkills({ root: f.source }).errors.some((e) => e.includes("must equal manifest.harness_skills")), "subset");

  fs.rmSync(f.base, { recursive: true, force: true });
});
