import { existsSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { posixRelative } from "../support/path-rules.mjs";

import {
  ABI_LABELS,
  OUTCOME_STATES,
  PUBLICATION_STATES,
  fieldLine,
  fixedPointAnchors,
  parseAcceptance,
  parseCleanup,
  stripMarkup,
} from "./capsule-abi.mjs";
import { runGit as git } from "../kernel/git.mjs";
import { lessonStructureFindings } from "../lessons/lessons.mjs";
import { readJson } from "../support/read-json.mjs";
import { capsuleStoreReport, runDirectoriesDetailed } from "./spine-runs.mjs";
import { checkTickets } from "../ticket/ticket.mjs";
import { isInside } from "../support/path-rules.mjs";
import { resolveRepositoryRoot } from "../kernel/repo-root.mjs";

// Capsule narrative is a working record, not a history log: the four fields that
// tend to absorb status prose are bounded per field and in total. Past a bound
// the capsule is divergent and the history belongs in the LT registry.
const NARRATIVE_BUDGETS = [
  ["Evidence observed", 4096],
  ["Next bounded owner and action", 2048],
  ["Open unknowns and blockers with owners", 2048],
  ["Review fixed point and Standards / Spec disposition", 2048],
];
const NARRATIVE_TOTAL_BUDGET = 8192;

function narrativeBudgetFindings(fields) {
  const over = [];
  let total = 0;
  for (const [label, cap] of NARRATIVE_BUDGETS) {
    const value = fields[label];
    if (value === null || value === undefined) continue;
    const size = Buffer.byteLength(value, "utf8");
    total += size;
    if (size > cap) over.push(`${label} ${size}/${cap}`);
  }
  if (total > NARRATIVE_TOTAL_BUDGET) {
    over.push(`narrative total ${total}/${NARRATIVE_TOTAL_BUDGET}`);
  }
  return over;
}

// Resolve an `evidence=` token that claims an artifact or a frozen acceptance
// case: a COMPLETE capsule's evidence must name something that exists, either a
// frozen conformance case (`case:<id>`) or a repository-relative path inside the
// root. Every other token is unresolved.
function reviewEvidenceUnresolved(root, token) {
  if (token.startsWith("case:")) {
    const id = token.slice("case:".length);
    let ids = null;
    try {
      ids = new Set((readJson(join(root, "config", "conformance.json")).cases ?? []).map((entry) => entry?.id));
    } catch {
      ids = null;
    }
    return ids?.has(id) ? null : `evidence ${token} is not a frozen conformance case`;
  }
  const target = resolve(root, token.replace(/^\.\//, ""));
  let inside = false;
  try { inside = isInside(root, target); } catch { inside = false; }
  return inside && existsSync(target) ? null : `evidence ${token} does not exist in the repository`;
}

export function normalizeRunPointer(root, pointer) {
  // Resolve symlink aliases so one physical run reached by two names has one
  // identity; a missing pointer falls back to its normalized lexical path.
  const absolute = resolve(root, pointer);
  let resolved = absolute;
  try { resolved = realpathSync(absolute); } catch { resolved = absolute; }
  return posixRelative(root, resolved);
}

// A friction candidate is a reflection awaiting an integration decision: it
// drains only when it names an existing lesson-row anchor, a ticket under the
// queue, or a deferred ticket. Anything else dangles and must be visible.
const candidateText = (friction) => stripMarkup(typeof friction === "string" ? friction : "");

function frictionCandidates(friction) {
  return [...candidateText(friction).matchAll(/\bcandidate:\s*([^\s;,`]+)/gi)].map((match) => match[1].replace(/[.,]+$/, ""));
}

function lessonAnchors(root) {
  const anchors = new Set();
  try {
    for (const row of lessonStructureFindings({ root }).rows) {
      if (row.lesson) anchors.add(row.lesson.trim());
      for (const match of (row.gate ?? "").matchAll(/`([^`]+)`/g)) anchors.add(match[1].trim());
      for (const part of (row.gate ?? "").split(/[;,]/).map((value) => value.trim()).filter(Boolean)) anchors.add(part);
      for (const part of (row.trigger ?? "").split(/[;,]/).map((value) => value.trim()).filter(Boolean)) anchors.add(part);
      const falsifierFile = (/(test\/[A-Za-z0-9_./-]+\.mjs)/.exec(row.falsifier ?? "") ?? [])[1];
      if (falsifierFile) anchors.add(falsifierFile);
    }
  } catch {
    // An unreadable lessons page resolves no anchor, so candidates fail closed.
  }
  return anchors;
}

function queueTicketIds(root) {
  const ids = new Set();
  try {
    for (const ticket of checkTickets({ root }).tickets) if (ticket.id) ids.add(ticket.id);
  } catch {
    // No readable queue: candidates can only resolve to lesson-row anchors.
  }
  return ids;
}

function candidateResolves(token, anchors, ticketIds) {
  const deferred = /^deferred:(.+)$/i.exec(token);
  if (deferred) return ticketIds.has(deferred[1]);
  return anchors.has(token) || ticketIds.has(token);
}

function frictionFindings({ id, friction, outcome, anchors, ticketIds, errors, warnings }) {
  const complete = stripMarkup(outcome ?? "") === "COMPLETE";
  for (const token of frictionCandidates(friction)) {
    if (candidateResolves(token, anchors, ticketIds)) continue;
    const finding = { id, rule: "dangling-candidate", detail: token };
    if (complete) errors.push(finding);
    else warnings.push(finding);
  }
  if (!complete) return;
  const residue = candidateText(friction).replace(/\bcandidate:\s*[^\s;,`]+/gi, "").replace(/[;,\s]+/g, "");
  if (residue.length > 0 && !/^none$/i.test(residue)) {
    errors.push({ id, rule: "complete-with-friction", detail: candidateText(friction) });
  }
}

function fixedPointErrors(root, fixedPoint, canCheckCommits) {
  const errors = [];
  for (const match of fixedPoint.matchAll(/\b(base|HEAD|fingerprint)\s*=\s*([^\s,;]+)/gi)) {
    const label = match[1].toLowerCase();
    const value = match[2].replace(/[`<>]/g, "");
    if (label === "fingerprint") continue;
    if (!/^[0-9a-f]+$/i.test(value)) {
      errors.push({ rule: "invalid-fixed-point", detail: `${label}=${value} is not a commit token` });
      continue;
    }
    const tokenValue = value.toLowerCase();
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
    .map((entry) => ({ ...entry, name: entry.id, relativePath: entry.state?.relativePath, resolvedRelativePath: entry.state?.resolvedRelativePath, text: entry.state?.text }))
    .sort(
      (left, right) =>
        Number(Boolean(left.link)) - Number(Boolean(right.link)) || left.name.localeCompare(right.name),
    );

  const lessonAnchorSet = lessonAnchors(root);
  const queueTicketSet = queueTicketIds(root);
  const currentHead = usableGit ? git(root, ["rev-parse", "HEAD"]) : { ok: false, out: "" };
  const seenDirectories = new Set();
  const realRoot = (() => { try { return realpathSync(root); } catch { return root; } })();
  const containedInRepo = (relative) => {
    if (!isInside(root, relative)) return false;
    try {
      return isInside(realRoot, realpathSync(resolve(root, relative)));
    } catch {
      return true;
    }
  };

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
      const ignorePath = entry.resolvedRelativePath ?? relativePath;
      const ignore = git(root, ["check-ignore", "-q", ignorePath]);
      const isIgnored = ignore.ok;
      const ignorable = ignore.ok || ignore.status === 1;
      ignored.checked += 1;
      if (isIgnored) ignored.ignored += 1;
      else if (ignorable) errors.push({ id: entry.name, rule: "runs-not-ignored", detail: `${ignorePath} is not git-ignored` });
      else warnings.push({ id: entry.name, rule: "gitignore-unverified", detail: `${ignorePath}: git check-ignore failed` });
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

    const overBudget = narrativeBudgetFindings(fields);
    if (overBudget.length > 0) {
      errors.push({
        id: entry.name,
        rule: "capsule-narrative-over-budget",
        detail: `${overBudget.join("; ")}; history belongs in docs/research/lab-tests.md`,
      });
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
    const acceptanceLedger = parseAcceptance(acceptance ?? "");
    for (const entryText of acceptanceLedger.malformed) {
      errors.push({ id: entry.name, rule: "malformed-acceptance", detail: entryText });
    }
    const outcomeValue = outcome ? stripMarkup(outcome) : "";
    if (outcomeValue === "ACTIVE" && !acceptanceLedger.ledger) {
      warnings.push({
        id: entry.name,
        rule: "acceptance-without-ledger",
        detail: "record each criterion as [criterion; todo|pass|drop:<why>] so the next session can re-verify it",
      });
    }
    if (outcomeValue === "COMPLETE") {
      const open = acceptanceLedger.items.filter((item) => item.status === "todo");
      if (open.length > 0) {
        errors.push({ id: entry.name, rule: "complete-with-open-acceptance", detail: open.map((item) => item.criterion).join(", ") });
      }
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

    frictionFindings({
      id: entry.name,
      friction: fields["Workflow friction and lesson candidates"],
      outcome,
      anchors: lessonAnchorSet,
      ticketIds: queueTicketSet,
      errors,
      warnings,
    });

    if (restart && stripMarkup(restart) !== "ABSENT") {
      const restartPath = stripMarkup(restart);
      if (!containedInRepo(restartPath)) {
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
        if (!containedInRepo(parsedEntry.pointer)) {
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
      if (!/\b(base|HEAD|fingerprint)\s*=\s*[^\s,;]+/i.test(stripMarkup(fixedPoint))) {
        const finding = { id: entry.name, rule: "missing-fixed-point", detail: stripMarkup(fixedPoint) };
        if (outcome && stripMarkup(outcome) === "ACTIVE") errors.push(finding);
        else warnings.push(finding);
      }
      if (outcome && stripMarkup(outcome) === "COMPLETE" && anchorHead === null) {
        // A COMPLETE outcome needs an end anchor: a base-only fixed point cannot
        // detect that HEAD advanced after completion.
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
      const review = fields["Review fixed point and Standards / Spec disposition"];
      const reviewText = review ? stripMarkup(review).trim() : "";
      const pendingReview = /^(pending|unreviewed|not[ _-]?reviewed|tbd)\b/i.test(reviewText);
      if (pendingReview) {
        errors.push({ id: entry.name, rule: "complete-with-pending-review", detail: reviewText });
      } else if (review && !/^(none|not-applicable)$/i.test(reviewText)) {
        const evidence = review.match(/evidence\s*=\s*([^\s;,`]+)/i);
        if (!evidence || /^(none|n\/a|na|tbd|-|pending)$/i.test(evidence[1])) {
          errors.push({ id: entry.name, rule: "complete-review-without-evidence", detail: reviewText });
        } else {
          const unresolved = reviewEvidenceUnresolved(root, evidence[1].replace(/[<>]/g, ""));
          if (unresolved) errors.push({ id: entry.name, rule: "complete-review-evidence-unresolved", detail: unresolved });
        }
      }
      const participants = fields["Native Goal identity/state and configured tracker item/state"];
      const participantText = participants ? stripMarkup(participants) : "";
      const activeParticipant =
        /\bstate\s*[=:]\s*["']?(active|open|in[ _-]?progress|blocked|deferred|running)\b/i.test(participantText)
        || /\((?:active|open|in[ _-]?progress|blocked|deferred|running)\)/i.test(participantText);
      if (participants && activeParticipant) {
        errors.push({ id: entry.name, rule: "complete-with-active-participant", detail: participantText });
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
    let readable = true;
    try {
      if (!statSync(lessonsFile).isFile()) throw new Error("not a file");
    } catch {
      readable = false;
      errors.push({ id: "workflow-lessons", rule: "unreadable-lessons", detail: "docs/research/workflow-lessons.md" });
    }
    if (readable) {
      for (const finding of lessonStructureFindings({ root }).findings) {
        const rule = finding.rule === "over-budget-active" ? "lessons-over-budget" : "malformed-lesson";
        errors.push({ id: "workflow-lessons", rule, detail: finding.message });
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
