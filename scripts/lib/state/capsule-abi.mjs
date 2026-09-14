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

export const OUTCOME_STATES = new Set([
  "ACTIVE",
  "BLOCKED",
  "DEFERRED",
  "NEEDS_REVIEW",
  "COMPLETE",
  "SUPERSEDED",
  "ABANDONED",
]);

export const PUBLICATION_STATES = new Set([
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

export function fieldLine(text, label) {
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith(`${label}:`)) return line.trimStart().slice(label.length + 1).trim();
  }
  return null;
}

export function stripMarkup(value) {
  return value.replace(/[`<>]/g, "").trim();
}

export function parseCleanup(value) {
  if (typeof value !== "string") return { entries: [], malformed: [] };
  const trimmedValue = value.trim();
  if (/^none$/i.test(trimmedValue)) return { entries: [], malformed: [] };
  if (!trimmedValue.startsWith("[")) return { entries: [], malformed: [value] };
  const open = value.indexOf("[");
  const close = value.lastIndexOf("]");
  if (close <= open) return { entries: [], malformed: [value] };
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
    entries.push({ pointer: parts[0], workflow: parts[1], consumer: parts[2], trigger: parts[3], state: parts[4] });
  }
  if (entries.length === 0 && malformed.length === 0) malformed.push(value);
  return { entries, malformed };
}

const COMMIT_ANCHOR = /\b(base|HEAD|fingerprint)\s*=\s*([0-9a-f]{40}|[0-9a-f]{64})\b/gi;

export function renderCapsule(values) {
  const missing = ABI_LABELS.filter((label) => values[label] === undefined || values[label] === null);
  if (missing.length > 0) throw new Error(`capsule values missing labels: ${missing.join(", ")}`);
  return ABI_LABELS.map((label) => `${label}: ${values[label]}`).join("\n");
}

export function fixedPointAnchors(value) {
  const anchors = { base: null, head: null, fingerprint: null };
  if (!value) return anchors;
  for (const match of value.replace(/[<>`]/g, "").matchAll(COMMIT_ANCHOR)) {
    const key = match[1].toLowerCase() === "head" ? "head" : match[1].toLowerCase();
    anchors[key] = match[2].toLowerCase();
  }
  return anchors;
}
