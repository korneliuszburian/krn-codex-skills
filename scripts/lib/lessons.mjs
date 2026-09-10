import fs from "node:fs";
import path from "node:path";

const CANDIDATE = /^(npm run |test:|manual:)|[.][a-z0-9]{2,4}$/i;

function readRows(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line) && !/^\|\s*Lesson\s*\|/.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

function resolveReference(root, scripts, reference) {
  if (reference.startsWith("manual:")) return { ok: true, kind: "manual" };
  if (reference.startsWith("npm run ")) {
    const name = reference.slice("npm run ".length).trim();
    return scripts[name] ? { ok: true, kind: "script" } : { ok: false, reason: `unknown npm script ${name}` };
  }
  if (scripts[reference]) return { ok: true, kind: "script" };
  if (fs.existsSync(path.join(root, reference))) return { ok: true, kind: "path" };
  return { ok: false, reason: `no file or npm script at ${reference}` };
}

export function checkLessons({ root }) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const errors = [];
  const lessons = [];
  if (!fs.existsSync(file)) return { root, lessons, errors };
  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts ?? {};
  for (const cells of readRows(file)) {
    if (cells.length !== 3 || cells.some((cell) => cell === "")) {
      errors.push(`malformed lesson row: ${cells.join(" | ")}`);
      continue;
    }
    const [lesson, , gate] = cells;
    const candidates = [...gate.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1].trim())
      .filter((reference) => CANDIDATE.test(reference));
    const resolved = [];
    for (const reference of candidates) {
      const result = resolveReference(root, scripts, reference);
      if (result.ok) resolved.push({ reference, kind: result.kind });
      else errors.push(`lesson "${lesson}": ${result.reason}`);
    }
    if (resolved.length === 0) errors.push(`lesson "${lesson}": no resolvable gate reference`);
    lessons.push({ lesson, resolved });
  }
  return { root, lessons, errors };
}
