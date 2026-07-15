#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadCapabilityProfiles } from "./lib/catalog-inventory.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "skills", "manifest.json");
const evalPath = path.join(root, "evals", "trigger-cases.json");
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
  path.join(root, "README.md"),
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
    if (!manifestNames.has(name)) fail(`${testCase.id}: unknown expected skill ${name}`);
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
    `${Object.keys(capabilityProfiles.profiles).length} capability profiles, and installation metadata`,
);
