import fs from "node:fs";
import path from "node:path";

const CANDIDATE = /^(npm run |test:|manual:)|[.][a-z0-9]{2,4}$/i;

const LESSON_BUDGET = 24;

export function parseLessons(file) {
  if (!fs.existsSync(file)) return { rows: [], malformed: [], budget: LESSON_BUDGET };
  const rows = [];
  const malformed = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.startsWith("|") || /^\|\s*-+/.test(line) || /^\|\s*Lesson\s*\|/.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 3 || cells.some((cell) => cell === "")) {
      malformed.push(line);
      continue;
    }
    rows.push({ lesson: cells[0], evidence: cells[1], gate: cells[2] });
  }
  return { rows, malformed, budget: LESSON_BUDGET };
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
  const { rows, malformed, budget } = parseLessons(file);
  const errors = malformed.map((row) => `malformed lesson row: ${row.trim()}`);
  const lessons = [];
  if (rows.length > budget) errors.push(`workflow-lessons.md exceeds ${budget} lesson rows; displace or condense`);
  if (!fs.existsSync(file)) return { root, lessons, errors, skipped: true };
  const packageFile = path.join(root, "package.json");
  const scripts = fs.existsSync(packageFile)
    ? JSON.parse(fs.readFileSync(packageFile, "utf8")).scripts ?? {}
    : {};
  for (const row of rows) {
    const candidates = [...row.gate.matchAll(/`([^`]+)`/g)]
      .map((match) => match[1].trim())
      .filter((reference) => CANDIDATE.test(reference));
    const resolved = [];
    for (const reference of candidates) {
      const result = resolveReference(root, scripts, reference);
      if (result.ok) resolved.push({ reference, kind: result.kind });
      else errors.push(`lesson "${row.lesson}": ${result.reason}`);
    }
    if (resolved.length === 0) errors.push(`lesson "${row.lesson}": no resolvable gate reference`);
    lessons.push({ lesson: row.lesson, resolved });
  }
  return { root, lessons, errors };
}
