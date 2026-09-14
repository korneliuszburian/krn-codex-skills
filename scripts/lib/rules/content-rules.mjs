const FENCE = /^( {0,3})(`{3,}|~{3,})(.*)$/;

export function fenceLines(content) {
  const result = [];
  let fence = null;
  for (const [index, line] of content.split("\n").entries()) {
    const match = FENCE.exec(line);
    const number = index + 1;
    if (fence) {
      result.push({ line, number, fenced: true });
      const closing = match !== null && match[2][0] === fence.char && match[2].length >= fence.length && match[3].trim() === "";
      if (closing) fence = null;
      continue;
    }
    if (match && !(match[2][0] === "`" && match[3].includes("`"))) {
      fence = { char: match[2][0], length: match[2].length };
      result.push({ line, number, fenced: true });
      continue;
    }
    result.push({ line, number, fenced: false });
  }
  return result;
}

export const unfencedLines = (content) => fenceLines(content).filter((entry) => !entry.fenced);

function splitTableRow(line) {
  const cells = [];
  const inner = line.startsWith("|") ? line.slice(1) : line;
  const body = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function linkTargets(line) {
  const text = line.replace(/`[^`]*`/g, " ");
  const targets = [];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("](", index);
    if (open === -1) break;
    const labelStart = text.lastIndexOf("[", open);
    if (labelStart === -1 || text.slice(labelStart + 1, open).includes("]")) {
      index = open + 2;
      continue;
    }
    let cursor = open + 2;
    let raw = "";
    let depth = 1;
    while (cursor < text.length) {
      const char = text[cursor];
      if (char === "\\") {
        raw += char + (text[cursor + 1] ?? "");
        cursor += 2;
        continue;
      }
      if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
      raw += char;
      cursor += 1;
    }
    targets.push(raw);
    index = cursor + 1;
  }
  return targets;
}

export function markdownLinkErrors(content, { label, resolveTarget }) {
  const errors = [];
  for (const { line, number } of unfencedLines(content)) {
    for (const match of linkTargets(line)) {
      const raw = match.trim();
      if (!raw) continue;
      let target;
      if (raw.startsWith("<")) {
        const close = raw.indexOf(">");
        target = close === -1 ? raw.slice(1) : raw.slice(1, close);
      } else {
        let end = raw.length;
        for (let index = 0; index < raw.length; index += 1) {
          if (raw[index] === "\\") { index += 1; continue; }
          if (/\s/.test(raw[index])) { end = index; break; }
        }
        target = raw.slice(0, end).replace(/\\(["'() ])/g, "$1");
      }
      if (!target || target.startsWith("#") || /^[a-z][a-z+.-]*:/i.test(target)) {
        continue;
      }
      try {
        target = decodeURIComponent(target.split("#")[0]);
      } catch {
        errors.push(`${label}:${number}: malformed Markdown link target ${match}`);
        continue;
      }
      if (!resolveTarget(target)) {
        errors.push(`${label}:${number}: broken Markdown link ${match}`);
      }
    }
  }
  return errors;
}

export function semanticXmlErrors(content, label) {
  const errors = [];
  const stack = [];
  const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
  for (const { line, number } of unfencedLines(content)) {
    const trimmed = line.trim();
    const close = trimmed.match(/^<\/([a-z][a-z0-9-]*)>$/);
    if (close) {
      const open = stack.pop();
      if (!open || open.name !== close[1]) {
        errors.push(`${label}:${number}: unmatched </${close[1]}>`);
      }
      continue;
    }
    if (/\/>$/.test(trimmed)) continue;
    const open = trimmed.match(/^<([a-z][a-z0-9-]*)(?:\s+[^>]*)?>$/);
    if (open && !VOID.has(open[1])) stack.push({ name: open[1], number });
  }
  for (const open of stack) {
    errors.push(`${label}:${open.number}: unclosed <${open.name}>`);
  }
  return errors;
}

export function readmeSkillsTableErrors(content, { label, skills }) {
  const errors = [];
  const lines = content.split("\n");
  const headings = lines
    .map((line, index) => (line.trim() === "## Skills" ? index : -1))
    .filter((index) => index !== -1);
  if (headings.length !== 1) {
    errors.push(`${label}: expected exactly one ## Skills section, found ${headings.length}`);
    return errors;
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
    errors.push(`${label}:${headerIndex + 1}: Skills table must use Skill, Invocation, and Owns columns`);
    return errors;
  }

  const dividerIndex = headerIndex + 1;
  if (
    !/^\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*:?-{3,}:?\s*\|\s*$/.test(
      lines[dividerIndex] ?? "",
    )
  ) {
    errors.push(`${label}:${dividerIndex + 1}: invalid Skills table divider`);
    return errors;
  }

  const rows = [];
  for (let index = dividerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || /^#{1,6}\s/.test(line)) break;
    if (!line.startsWith("|") || !line.endsWith("|")) {
      errors.push(`${label}:${index + 1}: malformed Skills table row`);
      break;
    }
    const cells = splitTableRow(line);
    if (cells.length !== 3) {
      errors.push(`${label}:${index + 1}: Skills table row must have exactly three cells`);
      continue;
    }
    const skillLink = cells[0].match(
      /^\[`([a-z0-9-]+)`\]\(skills\/([a-z0-9-]+)\/([a-z0-9-]+)\/SKILL\.md\)$/,
    );
    if (!skillLink) {
      errors.push(
        `${label}:${index + 1}: skill cell must be a canonical skills/<group>/<skill>/SKILL.md link`,
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
      errors.push(`${label}:${row.line}: duplicate skill row ${row.name}`);
      continue;
    }
    seen.add(row.name);

    const skill = manifestByName.get(row.name);
    if (!skill) {
      errors.push(`${label}:${row.line}: unknown skill row ${row.name}`);
      continue;
    }
    if (row.linkedName !== row.name) {
      errors.push(`${label}:${row.line}: skill ${row.name} link must end in ${row.name}/SKILL.md`);
    }
    const expectedGroup = skill.path?.split("/")[1];
    if (expectedGroup && row.group !== expectedGroup) {
      errors.push(
        `${label}:${row.line}: skill ${row.name} group ${row.group} differs from manifest group ${expectedGroup}`,
      );
    }
    if (typeof skill.implicit === "boolean") {
      const expectedInvocation = skill.implicit ? "model or user" : "explicit only";
      if (row.invocation !== expectedInvocation) {
        errors.push(
          `${label}:${row.line}: skill ${row.name} invocation must be "${expectedInvocation}"`,
        );
      }
    }
  }

  for (const name of manifestByName.keys()) {
    if (!seen.has(name)) {
      errors.push(`${label}: Skills table is missing manifest skill ${name}`);
    }
  }
  return errors;
}

export function readmeSourceOnlyPointerErrors(
  content,
  { label, skills, installableSkills },
) {
  const errors = [];
  const heading = "### Source-only packs";
  const start = content.indexOf(heading);
  const section = start === -1
    ? ""
    : content.slice(start, content.indexOf("\n## ", start + heading.length) === -1
      ? content.length
      : content.indexOf("\n## ", start + heading.length));
  if (start === -1) errors.push(`${label}: missing Source-only packs section`);
  for (const skill of skills) {
    const pointer = `](${skill.path}/SKILL.md)`;
    const count = section.split(pointer).length - 1;
    if (count !== 1) {
      errors.push(`${label}: source-only skill ${skill.name} must have exactly one canonical pointer`);
    }
  }
  for (const skill of installableSkills) {
    const pointer = `](${skill.path}/SKILL.md)`;
    if (section.includes(pointer)) {
      errors.push(`${label}: installable skill ${skill.name} must not appear in the Source-only packs section`);
    }
  }
  if (skills.length > 0 && !/\bnot installed\b/i.test(section)) {
    errors.push(`${label}: Source-only packs section must state that the packs are not installed`);
  }
  return errors;
}

export function skillMarkdownErrors(content, { label, name, knownSkillNames }) {
  const errors = [];
  if (/\b(?:node|bash|python3?)\s+(?:\.\/)?scripts\//.test(content)) {
    errors.push(
      `${label}: runnable global skill scripts must use the installed ~/.agents/skills/${name}/scripts path`,
    );
  }
  for (const match of content.matchAll(/\$([a-z][a-z0-9-]+)/g)) {
    if (!knownSkillNames.has(match[1])) {
      errors.push(`${label}: unknown skill reference $${match[1]}`);
    }
  }
  return errors;
}

export function parseFrontmatterFields(content, label) {
  const errors = [];
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) {
    errors.push(`${label}: missing YAML frontmatter`);
    return { fields: {}, errors };
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^([a-z_]+):\s*(.+)$/);
    if (!field) {
      errors.push(`${label}: unsupported frontmatter line "${line}"`);
      continue;
    }
    if (field[1] !== "name" && field[1] !== "description") {
      errors.push(`${label}: frontmatter must contain only name and description`);
      continue;
    }
    fields[field[1]] = field[2].replace(/^"(.*)"$/, "$1");
  }
  const keys = Object.keys(fields).sort();
  if (keys.join(",") !== "description,name") {
    errors.push(`${label}: frontmatter must contain only name and description`);
  }
  return { fields, errors };
}
