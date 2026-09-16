import fs from "node:fs";
import path from "node:path";

const readText = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

const listDir = (dir, filter) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && filter(entry.name))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const ELEMENTS = new Set([
  "a", "blockquote", "button", "cite", "code", "dd", "details", "dialog", "div", "dl",
  "dt", "em", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
  "h6", "header", "hr", "img", "input", "label", "li", "main", "nav", "ol", "p", "pre",
  "section", "select", "span", "strong", "summary", "svg", "table", "td", "textarea",
  "th", "tr", "ul", "video", "iframe",
]);

const splitRow = (line) => {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || trimmed.length < 2) return null;
  return trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
};

function parseTable(markdown, needles) {
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const header = splitRow(lines[index]);
    if (!header) continue;
    const lower = header.map((cell) => cell.toLowerCase());
    if (!needles.every((needle) => lower.some((cell) => cell.includes(needle)))) continue;
    const rows = [];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const cells = splitRow(lines[cursor]);
      if (!cells) break;
      if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue;
      rows.push(cells);
    }
    return { header: lower, rows };
  }
  return null;
}

const cell = (header, row, needle) => {
  const index = header.findIndex((entry) => entry.includes(needle));
  return index === -1 ? "" : (row[index] ?? "");
};

const backticked = (text) => [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
const dataAttributes = (text) => [...new Set([...text.matchAll(/\b(data-[a-z][\w-]*)/g)].map((match) => match[1]))];

function cssDefinitions(root, extra = "") {
  const values = new Map();
  const collect = (text) => {
    for (const match of text.matchAll(/(--[a-z][\w-]*)\s*:\s*([^;}]+)/g)) {
      if (!values.has(match[1])) values.set(match[1], match[2].trim());
    }
  };
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".css")) collect(readText(full));
    }
  };
  try {
    walk(path.join(root, "src", "css"));
  } catch {}
  collect(extra);
  return values;
}

function normalizeValue(value) {
  const text = String(value).trim();
  if (/^#[0-9a-f]{3,8}$/i.test(text)) return text.toLowerCase();
  return text
    .toLowerCase()
    .split(",")
    .map((part) => part.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean)
    .join(", ");
}

function tokenSources(root, built) {
  const values = new Map();
  const dir = path.join(root, "src", "design-tokens");
  for (const file of listDir(dir, (name) => name.endsWith(".json"))) {
    let document;
    try {
      document = JSON.parse(readText(path.join(dir, file)));
    } catch {
      continue;
    }
    const walk = (value, trail) => {
      if (value === null || typeof value !== "object") return;
      if ("$value" in value) {
        const raw = value.$value;
        values.set(`--${trail.join("-")}`, Array.isArray(raw) ? raw.join(", ") : String(raw));
      }
      for (const [key, child] of Object.entries(value)) {
        if (key.startsWith("$")) continue;
        walk(child, [...trail, key]);
      }
    };
    walk(document, []);
  }
  for (const [name, value] of cssDefinitions(root, built)) {
    if (!values.has(name)) values.set(name, value);
  }
  return values;
}

export function auditFacts({ root, docs = null } = {}) {
  const docsDir = docs ?? path.join(root, "docs", "design");
  const findings = [];
  const push = (rule, detail, severity = "hard") => findings.push({ rule, severity, detail });

  const blockFiles = listDir(path.join(root, "src", "css", "blocks"), (name) => name.endsWith(".css")).map((name) => name.slice(0, -4));
  const blockSlugs = new Set(blockFiles);
  const compositionSlugs = new Set(listDir(path.join(root, "src", "css", "compositions"), (name) => name.endsWith(".css")).map((name) => name.slice(0, -4)));

  const components = parseTable(readText(path.join(docsDir, "components.md")), ["block", "status"]);
  if (components) {
    for (const row of components.rows) {
      const name = backticked(cell(components.header, row, "block"))[0];
      if (!name) continue;
      blockSlugs.add(name);
      const status = cell(components.header, row, "status");
      const library = cell(components.header, row, "library");
      const hasOwnFile = blockFiles.includes(name);
      const exempt = /gap|reuse|no block|sub-part|inside/i.test(status) || /reuse/i.test(library);
      if (!hasOwnFile && !exempt) {
        push("facts-components", `the matrix marks \`${name}\` as ${status} but src/css/blocks/${name}.css does not exist`);
      }
      for (const match of library.matchAll(/`blocks\/([\w-]+)\.css`/g)) {
        if (!blockFiles.includes(match[1])) push("facts-components", `the matrix points \`${name}\` at blocks/${match[1]}.css, which does not exist`);
      }
      if (/reuse/i.test(library)) {
        for (const reused of backticked(library)) {
          if (reused === name || reused.includes("/")) continue;
          if (!compositionSlugs.has(reused) && !blockFiles.includes(reused)) {
            push("facts-components", `the matrix reuses \`${reused}\` for \`${name}\`, but no composition or block of that name exists`);
          }
        }
      }
      if (hasOwnFile) {
        const css = readText(path.join(root, "src", "css", "blocks", `${name}.css`));
        const template = readText(path.join(root, "components", name, "template.php"));
        for (const attribute of dataAttributes(cell(components.header, row, "variant"))) {
          if (!css.includes(attribute) && !template.includes(attribute)) {
            push("facts-components", `the matrix gives \`${name}\` the variant \`${attribute}\`, which neither ${name}.css nor the ${name} template implements`);
          }
        }
      }
    }
  }

  const sections = parseTable(readText(path.join(docsDir, "sections.md")), ["section"]);
  if (sections) {
    for (const row of sections.rows) {
      for (const mapped of backticked(cell(sections.header, row, "mapped"))) {
        if (blockSlugs.has(mapped) || compositionSlugs.has(mapped) || ELEMENTS.has(mapped)) continue;
        push("facts-sections", `a section maps to \`${mapped}\`, which is neither a block nor a composition`);
      }
    }
  }

  const tokens = parseTable(readText(path.join(docsDir, "tokens.md")), ["token"]);
  if (tokens) {
    const builtFiles = listDir(path.join(root, "assets", "dist"), (name) => name.endsWith(".css"));
    if (builtFiles.length === 0) {
      push("facts-tokens", "tokens are documented but the project has no built CSS to verify generated tokens against (run the project build)", "soft");
    }
    {
      const built = builtFiles.map((name) => readText(path.join(root, "assets", "dist", name))).join("\n");
      const sources = tokenSources(root, built);
      for (const row of tokens.rows) {
        const token = backticked(cell(tokens.header, row, "token"))[0];
        const documented = cell(tokens.header, row, "value").replace(/`/g, "").trim();
        for (const match of row.join(" | ").matchAll(/(--[a-z][\w-]*)/g)) {
          if (!sources.has(match[1])) push("facts-tokens", `tokens.md documents \`${match[1]}\`, which no shipped layer defines`);
        }
        if (!token || !documented || !sources.has(token)) continue;
        const comparable = /^#[0-9a-f]{3,8}$/i.test(documented) || token.startsWith("--font-");
        if (!comparable) continue;
        if (/\{[^}]+\}/.test(String(sources.get(token)))) continue;
        if (normalizeValue(documented) !== normalizeValue(sources.get(token))) {
          push("facts-tokens", `tokens.md documents \`${token}\` as ${documented}, but the token source says ${sources.get(token)}`);
        }
      }
    }
  }

  return {
    root,
    findings,
    hard: findings.filter((finding) => finding.severity === "hard").length,
  };
}
