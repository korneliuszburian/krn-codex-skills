import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

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
const ABI_LABELS = [
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
  "Durable CONTEXT / ADR / research references",
  "Next bounded owner and action",
];

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

function fieldOf(text, label) {
  for (const line of text.split("\n")) {
    if (line.startsWith(`${label}:`)) return line.slice(label.length + 1).trim();
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
  const entries = [];
  const malformed = [];
  for (const chunk of value.slice(open + 1, close).split(",")) {
    const entry = chunk.replace(/[<>]/g, "").trim();
    if (!entry) continue;
    const parts = entry.split(";").map((part) => part.trim());
    if (parts.length !== 5 || !CLEANUP_STATES.has(parts[4].toUpperCase())) {
      malformed.push(entry);
      continue;
    }
    entries.push({ pointer: parts[0], state: parts[4].toUpperCase() });
  }
  if (entries.length === 0 && malformed.length === 0) malformed.push(value);
  return { entries, malformed };
}

export function inspectSpineState({ repo = process.cwd() } = {}) {
  const requested = resolve(repo);
  if (!existsSync(requested)) throw new Error(`repository path does not exist: ${requested}`);
  const top = git(requested, ["rev-parse", "--show-toplevel"]);
  const root = top.ok && top.out ? resolve(top.out) : requested;

  const errors = [];
  const warnings = [];
  const capsules = [];
  const ignored = { checked: 0, ignored: 0 };
  const gitRepo = git(root, ["rev-parse", "--is-inside-work-tree"]);

  const capsuleRoot = join(root, ".krn", "runs", "delivery-loop");
  const ids = existsSync(capsuleRoot)
    ? readdirSync(capsuleRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && existsSync(join(capsuleRoot, entry.name, "state.md")))
        .map((entry) => entry.name)
        .sort()
    : [];

  const currentHead = gitRepo.ok ? git(root, ["rev-parse", "HEAD"]) : { ok: false, out: "" };

  for (const id of ids) {
    const relativePath = join(".krn", "runs", "delivery-loop", id, "state.md");
    const file = join(capsuleRoot, id, "state.md");
    capsules.push({ id, path: relativePath });
    const text = readFileSync(file, "utf8");
    const isIgnored = gitRepo.ok && git(root, ["check-ignore", "-q", relativePath]).ok;
    ignored.checked += 1;
    if (isIgnored) ignored.ignored += 1;
    else errors.push({ id, rule: "runs-not-ignored", detail: `${relativePath} is not git-ignored` });

    const fields = Object.fromEntries(ABI_LABELS.map((label) => [label, fieldOf(text, label)]));
    for (const [label, value] of Object.entries(fields)) {
      if (value === null || value === "") errors.push({ id, rule: "missing-field", detail: label });
    }

    const outcome = fields["Outcome state"];
    const publication = fields["Publication state"];
    const restart = fields["Restart state"];
    const cleanup = fields["Outstanding workflow-run cleanup"];
    const fixedPoint = fields["Repository base, HEAD or working-tree fingerprint, and dirty-state scope"];

    if (outcome && !OUTCOME_STATES.has(stripMarkup(outcome))) {
      errors.push({ id, rule: "invalid-outcome-state", detail: outcome });
    }
    if (publication && !PUBLICATION_STATES.has(stripMarkup(publication))) {
      errors.push({ id, rule: "invalid-publication-state", detail: publication });
    }

    if (restart && stripMarkup(restart) !== "ABSENT") {
      const restartPath = stripMarkup(restart);
      if (!existsSync(resolve(root, restartPath))) {
        errors.push({ id, rule: "restart-path-missing", detail: restartPath });
      }
    }

    if (cleanup && stripMarkup(cleanup).toLowerCase() !== "none") {
      const parsed = parseCleanup(cleanup);
      for (const entry of parsed.malformed) {
        errors.push({ id, rule: "malformed-cleanup", detail: entry });
      }
      for (const entry of parsed.entries) {
        if ((entry.state === "ACTIVE" || entry.state === "BLOCKED") && !existsSync(resolve(root, entry.pointer))) {
          errors.push({ id, rule: "ghost-cleanup-entry", detail: `${entry.pointer} (${entry.state})` });
        }
      }
    }

    if (fixedPoint) {
      const commits = [...new Set([...fixedPoint.matchAll(/\b[0-9a-f]{40}\b/gi)].map((match) => match[0].toLowerCase()))];
      let allValid = true;
      for (const commit of commits) {
        if (!git(root, ["cat-file", "-e", `${commit}^{commit}`]).ok) {
          errors.push({ id, rule: "invalid-fixed-point", detail: commit });
          allValid = false;
        }
      }
      if (allValid && currentHead.ok && commits.length > 0 && !commits.includes(currentHead.out.toLowerCase())) {
        warnings.push({
          id,
          rule: "stale-fixed-point",
          detail: `capsule records ${commits.join(", ")} but HEAD is ${currentHead.out}`,
        });
      }
    }

    if (outcome && stripMarkup(outcome) === "COMPLETE" && cleanup && stripMarkup(cleanup).toLowerCase() !== "none") {
      errors.push({ id, rule: "complete-with-cleanup", detail: "COMPLETE capsules must have no outstanding cleanup" });
    }
  }

  return {
    root,
    ignoredRuns: ignored.checked === 0 ? null : ignored.ignored === ignored.checked,
    capsules,
    errors,
    warnings,
    status: errors.length > 0 ? "divergent" : "clean",
  };
}
