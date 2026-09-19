import fs from "node:fs";
import path from "node:path";
import { GIT_LOG_FORMAT, commitChangedFiles, parseGitLogRecords, runGit } from "../kernel/git.mjs";
import { escapeRegExp } from "../support/regexp.mjs";
import { touchedSymbolFiles } from "../support/symbol-triggers.mjs";
import { churnHot } from "../support/churn.mjs";
import { globToRegex, parseLessons, recallLessons, triggerEntries } from "./lessons.mjs";

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

function declarationFiles(root, git, names) {
  const listed = git(root, ["ls-files", "-z"]);
  if (!listed.ok) return null;
  const files = new Set();
  for (const rel of listed.out.split("\0").filter(Boolean)) {
    if (!/\.(?:mjs|js|cjs)$/.test(rel)) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, rel), "utf8"); } catch { continue; }
    for (const name of names) {
      const declaration = new RegExp(`export\\s+(?:default\\s+)?(?:async\\s+)?(?:function\\*?|class|const|let|var)\\s+${escapeRegExp(name)}\\b`);
      if (declaration.test(text)) { files.add(rel); break; }
    }
  }
  return files;
}

export function recallUsage(root, git, rows) {
  const active = rows.filter((row) => !row.status && (row.trigger ?? "").trim());
  const usage = new Map();
  if (active.length === 0 || !git(root, ["rev-parse", "--git-dir"]).ok) return usage;
  const log = git(root, ["log", GIT_LOG_FORMAT]);
  if (!log.ok) return usage;
  const churnPatterns = active.flatMap((row) => triggerEntries(row.trigger, "churn:")).map(globToRegex);
  const symbolNames = [...new Set(active.flatMap((row) => triggerEntries(row.trigger, "symbol:")))];
  const symbolEnabled = symbolNames.length > 0;
  const symbolCandidates = symbolEnabled ? declarationFiles(root, git, symbolNames) : null;
  const records = parseGitLogRecords(log.out).map((record) => ({ sha: record.sha, text: `${record.subject}\n${record.body}` }));
  for (const record of records) {
    const lines = recallLines(record.text);
    const files = commitChangedFiles(root, git, record.sha).files;
    const churnFiles = churnPatterns.length > 0 ? files.filter((file) => churnPatterns.some((pattern) => pattern.test(file))) : [];
    const symbolFiles = symbolEnabled && (symbolCandidates === null || files.some((file) => symbolCandidates.has(file)))
      ? touchedSymbolFiles({ root, git, sha: record.sha })
      : new Map();
    const symbols = [...symbolFiles.keys()];
    const hot = churnFiles.length > 0 ? churnHot({ root, git, sha: record.sha, files: churnFiles }) : [];
    for (const hit of recallLessons({ root, files, symbols, hot, symbolFiles, rows: active })) {
      const counts = usage.get(hit.lesson) ?? { hits: 0, binds: 0 };
      counts.hits += 1;
      if (lines.length > 0 && recallBindings({ hit, lines }).reconstructed) counts.binds += 1;
      usage.set(hit.lesson, counts);
    }
  }
  return usage;
}

export function lessonUsage({ root } = {}) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const { rows } = parseLessons(file);
  const triggered = rows.filter((row) => !row.status && (row.trigger ?? "").trim());
  if (!runGit(root, ["rev-parse", "--git-dir"]).ok) return { root, usage: [], neverRecalled: [], skipped: true };
  const counts = recallUsage(root, runGit, rows);
  const usage = triggered.map((row) => {
    const entry = counts.get(row.lesson) ?? { hits: 0, binds: 0 };
    return { lesson: row.lesson, hits: entry.hits, binds: entry.binds, recalls: entry.binds };
  });
  return { root, usage, neverRecalled: usage.filter((entry) => entry.binds === 0).map((entry) => entry.lesson) };
}
