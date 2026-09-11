import { basename, join, relative, sep } from "node:path";

const METADATA_SCHEMA =
  /^interface:\n  display_name: "([^"\n]+)"\n  short_description: "([^"\n]+)"\n  default_prompt: "([^"\n]+)"\npolicy:\n  allow_implicit_invocation: (true|false)\n?$/;

export function openaiYamlErrors(metadata, { name, implicit, skillPath }) {
  const errors = [];
  const match = metadata.match(METADATA_SCHEMA);
  if (!match) {
    return [`${skillPath}: agents/openai.yaml must match the canonical schema`];
  }
  const [, displayName, shortDescription, defaultPrompt, policy] = match;
  if (!displayName) errors.push(`${skillPath}: missing quoted display_name`);
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
  if (/\]\(\.\.\//.test(content)) {
    errors.push(`${skillPath}: cross-skill relative pointers are not allowed`);
  }
  return errors;
}

export function skillPointerErrors(content, { skillPath, resolveTarget }) {
  const errors = [];
  for (const match of content.matchAll(/\]\((references|scripts)\/([^)#]+)\)/g)) {
    if (!resolveTarget(match[1], match[2])) {
      errors.push(`${skillPath}: broken direct pointer ${match[0]}`);
    }
  }
  return errors;
}

export function lineLimitErrors({ label, lineCount, max, suffix = "" }) {
  return lineCount > max ? [`${label} exceeds ${max} lines${suffix}`] : [];
}

export function skillLayoutErrors(skill, { root, exists }) {
  const errors = [];
  const skillDir = join(root, skill.path);
  const skillFile = join(skillDir, "SKILL.md");
  const metadataFile = join(skillDir, "agents", "openai.yaml");
  const group = skill.path.split("/")[1];
  const operatorMirror = join(root, "docs", group, `${skill.name}.md`);
  if (exists(operatorMirror)) {
    const mirrorLabel = relative(root, operatorMirror).split(sep).join("/");
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
  for (const pointer of references) {
    if (!content.includes(`(${pointer})`)) {
      errors.push(`${skillPath}: ${pointer} is not linked directly from SKILL.md`);
    }
  }
  return errors;
}
