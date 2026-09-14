import { basename, join } from "node:path";
import { posixRelative } from "../support/path-rules.mjs";
import { unfencedLines } from "./content-rules.mjs";

const INTERFACE_REQUIRED = ["display_name", "short_description", "default_prompt"];
const INTERFACE_OPTIONAL = new Set(["icon_small", "icon_large", "brand_color"]);
const SCHEMA_ERROR = "must match the canonical schema";

function parseMetadata(metadata) {
  const interfaceFields = new Map();
  const policyFields = new Map();
  let section = null;
  let inDependencies = false;
  for (const raw of String(metadata).split("\n")) {
    if (raw.trim() === "" || raw.trimStart().startsWith("#")) continue;
    if (/^dependencies:\s*$/.test(raw)) {
      section = null;
      inDependencies = true;
      continue;
    }
    const topLevel = /^([A-Za-z_][A-Za-z0-9_-]*):\s*$/.exec(raw);
    if (topLevel) {
      section = topLevel[1];
      inDependencies = false;
      if (section !== "interface" && section !== "policy") return null;
      continue;
    }
    if (inDependencies) {
      if (/^\s/.test(raw)) continue;
      return null;
    }
    const field = /^ {2}([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/.exec(raw);
    if (!field) return null;
    if (section === "interface") {
      if (!INTERFACE_REQUIRED.includes(field[1]) && !INTERFACE_OPTIONAL.has(field[1])) return null;
      interfaceFields.set(field[1], field[2].trim());
    } else if (section === "policy") {
      if (field[1] !== "allow_implicit_invocation") return null;
      policyFields.set(field[1], field[2].trim());
    } else {
      return null;
    }
  }
  return { interfaceFields, policyFields };
}

function quoted(value) {
  const match = value?.match(/^"([^"\n]+)"$/);
  return match ? match[1] : undefined;
}

export function openaiYamlErrors(metadata, { name, implicit, skillPath }) {
  const errors = [];
  const schemaError = `${skillPath}: agents/openai.yaml ${SCHEMA_ERROR}`;
  const parsed = parseMetadata(metadata);
  if (!parsed) return [schemaError];
  const displayName = quoted(parsed.interfaceFields.get("display_name"));
  const shortDescription = quoted(parsed.interfaceFields.get("short_description"));
  const defaultPrompt = quoted(parsed.interfaceFields.get("default_prompt"));
  const policy = parsed.policyFields.get("allow_implicit_invocation");
  if (displayName === undefined || shortDescription === undefined || defaultPrompt === undefined || (policy !== "true" && policy !== "false")) {
    return [schemaError];
  }
  if (shortDescription.length < 25 || shortDescription.length > 64) {
    errors.push(`${skillPath}: short_description must be 25-64 characters`);
  }
  if (!defaultPrompt.includes(`$${name}`)) {
    errors.push(`${skillPath}: default_prompt must mention $${name}`);
  }
  if (policy !== String(implicit)) {
    errors.push(`${skillPath}: invocation policy differs from manifest`);
  }
  return errors;
}

export function skillContentErrors(content, { skillPath }) {
  const errors = [];
  if (/disable-model-invocation/.test(content)) {
    errors.push(`${skillPath}: Claude-only invocation frontmatter is not canonical`);
  }
  if (/TODO|\[TODO|Structuring This Skill/i.test(content)) {
    errors.push(`${skillPath}: unresolved scaffold text`);
  }
  if (/\]\(\.\.\//.test(content) || /^\[[^\]]+\]:\s*\.\.\//m.test(content)) {
    errors.push(`${skillPath}: cross-skill relative pointers are not allowed`);
  }
  return errors;
}

export function skillPointerErrors(content, { skillPath, resolveTarget }) {
  const errors = [];
  for (const match of content.matchAll(/\]\((references|scripts)\/([^)\s#]+)[^)]*\)/g)) {
    if (!resolveTarget(match[1], match[2])) {
      errors.push(`${skillPath}: broken direct pointer ${match[0]}`);
    }
  }
  return errors;
}

export function lineLimitErrors({ label, lineCount, max }) {
  return lineCount > max ? [`${label} exceeds ${max} lines`] : [];
}

export function skillLayoutErrors(skill, { root, exists }) {
  const errors = [];
  const skillDir = join(root, skill.path);
  const skillFile = join(skillDir, "SKILL.md");
  const metadataFile = join(skillDir, "agents", "openai.yaml");
  const group = skill.path.split("/")[1];
  const operatorMirror = join(root, "docs", group, `${skill.name}.md`);
  if (exists(operatorMirror)) {
    const mirrorLabel = posixRelative(root, operatorMirror);
    errors.push(
      `${mirrorLabel}: per-skill operator mirrors are forbidden; README must link to canonical SKILL.md`,
    );
  }
  if (!exists(skillFile)) {
    errors.push(`${skill.path}: missing SKILL.md`);
    return { errors, present: false };
  }
  if (!exists(metadataFile)) {
    errors.push(`${skill.path}: missing agents/openai.yaml`);
    return { errors, present: false };
  }
  return { errors, present: true, skillDir, skillFile, metadataFile };
}

export function skillIdentityErrors(fields, skill) {
  const errors = [];
  if (fields.name !== skill.name) {
    errors.push(`${skill.path}: frontmatter name does not match manifest`);
  }
  if (basename(skill.path) !== skill.name) {
    errors.push(`${skill.path}: folder name does not match skill name`);
  }
  if (!fields.description || fields.description.length > 280) {
    errors.push(`${skill.path}: description must be 1-280 characters`);
  }
  return errors;
}

export function referenceLinkErrors(content, { skillPath, references }) {
  const errors = [];
  const unfenced = unfencedLines(content).map((entry) => entry.line).join("\n");
  const targets = new Set();
  for (const match of unfenced.matchAll(/\(<?([^)\s>#]+)(?:#[^)\s>]*)?(?:\s+"[^"]*")?\s*>?\)/g)) {
    targets.add(match[1]);
  }
  for (const pointer of references) {
    if (!targets.has(pointer)) {
      errors.push(`${skillPath}: ${pointer} is not linked directly from SKILL.md`);
    }
  }
  return errors;
}

export function skillPromotionErrors(discoveredPaths, promotedPaths) {
  const errors = [];
  for (const discovered of discoveredPaths) {
    if (!promotedPaths.has(discovered)) {
      errors.push(`${discovered}: SKILL.md is not promoted in the manifest`);
    }
  }
  for (const promoted of promotedPaths) {
    if (!discoveredPaths.has(promoted)) {
      errors.push(`${promoted}: manifest path has no SKILL.md`);
    }
  }
  return errors;
}

export function contractBudgetErrors({ label, text, maxLineChars, maxWords, maxChars }) {
  const errors = [];
  text.split("\n").forEach((line, index) => {
    if (line.length > maxLineChars) {
      errors.push(`${label}:${index + 1} has ${line.length} characters; the cap is ${maxLineChars}`);
    }
  });
  if (maxChars && text.length > maxChars) {
    errors.push(`${label} has ${text.length} characters; the cap is ${maxChars}`);
  }
  const words = text.replace(/[\u200B-\u200D\u2060\uFEFF]/g, " ").split(/\s+/).filter(Boolean).length;
  if (words > maxWords) {
    errors.push(`${label} has ${words} words; the cap is ${maxWords}`);
  }
  return errors;
}
