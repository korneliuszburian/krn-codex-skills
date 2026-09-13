import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

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

const exportedNames = (source) => {
  const names = new Set([
    ...[...source.matchAll(/export\s+(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]),
    ...[...source.matchAll(/export\s+const\s+([A-Za-z0-9_$]+)/g)].map((m) => m[1]),
  ]);
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z0-9_$]+$/.test(name)) names.add(name);
    }
  }
  return [...names];
};

const importedNames = (source) => {
  const names = new Set();
  for (const match of source.matchAll(/import\s+([^;]*?)\s+from\s+["'][^"']+["']/g)) {
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

const CREDENTIALS = [
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key block"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub token"],
  [/\bgithub_pat_[A-Za-z0-9_]{22,}\b/, "GitHub fine-grained token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, "Slack token"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google API key"],
  [/\bsk-(?:proj-|ant-|live-)?[A-Za-z0-9]{20,}\b/, "vendor API key"],
  [/\bsk_live_[A-Za-z0-9]{16,}\b/, "Stripe secret key"],
  [/\baws_secret_access_key\s*[:=]\s*["']?[A-Za-z0-9/+=]{40}/, "AWS secret access key"],
];
const ENV_DUMP = /\b(?:console\.log|process\.stdout\.write)\s*\([^)]*process\.env\b|\bprintenv\b|\benv\s*\|/;

const walkAll = (directory) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkAll(path);
    return entry.isFile() ? [path] : [];
  });
};

export function auditRepository(root) {
  const allFiles = [...walk(join(root, "scripts")), ...walk(join(root, "test")), ...walk(join(root, "skills"))];
  const sources = new Map(allFiles.map((file) => [file, readFileSync(file, "utf8")]));
  const runtime = [...sources.keys()].filter((file) => relative(root, file).startsWith(`scripts${sep}`));
  const label = (file) => relative(root, file).split(sep).join("/");
  const isSelf = (file) => label(file) === SELF;

  const errors = [];
  const info = [];

  const rootMarkdown = (() => {
    try { return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => join(root, entry.name)); } catch { return []; }
  })();
  const credentialFiles = [...rootMarkdown, ...walkAll(join(root, "skills")), ...walkAll(join(root, ".agents", "skills")), ...walkAll(join(root, "scripts")), ...walkAll(join(root, "config")), ...walkAll(join(root, "docs"))];
  for (const file of credentialFiles) {
    let text;
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const [pattern, kind] of CREDENTIALS) {
      if (pattern.test(text)) errors.push(`${label(file)}: possible credential (${kind})`);
    }
    if (/\.(?:mjs|js|cjs|sh|py)$/.test(label(file)) && /(^|\/)(?:skills|\.agents\/skills)\//.test(label(file)) && ENV_DUMP.test(text)) {
      errors.push(`${label(file)}: skill dumps environment variables into captured output`);
    }
  }

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

  const consumedNames = (source) => {
    const names = importedNames(source);
    for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*["'][^"']+["']/g)) {
      for (const part of match[1].split(",")) {
        const name = part.split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z0-9_$]+$/.test(name)) names.add(name);
      }
    }
    return names;
  };
  const dynamicallyImports = (source, moduleFile) => {
    const base = basename(moduleFile);
    return new RegExp(`import\\s*\\(\\s*["'][^"']*${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source);
  };
  const consumed = new Map([...sources.entries()].map(([file, source]) => [file, consumedNames(source)]));

  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const source = sources.get(file);
    for (const name of exportedNames(source)) {
      const usedElsewhere = [...sources.entries()].some(
        ([other, otherSource]) => other !== file && (consumed.get(other)?.has(name) || dynamicallyImports(otherSource, file)),
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
  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const source = sources.get(file);
    const base = basename(file);
    for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)) {
      const names = match[1].split(",").map((part) => part.split(/\s+as\s+/).pop().trim()).filter(Boolean);
      for (const name of names) {
        const imported = [...sources.entries()].some(([other, otherSource]) => {
          if (other === file) return false;
          for (const spec of otherSource.matchAll(/(?:import|export)\s+([^;]*?)\s+from\s+["'](\.[^"']+)["']/g)) {
            if (basename(spec[2]) !== base) continue;
            const braces = spec[1].match(/\{([\s\S]*?)\}/);
            if (!braces) continue;
            const locals = braces[1].split(",").map((part) => part.split(/\s+as\s+/).pop().trim());
            if (locals.includes(name)) return true;
          }
          return false;
        });
        if (!imported) errors.push(`${label(file)}: dead re-export ${name}`);
      }
    }
  }

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
    const source = sources.get(file);
    for (const match of source.matchAll(/\b(console\.log|debugger)\b|(?:\/\/|#|<!--)\s*(TODO|FIXME|XXX)\b/g)) {
      errors.push(`${label(file)}: smell ${match[1] ?? match[2]}`);
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
