const TEST_FLAG = /(^|\s)--test(\s|$)/;
export const testFlagPresent = (command) => TEST_FLAG.test(command.replace(/['\"\\]/g, ""));

const BOOLEAN_TEST_FLAGS = new Set(["--test", "--test-only", "--test-force-exit", "--test-randomize", "--test-update-snapshots", "--test-coverage", "--test-watch"]);
export function normalizeRel(rel) {
  const parts = [];
  for (const segment of rel.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}
const VALUE_FLAGS = new Set(["-r", "--import", "--require", "--loader", "--experimental-loader", "--test-name-pattern", "--test-reporter", "-e", "--eval"]);
export function explicitTestOperands(command) {
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
export const CODE_EXT = "mjs|js|cjs|sh|ts|mts|cts";
export const TEST_FILE_RE = new RegExp(`(?:^|/)(?:test/.+|[^/]*\\.test|[^/]*-test|[^/]*_test|test-[^/]*|test)\\.(?:${CODE_EXT})$`);

export const SETUP_FLAGS = new Set(["--import", "-r", "--require", "--loader", "--experimental-loader"]);
export function unquote(value) {
  return value.replace(/^(['"])([\s\S]*)\1$/, "$2").replace(/\\(["'])/g, "$1");
}
export function shellTokens(command) {
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
