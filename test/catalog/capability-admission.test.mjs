import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { sha256Hex } from "../../scripts/lib/kernel/digest.mjs";
import { resolveProfile } from "../../scripts/lib/catalog/catalog-profile.mjs";
import { planCatalogConfig } from "../../scripts/lib/catalog/catalog-plan.mjs";

const admission = await import("../../scripts/lib/catalog/capability-admission.mjs").catch(() => ({}));
const composition = await import("../../scripts/lib/install/project-skill-composition.mjs").catch(() => ({}));
const openCode = await import("../../scripts/lib/catalog/opencode-capabilities.mjs").catch(() => ({}));
const skill = (name, scope = "global-index") => ({ id: name, name, family: name, scope, path: `/skills/${scope}/${name}/SKILL.md` });
const policy = { plugins: { default: "disabled" }, skills: { default: "disabled", preserveScopes: ["project-local", "system"], disable: ["collision"] }, mcps: { default: "disabled" }, apps: { mode: "report-only" } };

test("complete admission disables new optional surfaces including config-only integrations", () => {
  const inventory = { skills: [skill("new-option"), skill("owned")], plugins: [], hardQuarantine: [] };
  const resolved = resolveProfile(policy, inventory, {}, {}, { names: ["owned"] });
  assert.equal(resolved.desired.skills[skill("new-option").path], false);
  assert.equal(resolved.desired.skills[skill("owned").path], true);
  const source = '[plugins."new@market"]\nenabled = true\n\n[mcp_servers.new]\ncommand = "provider"\nargs = ["serve"]\nenabled = true\n';
  const plan = planCatalogConfig({ source, desired: resolved.desired });
  assert.match(plan.nextSource, /\[plugins\."new@market"\]\nenabled = false/);
  assert.match(plan.nextSource, /command = "provider"\nargs = \["serve"\]\nenabled = false/);
  assert.equal(planCatalogConfig({ source: plan.nextSource, desired: resolved.desired }).changed, false);
});

test("global exact-name exclusions never override preserved project or system scope", () => {
  const inventory = { skills: [skill("collision", "project-local"), skill("collision", "system"), skill("collision")], plugins: [], hardQuarantine: [] };
  const result = resolveProfile(policy, inventory);
  assert.equal(result.desired.skills[skill("collision", "project-local").path], undefined);
  assert.equal(result.desired.skills[skill("collision", "system").path], undefined);
  assert.equal(result.desired.skills[skill("collision").path], false);
});

test("upstream Matt skills remain project-local across every global profile", () => {
  const profiles = JSON.parse(fs.readFileSync(new URL("../../config/capability-profiles.json", import.meta.url), "utf8"));
  const lock = JSON.parse(fs.readFileSync(new URL("../../config/upstream-sources.json", import.meta.url), "utf8"));
  const source = lock.sources.find((entry) => entry.id === "mattpocock/skills");
  const names = new Set();
  const visit = (name) => {
    if (names.has(name)) return;
    names.add(name);
    for (const companion of source.companions?.[name] ?? []) visit(companion);
  };
  for (const relative of [...source.harness_paths, ...(source.project_paths ?? [])]) {
    visit(path.basename(path.dirname(relative)));
  }
  const upstreamNames = [...names].sort();
  const inventory = {
    skills: upstreamNames.flatMap((name) => [skill(name), skill(name, "project-local")]),
    plugins: [],
    hardQuarantine: [],
  };

  for (const profile of Object.values(profiles.profiles)) {
    for (const name of upstreamNames) {
      assert.ok(profile.skills.disable.includes(name), `${profile.description} must disable global ${name}`);
    }
    const result = resolveProfile(profile, inventory, {}, {}, { names: upstreamNames });
    for (const name of upstreamNames) {
      assert.equal(result.desired.skills[skill(name).path], false, `global ${name} should be disabled`);
      assert.equal(result.desired.skills[skill(name, "project-local").path], undefined, `project ${name} should remain available`);
    }
    const disabled = openCode.skillPermissionProjection({ profile, inventory, admission: { names: upstreamNames } });
    const project = openCode.skillPermissionProjection({
      profile,
      inventory,
      admission: { names: upstreamNames },
      projectNames: upstreamNames,
      existing: Object.fromEntries(upstreamNames.map((name) => [name, "allow"])),
    });
    for (const name of upstreamNames) {
      assert.equal(disabled[name], "deny", `OpenCode global ${name} should be denied`);
      assert.equal(project[name], "allow", `OpenCode project ${name} should retain project permission`);
    }
  }
});

test("the upstream setup skill that prescribes .scratch is absent from active KRN and global profiles", () => {
  const profiles = JSON.parse(fs.readFileSync(new URL("../../config/capability-profiles.json", import.meta.url), "utf8"));
  const lock = JSON.parse(fs.readFileSync(new URL("../../config/upstream-sources.json", import.meta.url), "utf8"));
  const source = lock.sources.find((entry) => entry.id === "mattpocock/skills");
  const path = "skills/engineering/setup-matt-pocock-skills/SKILL.md";
  assert.equal(source.required_paths.includes(path), false);
  assert.equal(source.project_paths.includes(path), false);
  assert.equal(Object.values(source.companions ?? {}).flat().includes("setup-matt-pocock-skills"), false);
  for (const profile of Object.values(profiles.profiles)) {
    assert.equal(profile.skills.enable.includes("setup-matt-pocock-skills"), false, `${profile.description} does not enable the displaced skill`);
    assert.equal(profile.skills.disable.includes("setup-matt-pocock-skills"), false, `${profile.description} has no stale tombstone for the absent skill`);
  }
});

test("manifest and pinned typed companions own admission; expanding the available catalog does not", () => {
  assert.equal(typeof admission.deriveSkillAdmission, "function");
  const manifest = { skills: [{ name: "delivery", path: "skills/engineering/delivery" }] };
  const pin = { sources: [{ id: "upstream", commit: "a".repeat(40), required_paths: ["skills/work/implement/SKILL.md", "skills/work/proof/SKILL.md", "skills/work/unused/SKILL.md"], harness_paths: ["skills/work/implement/SKILL.md"], project_paths: ["skills/work/unused/SKILL.md"], companions: { implement: ["proof"] } }] };
  const result = admission.deriveSkillAdmission(manifest, pin);
  assert.deepEqual(result.names, ["delivery", "implement", "proof"]);
  pin.sources[0].required_paths.push("skills/work/novel/SKILL.md");
  assert.deepEqual(admission.deriveSkillAdmission(manifest, pin).names, result.names);
  pin.sources[0].companions.implement.push("missing");
  assert.throws(() => admission.deriveSkillAdmission(manifest, pin), /unknown companion/);
});

test("missing harness roots never expand admission to the entire upstream catalog", () => {
  assert.equal(typeof admission.deriveSkillAdmission, "function");
  assert.throws(() => admission.deriveSkillAdmission({ skills: [] }, { sources: [{ id: "upstream", required_paths: ["skills/work/unused/SKILL.md"] }] }), /harness_paths/);
});

test("derived admission selects its global index owner and reports an absent required owner", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "krn-admission-owner-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const codexHome = path.join(temp, "codex");
  const release = path.join(codexHome, "krn", "releases", "release");
  const target = path.join(release, "skills", "engineering", "owned", "SKILL.md");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "---\nname: owned\ndescription: example\n---\n");
  fs.symlinkSync(release, path.join(codexHome, "krn", "current"));
  const known = { names: ["owned"], owners: { owned: { origin: "krn", path: "skills/engineering/owned" } } };
  const installed = { ...skill("owned"), targetPath: target };
  const oldCopy = skill("owned", "user");
  const resolved = resolveProfile(policy, { skills: [installed, oldCopy], plugins: [], hardQuarantine: [] }, {}, {}, known, { codexHome });
  assert.equal(resolved.desired.skills[oldCopy.path], false);
  assert.equal(resolved.desired.skills[installed.path], true);
  const missing = resolveProfile(policy, { skills: [], plugins: [], hardQuarantine: [] }, {}, {}, known, { codexHome });
  assert.deepEqual(missing.missingSkills, ["owned"]);
});

test("a matching KRN path suffix does not admit a foreign global skill", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "krn-owner-origin-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const codexHome = path.join(temp, "codex");
  const relative = "skills/engineering/owned/SKILL.md";
  const release = path.join(codexHome, "krn", "releases", "release");
  const genuine = path.join(release, relative);
  const foreign = path.join(temp, "foreign", relative);
  for (const file of [genuine, foreign]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "---\nname: owned\ndescription: example\n---\n");
  }
  fs.symlinkSync(release, path.join(codexHome, "krn", "current"));
  const inventory = { skills: [{ ...skill("owned"), path: path.join(temp, "index", "owned", "SKILL.md"), targetPath: foreign }], plugins: [], hardQuarantine: [] };
  const known = { names: ["owned"], owners: { owned: { origin: "krn", path: "skills/engineering/owned" } } };
  const result = resolveProfile(policy, inventory, {}, {}, known, { codexHome });
  assert.equal(result.desired.skills[inventory.skills[0].path], false);
  assert.deepEqual(result.missingSkills, ["owned"]);
  assert.equal(openCode.skillPermissionProjection({ profile: policy, inventory, admission: known, codexHome }).owned, "deny");
  inventory.skills[0].targetPath = genuine;
  const owned = resolveProfile(policy, inventory, {}, {}, known, { codexHome });
  assert.equal(owned.desired.skills[inventory.skills[0].path], true);
  assert.deepEqual(owned.missingSkills, []);
  assert.equal(openCode.skillPermissionProjection({ profile: policy, inventory, admission: known, codexHome }).owned, "allow");
});

test("OpenCode uses the profile for global visibility while preserving project skills and native system defaults", () => {
  assert.equal(typeof openCode.skillPermissionProjection, "function");
  const global = { skills: [skill("owned"), skill("optional"), skill("collision")], plugins: [], hardQuarantine: [] };
  const result = openCode.skillPermissionProjection({ profile: policy, inventory: global, admission: { names: ["owned"] }, projectNames: ["collision"], existing: { custom: "ask" } });
  assert.equal(result.owned, "allow");
  assert.equal(result.optional, "deny");
  assert.equal(result.collision, undefined);
  assert.equal(result.custom, "ask");
  assert.equal(result["*"], undefined);
});

test("OpenCode generated exact permissions follow preserved wildcard rules", () => {
  const inventory = { skills: [skill("owned")], plugins: [], hardQuarantine: [] };
  const result = openCode.skillPermissionProjection({ profile: policy, inventory, admission: { names: ["owned"] }, existing: { owned: "deny", "*": "ask" } });
  assert.deepEqual(Object.keys(result), ["*", "owned"]);
  assert.equal(result.owned, "allow");
});

test("OpenCode native scalar permission keeps its default and other permission keys", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krn-opencode-scalar-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const config = { permission: { skill: "ask", bash: { "*": "deny" } } };
  await openCode.configureOpenCodeCapabilities(config, { homeDirectory: home, directory: home, profileName: "minimal" });
  assert.equal(config.permission.skill["*"], "ask");
  assert.deepEqual(config.permission.bash, { "*": "deny" });
});

test("OpenCode does not classify a nongit ancestor's global skill as project-owned", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "krn-opencode-ancestor-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const global = path.join(home, ".agents", "skills", "optional", "SKILL.md");
  fs.mkdirSync(path.dirname(global), { recursive: true });
  fs.writeFileSync(global, "---\nname: optional\ndescription: optional\n---\n");
  const directory = path.join(home, "workspace");
  fs.mkdirSync(directory);
  const config = {};
  await openCode.configureOpenCodeCapabilities(config, { homeDirectory: home, directory, profileName: "minimal" });
  assert.equal(config.permission.skill.optional, "deny");
});

test("matching upstream path and commit without pinned repository origin is not owned", async (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "krn-composition-origin-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "project");
  const upstream = path.join(temp, "impostor");
  const relative = "skills/engineering/owned/SKILL.md";
  const global = path.join(temp, "global", "owned", "SKILL.md");
  const project = path.join(root, ".agents", "skills", "owned", "SKILL.md");
  const body = "---\nname: owned\ndescription: example\n---\n";
  for (const file of [path.join(upstream, relative), project]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, body);
  }
  fs.mkdirSync(path.dirname(global), { recursive: true });
  fs.symlinkSync(path.join(upstream, relative), global);
  const git = (...args) => {
    const result = spawnSync("git", ["-C", upstream, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git("init", "-q");
  git("add", relative);
  git("-c", "user.name=KRN Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture");
  git("remote", "add", "origin", "https://example.invalid/impostor.git");
  const commit = git("rev-parse", "HEAD");
  const owner = { origin: "upstream", path: relative, commit, repository: "https://github.com/mattpocock/skills.git" };
  const candidate = { id: "owned", name: "owned", family: "owned", scope: "global-index", path: global, targetPath: path.join(upstream, relative) };
  const resolved = resolveProfile(policy, { skills: [candidate], plugins: [], hardQuarantine: [] }, {}, {}, { names: ["owned"], owners: { owned: owner } });
  assert.equal(resolved.desired.skills[global], false);
  assert.deepEqual(resolved.missingSkills, ["owned"]);
  fs.writeFileSync(path.join(root, ".agents", "skills", ".krn-export.json"), JSON.stringify({ schemaVersion: 1, skills: ["owned"], digests: { owned: sha256Hex("SKILL.md", "\0", body, "\0") } }));
  const plan = await composition.planProjectSkillComposition({ root, codexHome: path.join(temp, "codex"), admission: { names: ["owned"], owners: { owned: owner } }, inventory: { skills: [candidate] }, desired: { skills: { [global]: true } }, source: "" });
  assert.deepEqual(plan.equivalent, []);
  assert.deepEqual(plan.unavailable, [project]);
});

test("equivalent export shadowing withdraws only its own stale override and never hides a missing global owner", async (t) => {
  assert.equal(typeof composition.planProjectSkillComposition, "function");
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "krn-composition-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const root = path.join(temp, "repo");
  const codexHome = path.join(temp, "codex");
  const release = path.join(codexHome, "krn", "releases", "a".repeat(40));
  const global = path.join(temp, "agents", "skills", "owned", "SKILL.md");
  const project = path.join(root, ".agents", "skills", "owned", "SKILL.md");
  const relative = "skills/engineering/owned";
  for (const directory of [path.dirname(project), path.join(release, relative), path.dirname(path.dirname(global))]) fs.mkdirSync(directory, { recursive: true });
  const body = "---\nname: owned\ndescription: example\n---\n";
  for (const directory of [path.dirname(project), path.join(release, relative)]) {
    fs.writeFileSync(path.join(directory, "SKILL.md"), body);
    fs.writeFileSync(path.join(directory, "reference.md"), "original\n");
  }
  fs.symlinkSync(release, path.join(codexHome, "krn", "current"));
  fs.symlinkSync(path.join(release, relative), path.dirname(global));
  const marker = { schemaVersion: 1, skills: ["owned"], digests: { owned: sha256Hex("reference.md", "\0", "original\n", "\0", "SKILL.md", "\0", body, "\0") } };
  fs.writeFileSync(path.join(root, ".agents", "skills", ".krn-export.json"), JSON.stringify(marker));
  const options = { root, codexHome, admission: { names: ["owned"], owners: { owned: { origin: "krn", path: relative } } }, inventory: { skills: [{ id: "owned", scope: "global-index", path: global, targetPath: path.join(release, relative, "SKILL.md") }] }, desired: { skills: { [global]: true } } };
  const original = 'model = "example"\n\n[[skills.config]]\npath = "/manual/SKILL.md"\nenabled = false\n';
  const first = await composition.planProjectSkillComposition({ ...options, source: original });
  assert.equal(first.equivalent.length, 1);
  assert.match(first.nextSource, /krn-equivalent-export/);
  assert.equal((await composition.planProjectSkillComposition({ ...options, source: first.nextSource })).changed, false);
  fs.writeFileSync(path.join(path.dirname(project), "reference.md"), "changed\n");
  const stale = await composition.planProjectSkillComposition({ ...options, source: first.nextSource });
  assert.equal(stale.changed, true);
  assert.equal(stale.restored.length, 1);
  assert.ok(!stale.nextSource.includes(project));
  assert.ok(stale.nextSource.includes('/manual/SKILL.md'));
  fs.writeFileSync(path.join(path.dirname(project), "reference.md"), "original\n");
  const unavailable = await composition.planProjectSkillComposition({ ...options, source: original, desired: { skills: { [global]: false } } });
  assert.equal(unavailable.equivalent.length, 0);
  assert.equal(unavailable.changed, false);
});
