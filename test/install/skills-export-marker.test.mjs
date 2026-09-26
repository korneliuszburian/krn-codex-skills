import assert from "node:assert/strict";
import { runGit } from "../../scripts/lib/kernel/git.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkSkills, exportSkills } from "../../scripts/lib/install/skills-export.mjs";

const git = (root, args) => runGit(root, args).out;

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
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-skills-export-marker-"));
  const upstream = path.join(base, "upstream");
  initRepo(upstream);
  writeSkill(path.join(upstream, "skills", "eng", "one"), "one", "Upstream skill one");
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
            required_paths: ["skills/eng/one/SKILL.md"],
            harness_paths: ["skills/eng/one/SKILL.md"],
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  commit(source, "source");
  return { base, upstream, source };
}

const editUnexported = (f, note) => {
  fs.appendFileSync(path.join(f.source, "skills", "meta", "extra", "SKILL.md"), `\n${note}\n`);
};

test("checkSkills warns marker-behind when commits under skills/** land after the marker", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  editUnexported(f, "trailing edit");
  commit(f.source, "touch an unexported skill");
  const report = checkSkills({ root: f.source });
  assert.deepEqual(report.errors, [], JSON.stringify(report));
  assert.ok(
    report.warnings.some((warning) => warning.includes("marker-behind: 1 commit")),
    JSON.stringify(report.warnings),
  );
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("the marker-behind warning names the trailing commit count", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  editUnexported(f, "first");
  commit(f.source, "first trailing commit");
  editUnexported(f, "second");
  commit(f.source, "second trailing commit");
  const report = checkSkills({ root: f.source });
  assert.deepEqual(report.errors, [], JSON.stringify(report));
  assert.ok(
    report.warnings.some((warning) => warning.includes("marker-behind: 2 commits")),
    JSON.stringify(report.warnings),
  );
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("checkSkills stays quiet when the marker matches HEAD", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  const report = checkSkills({ root: f.source });
  assert.ok(!report.warnings.some((warning) => warning.includes("marker-behind")), JSON.stringify(report.warnings));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("marker-behind ignores commits outside the skills path", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  fs.writeFileSync(path.join(f.source, "ROOT.md"), "outside skills\n");
  commit(f.source, "a change outside skills");
  const report = checkSkills({ root: f.source });
  assert.ok(!report.warnings.some((warning) => warning.includes("marker-behind")), JSON.stringify(report.warnings));
  fs.rmSync(f.base, { recursive: true, force: true });
});

// An absent harness_skills must not silently skip the export equality.
test("checkSkills fails closed when the manifest omits harness_skills", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  const manifestPath = path.join(f.source, "skills", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  delete manifest.harness_skills;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const report = checkSkills({ root: f.source });
  assert.ok(
    report.errors.some((error) => error.includes("harness_skills")),
    `an absent harness_skills must fail closed: ${JSON.stringify(report.errors)}`,
  );
  fs.rmSync(f.base, { recursive: true, force: true });
});
