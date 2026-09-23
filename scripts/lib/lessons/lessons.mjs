import fs from "node:fs";
import path from "node:path";
import { posixRelative } from "../support/path-rules.mjs";
import { readJson } from "../kernel/json.mjs";

import { runGit } from "../kernel/git.mjs";
import { compileGlob, globToRegex, splitTableRow } from "../kernel/text.mjs";
import { fenceLines, unbalancedFence as hasUnbalancedFence } from "../support/fences.mjs";
import { recallUsage } from "./lessons-recall.mjs";

export { recallLines, recallBindings, lessonUsage } from "./lessons-recall.mjs";

const CANDIDATE = /^(npm run |test:|manual:)|[.][a-z0-9]{2,4}$/i;

const LESSON_BUDGET = 24;

const DEAD_TRIGGER_HITS = 3;

export function parseLessonText(text) {
  const rows = [];
  const malformed = [];
  let headerColumns = null;
  for (const { line, fenced } of fenceLines(text)) {
    if (fenced) continue;
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    if (/^\|[\s:|-]*-{1,}[\s:|-]*\|?$/.test(trimmed)) continue;
    if (/^\|\s*lesson\s*\|\s*evidence\s*\|/i.test(trimmed)) {
      headerColumns = splitTableRow(trimmed).length;
      continue;
    }
    const cells = splitTableRow(trimmed);
    if (cells.length < 3 || cells.length > 7 || cells.slice(0, 3).some((cell) => cell === "")) {
      malformed.push(line);
      continue;
    }
    const occurrences = (cells[3] ?? "").split(/[,\s]+/).filter(Boolean);
    if (occurrences.some((token) => !/^\d{4}-\d{2}-\d{2}@[0-9a-f]{7}$/.test(token)) || new Set(occurrences).size !== occurrences.length) {
      malformed.push(line);
      continue;
    }
    rows.push({ lesson: cells[0], evidence: cells[1], gate: cells[2], occurrences, falsifier: cells[4] ?? "", trigger: cells[5] ?? "", status: (cells[6] ?? "").trim(), columns: cells.length });
  }
  return { rows, malformed, headerColumns, unbalancedFence: hasUnbalancedFence(text) };
}

export function parseLessons(file) {
  const isFile = fs.existsSync(file) && fs.statSync(file).isFile();
  if (!isFile) return { rows: [], malformed: [], budget: LESSON_BUDGET, headerColumns: null, unbalancedFence: false };
  const { rows, malformed, headerColumns, unbalancedFence } = parseLessonText(fs.readFileSync(file, "utf8"));
  return { rows, malformed, budget: LESSON_BUDGET, headerColumns, unbalancedFence };
}

const FALSIFIER = /^(test\/[A-Za-z0-9_./-]+\.mjs)::(.+?)@([0-9a-f]{7})$/;

const RETIRE = /^retired@([0-9a-f]{7})(?:;\s*superseded-by:\s*(\S.*?)|;\s*enforced-by:\s*(\S.*?))?$/i;

function normalizeTriggerEntry(entry) {
  const trimmed = entry.trim();
  const scoped = trimmed.match(/^(path|churn|symbol):(.*)$/);
  if (!scoped) return trimmed;
  return `${scoped[1]}:${scoped[2].trim().replace(/^\.\//, "")}`;
}

export function triggerEntries(trigger, prefix) {
  return (trigger ?? "")
    .split(/[;,]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.startsWith(prefix))
    .map((entry) => entry.slice(prefix.length).trim().replace(/^\.\//, ""))
    .filter(Boolean);
}

export function recallLessons({ root, files = [], symbols = [], hot = [], symbolFiles = new Map(), rows }) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  const source = rows ?? parseLessons(file).rows;
  const hits = [];
  for (const row of source.filter((candidate) => !candidate.status)) {
    const globs = triggerEntries(row.trigger, "path:");
    const symbolMatches = triggerEntries(row.trigger, "symbol:").filter((name) => symbols.includes(name));
    const symbolMatchedFiles = symbolMatches.flatMap((name) => [...(symbolFiles.get(name) ?? [])]);
    const churnMatches = hot.filter((candidate) => triggerEntries(row.trigger, "churn:").some((glob) => globToRegex(glob).test(candidate)));
    const matched = [
      ...files.filter((candidate) => globs.map(globToRegex).some((pattern) => pattern.test(candidate))),
      ...symbolMatches,
      ...symbolMatchedFiles,
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
  if (!relCheck.split(path.sep).join("/").startsWith("test/")) return { ok: false, reason: `falsifier path is not under test/: ${rel}` };
  let stat;
  try { stat = fs.statSync(absolute, { throwIfNoEntry: false }); } catch { stat = null; }
  if (!stat?.isFile()) return { ok: false, reason: `falsifier file not found: ${rel}` };
  let realRel;
  try { realRel = posixRelative(fs.realpathSync(root), fs.realpathSync(absolute)); } catch { return { ok: false, reason: `falsifier file not found: ${rel}` }; }
  if (!realRel || realRel.startsWith("..") || path.isAbsolute(realRel)) return { ok: false, reason: `falsifier path escapes the repository through a link: ${rel}` };
  if (!realRel.split(path.sep).join("/").startsWith("test/")) return { ok: false, reason: `falsifier path is not under test/ through a link: ${rel}` };
  let falsifierText;
  try { falsifierText = fs.readFileSync(absolute, "utf8"); } catch { return { ok: false, reason: `falsifier file not found: ${rel}` }; }
  if (!falsifierText.includes(caseName)) {
    return { ok: false, reason: `falsifier case "${caseName}" is not present in ${rel}` };
  }
  if (git(root, ["rev-parse", "--git-dir"]).ok) {
    const objectExists = git(root, ["cat-file", "-e", sha]).ok;
    const commitExists = git(root, ["cat-file", "-e", `${sha}^{commit}`]).ok;
    if (objectExists && !commitExists) {
      return { ok: false, reason: `falsifier anchor ${sha} for ${spec} is not a commit` };
    }
    if (commitExists && !git(root, ["merge-base", "--is-ancestor", sha, "HEAD"]).ok) {
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
      warnings.push(`proof ${sha} predates later changes to ${label} (${since.ok ? since.out : "?"} commits since); run \`krn lessons reanchor\``);
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
    const owned = (value) => value && !value.startsWith("..") && !path.isAbsolute(value) && /^(scripts|test|skills|config|docs|\.github)\//.test(value.split(path.sep).join("/"));
    if (owned(rel)) {
      let stat;
      try { stat = fs.statSync(absolute, { throwIfNoEntry: false }); } catch { stat = null; }
      if (stat?.isFile()) {
        const realRel = posixRelative(fs.realpathSync(root), fs.realpathSync(absolute));
        if (owned(realRel)) {
          return { ok: true, kind: "path", path: realRel };
        }
      }
    }
  }
  return { ok: false, reason: `no npm script or owned path at ${reference}` };
}

function isStructuralGate(result) {
  if (result.kind === "script") return true;
  const resolvedPath = result.kind === "path" ? (result.path ?? "") : "";
  return /^scripts\/[^/]+\.(mjs|js|cjs|sh|py)$/i.test(resolvedPath)
    || /^test\/.+\.(test|spec)\.(mjs|js|cjs|sh|py)$/i.test(resolvedPath)
    || /^\.github\/workflows\/.+\.ya?ml$/i.test(resolvedPath);
}

function gateReferences(gate) {
  const value = (gate ?? "").trim();
  const references = [...value.matchAll(/`([^`]+)`/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  return references.length === 0 && value ? [value] : references;
}

export function lessonStructureFindings({ root }) {
  const file = path.join(root, "docs", "research", "workflow-lessons.md");
  let stat = null;
  try { stat = fs.statSync(file, { throwIfNoEntry: false }); } catch { stat = null; }
  const isFile = stat?.isFile() === true;
  const { rows, malformed, budget, headerColumns, unbalancedFence } = parseLessons(file);
  const findings = malformed.map((row) => ({ rule: "malformed-row", message: `malformed lesson row: ${row.trim()}` }));
  if (stat && !isFile) findings.push({ rule: "unreadable-lessons", message: "docs/research/workflow-lessons.md exists but is not a regular file" });
  if (unbalancedFence) findings.push({ rule: "unbalanced-fence", message: "workflow-lessons.md has an unterminated code fence; lesson rows cannot be trusted" });
  const maxColumns = rows.reduce((widest, row) => Math.max(widest, row.columns ?? 0), 0);
  if (headerColumns !== null && maxColumns > headerColumns) {
    findings.push({ rule: "header-columns", message: `workflow-lessons.md header declares ${headerColumns} columns but a row uses ${maxColumns}; widen the header` });
  }
  const activeRows = rows.filter((row) => !row.status);
  const retiredRows = rows.filter((row) => row.status);
  const triggerOwners = new Map();
  for (const row of activeRows) {
    for (const entry of (row.trigger ?? "").split(/[;,]/).map((value) => value.trim()).filter(Boolean)) {
      const normalized = normalizeTriggerEntry(entry);
      triggerOwners.set(normalized, [...(triggerOwners.get(normalized) ?? []), row.lesson]);
    }
  }
  for (const [trigger, owners] of triggerOwners) {
    if (owners.length > 1) findings.push({ rule: "duplicate-trigger", message: `lessons ${owners.map((owner) => `"${owner}"`).join(" and ")} share trigger ${trigger}` });
  }
  if (activeRows.length > budget) findings.push({ rule: "over-budget-active", message: `workflow-lessons.md exceeds ${budget} active lesson rows; displace (add a row, then retire the displaced one) or retire` });
  if (retiredRows.length > budget) findings.push({ rule: "over-budget-archived", message: `workflow-lessons.md exceeds ${budget} archived rows; consolidate the archive` });
  for (const row of rows) {
    const invalidTrigger = (row.trigger ?? "").split(/[;,]/).map((entry) => entry.trim()).filter(Boolean).find((entry) => !/^(path|symbol|churn):/.test(entry));
    if (invalidTrigger) { findings.push({ rule: "invalid-trigger", message: `lesson "${row.lesson}": unknown trigger "${invalidTrigger}"; use path:, symbol:, or churn:` }); continue; }
    const emptyScope = (row.trigger ?? "").split(/[;,]/).map((entry) => entry.trim()).filter(Boolean).find((entry) => /^(path|symbol|churn):$/.test(entry));
    if (emptyScope) { findings.push({ rule: "invalid-trigger", message: `lesson "${row.lesson}": trigger "${emptyScope}" names no scope` }); continue; }
    const badGlob = [...triggerEntries(row.trigger, "path:"), ...triggerEntries(row.trigger, "churn:")].find((glob) => {
      try { compileGlob(glob); return false; } catch { return true; }
    });
    if (badGlob) { findings.push({ rule: "invalid-glob", message: `lesson "${row.lesson}": invalid trigger glob "${badGlob}"` }); continue; }
    if (row.status && !RETIRE.exec(row.status)) findings.push({ rule: "invalid-status", message: `lesson "${row.lesson}": invalid Status "${row.status}"; use retired@<7-hex>[; superseded-by:<anchor>|enforced-by:<gate-ref>]` });
  }
  return { findings, rows, activeRows, budget, exists: isFile };
}

export function checkLessons({ root, git = runGit }) {
  const { findings, rows, activeRows, exists } = lessonStructureFindings({ root });
  const errors = findings.map((finding) => finding.message);
  const warnings = [];
  const lessons = [];
  if (!exists) return { root, lessons, errors, warnings: ["no workflow-lessons page; memory is not adopted at this root"], skipped: true };
  const packageFile = path.join(root, "package.json");
  let scripts = {};
  if (fs.existsSync(packageFile)) {
    try { scripts = readJson(packageFile).scripts ?? {}; } catch { errors.push("package.json is not valid JSON"); }
  }
  for (const row of rows) {
    const invalidTrigger = (row.trigger ?? "").split(/[;,]/).map((entry) => entry.trim()).filter(Boolean).find((entry) => !/^(path|symbol|churn):/.test(entry));
    if (invalidTrigger) continue;
    const badGlob = [...triggerEntries(row.trigger, "path:"), ...triggerEntries(row.trigger, "churn:")].find((glob) => {
      try { compileGlob(glob); return false; } catch { return true; }
    });
    if (badGlob) continue;
    if (row.status) {
      const retirement = RETIRE.exec(row.status);
      if (!retirement) continue; // invalid Status is reported by lessonStructureFindings
      if ((row.trigger ?? "").trim()) errors.push(`lesson "${row.lesson}": a retired row cannot carry a Trigger`);
      const sha = retirement[1];
      if (git(root, ["rev-parse", "--git-dir"]).ok && git(root, ["cat-file", "-e", `${sha}^{commit}`]).ok && !git(root, ["merge-base", "--is-ancestor", sha, "HEAD"]).ok) {
        errors.push(`lesson "${row.lesson}": retirement commit ${sha} is not an ancestor of HEAD`);
      }
      const anchor = retirement[2];
      const enforcedBy = retirement[3];
      if (anchor) {
        const target = activeRows.find((candidate) => {
          const tokens = [...candidate.gate.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim());
          const falsifierFile = (/(test\/[A-Za-z0-9_./-]+\.mjs)/.exec(candidate.falsifier) ?? [])[1];
          return [...tokens, falsifierFile, candidate.lesson].filter(Boolean).some((value) => value === anchor);
        });
        if (!target) errors.push(`lesson "${row.lesson}": superseded-by "${anchor}" resolves to no active row`);
      } else if (enforcedBy) {
        const tokens = gateReferences(row.gate);
        if (!tokens.includes(enforcedBy)) {
          errors.push(`lesson "${row.lesson}": enforced-by "${enforcedBy}" is not declared in Enforced by`);
        } else {
          const result = resolveReference(root, scripts, enforcedBy);
          if (!result.ok) errors.push(`lesson "${row.lesson}": enforced-by "${enforcedBy}" no longer resolves: ${result.reason}`);
          else if (!isStructuralGate(result)) {
            errors.push(`lesson "${row.lesson}": enforced-by "${enforcedBy}" must resolve to an executable script/test or GitHub workflow`);
          }
        }
      } else {
        const tokens = gateReferences(row.gate);
        const live = tokens
          .filter((reference) => resolveReference(root, scripts, reference).ok);
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
    const structural = resolved.filter(isStructuralGate);
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
        const triggered = (row.trigger ?? "").trim().length > 0;
        for (const warning of proofWarnings(root, match[3], match[1], gates, git)) {
          if (triggered) errors.push(`lesson "${row.lesson}": stale-anchor: ${warning}`);
          else warnings.push(`lesson "${row.lesson}": ${warning}`);
        }
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
      const counts = usage.get(row.lesson) ?? { hits: 0, binds: 0 };
      if (counts.binds === 0) warnings.push(`lesson "${row.lesson}": trigger has never been recalled; verify it with \`krn memory usage\``);
      if (counts.hits >= DEAD_TRIGGER_HITS && counts.binds === 0) {
        warnings.push(`lesson "${row.lesson}": dead-trigger: trigger matched ${counts.hits} changes but none bound a Recall trailer; tighten or retire it`);
      }
    }
  }
  return { root, lessons, errors, warnings };
}
