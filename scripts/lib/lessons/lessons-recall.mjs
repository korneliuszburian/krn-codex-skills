import path from "node:path";
import { GIT_LOG_FORMAT, commitChangedFiles, parseGitLogRecords, runGit } from "../support/git-cli.mjs";
import { escapeRegExp } from "../support/regexp.mjs";
import { touchedSymbolFiles } from "../support/symbol-triggers.mjs";
import { churnHot } from "../support/churn.mjs";
import { parseLessons, recallLessons } from "./lessons.mjs";

export function recallLines(text) {
  return [...text.matchAll(/^Recall:\s*(.+?)\s*$/gim)].map((match) => match[1]);
}

export function recallBindings({ hit, lines }) {
  const cleanRef = (value) => String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/^(?:npm run|node)\s+/, "")
    .replace(/^--test\s+/, "")
    .replace(/^test\s+/, "")
    .replace(/^(['"])([\s\S]*)\1$/, "$2")
    .replace(/^\.\//, "")
    .replace(/\\ /g, " ")
    .trim();
  const ids = [...hit.gate.matchAll(/`([^`]+)`/g)].map((match) => cleanRef(match[1])).filter((id) => /\.[a-z0-9]{2,4}$|\//i.test(id));
  const falsifierFile = (/(test\/[^:@\s]+\.mjs)/.exec(hit.falsifier ?? "") ?? [])[1];
  const scriptRefs = [...hit.gate.matchAll(/`([^`]+)`/g)]
    .map((match) => cleanRef(match[1]))
    .filter((id) => /^[\w:@.-]+$/.test(id));
  const fileNames = [...new Set([...ids, falsifierFile])].filter(Boolean);
  const scriptNames = [...new Set(scriptRefs)].filter(Boolean);
  const namesId = (text, id) => new RegExp(`(?<![A-Za-z0-9_./-])${escapeRegExp(id)}(?![A-Za-z0-9_./-])`).test(text);
  const FALSIFIER_SUFFIX = /^(.+?)::[^@]+@[0-9a-f]{7}$/;
  const relevant = hit.matched ?? [];
  const reconstructed = lines.some((line) => {
    const [rawLeft, rawRight] = line.split("=>");
    if (!cleanRef(rawRight ?? "")) return false;
    const left = (rawLeft ?? "").trim();
    const loose = cleanRef(left);
    // A file/falsifier gate matches on a path boundary; a script gate must be
    // the whole token, so `npm run test` is not satisfied by `test:extra`.
    const fileLeft = fileNames.some((id) => namesId(left, id) || namesId(loose, id));
    const scriptLeft = scriptNames.some((id) => id === loose);
    if (!fileLeft && !scriptLeft) return false;
    const right = cleanRef(rawRight);
    const targets = new Set(relevant);
    const matchToken = (token) => {
      if (!token) return false;
      if (targets.has(token)) return true;
      const suffix = FALSIFIER_SUFFIX.exec(token);
      return Boolean(suffix && targets.has(suffix[1]));
    };
    // Comma/semicolon splitting preserves targets that contain spaces; the
    // whitespace split is a fallback for space-separated lists.
    return [
      right,
      ...right.split(/\s*[,;]\s*/),
      ...right.split(/\s*[,;]\s*|\s+/),
    ].some(matchToken);
  });
  return { falsifierFile, named: [...fileNames, ...scriptNames], reconstructed };
}

export function recallUsage(root, git, rows) {
  const active = rows.filter((row) => !row.status && (row.trigger ?? "").trim());
  const counts = new Map();
  if (active.length === 0 || !git(root, ["rev-parse", "--git-dir"]).ok) return counts;
  const log = git(root, ["log", GIT_LOG_FORMAT]);
  if (!log.ok) return counts;
  const churnEnabled = rows.some((row) => (row.trigger ?? "").includes("churn:"));
  const records = parseGitLogRecords(log.out).map((record) => ({ sha: record.sha, text: `${record.subject}\n${record.body}` }));
  for (const record of records) {
    const lines = recallLines(record.text);
    if (lines.length === 0) continue;
    const files = commitChangedFiles(root, git, record.sha).files;
    const symbolFiles = touchedSymbolFiles({ root, git, sha: record.sha });
    const symbols = [...symbolFiles.keys()];
    const hot = churnEnabled ? churnHot({ root, git, sha: record.sha, files }) : [];
    for (const hit of recallLessons({ root, files, symbols, hot, symbolFiles })) {
      if (recallBindings({ hit, lines }).reconstructed) {
        counts.set(hit.lesson, (counts.get(hit.lesson) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function lessonUsage({ root } = {}) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const { rows } = parseLessons(file);
  const triggered = rows.filter((row) => !row.status && (row.trigger ?? "").trim());
  if (!runGit(root, ["rev-parse", "--git-dir"]).ok) return { root, usage: [], neverRecalled: [], skipped: true };
  const counts = recallUsage(root, runGit, rows);
  const usage = triggered.map((row) => ({ lesson: row.lesson, recalls: counts.get(row.lesson) ?? 0 }));
  return { root, usage, neverRecalled: usage.filter((entry) => entry.recalls === 0).map((entry) => entry.lesson) };
}
