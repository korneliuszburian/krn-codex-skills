#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "skills", "manifest.json");
const evalPath = path.join(root, "evals", "trigger-cases.json");
const errors = [];

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));
const relative = (file) => path.relative(root, file).split(path.sep).join("/");

function fail(message) {
  errors.push(message);
}

function filesNamed(directory, basename) {
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...filesNamed(file, basename));
    } else if (entry.name === basename) {
      results.push(file);
    }
  }
  return results;
}

function parseFrontmatter(file) {
  const content = read(file);
  const match = content.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) {
    fail(`${relative(file)}: missing YAML frontmatter`);
    return {};
  }
  const fields = {};
  for (const line of match[1].split("\n")) {
    const field = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!field) {
      fail(`${relative(file)}: unsupported frontmatter line "${line}"`);
      continue;
    }
    fields[field[1]] = field[2].replace(/^"(.*)"$/, "$1");
  }
  const keys = Object.keys(fields).sort();
  if (keys.join(",") !== "description,name") {
    fail(`${relative(file)}: frontmatter must contain only name and description`);
  }
  return fields;
}

function yamlString(content, key) {
  return content.match(new RegExp(`^\\s{2}${key}: "([^"]+)"$`, "m"))?.[1];
}

function lineCount(file) {
  return read(file).split("\n").length;
}

function validateTransportSchema(value, location = "review schema") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      validateTransportSchema(item, `${location}[${index}]`),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "$schema" || key === "const") {
      fail(
        `${location}: ${key} is not portable across configured structured-output backends; use structural constraints or enum`,
      );
    }
    validateTransportSchema(child, `${location}.${key}`);
  }
}

const manifest = json(manifestPath);
if (manifest.schema_version !== 1) {
  fail("skills/manifest.json: schema_version must be 1");
}
const globalAgentsPathSafe =
  typeof manifest.global_agents === "string" &&
  Boolean(manifest.global_agents.trim()) &&
  !path.isAbsolute(manifest.global_agents) &&
  !manifest.global_agents.split("/").includes("..");
if (!globalAgentsPathSafe) {
  fail("manifest: unsafe global_agents path");
}

const manifestNames = new Set();
const manifestPaths = new Set();
for (const skill of manifest.skills ?? []) {
  if (!/^[a-z0-9-]{1,63}$/.test(skill.name)) {
    fail(`manifest: invalid skill name ${skill.name}`);
  }
  if (manifestNames.has(skill.name)) {
    fail(`manifest: duplicate skill name ${skill.name}`);
  }
  manifestNames.add(skill.name);
  if (
    typeof skill.path !== "string" ||
    path.isAbsolute(skill.path) ||
    skill.path.split("/").includes("..")
  ) {
    fail(`manifest: unsafe path for ${skill.name}`);
  }
  if (manifestPaths.has(skill.path)) {
    fail(`manifest: duplicate skill path ${skill.path}`);
  }
  manifestPaths.add(skill.path);
  if (typeof skill.implicit !== "boolean") {
    fail(`manifest: implicit must be boolean for ${skill.name}`);
  }
}

const skillFiles = filesNamed(path.join(root, "skills"), "SKILL.md");
const discoveredPaths = new Set(
  skillFiles.map((file) => relative(path.dirname(file))),
);

for (const skill of manifest.skills) {
  const skillDir = path.join(root, skill.path);
  const skillFile = path.join(skillDir, "SKILL.md");
  const metadataFile = path.join(skillDir, "agents", "openai.yaml");
  if (!fs.existsSync(skillFile)) {
    fail(`${skill.path}: missing SKILL.md`);
    continue;
  }
  if (!fs.existsSync(metadataFile)) {
    fail(`${skill.path}: missing agents/openai.yaml`);
    continue;
  }

  const fields = parseFrontmatter(skillFile);
  if (fields.name !== skill.name) {
    fail(`${skill.path}: frontmatter name does not match manifest`);
  }
  if (path.basename(skillDir) !== skill.name) {
    fail(`${skill.path}: folder name does not match skill name`);
  }
  if (!fields.description || fields.description.length > 280) {
    fail(`${skill.path}: description must be 1-280 characters`);
  }
  if (lineCount(skillFile) > 180) {
    fail(`${skill.path}: SKILL.md exceeds 180 lines; disclose branch detail`);
  }

  const metadata = read(metadataFile);
  const displayName = yamlString(metadata, "display_name");
  const shortDescription = yamlString(metadata, "short_description");
  const defaultPrompt = yamlString(metadata, "default_prompt");
  const policy = metadata.match(
    /^\s{2}allow_implicit_invocation:\s*(true|false)$/m,
  )?.[1];
  if (!displayName) fail(`${skill.path}: missing quoted display_name`);
  if (
    !shortDescription ||
    shortDescription.length < 25 ||
    shortDescription.length > 64
  ) {
    fail(`${skill.path}: short_description must be 25-64 characters`);
  }
  if (!defaultPrompt?.includes(`$${skill.name}`)) {
    fail(`${skill.path}: default_prompt must mention $${skill.name}`);
  }
  if (policy !== String(skill.implicit)) {
    fail(`${skill.path}: invocation policy differs from manifest`);
  }

  const content = read(skillFile);
  if (/disable-model-invocation/.test(content)) {
    fail(`${skill.path}: Claude-only invocation frontmatter is not canonical`);
  }
  if (/TODO|\[TODO|Structuring This Skill/i.test(content)) {
    fail(`${skill.path}: unresolved scaffold text`);
  }
  for (const match of content.matchAll(/\]\((references|scripts)\/([^)#]+)\)/g)) {
    const target = path.join(skillDir, match[1], match[2]);
    if (!fs.existsSync(target)) {
      fail(`${skill.path}: broken direct pointer ${match[0]}`);
    }
  }
  if (/\]\(\.\.\//.test(content)) {
    fail(`${skill.path}: cross-skill relative pointers are not allowed`);
  }
}

for (const discovered of discoveredPaths) {
  if (!manifestPaths.has(discovered)) {
    fail(`${discovered}: SKILL.md is not promoted in the manifest`);
  }
}
for (const promoted of manifestPaths) {
  if (!discoveredPaths.has(promoted)) {
    fail(`${promoted}: manifest path has no SKILL.md`);
  }
}

const secondOpinion = manifest.skills.find(
  (skill) => skill.name === "second-opinion-review",
);
if (secondOpinion) {
  const reviewSchemaPath = path.join(
    root,
    secondOpinion.path,
    "references",
    "review.schema.json",
  );
  if (!fs.existsSync(reviewSchemaPath)) {
    fail(`${secondOpinion.path}: missing review.schema.json`);
  } else {
    validateTransportSchema(json(reviewSchemaPath));
  }
}

const legacyPaths = new Set();
for (const item of manifest.legacy_user_paths ?? []) {
  if (
    typeof item.path !== "string" ||
    !item.path.startsWith(".codex/skills/") ||
    item.path.split("/").includes("..")
  ) {
    fail(`manifest: unsafe legacy path ${item.path}`);
  }
  if (legacyPaths.has(item.path)) {
    fail(`manifest: duplicate legacy path ${item.path}`);
  }
  legacyPaths.add(item.path);
  if (!manifestNames.has(item.replacement)) {
    fail(`manifest: unknown legacy replacement ${item.replacement}`);
  }
}

const triggerCases = json(evalPath);
if (triggerCases.schema_version !== 1) {
  fail("evals/trigger-cases.json: schema_version must be 1");
}
const caseIds = new Set();
const positivelyCovered = new Set();
const negativelyCovered = new Set();
for (const testCase of triggerCases.cases ?? []) {
  if (!testCase.id || caseIds.has(testCase.id)) {
    fail(`trigger case has missing or duplicate id: ${testCase.id}`);
  }
  caseIds.add(testCase.id);
  if (typeof testCase.prompt !== "string" || !testCase.prompt.trim()) {
    fail(`${testCase.id}: prompt must be non-empty`);
  }
  for (const name of testCase.expected_skills ?? []) {
    if (!manifestNames.has(name)) fail(`${testCase.id}: unknown expected skill ${name}`);
    positivelyCovered.add(name);
  }
  for (const name of testCase.forbidden_skills ?? []) {
    if (!manifestNames.has(name)) fail(`${testCase.id}: unknown forbidden skill ${name}`);
    negativelyCovered.add(name);
  }
}
for (const name of manifestNames) {
  if (!positivelyCovered.has(name)) fail(`trigger matrix: no positive case for ${name}`);
  if (!negativelyCovered.has(name)) fail(`trigger matrix: no negative case for ${name}`);
}

if (lineCount(path.join(root, "AGENTS.md")) > 90) {
  fail("AGENTS.md exceeds 90 lines");
}
if (
  globalAgentsPathSafe &&
  lineCount(path.join(root, manifest.global_agents)) > 60
) {
  fail(`${manifest.global_agents} exceeds 60 lines`);
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

console.log(
  `validated ${manifest.skills.length} skills, ${triggerCases.cases.length} trigger cases, and installation metadata`,
);
