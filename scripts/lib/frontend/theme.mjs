import fs from "node:fs";
import path from "node:path";

const CSS = ".css";
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

export function auditTheme({ root }) {
  const findings = [];
  const layers = ["blocks", "compositions", "utilities"];
  for (const layer of layers) {
    for (const file of listCss(path.join(root, "src", "css", layer))) {
      const relative = `src/css/${layer}/${file}`;
      const css = readText(path.join(root, "src", "css", layer, file));
      for (const rule of RULES) {
        if (layer !== "blocks" && rule.rule !== "magic-color") continue;
        for (const detail of rule.test(css)) {
          findings.push({ rule: rule.rule, severity: rule.severity, file: relative, detail: `${detail} (${rule.detail})` });
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
