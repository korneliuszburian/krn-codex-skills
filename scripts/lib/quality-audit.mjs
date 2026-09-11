import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SELF = "scripts/lib/quality-audit.mjs";

const walk = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path);
    return entry.isFile() && path.endsWith(".mjs") ? [path] : [];
  });
};

const functionDeclarations = (source) =>
  [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\*?\s+([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1]);

const exportedNames = (source) => [
  ...[...source.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]),
  ...[...source.matchAll(/export\s+const\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]),
];

const importedNames = (source) => {
  const names = new Set();
  for (const match of source.matchAll(/import\s+([\s\S]*?)\s+from\s+["'][^"']+["']/g)) {
    const clause = match[1];
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        const alias = part.split(/\s+as\s+/).pop().trim();
        if (alias) names.add(alias);
      }
    }
    const bare = clause.replace(/\{[\s\S]*?\}/, "").replace(/,/g, " ").trim();
    for (const token of bare.split(/\s+/)) {
      if (/^[A-Za-z0-9_$]+$/.test(token) && token !== "as") names.add(token);
    }
  }
  return names;
};

const normalizedBody = (source, start) => {
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1).replace(/\s+/g, " ");
    }
  }
  return "";
};

export function auditRepository(root) {
  const allFiles = [...walk(join(root, "scripts")), ...walk(join(root, "test"))];
  const sources = new Map(allFiles.map((file) => [file, readFileSync(file, "utf8")]));
  const runtime = [...sources.keys()].filter((file) => relative(root, file).startsWith(`scripts${sep}`));
  const label = (file) => relative(root, file).split(sep).join("/");
  const isSelf = (file) => label(file) === SELF;

  const errors = [];
  const info = [];

  const declarationOwners = new Map();
  for (const file of runtime) {
    for (const name of functionDeclarations(sources.get(file))) {
      if (!declarationOwners.has(name)) declarationOwners.set(name, new Set());
      declarationOwners.get(name).add(file);
    }
  }

  for (const file of runtime) {
    const source = sources.get(file);
    const local = new Set([...functionDeclarations(source), ...importedNames(source)]);
    for (const match of source.matchAll(/(?<![.\w$])([A-Za-z0-9_$]+)\s*\(/g)) {
      const name = match[1];
      if (local.has(name)) continue;
      const owners = declarationOwners.get(name);
      if (owners && !owners.has(file)) {
        errors.push(
          `${label(file)}: calls ${name}() but never imports it (declared in ${[...owners].map(label).join(", ")})`,
        );
      }
    }
  }

  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const source = sources.get(file);
    for (const name of exportedNames(source)) {
      const usedElsewhere = [...sources.entries()].some(
        ([other, otherSource]) => other !== file && new RegExp(`\\b${name}\\b`).test(otherSource),
      );
      if (!usedElsewhere) errors.push(`${label(file)}: dead export ${name}`);
    }
  }

  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const source = sources.get(file);
    for (const name of functionDeclarations(source)) {
      if (exportedNames(source).includes(name)) continue;
      if ((source.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length <= 1) {
        errors.push(`${label(file)}: unreferenced function ${name}`);
      }
    }
  }

  const bodies = new Map();
  for (const [file, source] of sources) {
    if (isSelf(file)) continue;
    for (const match of source.matchAll(/(?:export\s+)?(?:async\s+)?function\*?\s+([A-Za-z0-9_$]+)\s*\(/g)) {
      const body = normalizedBody(source, match.index);
      if (body.length < 120) continue;
      if (!bodies.has(body)) bodies.set(body, []);
      bodies.get(body).push(`${label(file)}:${match[1]}`);
    }
  }
  for (const locations of bodies.values()) {
    if (locations.length > 1) info.push(`duplicate function body: ${locations.join(", ")}`);
  }

  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    for (const match of sources.get(file).matchAll(/\b(console\.log|debugger|TODO|FIXME|XXX)\b/g)) {
      errors.push(`${label(file)}: smell ${match[1]}`);
    }
  }

  const importedTargets = new Set();
  for (const source of sources.values()) {
    for (const match of source.matchAll(/from\s+["'](\.[^"']+)["']/g)) importedTargets.add(match[1]);
  }
  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const base = label(file).replace("scripts/lib/", "");
    const used = [...importedTargets].some((target) => target.endsWith(base));
    if (!used) errors.push(`${label(file)}: lib file is never imported`);
  }

  return { errors: [...new Set(errors)], info: [...new Set(info)] };
}
