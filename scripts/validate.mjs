#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCapabilityProfiles } from "./lib/catalog-inventory.mjs";
import { ABI_LABELS } from "./lib/capsule-abi.mjs";
import { checkDurablePages } from "./lib/durable-pages.mjs";
import {
  capsuleAbiErrors,
  transitionErrors,
} from "./lib/delivery-loop-rules.mjs";
import {
  markdownLinkErrors,
  parseFrontmatterFields,
  readmeSkillsTableErrors,
  readmeSourceOnlyPointerErrors,
  semanticXmlErrors,
  skillMarkdownErrors,
} from "./lib/content-rules.mjs";
import { isSafeRelativePath as safeRelativePath } from "./lib/path-rules.mjs";
import { validateManifestSkills } from "./lib/manifest-rules.mjs";
import {
  upstreamSkillNamesFrom,
  upstreamSourceErrors,
} from "./lib/upstream-sources.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "skills", "manifest.json");
const readmePath = path.join(root, "README.md");
const upstreamSourcesPath = path.resolve(
  process.env.KRN_UPSTREAM_LOCK ?? path.join(root, "config", "upstream-sources.json"),
);
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

function filesUnder(directory, predicate = () => true) {
  if (!fs.existsSync(directory)) return [];
  const results = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      results.push(...filesUnder(file, predicate));
    } else if (predicate(file)) {
      results.push(file);
    }
  }
  return results;
}

function validateMarkdownLinks(file) {
  for (const message of markdownLinkErrors(read(file), {
    label: relative(file),
    resolveTarget: (target) => fs.existsSync(path.resolve(path.dirname(file), target)),
  })) {
    fail(message);
  }
}
function validateSemanticXml(file) {
  for (const message of semanticXmlErrors(read(file), relative(file))) fail(message);
}
function validateReadmeSkillsTable(file, skills) {
  for (const message of readmeSkillsTableErrors(read(file), { label: relative(file), skills })) {
    fail(message);
  }
}
function validateReadmeSourceOnlyPointers(file, skills, installableSkills) {
  for (const message of readmeSourceOnlyPointerErrors(read(file), {
    label: relative(file),
    skills,
    installableSkills,
  })) {
    fail(message);
  }
}
function validateSkillMarkdown(file, skill, knownSkillNames) {
  for (const message of skillMarkdownErrors(read(file), {
    label: relative(file),
    name: skill.name,
    knownSkillNames,
  })) {
    fail(message);
  }
}
function parseFrontmatter(file) {
  const { fields, errors } = parseFrontmatterFields(read(file), relative(file));
  for (const message of errors) fail(message);
  return fields;
}
function lineCount(file) {
  return read(file).split("\n").length;
}

function validateUpstreamSources(document) {
  for (const message of upstreamSourceErrors(document)) fail(message);
}

const manifest = json(manifestPath);
const upstreamSources = json(upstreamSourcesPath);
validateUpstreamSources(upstreamSources);
const upstreamSkillNames = new Set(upstreamSkillNamesFrom(upstreamSources));
const capabilityProfiles = await loadCapabilityProfiles(
  path.join(root, "config", "capability-profiles.json"),
);
if (manifest.schema_version !== 1) {
  fail("skills/manifest.json: schema_version must be 1");
}
const globalAgentsPathSafe = safeRelativePath(manifest.global_agents);
if (!globalAgentsPathSafe) {
  fail("manifest: unsafe global_agents path");
}
const globalHooksPathSafe = safeRelativePath(manifest.global_hooks);
if (!globalHooksPathSafe) {
  fail("manifest: unsafe global_hooks path");
}

function manifestArray(value, key) {
  if (!Array.isArray(value)) {
    fail(`manifest: ${key} must be an array`);
    return [];
  }
  return value;
}

const hookFileNames = new Set();
for (const hookFile of manifestArray(manifest.global_hook_files, "global_hook_files")) {
  if (!hookFile || typeof hookFile !== "object" || Array.isArray(hookFile)) {
    fail("manifest: global_hook_files entries must be objects");
    continue;
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/.test(hookFile.name ?? "")) {
    fail(`manifest: invalid global hook file name ${hookFile.name}`);
  }
  if (hookFileNames.has(hookFile.name)) {
    fail(`manifest: duplicate global hook file name ${hookFile.name}`);
  }
  hookFileNames.add(hookFile.name);
  if (!safeRelativePath(hookFile.path)) {
    fail(`manifest: unsafe global hook path for ${hookFile.name}`);
    continue;
  }
  if (typeof hookFile.executable !== "boolean") {
    fail(`manifest: executable must be boolean for global hook ${hookFile.name}`);
  }
  const hookPath = path.join(root, hookFile.path);
  if (!fs.existsSync(hookPath) || !fs.statSync(hookPath).isFile()) {
    fail(`manifest: missing global hook target for ${hookFile.name}`);
    continue;
  }
  if (hookFile.executable) {
    try {
      fs.accessSync(hookPath, fs.constants.X_OK);
    } catch {
      fail(`manifest: global hook target is not executable for ${hookFile.name}`);
    }
  }
}

const legacyGlobalHookPaths = new Set();
for (const legacyPath of manifestArray(manifest.legacy_global_hook_paths, "legacy_global_hook_paths")) {
  if (!safeRelativePath(legacyPath)) {
    fail(`manifest: unsafe legacy global hook path ${legacyPath}`);
  }
  if (legacyGlobalHookPaths.has(legacyPath)) {
    fail(`manifest: duplicate legacy global hook path ${legacyPath}`);
  }
  legacyGlobalHookPaths.add(legacyPath);
  const legacyName = legacyPath.split("/").at(-1);
  if (hookFileNames.has(legacyName)) {
    fail(`manifest: legacy global hook path overlaps installed hook ${legacyPath}`);
  }
}

if (globalHooksPathSafe) {
  const hooks = json(path.join(root, manifest.global_hooks));
  const preToolUse = hooks.hooks?.PreToolUse;
  if (!Array.isArray(preToolUse) || preToolUse.length !== 1) {
    fail(`${manifest.global_hooks}: expected one PreToolUse matcher group`);
  } else {
    const group = preToolUse[0];
    const handlers = group?.hooks;
    if (
      group?.matcher !== "^(Bash|apply_patch)$" ||
      !Array.isArray(handlers) ||
      handlers.length !== 1
    ) {
      fail(`${manifest.global_hooks}: expected one exact command and edit hook`);
    } else {
      const handler = handlers[0];
      if (
        handler?.type !== "command" ||
        typeof handler?.command !== "string" ||
        !handler.command.includes("/hooks/krn_pretooluse.py")
      ) {
        fail(`${manifest.global_hooks}: invalid global PreToolUse handler`);
      }
    }
  }
}

const binNames = new Set();
for (const bin of manifestArray(manifest.bins, "bins")) {
  if (!bin || typeof bin !== "object" || Array.isArray(bin)) {
    fail("manifest: bins entries must be objects");
    continue;
  }
  if (!/^[a-z0-9-]{1,63}$/.test(bin.name ?? "")) {
    fail(`manifest: invalid bin name ${bin.name}`);
  }
  if (binNames.has(bin.name)) {
    fail(`manifest: duplicate bin name ${bin.name}`);
  }
  binNames.add(bin.name);
  if (!safeRelativePath(bin.path)) {
    fail(`manifest: unsafe bin path for ${bin.name}`);
    continue;
  }
  const binPath = path.join(root, bin.path);
  if (!fs.existsSync(binPath) || !fs.statSync(binPath).isFile()) {
    fail(`manifest: missing bin target for ${bin.name}`);
    continue;
  }
  try {
    fs.accessSync(binPath, fs.constants.X_OK);
  } catch {
    fail(`manifest: bin target is not executable for ${bin.name}`);
  }
}

const {
  errors: manifestSkillErrors,
  names: localSkillNames,
  paths: localSkillPaths,
  valid: validLocalSkills,
  installableSkills,
  sourceOnlySkills,
} = validateManifestSkills(manifest);
for (const message of manifestSkillErrors) fail(message);

const knownSkillNames = new Set([...localSkillNames, ...upstreamSkillNames]);
const validInstallableSkills = validLocalSkills.filter((skill) =>
  installableSkills.includes(skill),
);
const validSourceOnlySkills = validLocalSkills.filter((skill) =>
  sourceOnlySkills.includes(skill),
);

if (!Array.isArray(manifest.retired_skills)) {
  fail("manifest: retired_skills must be an array");
}
const retiredSkillNames = new Set();
for (const retired of manifest.retired_skills ?? []) {
  if (!retired || typeof retired !== "object" || Array.isArray(retired)) {
    fail("manifest: retired skill metadata must be an object");
    continue;
  }
  const keys = Object.keys(retired).sort();
  if (keys.join(",") !== "name,owner,replacement") {
    fail(
      `manifest: retired skill ${retired.name ?? "<unknown>"} must contain only name, owner, and replacement`,
    );
  }
  if (!/^[a-z0-9-]{1,63}$/.test(retired.name ?? "")) {
    fail(`manifest: invalid retired skill name ${retired.name}`);
    continue;
  }
  if (retiredSkillNames.has(retired.name)) {
    fail(`manifest: duplicate retired skill name ${retired.name}`);
  }
  retiredSkillNames.add(retired.name);
  if (localSkillNames.has(retired.name)) {
    fail(`manifest: retired skill ${retired.name} is still active`);
  }
  if (typeof retired.owner !== "string" || !retired.owner.trim()) {
    fail(`manifest: retired skill ${retired.name} must declare an owner`);
  }
  if (
    retired.replacement !== null &&
    (typeof retired.replacement !== "string" ||
      !localSkillNames.has(retired.replacement))
  ) {
    fail(
      `manifest: retired skill ${retired.name} has unknown replacement ${retired.replacement}`,
    );
  }
  if (retired.replacement === retired.name) {
    fail(`manifest: retired skill ${retired.name} cannot replace itself`);
  }
}

validateReadmeSkillsTable(readmePath, validInstallableSkills);
validateReadmeSourceOnlyPointers(
  readmePath,
  validSourceOnlySkills,
  validInstallableSkills,
);

const skillFiles = filesNamed(path.join(root, "skills"), "SKILL.md");
const discoveredPaths = new Set(
  skillFiles.map((file) => relative(path.dirname(file))),
);
for (const skill of validLocalSkills) {
  const skillDir = path.join(root, skill.path);
  const skillFile = path.join(skillDir, "SKILL.md");
  const metadataFile = path.join(skillDir, "agents", "openai.yaml");
  const group = skill.path.split("/")[1];
  const operatorMirror = path.join(root, "docs", group, `${skill.name}.md`);
  if (fs.existsSync(operatorMirror)) {
    fail(
      `${relative(operatorMirror)}: per-skill operator mirrors are forbidden; README must link to canonical SKILL.md`,
    );
  }
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
  const metadataMatch = metadata.match(
    /^interface:\n  display_name: "([^"\n]+)"\n  short_description: "([^"\n]+)"\n  default_prompt: "([^"\n]+)"\npolicy:\n  allow_implicit_invocation: (true|false)\n?$/,
  );
  if (!metadataMatch) {
    fail(`${skill.path}: agents/openai.yaml must match the canonical schema`);
  } else {
    const [, displayName, shortDescription, defaultPrompt, policy] = metadataMatch;
    if (!displayName) fail(`${skill.path}: missing quoted display_name`);
    if (shortDescription.length < 25 || shortDescription.length > 64) {
      fail(`${skill.path}: short_description must be 25-64 characters`);
    }
    if (!defaultPrompt.includes(`$${skill.name}`)) {
      fail(`${skill.path}: default_prompt must mention $${skill.name}`);
    }
    if (policy !== String(skill.implicit)) {
      fail(`${skill.path}: invocation policy differs from manifest`);
    }
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

  const referenceRoot = path.join(skillDir, "references");
  for (const reference of filesUnder(referenceRoot)) {
    const pointer = relative(reference).slice(`${skill.path}/`.length);
    if (!content.includes(`(${pointer})`)) {
      fail(`${skill.path}: ${pointer} is not linked directly from SKILL.md`);
    }
  }

  for (const markdown of filesUnder(skillDir, (file) => file.endsWith(".md"))) {
    validateSkillMarkdown(markdown, skill, knownSkillNames);
    validateMarkdownLinks(markdown);
    validateSemanticXml(markdown);
  }
}

for (const discovered of discoveredPaths) {
  if (!localSkillPaths.has(discovered)) {
    fail(`${discovered}: SKILL.md is not promoted in the manifest`);
  }
}
for (const promoted of localSkillPaths) {
  if (!discoveredPaths.has(promoted)) {
    fail(`${promoted}: manifest path has no SKILL.md`);
  }
}

const repositoryMarkdown = new Set([
  path.join(root, "AGENTS.md"),
  path.join(root, "CONTEXT.md"),
  readmePath,
  ...filesUnder(path.join(root, "config"), (file) => file.endsWith(".md")),
  ...filesUnder(path.join(root, "docs"), (file) => file.endsWith(".md")),
]);
for (const markdown of repositoryMarkdown) {
  validateMarkdownLinks(markdown);
  validateSemanticXml(markdown);
}

{
  const durable = checkDurablePages({ root });
  for (const error of durable.errors) fail(error);
}

{
  const capsuleSkill = path.join(root, "skills", "engineering", "delivery-loop", "SKILL.md");
  for (const error of capsuleAbiErrors(read(capsuleSkill), ABI_LABELS)) fail(error);
}

{
  const transitions = read(
    path.join(root, "skills", "engineering", "delivery-loop", "references", "transitions.md"),
  );
  const baseline = new Set([
    ...(Array.isArray(manifest.harness_skills) ? manifest.harness_skills : []),
    ...upstreamSources.sources.flatMap((source) => {
      const paths = source.harness_paths ?? source.required_paths;
      return paths.map((requiredPath) => path.basename(path.dirname(requiredPath)));
    }),
  ]);
  const knownHandlers = new Set([...localSkillNames, ...upstreamSkillNames]);
  for (const error of transitionErrors(transitions, { knownHandlers, baseline })) fail(error);
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
  `validated ${installableSkills.length} installable skills and ${sourceOnlySkills.length} source-only skills, ` +
    `${Object.keys(capabilityProfiles.profiles).length} capability profiles, ` +
    "and installation metadata",
);
