import fs from "node:fs";

const FONT = /Font\(family:\s*"([^"]+)",\s*style:\s*([^,]+),\s*size:\s*([^,]+),\s*weight:\s*([^,]+),\s*lineHeight:\s*([^,]+),\s*letterSpacing:\s*([^)]+)\)/;

// The Figma MCP returns its payload as {"content":[{"type":"text","text":"..."}]}.
// Unwrap that shape to the inner text (or JSON), and tolerate a raw payload.
function unwrap(file) {
  const raw = fs.readFileSync(file, "utf8");
  try {
    const document = JSON.parse(raw);
    if (document && Array.isArray(document.content)) {
      const text = document.content.map((entry) => entry?.text ?? "").join("");
      const inner = text.trim();
      try {
        return { kind: "json", value: JSON.parse(inner) };
      } catch {
        return { kind: "text", value: inner };
      }
    }
    return { kind: "json", value: document };
  } catch {
    return { kind: "text", value: raw };
  }
}

function parseVariables(file) {
  const { kind, value } = unwrap(file);
  if (kind !== "json" || typeof value !== "object" || value === null) return { groups: {}, typography: [], colors: [], total: 0 };
  const groups = {};
  const typography = [];
  const colors = [];
  for (const [name, raw] of Object.entries(value)) {
    const group = name.includes("/") ? name.split("/")[0] : name.split(" ")[0];
    groups[group] = (groups[group] ?? 0) + 1;
    const font = FONT.exec(String(raw));
    if (font) typography.push({ name, family: font[1], style: font[2].trim(), size: Number(font[3]), weight: Number(font[4]), lineHeight: Number(font[5]), letterSpacing: font[6].trim() });
    else if (/^#[0-9a-f]{3,8}$/i.test(String(raw))) colors.push({ name, value: String(raw) });
  }
  return { groups, typography, colors, total: Object.keys(value).length };
}

// Indentation-aware read of the node tree: sections are the frames one level
// below a page frame (canvas > page > section).
function parseMetadata(file) {
  const text = unwrap(file).value;
  const sections = [];
  const counts = new Map();
  if (typeof text !== "string") return { sections, components: [] };
  for (const line of text.split("\n")) {
    const indent = line.length - line.trimStart().length;
    const node = /^<(frame|instance|symbol)\s+id="([^"]+)"\s+name="([^"]+)"/.exec(line.trim());
    if (!node) continue;
    const kind = node[1];
    const name = node[3];
    if (kind !== "frame") counts.set(name, (counts.get(name) ?? 0) + 1);
    if (kind === "frame" && indent === 4) sections.push({ id: node[2], name });
  }
  return { sections, components: [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count) };
}

export function parseDesign({ variablesFile, metadataFile }) {
  const tokens = variablesFile && fs.existsSync(variablesFile) ? parseVariables(variablesFile) : { groups: {}, typography: [], colors: [], total: 0 };
  const nodes = metadataFile && fs.existsSync(metadataFile) ? parseMetadata(metadataFile) : { sections: [], components: [] };
  return { tokens, sections: nodes.sections, components: nodes.components };
}
