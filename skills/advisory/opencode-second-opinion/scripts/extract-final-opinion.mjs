import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath, targetDirArg, outputMode = "prose"] = process.argv.slice(2);

if (!inputPath || !outputPath || !targetDirArg) {
  throw new Error("usage: extract-final-opinion.mjs <raw-jsonl> <output-file> <target-dir>");
}
if (outputMode !== "prose" && outputMode !== "json") {
  throw new Error("output mode must be prose or json.");
}

if (!fs.existsSync(targetDirArg)) {
  throw new Error(`target directory must be an existing directory: ${targetDirArg}`);
}

const targetDir = path.resolve(targetDirArg);

const events = fs
  .readFileSync(inputPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`OpenCode emitted malformed JSON at event line ${index + 1}.`);
    }
  });

const terminal = [...events]
  .reverse()
  .find((event) => event.type === "step_finish" && event.part?.reason === "stop");

if (!terminal?.part?.messageID) {
  throw new Error("OpenCode did not emit a completed final answer.");
}

const opinion = events
  .filter((event) => event.type === "text" && event.part?.messageID === terminal.part.messageID)
  .map((event) => event.part?.text)
  .filter((text) => typeof text === "string" && text.trim())
  .join("\n")
  .trim();

if (!opinion) {
  throw new Error("OpenCode completed without final answer text.");
}

function normalizeJsonOpinion(text) {
  const fencedMatches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const fenced = fencedMatches.map((match) => match[1].trim());
  const withoutFences = text.replace(/```(?:json)?\s*[\s\S]*?```/gi, (match) => " ".repeat(match.length));
  const candidates = [...fenced, ...balancedObjects(withoutFences)];
  const objects = candidates.map((candidate) => {
    try {
      const value = JSON.parse(candidate);
      if (value === null || Array.isArray(value) || typeof value !== "object") {
        throw new Error("final JSON must be an object");
      }
      return value;
    } catch {
      throw new Error("OpenCode did not emit exactly one parseable JSON object.");
    }
  });
  if (objects.length !== 1) {
    throw new Error("OpenCode emitted multiple JSON candidates.");
  }
  return JSON.stringify(objects[0]);
}

function balancedObjects(text) {
  const objects = [];
  for (let start = text.indexOf("{"); start !== -1; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const char = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
      } else if (char === '"') quoted = true;
      else if (char === "{") depth += 1;
      else if (char === "}" && --depth === 0) {
        objects.push(text.slice(start, index + 1));
        start = index;
        break;
      }
    }
  }
  return objects;
}

function outsideTarget(resolved) {
  const rel = path.relative(targetDir, resolved);
  return rel.startsWith("..") || path.isAbsolute(rel);
}

function isUri(token) {
  return /^[a-z][a-z+.-]*:\/\//i.test(token) || token.startsWith("#") || token.startsWith("mailto:");
}

function isRegexLiteral(token) {
  return (
    /^\/(?:\\.|[^/])+\/[a-z]*$/i.test(token) &&
    /[\\^$[\]{}()|*+?]/.test(token)
  );
}

const backtickTokens = [...opinion.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
// Absolute-path scan runs on a copy with backtick regions blanked:
// a backtick-wrapped RELATIVE filename (`run.json`) is already validated
// as in-scope above, but the leading backtick would otherwise look like
// a boundary and the scan would mis-read it as the absolute `/run.json`.
const blanked = opinion.replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length));
const absoluteTokens = [
  ...blanked.matchAll(/(^|[^A-Za-z0-9_./-])(\/[A-Za-z0-9_.~+-][^\s`"'<>()]+)/g),
].map((match) => match[2]);

for (const token of backtickTokens) {
  if (isUri(token) || isRegexLiteral(token)) continue;
  // A bare `/` (the filesystem root, cited as prose) is not a real
  // out-of-scope citation.
  if (token === "/") continue;
  const resolved = path.isAbsolute(token) ? path.normalize(token) : path.resolve(targetDir, token);
  // A relative token such as `../outside` can be a test literal or prose,
  // rather than an actual citation. As with absolute tokens below, reject it
  // only when it identifies an existing entry outside the target.
  if (outsideTarget(resolved) && fs.existsSync(resolved)) {
    throw new Error(`opinion cites a path outside the target scope: ${token}`);
  }
}
for (const token of absoluteTokens) {
  // Only plausible paths are scope-checked: a single bare component with
  // no extension (e.g. prose `/fact-id`, `/run`) is a hyphenated word,
  // not a path; `/etc/passwd` (2+ components) and `/run.json` (extension)
  // still get checked.
  const rest = token.slice(1);
  const plausible =
    rest.includes("/") || /\.[A-Za-z0-9]{1,5}$/.test(rest);
  if (!plausible) continue;
  // Prose slash-pairs (`the conflict/preserved queue`, `input/output`)
  // are not citations: only flag a token that ACTUALLY resolves to an
  // existing filesystem entry outside the target. A real out-of-scope
  // citation (`/etc/passwd`) exists and is caught; invented paths are
  // allowed as prose.
  const resolved = path.normalize(token);
  if (!fs.existsSync(resolved)) continue;
  if (outsideTarget(resolved)) {
    throw new Error(`opinion cites a path outside the target scope: ${token}`);
  }
}

const output = outputMode === "json" ? normalizeJsonOpinion(opinion) : opinion;
fs.writeFileSync(outputPath, `${output}\n`, "utf8");
