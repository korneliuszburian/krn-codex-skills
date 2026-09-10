import fs from "node:fs";

export function readFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  return Object.fromEntries(
    [...match[1].matchAll(/^(name|description):\s*(.+)$/gm)].map(([, key, value]) => [key, value.trim().replace(/^["']|["']$/g, "")]),
  );
}

export function skillMetadata(file) {
  return readFrontmatter(fs.readFileSync(file, "utf8"));
}
