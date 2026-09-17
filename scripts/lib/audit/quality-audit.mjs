import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { posixRelative } from "../support/path-rules.mjs";

import { maskLiterals, stripComments } from "../support/source-mask.mjs";

const SELF = "scripts/lib/audit/quality-audit.mjs";

const walk = (directory, keep = (candidate) => candidate.endsWith(".mjs")) => {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walk(path, keep);
    return entry.isFile() && keep(path) ? [path] : [];
  });
};

const functionDeclarations = (source) =>
  [...source.matchAll(/(?:export\s+)?(?:async\s+)?function\*?\s+([A-Za-z0-9_$]+)\s*\(/g)].map((m) => m[1]);

const bindingNames = (text) => {
  const splitTop = (body) => {
    const elements = [];
    let depth = 0;
    let current = "";
    for (const char of body) {
      if ("{[(".includes(char)) depth += 1;
      else if ("}])".includes(char)) depth -= 1;
      if (char === "," && depth === 0) { elements.push(current); current = ""; continue; }
      current += char;
    }
    elements.push(current);
    return elements;
  };
  const stripInitializer = (part) => {
    let depth = 0;
    for (let index = 0; index < part.length; index += 1) {
      const char = part[index];
      if ("{[(".includes(char)) depth += 1;
      else if ("}])".includes(char)) depth -= 1;
      else if (char === "=" && depth === 0) return part.slice(0, index);
    }
    return part;
  };
  return splitTop(text).flatMap((part) => {
    const binding = stripInitializer(part).trim();
    const destructured = binding.match(/^[\[{]([\s\S]*)[\]}]$/);
    const body = destructured ? destructured[1] : binding;
    return splitTop(body).flatMap((element) => {
      let name = stripInitializer(element).trim();
      const rename = name.lastIndexOf(":");
      if (rename >= 0) name = name.slice(rename + 1);
      return [...name.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map((match) => match[0]);
    });
  });
};

const exportedNames = (rawSource) => {
  const source = maskLiterals(stripComments(rawSource));
  const names = new Set(
    [...source.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|class)\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]),
  );
  for (const match of source.matchAll(/export\s+(?:const|let|var)\s+([^;]+)/g)) {
    for (const name of bindingNames(match[1])) names.add(name);
  }
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z0-9_$]+$/.test(name)) names.add(name);
    }
  }
  if (/export\s+default\b/.test(source)) names.add("default");
  return [...names];
};

const importedNames = (rawSource) => {
  const source = maskLiterals(stripComments(rawSource));
  const names = new Set();
  for (const match of source.matchAll(/(?:^|[;\n}])\s*import\s+([^;]*?)\s+from\s+["'][^"']+["']/g)) {
    const clause = match[1];
    const named = clause.match(/\{([\s\S]*?)\}/);
    if (named) {
      for (const part of named[1].split(",")) {
        // Only the local binding counts for the missing-import check: in
        // `import { foo as bar }` the usable name is `bar`, not `foo`.
        const local = part.split(/\s+as\s+/).pop().trim();
        if (/^[A-Za-z0-9_$]+$/.test(local)) names.add(local);
      }
    }
    const bare = clause.replace(/\{[\s\S]*?\}/, "").replace(/,/g, " ").trim();
    for (const token of bare.split(/\s+/)) {
      if (/^[A-Za-z0-9_$]+$/.test(token) && token !== "as") names.add(token);
    }
  }
  return names;
};

const clauseNames = (clause) => {
  const names = new Set();
  const named = clause.match(/\{([\s\S]*?)\}/);
  if (named) {
    for (const part of named[1].split(",")) {
      // Consumption binds the source name: in `import { foo as bar }` the export
      // that is consumed is `foo`, whatever local name it takes.
      const sourceName = part.split(/\s+as\s+/)[0].trim();
      if (/^[A-Za-z0-9_$]+$/.test(sourceName)) names.add(sourceName);
    }
  }
  const bare = clause.replace(/\{[\s\S]*?\}/, "").replace(/,/g, " ").trim();
  const star = /^\*\s+as\s+/.test(bare);
  if (star || /^[A-Za-z0-9_$]+$/.test(bare)) names.add("default");
  return { names: star ? new Set() : names, star };
};

const importEdges = (rawSource) => {
  const code = stripComments(rawSource);
  const masked = maskLiterals(code);
  const edges = [];
  for (const match of masked.matchAll(/(?:^|[;\n}])\s*import\s+([^;]*?)\s+from\s+["']([^"']+)["']/dg)) {
    const [start, end] = match.indices[2];
    edges.push({ clause: match[1], specifier: code.slice(start, end), dynamic: false });
  }
  for (const match of masked.matchAll(/export\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/dg)) {
    const lefts = match[1].split(",").map((part) => part.split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const [start, end] = match.indices[2];
    edges.push({ clause: `{${lefts.join(",")}}`, specifier: code.slice(start, end), dynamic: false });
  }
  for (const match of masked.matchAll(/import\s*\(/g)) {
    const specifier = /^import\s*\(\s*["']([^"']+)["']/.exec(code.slice(match.index))?.[1];
    if (specifier) edges.push({ clause: "", specifier, dynamic: true });
  }
  return edges;
};

const normalizedBody = (source, start) => {
  let index = source.indexOf("(", start);
  if (index < 0) return "";
  let parens = 0;
  for (; index < source.length; index += 1) {
    if (source[index] === "(") parens += 1;
    else if (source[index] === ")") {
      parens -= 1;
      if (parens === 0) { index += 1; break; }
    }
  }
  const open = source.indexOf("{", index);
  if (open < 0) return "";
  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    if (source[cursor] === "{") depth += 1;
    else if (source[cursor] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, cursor + 1).replace(/\s+/g, " ");
    }
  }
  return "";
};

const ASSERTION_TOKEN = /\b(?:assert|expect)\b/g;

const assertionTokens = (text) => (text.match(ASSERTION_TOKEN) ?? []).length;

const callSpan = (source, open) => {
  let depth = 0;
  for (let cursor = open; cursor < source.length; cursor += 1) {
    if (source[cursor] === "(") depth += 1;
    else if (source[cursor] === ")") {
      depth -= 1;
      if (depth === 0) return { start: open, end: cursor + 1 };
    }
  }
  return null;
};

const testCallbacks = (source) => {
  const spans = [];
  for (const match of source.matchAll(/(?<![.\w$])test\s*\(/g)) {
    const span = callSpan(source, source.indexOf("(", match.index));
    if (span) spans.push(span);
  }
  return spans;
};

const oracleHelpers = (source) => {
  const names = new Set();
  const declarations =
    /(?:export\s+)?(?:async\s+)?function\*?\s+([A-Za-z0-9_$]+)\s*\(|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:function\b|\()/g;
  for (const match of source.matchAll(declarations)) {
    const name = match[1] ?? match[2];
    if (assertionTokens(normalizedBody(source, match.index)) > 0) names.add(name);
  }
  return names;
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

const walkAll = (directory) => walk(directory, () => true);

export function auditRepository(root) {
  const allFiles = [...walk(join(root, "scripts")), ...walk(join(root, "test")), ...walk(join(root, "skills"))];
  const sources = new Map(allFiles.map((file) => [file, readFileSync(file, "utf8")]));
  const runtime = [...sources.keys()].filter((file) => relative(root, file).startsWith(`scripts${sep}`));
  const label = (file) => posixRelative(root, file);
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
    const source = maskLiterals(sources.get(file));
    const local = new Set([...functionDeclarations(source), ...importedNames(sources.get(file)), ...[...source.matchAll(/(?:const|let|var)\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]), ...[...source.matchAll(/\bclass\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]), ...[...source.matchAll(/function\s*\*?\s*[A-Za-z0-9_$]*\s*\(([^)]*)\)/g)].flatMap((match) => [...match[1].matchAll(/[A-Za-z0-9_$]+/g)].map((name) => name[0]))]);
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

  const runtimeSet = new Set(runtime);
  const dynamicTargets = new Set();
  const productionDynamic = new Set();
  const dynamicImporters = new Map();
  const starTargets = new Set();
  const edgesByImporter = new Map();
  for (const [file, rawSource] of sources) {
    const edges = new Map();
    for (const edge of importEdges(rawSource)) {
      if (!edge.specifier.startsWith(".")) continue;
      const target = resolve(dirname(file), edge.specifier);
      if (edge.dynamic) {
        dynamicTargets.add(target);
        if (!dynamicImporters.has(target)) dynamicImporters.set(target, new Set());
        dynamicImporters.get(target).add(file);
        if (runtimeSet.has(file)) productionDynamic.add(target);
        continue;
      }
      const { names, star } = clauseNames(edge.clause);
      const entry = edges.get(target) ?? { names: new Set(), star: false };
      for (const name of names) entry.names.add(name);
      if (star) {
        entry.star = true;
        starTargets.add(target);
      }
      edges.set(target, entry);
    }
    edgesByImporter.set(file, edges);
  }
  const isImported = (file) =>
    dynamicTargets.has(file) ||
    [...edgesByImporter].some(([importer, edges]) => importer !== file && edges.has(file));
  const productionImported = (file) =>
    productionDynamic.has(file) ||
    [...edgesByImporter].some(([importer, edges]) => runtimeSet.has(importer) && importer !== file && edges.has(file));
  const consumedIn = (file, name) =>
    starTargets.has(file) ||
    dynamicTargets.has(file) ||
    [...edgesByImporter].some(([importer, edges]) => importer !== file && edges.get(file)?.names.has(name));
  const isTestFile = (file) => label(file).startsWith(`test${sep}`);
  const importersOf = (file, name) => {
    const importers = new Set();
    for (const [importer, edges] of edgesByImporter) {
      if (importer === file) continue;
      const entry = edges.get(file);
      if (entry && (entry.names.has(name) || entry.star)) importers.add(importer);
    }
    for (const importer of dynamicImporters.get(file) ?? []) importers.add(importer);
    return importers;
  };
  const testOnlyImporters = (file, name) => {
    const importers = [...importersOf(file, name)];
    if (importers.length === 0) return [];
    return importers.every(isTestFile) ? importers : [];
  };

  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const source = sources.get(file);
    for (const name of exportedNames(source)) {
      if (!consumedIn(file, name)) {
        errors.push(`${label(file)}: dead export ${name}`);
        continue;
      }
      const importers = testOnlyImporters(file, name);
      if (importers.length > 0) {
        info.push(
          `${label(file)}: test-only-export ${name} (imported only by ${importers.map(label).sort().join(", ")})`,
        );
      }
    }
  }

  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const code = maskLiterals(stripComments(sources.get(file)));
    for (const name of functionDeclarations(code)) {
      if (exportedNames(code).includes(name)) continue;
      if ((code.match(new RegExp(`\\b${name}\\b`, "g")) ?? []).length <= 1) {
        errors.push(`${label(file)}: unreferenced function ${name}`);
      }
    }
  }

  const bodies = new Map();
  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    const source = stripComments(sources.get(file));
    for (const match of source.matchAll(/export\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+)["']/g)) {
      const names = match[1].split(",").map((part) => part.split(/\s+as\s+/).pop().trim()).filter(Boolean);
      for (const name of names) {
        const imported = [...sources.entries()].some(([other, otherSource]) => {
          if (other === file) return false;
          for (const spec of stripComments(otherSource).matchAll(/(?:import|export)\s+([^;]*?)\s+from\s+["'](\.[^"']+)["']/g)) {
            if (resolve(dirname(other), spec[2]) !== resolve(file)) continue;
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

  for (const file of runtime.filter((candidate) => label(candidate).startsWith(`scripts${sep}lib${sep}`))) {
    if (isSelf(file)) continue;
    if (!isImported(file)) errors.push(`${label(file)}: lib file is never imported`);
    else if (!productionImported(file)) info.push(`${label(file)}: no production consumer (reachable only from tests)`);
  }

  let oracleTokenCount = 0;
  let oracleCallbackCount = 0;
  for (const file of [...sources.keys()].filter(isTestFile)) {
    const raw = sources.get(file);
    const masked = maskLiterals(stripComments(raw));
    const helpers = oracleHelpers(masked);
    for (const span of testCallbacks(masked)) {
      oracleCallbackCount += 1;
      const args = masked.slice(span.start, span.end);
      const tokens = assertionTokens(args);
      oracleTokenCount += tokens;
      if (tokens > 0) continue;
      if ([...helpers].some((name) => new RegExp(`\\b${name}\\b`).test(args))) continue;
      const rawArgs = raw.slice(span.start, span.end);
      if (/\/\/\s*oracle:|\/\*\s*oracle:/i.test(rawArgs)) continue;
      const name = /^\s*\(\s*["'`]([^"'`]+)["'`]/.exec(rawArgs)?.[1];
      errors.push(`${label(file)}: test callback without an oracle${name ? ` ("${name}")` : ""}`);
    }
  }
  if (oracleCallbackCount > 0) {
    info.push(
      `test oracle density: ${oracleTokenCount} assertion tokens across ${oracleCallbackCount} test callbacks ` +
        `(${(oracleTokenCount / oracleCallbackCount).toFixed(2)} per callback)`,
    );
  }

  return { errors: [...new Set(errors)], info: [...new Set(info)] };
}
