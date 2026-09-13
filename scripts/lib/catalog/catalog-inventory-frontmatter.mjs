export function sanitizeMetadataValue(value) {
  const unquoted = value.replace(/^(?:"(.*)"|'(.*)')$/, "$1$2");
  return unquoted.replace(/\s+/g, " ").trim().slice(0, 320);
}

export function validSkillName(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

export function parseSkillFrontmatter(prefix) {
  const lines = prefix.split(/\r?\n/);
  if (lines[0] !== "---") return undefined;

  const metadata = {};
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line === "---") break;
    const match = /^(name|description):\s*(.*)$/.exec(line);
    if (!match) continue;
    metadata[match[1]] = sanitizeMetadataValue(match[2]);
  }
  return metadata;
}
