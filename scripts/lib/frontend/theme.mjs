import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CSS = ".css";
const LIBRARY_BLOCKS = fileURLToPath(new URL("../../../skills/frontend/frontend-library/library/css/blocks/", import.meta.url));
const listCss = (dir) => {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(CSS))
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
};

const readText = (file) => {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
};

function listPhp(dir) {
  const found = [];
  const walk = (current) => {
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".php")) found.push(full);
    }
  };
  walk(dir);
  return found.sort();
}

function selectors(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = [];
  for (const match of clean.matchAll(/([^{}]+)\{/g)) {
    for (const selector of match[1].split(",")) {
      const trimmed = selector.trim();
      if (trimmed && !trimmed.startsWith("@")) found.push(trimmed);
    }
  }
  return found;
}

function classRoots(selector) {
  return [...selector.matchAll(/\.([a-z][\w-]*)/gi)].map((match) => match[1].split("__")[0]);
}

function dataAttributes(text) {
  return [...new Set([...text.matchAll(/\b(data-[a-z][\w-]*)/g)].map((match) => match[1]))];
}

function prefixedBy(attribute, slug) {
  return attribute === `data-${slug}` || attribute.startsWith(`data-${slug}-`);
}

function libraryVocabulary(library = LIBRARY_BLOCKS) {
  const vocabulary = new Set();
  for (const file of listCss(library)) {
    const slug = file.slice(0, -CSS.length);
    for (const attribute of dataAttributes(readText(path.join(library, file)))) {
      if (prefixedBy(attribute, slug)) continue;
      vocabulary.add(attribute);
    }
  }
  return vocabulary;
}

function registryRows(file) {
  if (!file) return [];
  const rows = [];
  for (const line of readText(file).split("\n")) {
    const match = line.match(/^\|\s*`([a-z][\w-]*)`\s*\|\s*([^|]+)\|/);
    if (match) rows.push({ slug: match[1], status: match[2].trim() });
  }
  return rows;
}

function variantValues(css, block) {
  const values = new Set();
  const pattern = new RegExp(`\\[data-${block}-variant\\s*=\\s*["']?([^\\]"'\\s]+)`, "g");
  for (const match of css.matchAll(pattern)) values.add(match[1]);
  return values;
}

function variantSelectors(css) {
  const found = new Set();
  for (const match of css.matchAll(/\[(data-[a-z-]+)(?:=["']?([^\]"']+)["']?)?\]/g)) {
    found.add(match[2] ? `${match[1]}=${match[2]}` : match[1]);
  }
  return [...found].sort();
}

function tokenInventory(root) {
  const dir = path.join(root, "src", "design-tokens");
  const groups = {};
  let total = 0;
  let fluid = 0;
  if (!fs.existsSync(dir)) return { groups, total, fluid };
  for (const name of fs.readdirSync(dir).filter((entry) => entry.endsWith(".json") && !entry.includes("resolver"))) {
    let document;
    try {
      document = JSON.parse(readText(path.join(dir, name)));
    } catch {
      continue;
    }
    for (const [group, value] of Object.entries(document)) {
      if (group.startsWith("$") || typeof value !== "object" || value === null) continue;
      const entries = Object.entries(value).filter(([key]) => !key.startsWith("$"));
      groups[group] = (groups[group] ?? 0) + entries.length;
      total += entries.length;
      fluid += entries.filter(([, entry]) => entry?.$extensions?.["sh.sugarcube"]?.fluid).length;
    }
  }
  return { groups, total, fluid };
}

function acfInventory(root) {
  const layouts = [];
  const layoutsFile = path.join(root, "inc", "flexible-content-layouts.php");
  for (const match of readText(layoutsFile).matchAll(/'([a-z0-9_]+)'\s*=>\s*'([^']+)'/g)) {
    layouts.push({ layout: match[1], template: match[2] });
  }
  const fieldGroups = [];
  const jsonDir = path.join(root, "acf-json");
  if (fs.existsSync(jsonDir)) {
    for (const name of fs.readdirSync(jsonDir).filter((entry) => entry.endsWith(".json"))) {
      let document;
      try {
        document = JSON.parse(readText(path.join(jsonDir, name)));
      } catch {
        continue;
      }
      const fields = Array.isArray(document.fields) ? document.fields : [];
      fieldGroups.push({
        group: document.title ?? name,
        layouts: fields.filter((field) => field?.type === "flexible_content").length,
        fields: fields.length,
        tokenSelects: fields.filter((field) => /size|space|weight|leading|color|flow/.test(field?.name ?? "")).length,
      });
    }
  }
  return { layouts, fieldGroups };
}

export function inventoryTheme({ root }) {
  const layers = {};
  for (const layer of ["global", "compositions", "utilities", "blocks", "components"]) {
    layers[layer] = listCss(path.join(root, "src", "css", layer));
  }
  const blocks = layers.blocks.map((file) => {
    const css = readText(path.join(root, "src", "css", "blocks", file));
    return { name: file.slice(0, -CSS.length), file, lines: css.split("\n").length, variants: variantSelectors(css) };
  });
  return {
    root,
    layers,
    blocks,
    tokens: tokenInventory(root),
    acf: acfInventory(root),
  };
}

const RULES = [
  {
    rule: "block-height",
    severity: "hard",
    test: (css) => [...css.matchAll(/(min-block-size|min-height)\s*:\s*([^;{}]+)/gi)]
      .map((match) => `${match[1]}: ${match[2].trim()}`)
      .filter((entry) => !/:\s*0$/.test(entry)),
    detail: "a block must take its size from structure (flow, region padding, aspect-ratio), not a height floor",
  },
  {
    rule: "magic-color",
    severity: "hard",
    test: (css) => [...css.matchAll(/[a-z-]+\s*:\s*[^;{}]*#[0-9a-f]{3,8}\b/gi)].map((match) => match[0].trim()),
    detail: "a literal color must be a token (var(--color-...))",
  },
  {
    rule: "block-size-bar",
    severity: "soft",
    test: (css) => (css.split("\n").length > 100 ? [`${css.split("\n").length} lines`] : []),
    detail: "a block is a thin skeleton (target <= ~100 lines); move parts up to a composition or utility",
  },
  {
    rule: "class-variant",
    severity: "soft",
    test: (css) => [...css.matchAll(/\.[a-z][\w-]*--[a-z][\w-]*/gi)].map((match) => match[0]),
    detail: "a variant is a data-* exception, not a BEM modifier class",
  },
];

export function auditTheme({ root, accept = [], docs = null } = {}) {
  const accepted = new Set(accept);
  const findings = [];
  const severityFor = (rule, relative) => (accepted.has(`${rule}:${relative}`) ? "accepted" : "hard");
  const vocabulary = libraryVocabulary();
  const rows = registryRows(docs);
  const blockDir = path.join(root, "src", "css", "blocks");
  const blockFiles = listCss(blockDir);
  const blockSlugs = new Set([
    ...blockFiles.map((file) => file.slice(0, -CSS.length)),
    ...rows.map((row) => row.slug),
  ]);

  for (const row of rows) {
    if (!/\bbuilt\b|\bverified\b/i.test(row.status)) continue;
    if (/reuse|inside/i.test(row.status)) continue;
    if (!blockFiles.includes(`${row.slug}${CSS}`)) {
      findings.push({
        rule: "facts-registry",
        severity: severityFor("facts-registry", docs),
        file: docs,
        detail: `the registry marks \`${row.slug}\` as ${row.status} but src/css/blocks/${row.slug}.css does not exist`,
      });
    }
  }

  const layers = ["blocks", "compositions", "utilities"];
  for (const layer of layers) {
    for (const file of listCss(path.join(root, "src", "css", layer))) {
      const relative = `src/css/${layer}/${file}`;
      const css = readText(path.join(root, "src", "css", layer, file));
      const slug = file.slice(0, -CSS.length);
      for (const rule of RULES) {
        if (layer !== "blocks" && rule.rule !== "magic-color") continue;
        for (const detail of rule.test(css)) {
          const severity = rule.severity === "hard" && accepted.has(`${rule.rule}:${relative}`) ? "accepted" : rule.severity;
          findings.push({ rule: rule.rule, severity, file: relative, detail: `${detail} (${rule.detail})` });
        }
      }
      if (layer !== "blocks") continue;
      for (const selector of selectors(css)) {
        const roots = classRoots(selector);
        if (roots.includes(slug)) continue;
        const foreign = roots.find((name) => name !== slug && blockSlugs.has(name));
        if (foreign) {
          findings.push({
            rule: "block-ownership",
            severity: severityFor("block-ownership", relative),
            file: relative,
            detail: `\`${selector}\` styles .${foreign}, which belongs to the ${foreign} block; define it in ${foreign}.css or configure it from a .${slug} ancestor`,
          });
        }
      }
      for (const attribute of dataAttributes(css)) {
        if (vocabulary.has(attribute) || prefixedBy(attribute, slug)) continue;
        findings.push({
          rule: "variant-naming",
          severity: severityFor("variant-naming", relative),
          file: relative,
          detail: `\`${attribute}\` is neither the shared variant vocabulary nor prefixed with data-${slug}-`,
        });
      }
    }
  }

  for (const file of listPhp(path.join(root, "components"))) {
    const relative = path.relative(root, file).split(path.sep).join("/");
    const known = new Set([...blockSlugs, ...listCss(LIBRARY_BLOCKS).map((entry) => entry.slice(0, -CSS.length))]);
    for (const match of readText(file).matchAll(/\b(data-[a-z][\w-]*)\s*=\s*["']([^"']*)["']/g)) {
      const [, attribute, value] = match;
      if (vocabulary.has(attribute)) continue;
      const owner = [...known].find((slug) => prefixedBy(attribute, slug));
      if (!owner) {
        findings.push({
          rule: "template-variant",
          severity: severityFor("template-variant", relative),
          file: relative,
          detail: `\`${attribute}\` is neither the shared variant vocabulary nor a known block's data-<block>- attribute`,
        });
        continue;
      }
      if (attribute !== `data-${owner}-variant`) continue;
      if (value.includes("<?php")) continue;
      const allowed = new Set([
        ...variantValues(readText(path.join(blockDir, `${owner}${CSS}`)), owner),
        ...variantValues(readText(path.join(LIBRARY_BLOCKS, `${owner}${CSS}`)), owner),
      ]);
      if (allowed.size > 0 && !allowed.has(value)) {
        findings.push({
          rule: "template-variant",
          severity: severityFor("template-variant", relative),
          file: relative,
          detail: `data-${owner}-variant="${value}" is not defined by the theme or the library (allowed: ${[...allowed].sort().join(", ")})`,
        });
      }
    }
  }

  return {
    root,
    findings,
    hard: findings.filter((finding) => finding.severity === "hard").length,
  };
}
