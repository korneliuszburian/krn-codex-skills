import fs from "node:fs";
import path from "node:path";

import { runGit } from "./git-cli.mjs";

const CANDIDATE = /^(npm run |test:|manual:)|[.][a-z0-9]{2,4}$/i;

const LESSON_BUDGET = 24;

export function parseLessons(file) {
  if (!fs.existsSync(file)) return { rows: [], malformed: [], budget: LESSON_BUDGET };
  const rows = [];
  const malformed = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]*-{1,}[\s:|-]*\|?$/.test(trimmed)) continue;
    if (/^\|\s*lesson\s*\|\s*evidence\s*\|/i.test(trimmed)) continue;
    const body = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
    const inner = body.endsWith("|") ? body.slice(0, -1) : body;
    const cells = inner.split("|").map((cell) => cell.trim());
    if (cells.length < 3 || cells.length > 6 || cells.slice(0, 3).some((cell) => cell === "")) {
      malformed.push(line);
      continue;
    }
    const occurrences = [...new Set((cells[3] ?? "").split(/[,\s]+/).filter(Boolean))];
    if (occurrences.some((token) => !/^\d{4}-\d{2}-\d{2}@[0-9a-f]{7}$/.test(token))) {
      malformed.push(line);
      continue;
    }
    rows.push({ lesson: cells[0], evidence: cells[1], gate: cells[2], occurrences, falsifier: cells[4] ?? "", trigger: cells[5] ?? "" });
  }
  return { rows, malformed, budget: LESSON_BUDGET };
}

const FALSIFIER = /^(test\/[A-Za-z0-9_./-]+\.mjs)::(.+?)@([0-9a-f]{7})$/;

function triggerGlobs(trigger) {
  return (trigger ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("path:"))
    .map((entry) => entry.slice("path:".length).replace(/^\.\//, ""));
}

export function matchesTrigger(trigger, files) {
  const globs = triggerGlobs(trigger);
  if (globs.length === 0) return [];
  const patterns = globs.map((glob) => new RegExp(`^${glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")}$`));
  return files.filter((file) => patterns.some((pattern) => pattern.test(file)));
}

function triggerSymbols(trigger) {
  return (trigger ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("symbol:"))
    .map((entry) => entry.slice("symbol:".length));
}

export function recallLessons({ root, files = [], symbols = [] }) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const hits = [];
  for (const row of parseLessons(file).rows) {
    const matched = [...matchesTrigger(row.trigger, files), ...triggerSymbols(row.trigger).filter((name) => symbols.includes(name))];
    if (matched.length > 0) hits.push({ lesson: row.lesson, trigger: row.trigger, gate: row.gate, falsifier: row.falsifier, matched });
  }
  return hits;
}

function resolveFalsifier(root, cell, git = runGit) {
  const raw = (cell ?? "").replace(/`/g, "").trim();
  if (!raw) return { ok: false, reason: "no falsifier recorded" };
  const match = FALSIFIER.exec(raw);
  if (!match) return { ok: false, reason: `falsifier must be an executable <test>/file.mjs::<case>@<7-hex>, got "${raw}"` };
  const [, rel, caseName, sha] = match;
  const spec = `${rel}::${caseName}`;
  const absolute = path.resolve(root, rel);
  const relCheck = path.relative(root, absolute);
  if (!relCheck || relCheck.startsWith("..") || path.isAbsolute(relCheck)) return { ok: false, reason: `falsifier path escapes the repository: ${rel}` };
  if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isFile()) return { ok: false, reason: `falsifier file not found: ${rel}` };
  const realRel = path.relative(fs.realpathSync(root), fs.realpathSync(absolute)).split(path.sep).join("/");
  if (!realRel || realRel.startsWith("..") || path.isAbsolute(realRel)) return { ok: false, reason: `falsifier path escapes the repository through a link: ${rel}` };
  if (!fs.readFileSync(absolute, "utf8").includes(caseName)) {
    return { ok: false, reason: `falsifier case "${caseName}" is not present in ${rel}` };
  }
  if (git(root, ["rev-parse", "--git-dir"]).ok) {
    const known = git(root, ["cat-file", "-e", `${sha}^{commit}`]).ok;
    if (known && !git(root, ["merge-base", "--is-ancestor", sha, "HEAD"]).ok) {
      return { ok: false, reason: `falsifier commit ${sha} for ${spec} is not an ancestor of HEAD` };
    }
  }
  return { ok: true };
}

function proofWarnings(root, sha, rel, gates, git = runGit) {
  if (!git(root, ["rev-parse", "--git-dir"]).ok) return [];
  if (!git(root, ["cat-file", "-e", `${sha}^{commit}`]).ok) return [];
  const warnings = [];
  for (const [target, label] of [[rel, rel], ...gates.filter((gate) => gate !== rel).map((gate) => [gate, gate])]) {
    const newer = git(root, ["log", "--oneline", `${sha}..HEAD`, "--", target]);
    if (newer.ok && newer.out) {
      const since = git(root, ["rev-list", "--count", `${sha}..HEAD`, "--", target]);
      warnings.push(`proof ${sha} predates later changes to ${label} (${since.ok ? since.out : "?"} commits since); re-run \`npm run lessons:verify\``);
    }
  }
  return warnings;
}

function recurrenceAfterProof(root, sha, occurrences, git = runGit) {
  if (!git(root, ["rev-parse", "--git-dir"]).ok) return [];
  if (!git(root, ["cat-file", "-e", `${sha}^{commit}`]).ok) return [];
  const late = [];
  for (const token of occurrences) {
    const occurrence = token.split("@")[1];
    if (occurrence === sha || !git(root, ["cat-file", "-e", `${occurrence}^{commit}`]).ok) continue;
    if (git(root, ["merge-base", "--is-ancestor", sha, occurrence]).ok) late.push(token);
  }
  return late;
}

function resolveReference(root, scripts, reference) {
  if (reference.startsWith("manual:")) return { ok: true, kind: "manual" };
  if (reference.startsWith("npm run ")) {
    const name = reference.slice("npm run ".length).trim();
    return Object.hasOwn(scripts, name) ? { ok: true, kind: "script" } : { ok: false, reason: `unknown npm script ${name}` };
  }
  if (Object.hasOwn(scripts, reference)) return { ok: true, kind: "script" };
  const candidate = (reference.startsWith("node ") ? reference.slice("node ".length).trim() : reference)
    .replace(/^--test\s+/, "")
    .replace(/^\.\//, "");
  if (/^(scripts|test|skills|config|docs|\.github)\//.test(candidate)) {
    const absolute = path.resolve(root, candidate);
    const rel = path.relative(root, absolute);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
      const stat = fs.statSync(absolute, { throwIfNoEntry: false });
      if (stat?.isFile()) {
        const realRel = path.relative(fs.realpathSync(root), fs.realpathSync(absolute)).split(path.sep).join("/");
        if (realRel && !realRel.startsWith("..") && !path.isAbsolute(realRel)) {
          return { ok: true, kind: "path", path: realRel };
        }
      }
    }
  }
  return { ok: false, reason: `no npm script or owned path at ${reference}` };
}

export function checkLessons({ root, git = runGit }) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const { rows, malformed, budget } = parseLessons(file);
  const errors = malformed.map((row) => `malformed lesson row: ${row.trim()}`);
  const warnings = [];
  const lessons = [];
  if (rows.length > budget) errors.push(`workflow-lessons.md exceeds ${budget} lesson rows; displace or condense`);
  if (!fs.existsSync(file)) return { root, lessons, errors, warnings, skipped: true };
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
      if (result.ok) resolved.push({ reference, kind: result.kind, ...(result.path ? { path: result.path } : {}) });
      else errors.push(`lesson "${row.lesson}": ${result.reason}`);
    }
    if (resolved.length === 0) errors.push(`lesson "${row.lesson}": no resolvable gate reference`);
    const structural = resolved.filter(
      (entry) => entry.kind === "script" || (entry.kind === "path" && /^(scripts|test|\.github)\//.test(entry.path ?? entry.reference)),
    );
    if (row.occurrences.length >= 2 && structural.length === 0) {
      errors.push(`lesson "${row.lesson}": recurring friction (${row.occurrences.length} occurrences) has no structural gate; consolidate it into a script or test, or supersede the row`);
    }
    if (row.occurrences.length >= 2 || row.falsifier) {
      const falsifier = resolveFalsifier(root, row.falsifier, git);
      if (!falsifier.ok) {
        errors.push(`lesson "${row.lesson}": recurring friction needs the falsifier that proved the gate; ${falsifier.reason}`);
      } else {
        const match = FALSIFIER.exec((row.falsifier ?? "").replace(/`/g, "").trim());
        const gates = resolved.map((entry) => entry.path).filter(Boolean);
        for (const warning of proofWarnings(root, match[3], match[1], gates, git)) warnings.push(`lesson "${row.lesson}": ${warning}`);
        for (const token of recurrenceAfterProof(root, match[3], row.occurrences, git)) {
          errors.push(`lesson "${row.lesson}": friction recurred at ${token} after its consolidation proof @${match[3]}; the gate did not stick — strengthen it or open a distinct class`);
        }
      }
    }
    lessons.push({ lesson: row.lesson, resolved, occurrences: row.occurrences, falsifier: row.falsifier, trigger: row.trigger });
  }
  return { root, lessons, errors, warnings };
}
