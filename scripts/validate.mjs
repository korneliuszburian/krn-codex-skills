#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCapabilityProfiles } from "./lib/catalog-inventory.mjs";
import {
  gitStagedFiles,
  gitTrackedFiles,
  validateExperimentTree,
} from "./lib/experiment-artifacts.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "skills", "manifest.json");
const evalPath = path.join(root, "evals", "trigger-cases.json");
const experimentsPath = path.join(root, "evals", "experiments");
const readmePath = path.join(root, "README.md");
const errors = [];

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));
const relative = (file) => path.relative(root, file).split(path.sep).join("/");
const safeRelativePath = (value) =>
  typeof value === "string" &&
  Boolean(value.trim()) &&
  !path.isAbsolute(value) &&
  !value.split("/").includes("..");

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

function unfencedLines(content) {
  const lines = [];
  let fenced = false;
  for (const [index, line] of content.split("\n").entries()) {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (!fenced) lines.push({ line, number: index + 1 });
  }
  return lines;
}

function activeShellLines(content) {
  return content
    .split("\n")
    .map((line) => {
      let singleQuoted = false;
      let doubleQuoted = false;
      let escaped = false;
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\" && !singleQuoted) {
          escaped = true;
          continue;
        }
        if (character === "'" && !doubleQuoted) {
          singleQuoted = !singleQuoted;
          continue;
        }
        if (character === '"' && !singleQuoted) {
          doubleQuoted = !doubleQuoted;
          continue;
        }
        if (
          character === "#" &&
          !singleQuoted &&
          !doubleQuoted &&
          (index === 0 || /\s/.test(line[index - 1]))
        ) {
          return line.slice(0, index).trim();
        }
      }
      return line.trim();
    })
    .filter(Boolean);
}

function shellWords(line) {
  return line.match(/"(?:\\.|[^"\\])*"|'[^']*'|[^\s]+/g) ?? [];
}

function unquoteShellWord(word) {
  if (
    (word.startsWith('"') && word.endsWith('"')) ||
    (word.startsWith("'") && word.endsWith("'"))
  ) {
    return word.slice(1, -1);
  }
  return word;
}

function isClaudeInvocation(line) {
  const words = shellWords(line).map(unquoteShellWord);
  const command = 0;
  if (words[command] === "claude") return true;
  return (
    words[command] === "timeout" &&
    words.slice(command + 1).includes("claude")
  );
}

function isClaudeWindowGuard(line) {
  const words = shellWords(line).map(unquoteShellWord);
  const command = 0;
  return (
    words[command] === "node" &&
    words[command + 1]?.endsWith("check-claude-window.mjs") &&
    words[command + 2] === "check"
  );
}

function validateMarkdownLinks(file) {
  for (const { line, number } of unfencedLines(read(file))) {
    for (const match of line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      let target = match[1].trim().split(/\s+"/)[0];
      if (/^<.*>$/.test(target)) target = target.slice(1, -1);
      if (!target || target.startsWith("#") || /^[a-z][a-z+.-]*:/i.test(target)) {
        continue;
      }
      target = decodeURIComponent(target.split("#")[0]);
      if (!fs.existsSync(path.resolve(path.dirname(file), target))) {
        fail(`${relative(file)}:${number}: broken Markdown link ${match[1]}`);
      }
    }
  }
}

function validateSemanticXml(file) {
  const stack = [];
  for (const { line, number } of unfencedLines(read(file))) {
    const trimmed = line.trim();
    const close = trimmed.match(/^<\/([a-z][a-z0-9-]*)>$/);
    if (close) {
      const open = stack.pop();
      if (!open || open.name !== close[1]) {
        fail(`${relative(file)}:${number}: unmatched </${close[1]}>`);
      }
      continue;
    }
    const open = trimmed.match(/^<([a-z][a-z0-9-]*)(?:\s+[^>]*)?>$/);
    if (open) stack.push({ name: open[1], number });
  }
  for (const open of stack) {
    fail(`${relative(file)}:${open.number}: unclosed <${open.name}>`);
  }
}

function validateReadmeSkillsTable(file, skills) {
  const lines = read(file).split("\n");
  const headings = lines
    .map((line, index) => (line.trim() === "## Skills" ? index : -1))
    .filter((index) => index !== -1);
  if (headings.length !== 1) {
    fail(
      `${relative(file)}: expected exactly one ## Skills section, found ${headings.length}`,
    );
    return;
  }

  let headerIndex = headings[0] + 1;
  while (headerIndex < lines.length && !lines[headerIndex].trim()) {
    headerIndex += 1;
  }
  if (
    !/^\|\s*Skill\s*\|\s*Invocation\s*\|\s*Owns\s*\|\s*$/.test(
      lines[headerIndex] ?? "",
    )
  ) {
    fail(
      `${relative(file)}:${headerIndex + 1}: Skills table must use Skill, Invocation, and Owns columns`,
    );
    return;
  }

  const dividerIndex = headerIndex + 1;
  if (
    !/^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$/.test(
      lines[dividerIndex] ?? "",
    )
  ) {
    fail(`${relative(file)}:${dividerIndex + 1}: invalid Skills table divider`);
    return;
  }

  const rows = [];
  for (let index = dividerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || /^#{1,6}\s/.test(line)) break;
    if (!line.startsWith("|") || !line.endsWith("|")) {
      fail(`${relative(file)}:${index + 1}: malformed Skills table row`);
      break;
    }
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length !== 3) {
      fail(
        `${relative(file)}:${index + 1}: Skills table row must have exactly three cells`,
      );
      continue;
    }
    const skillLink = cells[0].match(
      /^\[`([a-z0-9-]+)`\]\(skills\/([a-z0-9-]+)\/([a-z0-9-]+)\/SKILL\.md\)$/,
    );
    if (!skillLink) {
      fail(
        `${relative(file)}:${index + 1}: skill cell must be a canonical skills/<group>/<skill>/SKILL.md link`,
      );
      continue;
    }
    rows.push({
      name: skillLink[1],
      group: skillLink[2],
      linkedName: skillLink[3],
      invocation: cells[1],
      line: index + 1,
    });
  }

  const manifestByName = new Map(
    skills
      .filter((skill) => typeof skill?.name === "string")
      .map((skill) => [skill.name, skill]),
  );
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.name)) {
      fail(`${relative(file)}:${row.line}: duplicate skill row ${row.name}`);
      continue;
    }
    seen.add(row.name);

    const skill = manifestByName.get(row.name);
    if (!skill) {
      fail(`${relative(file)}:${row.line}: unknown skill row ${row.name}`);
      continue;
    }
    if (row.linkedName !== row.name) {
      fail(
        `${relative(file)}:${row.line}: skill ${row.name} link must end in ${row.name}/SKILL.md`,
      );
    }
    const expectedGroup = skill.path?.split("/")[1];
    if (expectedGroup && row.group !== expectedGroup) {
      fail(
        `${relative(file)}:${row.line}: skill ${row.name} group ${row.group} differs from manifest group ${expectedGroup}`,
      );
    }
    if (typeof skill.implicit === "boolean") {
      const expectedInvocation = skill.implicit ? "model or user" : "explicit only";
      if (row.invocation !== expectedInvocation) {
        fail(
          `${relative(file)}:${row.line}: skill ${row.name} invocation must be "${expectedInvocation}"`,
        );
      }
    }
  }

  for (const name of manifestByName.keys()) {
    if (!seen.has(name)) {
      fail(`${relative(file)}: Skills table is missing manifest skill ${name}`);
    }
  }
}

function hasExactSkillToken(prompt, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(
    `(?:^|[^A-Za-z0-9_$-])\\$${escapedName}(?=$|[^A-Za-z0-9_-])`,
  ).test(prompt);
}

function validateSkillMarkdown(file, skill, manifestNames) {
  const content = read(file);
  if (/\b(?:node|bash|python3?)\s+(?:\.\/)?scripts\//.test(content)) {
    fail(
      `${relative(file)}: runnable global skill scripts must use the installed ~/.agents/skills/${skill.name}/scripts path`,
    );
  }
  for (const match of content.matchAll(/\$([a-z][a-z0-9-]+)/g)) {
    if (!manifestNames.has(match[1])) {
      fail(`${relative(file)}: unknown composed skill $${match[1]}`);
    }
  }
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
const globalClaudePathSafe = safeRelativePath(manifest.global_claude);
if (!globalClaudePathSafe) {
  fail("manifest: unsafe global_claude path");
}
const globalHooksPathSafe = safeRelativePath(manifest.global_hooks);
if (!globalHooksPathSafe) {
  fail("manifest: unsafe global_hooks path");
}

const hookFileNames = new Set();
for (const hookFile of manifest.global_hook_files ?? []) {
  if (!/^[a-zA-Z0-9_.-]{1,80}$/.test(hookFile.name ?? "")) {
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
for (const legacyPath of manifest.legacy_global_hook_paths ?? []) {
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
for (const bin of manifest.bins ?? []) {
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

  const pathParts = skill.path.split("/");
  if (
    pathParts.length !== 3 ||
    pathParts[0] !== "skills" ||
    !["engineering", "advisory", "meta"].includes(pathParts[1]) ||
    pathParts[2] !== skill.name
  ) {
    fail(`manifest: skill path must be skills/<group>/${skill.name}`);
  }
}

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
  if (manifestNames.has(retired.name)) {
    fail(`manifest: retired skill ${retired.name} is still active`);
  }
  if (typeof retired.owner !== "string" || !retired.owner.trim()) {
    fail(`manifest: retired skill ${retired.name} must declare an owner`);
  }
  if (
    retired.replacement !== null &&
    (typeof retired.replacement !== "string" ||
      !manifestNames.has(retired.replacement))
  ) {
    fail(
      `manifest: retired skill ${retired.name} has unknown replacement ${retired.replacement}`,
    );
  }
  if (retired.replacement === retired.name) {
    fail(`manifest: retired skill ${retired.name} cannot replace itself`);
  }
}

validateReadmeSkillsTable(readmePath, manifest.skills ?? []);

const skillFiles = filesNamed(path.join(root, "skills"), "SKILL.md");
const discoveredPaths = new Set(
  skillFiles.map((file) => relative(path.dirname(file))),
);

for (const skill of manifest.skills) {
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
    validateSkillMarkdown(markdown, skill, manifestNames);
    validateMarkdownLinks(markdown);
    validateSemanticXml(markdown);
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

const secondOpinion = manifest.skills.find(
  (skill) => skill.name === "second-opinion-review",
);
if (secondOpinion) {
  const skillRoot = path.join(root, secondOpinion.path);
  const skillEntrypoint = read(path.join(skillRoot, "SKILL.md"));
  const artifactHelper = "prepare-artifacts.mjs";
  const artifactHelperPath = path.join(skillRoot, "scripts", artifactHelper);
  if (!fs.existsSync(artifactHelperPath)) {
    fail(`${secondOpinion.path}: missing ${artifactHelper}`);
  }
  if (!skillEntrypoint.includes(`scripts/${artifactHelper}`)) {
    fail(`${secondOpinion.path}: SKILL.md must route through ${artifactHelper}`);
  }
  const reviewSchemaPath = path.join(
    skillRoot,
    "references",
    "review.schema.json",
  );
  if (!fs.existsSync(reviewSchemaPath)) {
    fail(`${secondOpinion.path}: missing review.schema.json`);
  } else {
    validateTransportSchema(json(reviewSchemaPath));
  }
  const researchSchemaPath = path.join(
    skillRoot,
    "references",
    "research.schema.json",
  );
  if (!fs.existsSync(researchSchemaPath)) {
    fail(`${secondOpinion.path}: missing research.schema.json`);
  } else {
    validateTransportSchema(json(researchSchemaPath));
  }

  for (const requiredFile of [
    "references/research-template.md",
    "scripts/research-campaign.mjs",
    "scripts/run-research.mjs",
  ]) {
    if (!fs.existsSync(path.join(skillRoot, requiredFile))) {
      fail(`${secondOpinion.path}: missing ${requiredFile}`);
    }
  }
  const researchRunner = read(path.join(skillRoot, "scripts", "run-research.mjs"));
  const researchWindow = researchRunner.indexOf("check-claude-window.mjs");
  const researchInvocation = researchRunner.indexOf("claudeInvoker({");
  if (
    researchWindow === -1 ||
    researchInvocation === -1 ||
    researchWindow >= researchInvocation
  ) {
    fail(
      `${secondOpinion.path}: run-research.mjs must bind the Claude window before invocation`,
    );
  }

  const windowGuard = "check-claude-window.mjs";
  for (const runner of ["run-review.sh", "run-handoff.sh"]) {
    const runnerPath = path.join(skillRoot, "scripts", runner);
    if (!fs.existsSync(runnerPath)) {
      fail(`${secondOpinion.path}: missing ${runner}`);
      continue;
    }

    const activeLines = activeShellLines(read(runnerPath));
    const firstClaude = activeLines.findIndex(isClaudeInvocation);
    const firstGuard = activeLines.findIndex(isClaudeWindowGuard);
    if (firstClaude === -1) {
      fail(`${secondOpinion.path}: ${runner} has no active Claude invocation`);
    } else if (firstGuard === -1 || firstGuard >= firstClaude) {
      fail(
        `${secondOpinion.path}: ${runner} must run an active ${windowGuard} check before its first Claude invocation`,
      );
    }
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
  const skillLists = {};
  for (const field of ["expected_skills", "forbidden_skills"]) {
    const names = testCase[field];
    if (!Array.isArray(names)) {
      fail(`${testCase.id}: ${field} must be an array`);
      skillLists[field] = [];
      continue;
    }
    const unique = new Set();
    for (const name of names) {
      if (unique.has(name)) {
        fail(`${testCase.id}: duplicate ${field} member ${name}`);
      }
      unique.add(name);
    }
    skillLists[field] = names;
  }
  const expectedSkills = skillLists.expected_skills;
  const forbiddenSkills = skillLists.forbidden_skills;
  for (const name of expectedSkills) {
    const expectedSkill = (manifest.skills ?? []).find(
      (skill) => skill.name === name,
    );
    if (!expectedSkill) {
      fail(`${testCase.id}: unknown expected skill ${name}`);
    } else if (
      expectedSkill.implicit === false &&
      typeof testCase.prompt === "string" &&
      !hasExactSkillToken(testCase.prompt, name)
    ) {
      fail(
        `${testCase.id}: explicit-only expected skill ${name} requires exact $${name} attachment in prompt`,
      );
    }
    positivelyCovered.add(name);
  }
  for (const name of forbiddenSkills) {
    if (!manifestNames.has(name)) fail(`${testCase.id}: unknown forbidden skill ${name}`);
    negativelyCovered.add(name);
  }
  const forbiddenSet = new Set(forbiddenSkills);
  for (const name of new Set(expectedSkills)) {
    if (forbiddenSet.has(name)) {
      fail(`${testCase.id}: skill ${name} is both expected and forbidden`);
    }
  }
}
for (const name of manifestNames) {
  if (!positivelyCovered.has(name)) fail(`trigger matrix: no positive case for ${name}`);
  if (!negativelyCovered.has(name)) fail(`trigger matrix: no negative case for ${name}`);
}

const experimentValidation = validateExperimentTree(experimentsPath, {
  trackedFiles: gitTrackedFiles(root, experimentsPath),
  stagedFiles: gitStagedFiles(root, experimentsPath),
  repositoryRoot: root,
});
for (const error of experimentValidation.errors) fail(error);

const goalRecovery = triggerCases.cases.find(
  (testCase) => testCase.id === "goal-recovery-is-not-global-workflow",
);
if (!goalRecovery) {
  fail("trigger matrix: missing goal-recovery-is-not-global-workflow case");
} else {
  if (
    !Array.isArray(goalRecovery.expected_skills) ||
    goalRecovery.expected_skills.length !== 0
  ) {
    fail("goal-recovery-is-not-global-workflow: expected_skills must stay empty");
  }
  const forbidden = new Set(
    Array.isArray(goalRecovery.forbidden_skills)
      ? goalRecovery.forbidden_skills
      : [],
  );
  for (const name of manifestNames) {
    if (!forbidden.has(name)) {
      fail(`goal-recovery-is-not-global-workflow: must forbid ${name}`);
    }
  }
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
if (globalClaudePathSafe) {
  const globalClaude = path.join(root, manifest.global_claude);
  if (
    !fs.lstatSync(globalClaude).isSymbolicLink() ||
    fs.readlinkSync(globalClaude) !== "AGENTS.md"
  ) {
    fail(`${manifest.global_claude} must symlink to the shared AGENTS.md`);
  }
}
const sourceClaude = path.join(root, "CLAUDE.md");
if (
  !fs.lstatSync(sourceClaude).isSymbolicLink() ||
  fs.readlinkSync(sourceClaude) !== "AGENTS.md"
) {
  fail("CLAUDE.md must symlink to the source-repository AGENTS.md");
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR ${error}`);
  process.exit(1);
}

console.log(
  `validated ${manifest.skills.length} skills, ${triggerCases.cases.length} trigger cases, ` +
    `${Object.keys(capabilityProfiles.profiles).length} capability profiles, ` +
    `${experimentValidation.experimentCount} experiment manifest${experimentValidation.experimentCount === 1 ? "" : "s"}, ` +
    "and installation metadata",
);
