import fs from "node:fs";

export function readFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return Object.fromEntries(
    [...match[1].matchAll(/^(name|description):\s*(.+)$/gm)].map(([, key, value]) => [key, value.trim().replace(/^"(.*)"$/, "$1")]),
  );
}

export function skillMetadata(file) {
  return readFrontmatter(fs.readFileSync(file, "utf8"));
}
