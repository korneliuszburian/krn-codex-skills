import fs from "node:fs";
import path from "node:path";

import { posixRelative } from "../support/path-rules.mjs";
import { readJson } from "../kernel/json.mjs";
import { runProcess } from "../kernel/proc.mjs";
import { tapName, tapSummary } from "../kernel/tap.mjs";
import { walkFiles } from "../kernel/walk.mjs";
import { TEST_FILE_RE, CODE_EXT, SETUP_FLAGS, testFlagPresent } from "./command-analysis.mjs";

const DENY = new Set(["changes:check"]);

const BOOLEAN_TEST_FLAGS = new Set(["--test", "--test-only", "--test-force-exit", "--test-randomize", "--test-update-snapshots", "--test-coverage", "--test-watch"]);
function normalizeRel(rel) {
  const parts = [];
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}
const VALUE_FLAGS = new Set(["-r", "--import", "--require", "--loader", "--experimental-loader", "--test-name-pattern", "--test-reporter", "-e", "--eval"]);
function explicitTestOperands(command) {
  const tokens = shellTokens(command);
  const files = [];
  let hasDirectory = false;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "node") continue;
    if (token.startsWith("--") && token.includes("=")) continue;
    if (VALUE_FLAGS.has(token)) { index += 1; continue; }
    if (token.startsWith("--test") && !BOOLEAN_TEST_FLAGS.has(token)) { index += 1; continue; }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) continue;
    const cleaned = normalizeRel(token.replace(/^['"]|['"]$/g, "").replace(/\\(["'])/g, "$1").replace(/\\/g, "/"));
    if (new RegExp(`\\.(?:${CODE_EXT})$`).test(cleaned)) files.push(cleaned);
    else if (!cleaned.startsWith("-")) hasDirectory = true;
  }
  return { files, hasDirectory };
}
function unquote(value) {
  return value.replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\\(["'])/g, "$1");
}
function shellTokens(command) {
  const tokens = [];
  let current = "";
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote) {
      if (char === "\\" && index + 1 < command.length) { current += char + command[index + 1]; index += 1; continue; }
      current += char;
      if (char === quote) quote = null;
      continue;
    }
    if (char === "'" || char === "\"") { quote = char; current += char; continue; }
    if (char === "\\" && index + 1 < command.length && /\s/.test(command[index + 1])) { current += " "; index += 1; continue; }
    if (/\s/.test(char)) { if (current) { tokens.push(current); current = ""; } continue; }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function resolveCheck(root, scripts, ref) {
  const name = ref.startsWith("npm run ") ? ref.slice("npm run ".length).trim() : ref;
  if (DENY.has(ref) || DENY.has(name)) return null;
  if (Object.hasOwn(scripts, name) && typeof scripts[name] === "string") return { kind: "script", name };
  const rel = normalizeRef(name);
  if (/^(test|scripts)\/.+\.mjs$/.test(rel) && !rel.includes("..")) {
    let real;
    try {
      real = posixRelative(fs.realpathSync(root), fs.realpathSync(path.resolve(root, rel)));
    } catch {
      return null;
    }
    if (real === rel && fs.statSync(path.resolve(root, rel), { throwIfNoEntry: false })?.isFile()) {
      return { kind: rel.startsWith("test/") ? "test" : "node", name: rel };
    }
  }
  return null;
}

export function runCheck({ root, target, frozenTests = null, frozenArgs = [] }) {
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
  delete env.NODE_TEST_CONTEXT;
  const [command, argv] = target.kind === "script" && frozenTests?.length
    ? [process.execPath, ["--test", "--test-reporter=tap", ...frozenArgs, ...frozenTests]]
    : target.kind === "script"
      ? ["npm", ["run", target.name]]
      : [process.execPath, target.kind === "test" ? ["--test", "--test-reporter=tap", target.name] : [target.name]];
  const result = runProcess(command, argv, { cwd: root, timeout: 600000, env });
  return { ok: result.ok, status: result.status, spawnFailed: result.errorCode !== null || result.status === null, output: `${result.out}${result.err}` };
}

export function checkFileRedefined(root, base, git, rel) {
  const before = git(root, ["rev-parse", `${base}:${rel}`]);
  const now = git(root, ["hash-object", rel]);
  return before.ok && (!now.ok || before.out.trim() !== now.out.trim());
}

export const isTestFile = (rel) => TEST_FILE_RE.test(rel);
export const normalizeRef = (ref) => {
  const value = String(ref ?? "").trim();
  return (value.startsWith("npm run ") ? value.slice("npm run ".length).trim() : value).replace(/^\.\//, "");
};

export function frozenNodeArgs(command) {
  const tokens = shellTokens(String(command ?? ""));
  const args = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (SETUP_FLAGS.has(token) && index + 1 < tokens.length) {
      args.push(token, unquote(tokens[index + 1]));
      index += 1;
      continue;
    }
    const attached = /^(--import|--require|--loader|--experimental-loader)=(.*)$/.exec(token);
    if (attached) args.push(`${attached[1]}=${unquote(attached[2])}`);
  }
  return args;
}

function literalCommandFiles(command) {
  const files = [];
  const safe = command.replace(/\\[ \t]/g, "\u0000");
  const clean = (value) => normalizeRel(value.replace(/\u0000/g, " ").replace(/\\(["'])/g, "$1").replace(/\\/g, "/"));
  const quoted = new RegExp(`"((?:\\\\.|[^"\\\\])+\\.(?:${CODE_EXT}))"|'((?:\\\\.|[^'\\\\])+\\.(?:${CODE_EXT}))'`, "g");
  for (const match of safe.matchAll(quoted)) files.push(clean(match[1] ?? match[2]));
  const prefix = "(?:[A-Za-z_][A-Za-z0-9_]*=|--?[^\\s=]+=)?";
  const bare = new RegExp(`(?:^|\\s)${prefix}([^\\s]+\\.(?:${CODE_EXT}))(?=$|\\s)`, "g");
  for (const match of safe.matchAll(bare)) files.push(clean(match[1]));
  return files;
}

export function changedFilesUnder(root, base, git, prefix) {
  const result = git(root, ["-c", "core.quotePath=false", "diff", "-z", "--name-only", "--diff-filter=ACMR", base, "--", prefix]);
  if (!result.ok) return [];
  return result.out.split("\0").filter(Boolean);
}

export function listTestFiles(root, base, git) {
  const names = new Set();
  for (const ref of [base, "HEAD"]) {
    const result = git(root, ["ls-tree", "-r", "-z", "--name-only", ref]);
    if (result.ok) {
      for (const name of result.out.split("\0")) {
        if (name.trim()) names.add(name.trim());
        if (name && name !== name.trim()) names.add(name);
      }
    }
  }
  return [...names].filter((name) => TEST_FILE_RE.test(name));
}

function shimCommand(root, command) {
  const first = command.trim().split(/\s+/)[0];
  if (!first || first === "node" || first.includes("/")) return false;
  return fs.existsSync(path.join(root, "node_modules", ".bin", first));
}

function scriptNonLiteral(root, command) {
  const first = command.trim().split(/\s+/)[0] ?? "";
  return /[*?\[]/.test(command)
    || /[$`|;&<>]/.test(command)
    || (first.includes("/") && first !== "node")
    || /(^|[\s/'"])(?:[^\s/]*\/)*(?:sh|bash|zsh|dash|ash|ksh|busybox)\b[^\n]*?\s-[a-z]*c[a-z]*(\s|$)/.test(command)
    || /\b(?:npm|pnpm|yarn|bun)\s+(?:(?:-{1,2}\S+)(?:\s+\S+)?\s+)*(?:run|exec|test|start|dlx|x)\b/.test(command)
    || /(^|\s)node(?:\s+-{1,2}\S+)*\s+--run(\s|$)/.test(command)
    || /(^|\s)(?:bun|deno)\s+(?:test|bench)(\s|$)/.test(command)
    || /(^|\s)(?:npx|bunx)(\s|$)/.test(command)
    || shimCommand(root, command);
}

function collectCommandFiles(root, base, git, command) {
  const files = literalCommandFiles(command);
  const operands = explicitTestOperands(command);
  if (testFlagPresent(command) && (operands.files.filter(isTestFile).length === 0 || operands.hasDirectory)) {
    files.push(...listTestFiles(root, base, git));
  }
  return files;
}

export function scriptRedefinition(root, base, git, command) {
  if (scriptNonLiteral(root, command)) return "non-literal";
  for (const rel of collectCommandFiles(root, base, git, command)) {
    if (checkFileRedefined(root, base, git, rel)) return "redefined";
  }
  return "clean";
}

export function scriptChangedFiles(root, base, git, command) {
  return collectCommandFiles(root, base, git, command).filter((rel) => checkFileRedefined(root, base, git, rel));
}

function literalTestFiles(root, target) {
  if (target.kind !== "script") return { tests: null, bare: false };
  const command = scriptCommand(root, target);
  if (typeof command !== "string" || scriptNonLiteral(root, command)) return { tests: null, bare: false };
  const operands = explicitTestOperands(command);
  if (operands.hasDirectory) return { tests: null, bare: false };
  const tests = operands.files.filter(isTestFile);
  return { tests: tests.length > 0 ? tests : null, bare: operands.files.length === 0 };
}

export function frozenTestsFor(root, target, enumerate) {
  if (target.kind !== "script") return null;
  const command = scriptCommand(root, target);
  if (!command || !testFlagPresent(command)) return null;
  const { tests, bare } = literalTestFiles(root, target);
  if (tests) return tests;
  // Only a bare `node --test` invocation is the tree's test suite; a command that
  // merely takes `--test` as an argument (e.g. `node scripts/check.mjs --test`)
  // is a different program and must run through `npm run <script>`.
  return bare ? enumerate() : null;
}

export function scriptCommand(root, target) {
  if (target.kind !== "script") return null;
  try {
    return readJson(path.join(root, "package.json")).scripts?.[target.name] ?? null;
  } catch {
    return null;
  }
}

export function listTestFilesIn(dir) {
  return walkFiles(dir, { filter: (entry) => isTestFile(entry.relative) })
    .map((entry) => entry.relative)
    .sort();
}

export { tapSummary };

export function frozenRedOk(output) {
  const summary = tapSummary(output);
  return summary.tests >= 1 && summary.fail >= 1 && summary.failing.length >= 1 && !summary.setup;
}

export function outputTail(output) {
  if (!output) return "";
  const lines = output.trim().split("\n");
  const failing = lines.filter((line) => /^not ok /.test(line)).slice(0, 3);
  const tail = lines.slice(-4);
  return `; output: ${[...new Set([...failing, ...tail])].join("\n")}`;
}
