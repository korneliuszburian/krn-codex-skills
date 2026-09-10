import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const ABI_LABELS = [
  "Outcome and observable acceptance",
  "Current workflow owner and sole writer",
  "Outcome state",
  "Publication state",
  "Repository base, HEAD or working-tree fingerprint, and dirty-state scope",
  "Native Goal identity/state and configured tracker item/state",
  "Restart state",
  "Outstanding workflow-run cleanup",
  "Authority",
  "Evidence observed",
  "Explicit non-proofs",
  "Review fixed point and Standards / Spec disposition",
  "Open unknowns and blockers with owners",
  "Workflow friction and lesson candidates",
  "Durable CONTEXT / ADR / research references",
  "Next bounded owner and action",
];

const OUTCOME_STATES = new Set([
  "ACTIVE",
  "BLOCKED",
  "DEFERRED",
  "NEEDS_REVIEW",
  "COMPLETE",
  "SUPERSEDED",
  "ABANDONED",
]);
const PUBLICATION_STATES = new Set([
  "NOT_REQUESTED",
  "NOT_AUTHORIZED",
  "LOCAL_ONLY",
  "PUBLISH_PENDING",
  "PR_OPEN",
  "MERGE_READY",
  "MERGED",
  "DEPLOYED",
]);
const CLEANUP_STATES = new Set(["ACTIVE", "CLEANUP_PENDING", "BLOCKED"]);

function git(repo, args) {
  try {
    return {
      ok: true,
      out: execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim(),
    };
  } catch {
    return { ok: false, out: "" };
  }
}

function gitAvailable() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function inside(root, candidate) {
  const target = resolve(root, candidate);
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function fieldLine(text, label) {
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith(`${label}:`)) return line.trimStart().slice(label.length + 1).trim();
  }
  return null;
}

function stripMarkup(value) {
  return value.replace(/[`<>]/g, "").trim();
}

function parseCleanup(value) {
  const open = value.indexOf("[");
  const close = value.lastIndexOf("]");
  if (open === -1 || close <= open) return { entries: [], malformed: [value] };
  if (value.slice(close + 1).trim() !== "") return { entries: [], malformed: [value] };
  const entries = [];
  const malformed = [];
  for (const chunk of value.slice(open + 1, close).split(",")) {
    const entry = chunk.replace(/[<>]/g, "").trim();
    if (!entry) continue;
    const parts = entry.split(";").map((part) => part.trim());
    const wellFormed =
      parts.length === 5 &&
      parts.slice(0, 4).every((part) => part !== "") &&
      CLEANUP_STATES.has(parts[4]);
    if (!wellFormed) {
      malformed.push(entry);
      continue;
    }
    entries.push({ pointer: parts[0], state: parts[4] });
  }
  if (entries.length === 0 && malformed.length === 0) malformed.push(value);
  return { entries, malformed };
}

function fixedPointErrors(root, fixedPoint, canCheckCommits) {
  const errors = [];
  for (const match of fixedPoint.matchAll(/\b(base|HEAD|fingerprint)\s*=\s*([^\s,;]+)/gi)) {
    const value = match[2].replace(/[`<>]/g, "");
    if (!/^[0-9a-f]+$/i.test(value)) continue;
    const tokenValue = value.toLowerCase();
    if (tokenValue.length !== 40) {
      errors.push({ rule: "invalid-fixed-point", detail: `partial token ${tokenValue}` });
    } else if (canCheckCommits && !git(root, ["cat-file", "-e", `${tokenValue}^{commit}`]).ok) {
      errors.push({ rule: "invalid-fixed-point", detail: tokenValue });
    }
  }
  return errors;
}

export function inspectSpineState({ repo = process.cwd() } = {}) {
  const requested = resolve(repo);
  const requestedStat = statSync(requested, { throwIfNoEntry: false });
  if (!requestedStat) throw new Error(`repository path does not exist: ${requested}`);
  if (!requestedStat.isDirectory()) {
    throw new Error(`state check expects a repository directory, got a file: ${requested}`);
  }
  const hasGit = gitAvailable();
  const top = hasGit ? git(requested, ["rev-parse", "--show-toplevel"]) : { ok: false, out: "" };
  const root = top.ok && top.out ? resolve(top.out) : requested;

  const errors = [];
  const warnings = [];
  const capsules = [];
  const ignored = { checked: 0, ignored: 0 };
  const gitRepo = hasGit ? git(root, ["rev-parse", "--is-inside-work-tree"]) : { ok: false, out: "" };
  const usableGit = gitRepo.ok && gitRepo.out === "true";

  const capsuleBase = join(root, ".krn", "runs", "delivery-loop");
  const candidates = existsSync(capsuleBase)
    ? readdirSync(capsuleBase, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))
    : [];

  const currentHead = usableGit ? git(root, ["rev-parse", "HEAD"]) : { ok: false, out: "" };

  for (const entry of candidates) {
    const entryPath = join(capsuleBase, entry.name);
    let resolvedDirectory;
    try {
      resolvedDirectory = realpathSync(entryPath);
    } catch {
      if (existsSync(join(entryPath, "state.md"))) {
        errors.push({ id: entry.name, rule: "unreadable-capsule", detail: `${entry.name} cannot be resolved` });
      }
      continue;
    }
    let directoryStat;
    try {
      directoryStat = statSync(resolvedDirectory);
    } catch {
      continue;
    }
    if (!directoryStat.isDirectory()) continue;
    if (!inside(root, resolvedDirectory)) {
      capsules.push({ id: entry.name, path: join(".krn", "runs", "delivery-loop", entry.name) });
      errors.push({ id: entry.name, rule: "capsule-outside-repo", detail: resolvedDirectory });
      continue;
    }
    const file = join(entryPath, "state.md");
    const relativePath = join(".krn", "runs", "delivery-loop", entry.name, "state.md");
    if (!existsSync(file)) continue;
    capsules.push({ id: entry.name, path: relativePath });

    let fileStat;
    try {
      fileStat = statSync(file);
    } catch {
      errors.push({ id: entry.name, rule: "unreadable-capsule", detail: relativePath });
      continue;
    }
    if (!fileStat.isFile()) {
      errors.push({ id: entry.name, rule: "unreadable-capsule", detail: `${relativePath} is not a regular file` });
      continue;
    }
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      errors.push({ id: entry.name, rule: "unreadable-capsule", detail: relativePath });
      continue;
    }

    if (hasGit && !usableGit) {
      errors.push({ id: entry.name, rule: "not-a-git-worktree", detail: root });
    } else if (!hasGit) {
      errors.push({ id: entry.name, rule: "git-unavailable", detail: "git is not on PATH" });
    } else {
      const isIgnored = git(root, ["check-ignore", "-q", relativePath]).ok;
      ignored.checked += 1;
      if (isIgnored) ignored.ignored += 1;
      else errors.push({ id: entry.name, rule: "runs-not-ignored", detail: `${relativePath} is not git-ignored` });
    }

    const fields = Object.fromEntries(ABI_LABELS.map((label) => [label, fieldLine(text, label)]));
    for (const [label, value] of Object.entries(fields)) {
      if (value === null || value === "") errors.push({ id: entry.name, rule: "missing-field", detail: label });
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

    if (outcome && !OUTCOME_STATES.has(stripMarkup(outcome))) {
      errors.push({ id: entry.name, rule: "invalid-outcome-state", detail: outcome });
    }
    if (publication && !PUBLICATION_STATES.has(stripMarkup(publication))) {
      errors.push({ id: entry.name, rule: "invalid-publication-state", detail: publication });
    }

    if (restart && stripMarkup(restart) !== "ABSENT") {
      const restartPath = stripMarkup(restart);
      if (!inside(root, restartPath)) {
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
        if (!inside(root, parsedEntry.pointer)) {
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
      const commits = [...fixedPoint.matchAll(/\b(base|HEAD|fingerprint)\s*=\s*([0-9a-f]{40})\b/gi)].map((match) => match[2].toLowerCase());
      if (commits.length > 0 && currentHead.ok && !commits.includes(currentHead.out.toLowerCase())) {
        warnings.push({
          id: entry.name,
          rule: "stale-fixed-point",
          detail: `capsule records ${commits.join(", ")} but HEAD is ${currentHead.out}`,
        });
      }
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
    }
  }

  const lessonsFile = join(root, "docs", "research", "workflow-lessons.md");
  if (existsSync(lessonsFile)) {
    const rows = readFileSync(lessonsFile, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("|") && !/^\|\s*-+/.test(line) && !/^\|\s*Lesson\s*\|/.test(line))
      .length;
    if (rows > 24) {
      errors.push({ id: "workflow-lessons", rule: "lessons-over-budget", detail: `${rows} rows` });
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
