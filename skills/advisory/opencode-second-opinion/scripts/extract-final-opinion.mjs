import fs from "node:fs";
import path from "node:path";

const [inputPath, outputPath, targetDirArg] = process.argv.slice(2);

if (!inputPath || !outputPath || !targetDirArg) {
  throw new Error("usage: extract-final-opinion.mjs <raw-jsonl> <output-file> <target-dir>");
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

function outsideTarget(resolved) {
  const rel = path.relative(targetDir, resolved);
  return rel.startsWith("..") || path.isAbsolute(rel);
}

function isUri(token) {
  return /^[a-z][a-z+.-]*:\/\//i.test(token) || token.startsWith("#") || token.startsWith("mailto:");
}

const backtickTokens = [...opinion.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
const absoluteTokens = [
  ...opinion.matchAll(/(^|[^A-Za-z0-9_./-])(\/[A-Za-z0-9_.~+-][^\s`"'<>()]+)/g),
].map((match) => match[2]);

for (const token of backtickTokens) {
  if (isUri(token)) continue;
  const resolved = path.isAbsolute(token) ? path.normalize(token) : path.resolve(targetDir, token);
  if (outsideTarget(resolved)) {
    throw new Error(`opinion cites a path outside the target scope: ${token}`);
  }
}
for (const token of absoluteTokens) {
  const resolved = path.normalize(token);
  if (outsideTarget(resolved)) {
    throw new Error(`opinion cites a path outside the target scope: ${token}`);
  }
}

fs.writeFileSync(outputPath, `${opinion}\n`, "utf8");
