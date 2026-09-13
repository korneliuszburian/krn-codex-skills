import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { checkSkills, exportSkills } from "../../scripts/lib/install/skills-export.mjs";

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

test("the long-description warning names only KRN-owned skills", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  fs.mkdirSync(path.join(f.root, "skills"), { recursive: true });
  fs.copyFileSync(path.join(f.source, "skills", "manifest.json"), path.join(f.root, "skills", "manifest.json"));
  const long = "x".repeat(300);
  for (const name of ["local", "one"]) {
    const file = path.join(f.root, ".agents", "skills", name, "SKILL.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace(/^description:.*$/m, `description: ${long}`));
  }
  const report = checkSkills({ root: f.root });
  assert.ok(report.warnings.some((warning) => warning.startsWith("local:")), JSON.stringify(report.warnings));
  assert.ok(!report.warnings.some((warning) => warning.startsWith("one:")), "an upstream skill is not held to the KRN budget");
});

test("check fails when the upstream pin moves without a re-export", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const lock = JSON.parse(fs.readFileSync(path.join(f.source, "config", "upstream-sources.json"), "utf8"));
  lock.sources[0].commit = "0".repeat(40);
  fs.mkdirSync(path.join(f.root, "config"), { recursive: true });
  fs.writeFileSync(path.join(f.root, "config", "upstream-sources.json"), JSON.stringify(lock));
  const report = checkSkills({ root: f.root });
  assert.ok(report.errors.some((error) => error.includes("upstream-sources.json pins")), JSON.stringify(report.errors));
});

test("export generates a checked skill set from both pins", () => {
  const f = fixture();
  const report = exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  assert.equal(report.skills, 2);
  assert.ok(fs.existsSync(path.join(f.root, ".agents", "skills", "local", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(f.root, ".agents", "skills", "one", "SKILL.md")));
  assert.ok(fs.existsSync(path.join(f.root, ".agents", "skills", "UPSTREAM-LICENSE")));
  const marker = JSON.parse(fs.readFileSync(path.join(f.root, ".agents", "skills", ".krn-export.json"), "utf8"));
  assert.equal(marker.krn.commit, git(f.source, ["rev-parse", "HEAD"]), "the marker records the source HEAD");
  const exported = fs.readFileSync(path.join(f.root, ".agents", "skills", "local", "SKILL.md"), "utf8");
  assert.equal(execFileSync("git", ["-C", f.source, "show", `${marker.krn.commit}:skills/meta/local/SKILL.md`], { encoding: "utf8" }), exported, "the named commit reproduces the exported bytes");
  const check = checkSkills({ root: f.root });
  assert.deepEqual(check.errors, [], JSON.stringify(check));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("check fails when the exported skill set exceeds the budget", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const skillFile = path.join(f.root, ".agents", "skills", "local", "SKILL.md");
  fs.writeFileSync(skillFile, `---\nname: local\ndescription: ${"x".repeat(9000)}\n---\n`);
  assert.ok(checkSkills({ root: f.root }).errors.some((e) => e.includes("characters of")), JSON.stringify(checkSkills({ root: f.root }).errors));
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

test("check detects drift in an upstream-composed export", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  fs.appendFileSync(path.join(f.root, ".agents", "skills", "one", "SKILL.md"), "tampered\n");
  const check = checkSkills({ root: f.root });
  assert.ok(check.errors.some((error) => error.includes("exported files changed since export")), JSON.stringify(check.errors));
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

test("a failed export leaves the previous export intact", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const skillsDir = path.join(f.root, ".agents", "skills");
  const markerBefore = fs.readFileSync(path.join(skillsDir, ".krn-export.json"), "utf8");
  // Point a KRN harness skill at a missing path so the build fails mid-copy (upstream stays clean and pinned).
  fs.writeFileSync(
    path.join(f.source, "skills", "manifest.json"),
    `${JSON.stringify({ schema_version: 1, harness_skills: ["local", "ghost"], skills: [{ name: "local", path: "skills/meta/local", implicit: true }, { name: "extra", path: "skills/meta/extra", implicit: false }, { name: "ghost", path: "skills/meta/ghost", implicit: false }] }, null, 2)}\n`,
  );
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }));
  assert.equal(fs.readFileSync(path.join(skillsDir, ".krn-export.json"), "utf8"), markerBefore, "the previous export marker survives a failed build");
  assert.ok(fs.existsSync(path.join(skillsDir, "one", "SKILL.md")), "the previous export bytes survive a failed build");
  const leftovers = fs.readdirSync(path.join(f.root, ".agents")).filter((name) => name.startsWith("skills."));
  assert.deepEqual(leftovers, [], `no staging/backup dirs should remain: ${leftovers}`);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("an ignored file inside a source skill path is refused", () => {
  const f = fixture();
  fs.appendFileSync(path.join(f.source, ".git", "info", "exclude"), "stray-source.txt\n");
  fs.writeFileSync(path.join(f.source, "skills", "meta", "local", "stray-source.txt"), "hidden\n");
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }), /without provenance/);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("a gitignored non-ASCII file inside a pinned harness path is refused", () => {
  const f = fixture();
  fs.appendFileSync(path.join(f.upstream, ".git", "info", "exclude"), "stray-über.txt\n");
  fs.writeFileSync(path.join(f.upstream, "skills", "eng", "one", "stray-über.txt"), "hidden\n");
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }), /untracked/);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("a gitignored file inside a pinned harness path is refused", () => {
  const f = fixture();
  fs.appendFileSync(path.join(f.upstream, ".git", "info", "exclude"), "stray-ignored.txt\n");
  fs.writeFileSync(path.join(f.upstream, "skills", "eng", "one", "stray-ignored.txt"), "hidden\n");
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }), /untracked/);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("an untracked file inside a pinned harness path is refused", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.upstream, "skills", "eng", "one", "stray.txt"), "local\n");
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }), /untracked/);
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("a dirty upstream checkout is refused", () => {
  const f = fixture();
  const tracked = path.join(f.upstream, "skills", "eng", "two", "SKILL.md");
  fs.appendFileSync(tracked, "\nlocal edit\n");
  assert.throws(() => exportSkills({ source: f.source, upstream: f.upstream, root: f.root }), /uncommitted changes/);
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

test("check fails when the exported upstream set disagrees with the pinned harness_paths", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  const lockPath = path.join(f.source, "config", "upstream-sources.json");
  const lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
  lock.sources[0].required_paths = ["skills/eng/one/SKILL.md"];
  lock.sources[0].harness_paths = ["skills/eng/one/SKILL.md", "skills/eng/two/SKILL.md"];
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  const check = checkSkills({ root: f.source });
  assert.ok(check.errors.some((e) => e.includes("pinned harness_paths")), JSON.stringify(check.errors));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("check warns when the export marker records a dirty source", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const markerPath = path.join(f.root, ".agents", "skills", ".krn-export.json");
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
  marker.krn.dirty = true;
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  const check = checkSkills({ root: f.root });
  assert.ok(check.warnings.some((w) => w.includes("dirty source")), JSON.stringify(check.warnings));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("dirty scope follows the exported skill paths, not the whole repo", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.source, "ROOT.md"), "a\n");
  commit(f.source, "root file");
  fs.writeFileSync(path.join(f.source, "ROOT.md"), "b\n");
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const marker = JSON.parse(fs.readFileSync(path.join(f.root, ".agents", "skills", ".krn-export.json"), "utf8"));
  assert.notEqual(marker.krn.dirty, true, "a tracked change outside skill paths must not mark the export dirty");

  const skillFile = path.join(f.source, "skills", "meta", "local", "SKILL.md");
  fs.writeFileSync(skillFile, `${fs.readFileSync(skillFile, "utf8")}\ntracked edit\n`);
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const dirty = JSON.parse(fs.readFileSync(path.join(f.root, ".agents", "skills", ".krn-export.json"), "utf8"));
  assert.equal(dirty.krn.dirty, true, "a tracked change inside a skill path must mark the export dirty");
  assert.ok(!checkSkills({ root: f.root }).errors.some((e) => e.includes("do not reproduce")), "a recorded dirty export warns instead of failing reproducibility");
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("check reports a malformed upstream lock instead of throwing", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  fs.writeFileSync(path.join(f.source, "config", "upstream-sources.json"), "{\"sources\":[null]}\n");
  let check;
  assert.doesNotThrow(() => { check = checkSkills({ root: f.source }); });
  assert.ok(Array.isArray(check.errors));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("check reports invalid JSON in the lock or manifest instead of throwing", () => {
  const f = fixture();
  exportSkills({ source: f.source, upstream: f.upstream, root: f.source });
  fs.writeFileSync(path.join(f.source, "config", "upstream-sources.json"), "{ \"sources\": [\n");
  let check;
  assert.doesNotThrow(() => { check = checkSkills({ root: f.source }); });
  assert.ok(check.errors.some((error) => error.includes("not valid JSON")), JSON.stringify(check.errors));
  fs.rmSync(f.base, { recursive: true, force: true });
});

test("a tracked skill edit as the first change marks the export dirty", () => {
  const f = fixture();
  fs.appendFileSync(path.join(f.source, "skills", "meta", "local", "SKILL.md"), "\n");
  exportSkills({ source: f.source, upstream: f.upstream, root: f.root });
  const marker = JSON.parse(fs.readFileSync(path.join(f.root, ".agents", "skills", ".krn-export.json"), "utf8"));
  assert.equal(marker.krn.dirty, true, "the first porcelain entry must not be truncated");
  fs.rmSync(f.base, { recursive: true, force: true });
});
