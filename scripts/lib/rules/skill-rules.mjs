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
  const unfenced = unfencedLines(content).map((entry) => entry.line).join("\n");
  if (/disable-model-invocation/.test(content)) {
    errors.push(`${skillPath}: Claude-only invocation frontmatter is not canonical`);
  }
  if (/TODO|\[TODO|Structuring This Skill/i.test(content)) {
    errors.push(`${skillPath}: unresolved scaffold text`);
  }
  if (/\]\(\.\.\//.test(unfenced) || /^\[[^\]]+\]:\s*\.\.\//m.test(unfenced)) {
    errors.push(`${skillPath}: cross-skill relative pointers are not allowed`);
  }
  return errors;
}

export function skillPointerErrors(content, { skillPath, resolveTarget }) {
  const errors = [];
  const code = unfencedLines(content).map((entry) => entry.line.replace(/`[^`]*`/g, "")).join("\n");
  for (const match of code.matchAll(/\]\(<?(references|scripts)\/([^)\s#>]+)[^)]*\)/g)) {
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
  const unfenced = unfencedLines(content).map((entry) => entry.line.replace(/`[^`]*`/g, "")).join("\n");
  const targets = new Set();
  for (const match of unfenced.matchAll(/\(<?([^)\s>#]+)(?:#[^)\s>]*)?(?:\s+(?:"[^"]*"|'[^']*'))?\s*>?\)/g)) {
    targets.add(match[1]);
  }
  for (const match of unfenced.matchAll(/^\s*\[[^\]]+\]:\s*<?([^)\s>#]+)/gm)) {
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

const ROUTING_CATEGORIES = new Set(["canonical", "synonym", "negative", "no-owner"]);

const QUERY_STOPWORDS = new Set([
  "this", "that", "these", "those", "with", "from", "into", "your", "have", "does",
  "when", "then", "than", "them", "they", "will", "would", "should", "about", "after",
  "before", "without", "across", "over", "plain",
]);

const ACTION_VERBS = new Set([
  "audit", "capture", "condense", "coordinate", "copy", "define", "disable", "edit",
  "enable", "enter", "handle", "implement", "initialize", "inspect", "install",
  "inventory", "make", "manage", "plan", "produce", "profile", "repair", "request",
  "review", "rewrite", "run", "set", "sharpen", "test", "turn", "verify", "write",
]);

const OBJECT_STOPWORDS = new Set([
  "a", "an", "the", "this", "that", "these", "those", "your", "our", "its", "their",
  "one", "two", "three", "and", "or", "for", "with", "from", "into", "over", "across",
  "every", "each", "all", "any", "explicitly", "requested", "settled", "accepted",
  "bounded", "forced", "first", "before", "after", "when", "while",
]);

function normalizePhrase(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function declaresTrigger(description, phrase) {
  const haystack = normalizePhrase(description);
  const needle = normalizePhrase(phrase);
  return needle.length > 0 && haystack.includes(needle);
}

function queryTokens(query) {
  return [...new Set(normalizePhrase(query).split(" ").filter((token) => token.length >= 4 && !QUERY_STOPWORDS.has(token)))];
}

function pairKey(left, right) {
  return [left, right].sort().join("\u0000");
}

export function verbObjectTriggers(description) {
  const first = String(description).replace(/\s+/g, " ").split(/(?<=[.!?])\s/)[0] ?? "";
  const tokens = first.toLowerCase().match(/[a-z][a-z-]+/g) ?? [];
  const verbIndex = tokens.findIndex((token) => ACTION_VERBS.has(token));
  if (verbIndex === -1) return [];
  for (let index = verbIndex + 1; index < tokens.length; index += 1) {
    if (ACTION_VERBS.has(tokens[index]) || OBJECT_STOPWORDS.has(tokens[index])) continue;
    return [`${tokens[verbIndex]} ${tokens[index]}`];
  }
  return [];
}

export function triggerCollisionWarnings(skills, { companions = [] } = {}) {
  const warnings = [];
  const pairs = new Set(companions.map(([left, right]) => pairKey(left, right)));
  const claims = new Map();
  for (const skill of skills) {
    if (skill.implicit === false) continue;
    for (const trigger of verbObjectTriggers(skill.description)) {
      if (!claims.has(trigger)) claims.set(trigger, []);
      claims.get(trigger).push(skill.name);
    }
  }
  for (const [trigger, names] of claims) {
    const unique = [...new Set(names)];
    for (let left = 0; left < unique.length; left += 1) {
      for (let right = left + 1; right < unique.length; right += 1) {
        if (pairs.has(pairKey(unique[left], unique[right]))) continue;
        warnings.push({ rule: "trigger-collision", trigger, skills: [unique[left], unique[right]] });
      }
    }
  }
  return warnings;
}

export function routingCaseErrors(skills, cases, { companions = [] } = {}) {
  const errors = [];
  const byName = new Map(skills.map((skill) => [skill.name, skill]));
  const implicit = skills.filter((skill) => skill.implicit !== false);
  const pairs = new Set(companions.map(([left, right]) => pairKey(left, right)));
  const ids = new Set();
  const categories = new Set();
  const covered = new Set();
  for (const entry of cases) {
    const id = entry?.id;
    if (typeof id !== "string" || !id.trim()) {
      errors.push("routing case needs a non-empty id");
      continue;
    }
    if (ids.has(id)) errors.push(`routing case ${id}: duplicate id`);
    ids.add(id);
    if (!ROUTING_CATEGORIES.has(entry.category)) errors.push(`routing case ${id}: unknown category ${entry.category}`);
    else categories.add(entry.category);
    if (typeof entry.query !== "string" || !entry.query.trim()) errors.push(`routing case ${id}: query must be non-empty`);
    if (typeof entry.trigger !== "string" || !entry.trigger.trim()) errors.push(`routing case ${id}: trigger must be non-empty`);
    const near = Array.isArray(entry.near) ? [...new Set(entry.near)] : [];
    for (const name of near) if (!byName.has(name)) errors.push(`routing case ${id}: unknown near skill ${name}`);
    if (entry.owner === null || entry.owner === undefined) {
      if (entry.category === "canonical" || entry.category === "synonym") {
        errors.push(`routing case ${id}: a ${entry.category} case needs an owner`);
      }
      const claimants = implicit.filter((skill) => declaresTrigger(skill.description, entry.trigger)).map((skill) => skill.name);
      if (claimants.length) errors.push(`routing case ${id}: no-owner trigger "${entry.trigger}" is claimed by ${claimants.join(", ")}`);
      if (entry.category === "negative") {
        for (const name of near) {
          const skill = byName.get(name);
          if (skill && !queryTokens(entry.query).some((token) => declaresTrigger(skill.description, token))) {
            errors.push(`routing case ${id}: near skill ${name} is not close to the query`);
          }
        }
      }
    } else {
      const owner = byName.get(entry.owner);
      if (!owner) errors.push(`routing case ${id}: unknown owner ${entry.owner}`);
      else if (owner.implicit === false) errors.push(`routing case ${id}: owner ${entry.owner} is explicit-only`);
      else {
        if (!declaresTrigger(owner.description, entry.trigger)) errors.push(`routing case ${id}: ${entry.owner} does not declare trigger "${entry.trigger}"`);
        const rivals = implicit
          .filter((skill) => skill.name !== owner.name && declaresTrigger(skill.description, entry.trigger) && !pairs.has(pairKey(skill.name, owner.name)))
          .map((skill) => skill.name);
        if (rivals.length) errors.push(`routing case ${id}: trigger "${entry.trigger}" is also claimed by ${rivals.join(", ")}`);
        covered.add(owner.name);
      }
      if (entry.category === "no-owner") errors.push(`routing case ${id}: a no-owner case must not name an owner`);
    }
    for (const name of near) {
      if (entry.owner === name) errors.push(`routing case ${id}: near skill ${name} is also the owner`);
      const skill = byName.get(name);
      if (skill && declaresTrigger(skill.description, entry.trigger)) errors.push(`routing case ${id}: near skill ${name} shares trigger "${entry.trigger}"`);
    }
  }
  for (const skill of implicit) if (!covered.has(skill.name)) errors.push(`routing case set: no positive case for ${skill.name}`);
  for (const category of ROUTING_CATEGORIES) if (!categories.has(category)) errors.push(`routing case set: no ${category} case`);
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
