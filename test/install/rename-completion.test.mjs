import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const OLD = "krn-codex";

// The residual `krn-codex` spellings the rename contract deliberately keeps: the
// repository slug, the catalog compatibility alias, and the frozen shim path.
// The bare CLI name that a KRN-owned reference mentions is not a command either.
const ALLOWED = [/krn-codex-skills/g, /krn-codex-catalog/g, /scripts\/krn-codex\.mjs/g];

const read = (relative) => {
  const file = path.join(root, relative);
  assert.ok(fs.existsSync(file), `${relative} is missing`);
  return fs.readFileSync(file, "utf8");
};

const unflagged = (text) => ALLOWED.reduce((carry, pattern) => carry.replace(pattern, ""), text);

const git = (...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();

test("the managing-codex-capabilities skill names the krn CLI", () => {
  const skill = read("skills/meta/managing-codex-capabilities/SKILL.md");
  assert.match(skill, /`krn capability inventory`/, "the inventory command must name krn");
  assert.match(skill, /`krn capability check PROFILE --root REPO`/, "the check command must name krn and its repository root");
  assert.doesNotMatch(unflagged(skill), new RegExp(OLD), "the skill still names krn-codex");
});

test("the install-release usage diagnostic names krn", () => {
  const source = read("scripts/lib/install/install-release.mjs");
  assert.match(source, /when krn is run outside one/, "the usage diagnostic must name krn");
  assert.doesNotMatch(unflagged(source), new RegExp(OLD), "the diagnostic still names krn-codex");
});

test("the export README template names krn", async () => {
  const mod = await import("../../scripts/lib/install/skills-export.mjs");
  assert.equal(typeof mod.renderCatalog, "function", "renderCatalog must be exported for the template observer");
  const rendered = mod.renderCatalog({
    skills: [{ name: "delivery-loop", origin: "krn", description: "Demo skill" }],
    krnCommit: "1".repeat(40),
    upstream: { id: "mattpocock/skills", commit: "2".repeat(40) },
  });
  assert.match(rendered, /`krn skills export`/, "the template must name the krn export command");
  assert.match(rendered, /`krn skills check --root \.`/, "the template must name the krn check gate");
  assert.doesNotMatch(unflagged(rendered), new RegExp(OLD), "the template still names krn-codex");
});

test("the regenerated export carries no krn-codex command reference", () => {
  const skillsDir = path.join(root, ".agents", "skills");
  assert.ok(fs.existsSync(skillsDir), ".agents/skills is missing");
  const catalog = read(".agents/skills/README.md");
  assert.doesNotMatch(unflagged(catalog), new RegExp(OLD), ".agents/skills/README.md still names krn-codex");
  // A command reference is the old name followed by a lowercase subcommand; a
  // bare CLI-name mention in a KRN-owned reference is not.
  const command = new RegExp(`${OLD}\`?\\s+[a-z]`);
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  for (const file of walk(skillsDir)) {
    if (!fs.statSync(file).isFile()) continue;
    assert.doesNotMatch(fs.readFileSync(file, "utf8"), command, `${path.relative(root, file)} still carries a ${OLD} command`);
  }
});

test("the export marker matches the skills tip", () => {
  const marker = JSON.parse(read(".agents/skills/.krn-export.json"));
  assert.equal(marker.krn?.dirty, false, "the export must come from a clean tree");
  assert.match(marker.krn?.commit ?? "", /^[0-9a-f]{40}$/, "the marker must record a source commit");
  const tip = git("rev-list", "-1", "HEAD", "--", "skills");
  assert.equal(marker.krn.commit, tip, "the marker must name the last commit under skills/**");
  assert.equal(
    git("rev-list", "--count", `${marker.krn.commit}..HEAD`, "--", "skills"),
    "0",
    "no commit under skills/** may land after the marker",
  );
  assert.match(read(".agents/skills/README.md"), new RegExp(marker.krn.commit), "the catalog must pin the marker commit");
});
