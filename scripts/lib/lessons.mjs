import fs from "node:fs";
import path from "node:path";

import { runGit } from "./git-cli.mjs";
import { touchedSymbols } from "./symbol-triggers.mjs";
import { churnHot } from "./churn.mjs";

const CANDIDATE = /^(npm run |test:|manual:)|[.][a-z0-9]{2,4}$/i;

const LESSON_BUDGET = 24;

export function parseLessonText(text) {
  const rows = [];
  const malformed = [];
  let headerColumns = null;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]*-{1,}[\s:|-]*\|?$/.test(trimmed)) continue;
    if (/^\|\s*lesson\s*\|\s*evidence\s*\|/i.test(trimmed)) {
      headerColumns = trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").length;
      continue;
    }
    const body = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
    const inner = body.endsWith("|") ? body.slice(0, -1) : body;
    const cells = inner.split("|").map((cell) => cell.trim());
    if (cells.length < 3 || cells.length > 7 || cells.slice(0, 3).some((cell) => cell === "")) {
      malformed.push(line);
      continue;
    }
    const occurrences = [...new Set((cells[3] ?? "").split(/[,\s]+/).filter(Boolean))];
    if (occurrences.some((token) => !/^\d{4}-\d{2}-\d{2}@[0-9a-f]{7}$/.test(token))) {
      malformed.push(line);
      continue;
    }
    rows.push({ lesson: cells[0], evidence: cells[1], gate: cells[2], occurrences, falsifier: cells[4] ?? "", trigger: cells[5] ?? "", status: (cells[6] ?? "").trim(), columns: cells.length });
  }
  return { rows, malformed, headerColumns };
}

export function parseLessons(file) {
  if (!fs.existsSync(file)) return { rows: [], malformed: [], budget: LESSON_BUDGET, headerColumns: null };
  const { rows, malformed, headerColumns } = parseLessonText(fs.readFileSync(file, "utf8"));
  return { rows, malformed, budget: LESSON_BUDGET, headerColumns };
}

const FALSIFIER = /^(test\/[A-Za-z0-9_./-]+\.mjs)::(.+?)@([0-9a-f]{7})$/;

const RETIRE = /^retired@([0-9a-f]{7})(?:;\s*superseded-by:\s*(\S.*?))?$/i;

function triggerGlobs(trigger) {
  return (trigger ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith("path:"))
    .map((entry) => entry.slice("path:".length).replace(/^\.\//, ""));
}

function globToRegex(glob) {
  return new RegExp(`^${glob
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\u0000")
    .replace(/\*/g, "[^/]*")
    .replace(/\u0000/g, ".*")}$`);
}

export function matchesTrigger(trigger, files) {
  const globs = triggerGlobs(trigger);
  if (globs.length === 0) return [];
  const patterns = globs.map(globToRegex);
  return files.filter((file) => patterns.some((pattern) => pattern.test(file)));
}

function triggerEntries(trigger, prefix) {
  return (trigger ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length));
}

export function recallLessons({ root, files = [], symbols = [], hot = [] }) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const hits = [];
  for (const row of parseLessons(file).rows.filter((candidate) => !candidate.status)) {
    const globs = triggerEntries(row.trigger, "path:");
    const symbolMatches = triggerEntries(row.trigger, "symbol:").filter((name) => symbols.includes(name));
    const churnMatches = hot.filter((candidate) => triggerEntries(row.trigger, "churn:").some((glob) => globToRegex(glob).test(candidate)));
    const matched = [
      ...files.filter((candidate) => globs.map(globToRegex).some((pattern) => pattern.test(candidate))),
      ...symbolMatches,
      ...churnMatches,
    ];
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
  const { rows, malformed, budget, headerColumns } = parseLessons(file);
  const errors = malformed.map((row) => `malformed lesson row: ${row.trim()}`);
  const warnings = [];
  const lessons = [];
  const maxColumns = rows.reduce((widest, row) => Math.max(widest, row.columns ?? 0), 0);
  if (headerColumns !== null && maxColumns > headerColumns) {
    errors.push(`workflow-lessons.md header declares ${headerColumns} columns but a row uses ${maxColumns}; widen the header`);
  }
  const activeRows = rows.filter((row) => !row.status);
  const retiredRows = rows.filter((row) => row.status);
  if (activeRows.length > budget) errors.push(`workflow-lessons.md exceeds ${budget} active lesson rows; displace, condense, or retire`);
  if (retiredRows.length > budget) errors.push(`workflow-lessons.md exceeds ${budget} archived rows; consolidate the archive`);
  if (!fs.existsSync(file)) return { root, lessons, errors, warnings: ["no workflow-lessons page; memory is not adopted at this root"], skipped: true };
  const packageFile = path.join(root, "package.json");
  const scripts = fs.existsSync(packageFile)
    ? JSON.parse(fs.readFileSync(packageFile, "utf8")).scripts ?? {}
    : {};
  for (const row of rows) {
    const invalidTrigger = (row.trigger ?? "").split(/[;,]/).map((entry) => entry.trim()).filter(Boolean).find((entry) => !/^(path|symbol|churn):/.test(entry));
    if (invalidTrigger) {
      errors.push(`lesson "${row.lesson}": unknown trigger "${invalidTrigger}"; use path:, symbol:, or churn:`);
      continue;
    }
    if (row.status) {
      const retirement = RETIRE.exec(row.status);
      if (!retirement) {
        errors.push(`lesson "${row.lesson}": invalid Status "${row.status}"; use retired@<7-hex>[; superseded-by:<anchor>]`);
        continue;
      }
      if ((row.trigger ?? "").trim()) errors.push(`lesson "${row.lesson}": a retired row cannot carry a Trigger`);
      const sha = retirement[1];
      if (git(root, ["rev-parse", "--git-dir"]).ok && git(root, ["cat-file", "-e", `${sha}^{commit}`]).ok && !git(root, ["merge-base", "--is-ancestor", sha, "HEAD"]).ok) {
        errors.push(`lesson "${row.lesson}": retirement commit ${sha} is not an ancestor of HEAD`);
      }
      const anchor = retirement[2];
      if (anchor) {
        const target = activeRows.find((candidate) => {
          const tokens = [...candidate.gate.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
          const falsifierFile = (/(test\/[A-Za-z0-9_./-]+\.mjs)/.exec(candidate.falsifier) ?? [])[1];
          return [...tokens, falsifierFile, candidate.lesson].filter(Boolean).some((value) => value === anchor);
        });
        if (!target) errors.push(`lesson "${row.lesson}": superseded-by "${anchor}" resolves to no active row`);
      } else {
        const live = [...row.gate.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter((reference) => CANDIDATE.test(reference)).filter((reference) => resolveReference(root, scripts, reference).ok);
        if (live.length > 0) errors.push(`lesson "${row.lesson}": retired with a live gate (${live.join(", ")}); remove the enforcement or name superseded-by`);
      }
      lessons.push({ lesson: row.lesson, resolved: [], occurrences: row.occurrences, falsifier: row.falsifier, trigger: row.trigger, status: row.status });
      continue;
    }
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
    lessons.push({ lesson: row.lesson, resolved, occurrences: row.occurrences, falsifier: row.falsifier, trigger: row.trigger, status: "" });
  }
  if (git(root, ["rev-parse", "--git-dir"]).ok) {
    const usage = recallUsage(root, git, rows);
    for (const row of rows) {
      if (row.status || !(row.trigger ?? "").trim()) continue;
      if ((usage.get(row.lesson) ?? 0) === 0) warnings.push(`lesson "${row.lesson}": trigger has never been recalled; verify it with \`krn-codex memory usage\``);
    }
  }
  return { root, lessons, errors, warnings };
}

export function recallLines(text) {
  return [...text.matchAll(/^Recall:\s*(.+?)\s*$/gim)].map((match) => match[1]);
}

export function recallBindings({ hit, lines, targets }) {
  const ids = [...hit.gate.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
  const falsifierFile = (/(test\/[A-Za-z0-9_./-]+\.mjs)/.exec(hit.falsifier) ?? [])[1];
  const named = [...ids, falsifierFile].filter(Boolean);
  const namesId = (text, id) => new RegExp(`(^|[\\s,;])${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s,;]|$)`).test(text);
  const reconstructed = lines.some((line) => {
    const [left, right] = line.split("=>").map((part) => part?.trim() ?? "");
    if (!right || !named.some((id) => namesId(left, id))) return false;
    return right.split(/[\s,;]+/).filter(Boolean).some((target) => targets.includes(target));
  });
  return { ids, falsifierFile, named, reconstructed };
}

function recallUsage(root, git, rows) {
  const active = rows.filter((row) => !row.status && (row.trigger ?? "").trim());
  const counts = new Map();
  if (active.length === 0 || !git(root, ["rev-parse", "--git-dir"]).ok) return counts;
  const log = git(root, ["log", "--format=%H%x1f%s%x1f%b%x1e"]);
  if (!log.ok) return counts;
  const churnEnabled = rows.some((row) => (row.trigger ?? "").includes("churn:"));
  const records = log.out
    .split("\u001e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body] = record.split("\u001f");
      return { sha, text: `${subject ?? ""}\n${body ?? ""}` };
    });
  for (const record of records) {
    const lines = recallLines(record.text);
    if (lines.length === 0) continue;
    const changed = git(root, ["show", "--no-renames", "--name-only", "-z", "--format=", record.sha]);
    const files = changed.ok ? changed.out.split("\0").map((entry) => entry.trim()).filter(Boolean) : [];
    const symbols = touchedSymbols({ root, git, sha: record.sha });
    const hot = churnEnabled ? churnHot({ root, git, sha: record.sha, files }) : [];
    for (const hit of recallLessons({ root, files, symbols, hot })) {
      if (recallBindings({ hit, lines, targets: [...files, ...symbols] }).reconstructed) {
        counts.set(hit.lesson, (counts.get(hit.lesson) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function lessonUsage({ root, git = runGit } = {}) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const { rows } = parseLessons(file);
  const triggered = rows.filter((row) => !row.status && (row.trigger ?? "").trim());
  if (!git(root, ["rev-parse", "--git-dir"]).ok) return { root, usage: [], neverRecalled: [], skipped: true };
  const counts = recallUsage(root, git, rows);
  const usage = triggered.map((row) => ({ lesson: row.lesson, recalls: counts.get(row.lesson) ?? 0 }));
  return { root, usage, neverRecalled: usage.filter((entry) => entry.recalls === 0).map((entry) => entry.lesson) };
}
