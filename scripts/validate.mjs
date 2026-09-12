#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCapabilityProfiles } from "./lib/catalog-inventory.mjs";
import { ABI_LABELS } from "./lib/capsule-abi.mjs";
import { checkDurablePages } from "./lib/durable-pages.mjs";
import { checkLessons } from "./lib/lessons.mjs";
import { runtimeClosureErrors } from "./lib/runtime-closure.mjs";
import {
  contractBudgetErrors,
  lineLimitErrors,
  openaiYamlErrors,
  referenceLinkErrors,
  skillContentErrors,
  skillIdentityErrors,
  skillLayoutErrors,
  skillPointerErrors,
  skillPromotionErrors,
} from "./lib/skill-rules.mjs";
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
import {
  binErrors,
  hookFileErrors,
  legacyHookPathErrors,
  pretoolUseHookErrors,
  retirementErrors,
  validateManifestSkills,
} from "./lib/manifest-rules.mjs";
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

const inspectCatalogTarget = (relative) => {
  const target = path.join(root, relative);
  let exists = false;
  let isFile = false;
  let executable = false;
  try {
    const stat = fs.statSync(target);
    exists = true;
    isFile = stat.isFile();
  } catch {
    exists = false;
  }
  if (exists && isFile) {
    try {
      fs.accessSync(target, fs.constants.X_OK);
      executable = true;
    } catch {
      executable = false;
    }
  }
  return { exists, isFile, executable };
};

{
  const { errors: hookProblems, names: hookFileNames } = hookFileErrors(
    manifest.global_hook_files,
    { isSafeRelativePath: safeRelativePath, inspectTarget: inspectCatalogTarget },
  );
  for (const message of hookProblems) fail(message);
  const { errors: legacyProblems } = legacyHookPathErrors(
    manifest.legacy_global_hook_paths,
    { isSafeRelativePath: safeRelativePath, hookNames: hookFileNames },
  );
  for (const message of legacyProblems) fail(message);
}

if (globalHooksPathSafe) {
  const hooks = json(path.join(root, manifest.global_hooks));
  for (const message of pretoolUseHookErrors(hooks, manifest.global_hooks)) {
    fail(message);
  }
}

{
  const { errors: binProblems } = binErrors(manifest.bins, {
    isSafeRelativePath: safeRelativePath,
    inspectTarget: inspectCatalogTarget,
  });
  for (const message of binProblems) fail(message);
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

{
  const { errors: retirementProblems } = retirementErrors(
    manifest.retired_skills,
    localSkillNames,
  );
  for (const message of retirementProblems) fail(message);
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
  const layout = skillLayoutErrors(skill, { root, exists: fs.existsSync });
  for (const message of layout.errors) fail(message);
  if (!layout.present) continue;
  const { skillDir, skillFile, metadataFile } = layout;

  const fields = parseFrontmatter(skillFile);
  for (const message of skillIdentityErrors(fields, skill)) fail(message);
  for (const message of lineLimitErrors({
    label: `${skill.path}: SKILL.md`,
    lineCount: lineCount(skillFile),
    max: 180,
    suffix: "; disclose branch detail",
  })) {
    fail(message);
  }

  const metadata = read(metadataFile);
  for (const message of openaiYamlErrors(metadata, {
    name: skill.name,
    implicit: skill.implicit,
    skillPath: skill.path,
  })) {
    fail(message);
  }

  const content = read(skillFile);
  for (const message of skillContentErrors(content, { skillPath: skill.path })) fail(message);
  for (const message of skillPointerErrors(content, {
    skillPath: skill.path,
    resolveTarget: (kind, rest) => fs.existsSync(path.join(skillDir, kind, rest)),
  })) {
    fail(message);
  }

  const referenceRoot = path.join(skillDir, "references");
  const references = filesUnder(referenceRoot).map((reference) =>
    relative(reference).slice(`${skill.path}/`.length),
  );
  for (const message of referenceLinkErrors(content, { skillPath: skill.path, references })) {
    fail(message);
  }

  for (const markdown of filesUnder(skillDir, (file) => file.endsWith(".md"))) {
    validateSkillMarkdown(markdown, skill, knownSkillNames);
    validateMarkdownLinks(markdown);
    validateSemanticXml(markdown);
  }
}

for (const message of skillPromotionErrors(discoveredPaths, localSkillPaths)) fail(message);

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
  try {
    const durable = checkDurablePages({ root });
    for (const error of durable.errors) fail(error);
  } catch (error) {
    fail(`durable-pages check failed: ${error.message}`);
  }
}

{
  try {
    for (const message of runtimeClosureErrors({ root, manifest })) fail(message);
  } catch (error) {
    fail(`runtime closure check failed: ${error.message}`);
  }
}

{
  try {
    const lessons = checkLessons({ root });
    for (const error of lessons.errors) fail(error);
  } catch (error) {
    fail(`lessons check failed: ${error.message}`);
  }
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

for (const message of lineLimitErrors({
  label: "AGENTS.md",
  lineCount: lineCount(path.join(root, "AGENTS.md")),
  max: 90,
})) {
  fail(message);
}
if (globalAgentsPathSafe) {
  for (const message of lineLimitErrors({
    label: manifest.global_agents,
    lineCount: lineCount(path.join(root, manifest.global_agents)),
    max: 60,
  })) {
    fail(message);
  }
  const globalAgentsText = fs.readFileSync(path.join(root, manifest.global_agents), "utf8");
  for (const message of contractBudgetErrors({
    label: manifest.global_agents,
    text: globalAgentsText,
    maxLineChars: 320,
    maxWords: 620,
    maxChars: 5200,
  })) {
    fail(message);
  }
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
