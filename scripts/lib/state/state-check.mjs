import { existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { posixRelative } from "../support/path-rules.mjs";

import {
  ABI_LABELS,
  OUTCOME_STATES,
  PUBLICATION_STATES,
  fieldLine,
  fixedPointAnchors,
  parseCleanup,
  stripMarkup,
} from "./capsule-abi.mjs";
import { runGit as git } from "../support/git-cli.mjs";
import { parseLessons } from "../lessons/lessons.mjs";
import { capsuleStoreReport, runDirectoriesDetailed } from "./spine-runs.mjs";
import { isInside } from "../support/path-rules.mjs";
import { resolveRepositoryRoot } from "../support/repo-root.mjs";



export function normalizeRunPointer(root, pointer) {
  return posixRelative(root, resolve(root, pointer));
}

function fixedPointErrors(root, fixedPoint, canCheckCommits) {
  const errors = [];
  for (const match of fixedPoint.matchAll(/\b(base|HEAD|fingerprint)\s*=\s*([^\s,;]+)/gi)) {
    const label = match[1].toLowerCase();
    const value = match[2].replace(/[`<>]/g, "");
    if (!/^[0-9a-f]+$/i.test(value)) continue;
    const tokenValue = value.toLowerCase();
    if (label === "fingerprint") continue;
    if (tokenValue.length !== 40 && tokenValue.length !== 64) {
      errors.push({ rule: "invalid-fixed-point", detail: `partial token ${tokenValue}` });
    } else if (canCheckCommits && !git(root, ["cat-file", "-e", `${tokenValue}^{commit}`]).ok) {
      errors.push({ rule: "invalid-fixed-point", detail: tokenValue });
    }
  }
  return errors;
}

export function inspectSpineState({ repo = process.cwd() } = {}) {
  const { root, hasGit } = resolveRepositoryRoot(repo, { label: "state check" });
  const errors = [];
  const warnings = [];
  const capsules = [];
  const listedRunPointers = new Set();
  const runOwners = new Map();
  const ignored = { checked: 0, ignored: 0 };
  const gitRepo = hasGit ? git(root, ["rev-parse", "--is-inside-work-tree"]) : { ok: false, out: "" };
  const usableGit = gitRepo.ok && gitRepo.out === "true";

  const { storeErrors, entries } = capsuleStoreReport(root);
  for (const error of storeErrors) errors.push({ id: "runs", rule: error.rule, detail: error.detail });
  const candidates = [...entries]
    .map((entry) => ({ ...entry, name: entry.id, relativePath: entry.state?.relativePath, text: entry.state?.text }))
    .sort(
      (left, right) =>
        Number(Boolean(left.link)) - Number(Boolean(right.link)) || left.name.localeCompare(right.name),
    );

  const currentHead = usableGit ? git(root, ["rev-parse", "HEAD"]) : { ok: false, out: "" };
  const seenDirectories = new Set();

  for (const entry of candidates) {
    if (entry.kind === "resolve") {
      errors.push({ id: entry.name, rule: "unreadable-capsule", detail: `${entry.name} cannot be resolved` });
      continue;
    }
    if (entry.resolvedDirectory !== undefined) {
      if (seenDirectories.has(entry.resolvedDirectory)) continue;
      seenDirectories.add(entry.resolvedDirectory);
    }
    if (entry.error) {
      errors.push({ id: entry.name, rule: entry.error.rule, detail: entry.error.detail });
      continue;
    }
    const relativePath = entry.relativePath;
    const text = entry.text;
    capsules.push({ id: entry.name, path: relativePath });

    if (hasGit && !usableGit) {
      errors.push({ id: entry.name, rule: "not-a-git-worktree", detail: root });
    } else if (!hasGit) {
      errors.push({ id: entry.name, rule: "git-unavailable", detail: "git is not on PATH" });
    } else {
      const ignore = git(root, ["check-ignore", "-q", relativePath]);
      const isIgnored = ignore.ok;
      const ignorable = ignore.ok || ignore.status === 1;
      ignored.checked += 1;
      if (isIgnored) ignored.ignored += 1;
      else if (ignorable) errors.push({ id: entry.name, rule: "runs-not-ignored", detail: `${relativePath} is not git-ignored` });
      else warnings.push({ id: entry.name, rule: "gitignore-unverified", detail: `${relativePath}: git check-ignore failed` });
    }

    const fields = Object.fromEntries(ABI_LABELS.map((label) => [label, fieldLine(text, label)]));
    for (const [label, value] of Object.entries(fields)) {
      if (value === null || stripMarkup(value) === "") errors.push({ id: entry.name, rule: "missing-field", detail: label });
      else if (/<fill\b/.test(value)) errors.push({ id: entry.name, rule: "unresolved-placeholder", detail: label });
    }
    for (const label of ABI_LABELS) {
      const occurrences = text.split("\n").filter((line) => line.trimStart().startsWith(`${label}:`)).length;
      if (occurrences > 1) errors.push({ id: entry.name, rule: "duplicate-field", detail: label });
    }

    const outcome = fields["Outcome state"];
    const publication = fields["Publication state"];
    const restart = fields["Restart state"];
    const cleanup = fields["Outstanding workflow-run cleanup"];
    const fixedPoint = fields["Repository base, HEAD or working-tree fingerprint, and dirty-state scope"];
    const acceptance = fields["Outcome and observable acceptance"];

    if (acceptance && !/`[^`]+`/.test(acceptance) && !/[\\/]|--|\btest\b|\bcheck\b/.test(acceptance)) {
      warnings.push({
        id: entry.name,
        rule: "vague-acceptance",
        detail: "acceptance names no command, path, or code marker; state the check the next session can run",
      });
    }
    const disposition = fields["Review fixed point and Standards / Spec disposition"];
    if (
      disposition &&
      !/^(none|pending|not-applicable)$/i.test(stripMarkup(disposition)) &&
      !/evidence=/.test(disposition) &&
      !/`[^`]+`/.test(disposition)
    ) {
      warnings.push({
        id: entry.name,
        rule: "disposition-without-evidence",
        detail: "store the executed command, its exit, and the fixed point",
      });
    }

    if (outcome && !OUTCOME_STATES.has(stripMarkup(outcome))) {
      errors.push({ id: entry.name, rule: "invalid-outcome-state", detail: outcome });
    }
    if (publication && !PUBLICATION_STATES.has(stripMarkup(publication))) {
      errors.push({ id: entry.name, rule: "invalid-publication-state", detail: publication });
    }

    if (restart && stripMarkup(restart) !== "ABSENT") {
      const restartPath = stripMarkup(restart);
      if (!isInside(root, restartPath)) {
        errors.push({ id: entry.name, rule: "restart-path-outside-repo", detail: restartPath });
      } else if (!existsSync(resolve(root, restartPath))) {
        errors.push({ id: entry.name, rule: "restart-path-missing", detail: restartPath });
      }
    }

    if (cleanup && stripMarkup(cleanup) !== "none") {
      const parsed = parseCleanup(stripMarkup(cleanup));
      for (const entryText of parsed.malformed) {
        errors.push({ id: entry.name, rule: "malformed-cleanup", detail: entryText });
      }
      for (const parsedEntry of parsed.entries) {
        const normalizedPointer = normalizeRunPointer(root, parsedEntry.pointer);
        let ownerKey = normalizedPointer;
        try { ownerKey = realpathSync(resolve(root, parsedEntry.pointer)); } catch { /* keep normalized */ }
        const owner = runOwners.get(ownerKey);
        if (owner && owner !== entry.name) {
          errors.push({ id: entry.name, rule: "duplicate-run-consumer", detail: `${parsedEntry.pointer} already owned by ${owner}` });
        } else {
          runOwners.set(ownerKey, entry.name);
        }
        listedRunPointers.add(normalizedPointer);
        if (!isInside(root, parsedEntry.pointer)) {
          errors.push({ id: entry.name, rule: "cleanup-pointer-outside-repo", detail: parsedEntry.pointer });
        } else if ((parsedEntry.state === "ACTIVE" || parsedEntry.state === "BLOCKED") && !existsSync(resolve(root, parsedEntry.pointer))) {
          errors.push({ id: entry.name, rule: "ghost-cleanup-entry", detail: `${parsedEntry.pointer} (${parsedEntry.state})` });
        }
      }
    }

    if (fixedPoint) {
      for (const finding of fixedPointErrors(root, fixedPoint, usableGit)) {
        errors.push({ id: entry.name, ...finding });
      }
      const commits = [...fixedPoint.replace(/[<>`]/g, "").matchAll(/\b(base|HEAD)\s*=\s*([0-9a-f]{40}|[0-9a-f]{64})\b/gi)].map((match) => match[2].toLowerCase());
      const anchorHead = fixedPointAnchors(fixedPoint).head;
      if (!/\b(base|HEAD|fingerprint)\s*=/i.test(stripMarkup(fixedPoint))) {
        const finding = { id: entry.name, rule: "missing-fixed-point", detail: stripMarkup(fixedPoint) };
        if (outcome && stripMarkup(outcome) === "ACTIVE") errors.push(finding);
        else warnings.push(finding);
      }
      if (outcome && stripMarkup(outcome) === "COMPLETE" && commits.length === 0) {
        errors.push({ id: entry.name, rule: "complete-without-commit-anchor", detail: stripMarkup(fixedPoint) });
      }
      if (anchorHead !== null && currentHead.ok && anchorHead !== currentHead.out.toLowerCase()) {
        const stale = { id: entry.name, rule: "stale-fixed-point", detail: `capsule records ${commits.join(", ")} but HEAD is ${currentHead.out}` };
        if (outcome && stripMarkup(outcome) === "COMPLETE") errors.push(stale);
        else warnings.push(stale);
      }
    }

    const next = fields["Next bounded owner and action"];
    if (outcome && stripMarkup(outcome) === "ACTIVE" && next && /^(none|n\/a|tbd)$/i.test(stripMarkup(next))) {
      errors.push({ id: entry.name, rule: "active-without-next", detail: stripMarkup(next) });
    }

    if (outcome && stripMarkup(outcome) === "COMPLETE") {
      if (cleanup && stripMarkup(cleanup) !== "none") {
        errors.push({ id: entry.name, rule: "complete-with-cleanup", detail: "COMPLETE capsules must have no outstanding cleanup" });
      }
      if (restart && stripMarkup(restart) !== "ABSENT") {
        errors.push({ id: entry.name, rule: "complete-with-restart", detail: stripMarkup(restart) });
      }
      const friction = fields["Workflow friction and lesson candidates"];
      if (friction && stripMarkup(friction) !== "none") {
        errors.push({ id: entry.name, rule: "complete-with-friction", detail: stripMarkup(friction) });
      }
      const participants = fields["Native Goal identity/state and configured tracker item/state"];
      if (participants && /\bstate\s*[=:]\s*["\']?(active|open|in[ _-]?progress|blocked|deferred)\b/i.test(stripMarkup(participants))) {
        errors.push({ id: entry.name, rule: "complete-with-active-participant", detail: stripMarkup(participants) });
      }
    }
  }

  const inventory = runDirectoriesDetailed(root);
  for (const detail of inventory.errors) errors.push({ id: "runs", rule: "unreadable-run-inventory", detail });
  if (capsules.length > 0) {
    for (const run of inventory.runs) {
      if (!listedRunPointers.has(normalizeRunPointer(root, run.pointer))) {
        errors.push({ id: run.workflow, rule: "orphaned-run", detail: run.pointer });
      }
    }
  }

  const lessonsFile = join(root, "docs", "research", "workflow-lessons.md");
  if (existsSync(lessonsFile)) {
    let parsedLessons;
    try {
      if (!statSync(lessonsFile).isFile()) throw new Error("not a file");
      parsedLessons = parseLessons(lessonsFile);
    } catch {
      errors.push({ id: "workflow-lessons", rule: "unreadable-lessons", detail: "docs/research/workflow-lessons.md" });
    }
    if (parsedLessons) {
      const activeLessons = parsedLessons.rows.filter((row) => !row.status).length;
      if (activeLessons > parsedLessons.budget) {
        errors.push({ id: "workflow-lessons", rule: "lessons-over-budget", detail: `${activeLessons} rows` });
      }
      for (const row of parsedLessons.malformed) {
        errors.push({ id: "workflow-lessons", rule: "malformed-lesson", detail: row.trim() });
      }
    }
  }

  return {
    root,
    git: hasGit,
    applicability: capsules.length > 0 ? "checked" : "no-file-backed-capsule",
    ignoredRuns: ignored.checked === 0 ? null : ignored.ignored === ignored.checked,
    capsules,
    errors,
    warnings,
    status: errors.length > 0 ? "divergent" : capsules.length > 0 ? "clean" : "not-applicable",
  };
}
