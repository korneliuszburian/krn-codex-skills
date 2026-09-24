import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { sha256Hex } from "../kernel/digest.mjs";
import { runGitInput, runGitRaw } from "../kernel/git.mjs";

export const STATUSES = new Set(["ready", "claimed", "blocked", "in-review", "done", "abandoned", "deferred"]);
// `TERMINAL_STATUSES` cannot be closed again; `deferred` is parked, not terminal,
// but neither is open: a commit trailer names a ticket that was open when the
// commit was authored, so only the active lifecycle states warn.
export const TERMINAL_STATUSES = new Set(["done", "abandoned"]);
export const CLOSED_STATUSES = new Set([...TERMINAL_STATUSES, "deferred"]);
export const TYPES = new Set(["task", "bug", "refactor", "research", "decision", "epic"]);
export const REQUIRED = [
  "Id",
  "Title",
  "Status",
  "Type",
  "Repository-base",
  "Scope",
  "Deciding check",
  "Contract",
  "Acceptance",
  "Blocked by",
];
export const DEFAULT_DIRS = [".scratch", ".krn/tickets"];

const SIMPLE_CLAIM_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function claimLockPath(root, id) {
  const stableId = String(id ?? "");
  if (!stableId) throw new Error("ticket id is required for a claim lock");
  const lockId = SIMPLE_CLAIM_ID.test(stableId)
    ? stableId
    : `~${Buffer.from(stableId, "utf8").toString("hex")}`;
  return path.join(root, ".krn", "claims", `${lockId}.lock`);
}

export const DEFAULT_CLAIM_DURATION = 3600;
export const MAX_ATTEMPTS = 3;
export const ANCHOR_BYPASS = "allow-unanchored";

// Infrastructure configuration swings agent evals as much as model choice does,
// so a closure pins the measured environment. The host is reduced to a hash:
// the fingerprint must distinguish machines without naming or locating them.
const ENV_FINGERPRINT = /^host=[0-9a-f]{12,64}; cpu=\d+; mem=\d+; node=\S+$/;

// The lane runner already measures wall time and billed tokens, so a closure
// carries them on the Evidence value: upkeep versus outcome becomes a query.
const COST_RECORD = /(?:^|;\s*)Cost:\s*wall=(\d+(?:\.\d+)?)s;\s*tokens=(\d+)(?:;|$)/;

const PLACEHOLDER_RESOLUTIONS = new Set(["", "none", "n/a", "na", "tbd", "pending", "-"]);

export const INTEGRATED_ANCHOR = /(?:^|[;\s])integrated=([0-9a-f]{7,40})/i;
export const PATCH_ANCHOR = /(?:^|[;\s])patch=([0-9a-f]{40})/i;
const INTEGRATION_BRANCH = /(?:^|;\s*)branch=([^\s;]+)/i;
export const CONTRACT_DIRECTION = /:\s*(red|green)\s*->\s*(red|green)\s*$/i;
export const TEST_REF = /(?:^|\/)test\/|\.test\.(?:mjs|cjs|js)$/;

export function parseIntegrationRecord(value) {
  const legacyRaw = String(value ?? "").trim();
  if (!legacyRaw) return null;
  const branch = INTEGRATION_BRANCH.exec(legacyRaw)?.[1];
  if (!branch) return null;
  return {
    branch,
    sha: /(?:^|;\s*)sha=([0-9a-f]{40})/i.exec(legacyRaw)?.[1] ?? "",
    patch: /(?:^|;\s*)patch=([0-9a-f]{40})/i.exec(legacyRaw)?.[1] ?? "",
    legacyRaw,
  };
}

// The lane consumes the envelope through this binding map rather than its own
// copy of the field parser: the owner decides which fields become which shell
// variables, and `krn ticket env` renders the map for `eval`.
export function ticketLaneBindings(fields) {
  const get = (name) => fields?.get(name) ?? "";
  const bindings = [];
  const add = (name, value) => {
    if (String(value ?? "").trim() !== "") bindings.push([name, String(value)]);
  };
  add("BASE_REF", get("Repository-base"));
  add("CHANGED", get("Scope"));
  add("TICKET_ID", get("Id"));
  add("DECIDING_CHECK", get("Deciding check").replace(/^node\s+--test\s+/, "").trim());
  const contract = get("Contract").trim();
  const separator = contract.lastIndexOf(":");
  if (separator !== -1) {
    add("CONTRACT_REF", contract.slice(0, separator).trim());
    add("CONTRACT_DIR", contract.slice(separator + 1).trim());
  }
  const agent = /agent=([A-Za-z]+)/.exec(get("Execution"));
  if (agent) add("TICKET_AGENT", agent[1]);
  return bindings;
}

export function setField(text, name, value) {
  const start = text.indexOf("<krn-ticket>");
  const end = text.indexOf("</krn-ticket>");
  if (start === -1 || end === -1 || end < start) throw new Error("ticket has no complete <krn-ticket> block");
  const block = text.slice(start, end + "</krn-ticket>".length);
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");
  const updated = pattern.test(block)
    ? block.replace(pattern, `${name}: ${value}`)
    : block.replace("</krn-ticket>", `${name}: ${value}\n</krn-ticket>`);
  return text.slice(0, start) + updated + text.slice(end + "</krn-ticket>".length);
}

export function readValidTicket(file, parseTicketText) {
  const text = fs.readFileSync(file, "utf8");
  const { fields, findings } = parseTicketText(text);
  if (findings.length) throw new Error(`ticket is invalid: ${findings[0].message}`);
  return { text, fields };
}

export function rootForTicket(file) {
  const resolved = path.resolve(file);
  for (const dir of DEFAULT_DIRS) {
    const marker = `${path.sep}${dir.split("/").join(path.sep)}${path.sep}`;
    const index = resolved.lastIndexOf(marker);
    if (index > 0) return resolved.slice(0, index);
  }
  return path.dirname(resolved);
}

export function ticketBase(fields) {
  const value = (fields.get("Repository-base") ?? "").trim();
  return value && !/^none$/i.test(value) ? value : "";
}

export function blockerIds(value) {
  const raw = (value ?? "").trim();
  if (!raw || /^none$/i.test(raw)) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

// `git patch-id` only reads a patch from stdin, so it needs a runner that
// forwards input; runGitInput is the kernel owner for that.
function stablePatchId(root, diff) {
  if (typeof diff !== "string" || diff.trim() === "") return "";
  const result = runGitInput(root, ["patch-id", "--stable"], diff);
  if (!result.ok) return "";
  const line = result.out.split("\n").map((entry) => entry.trim()).find(Boolean);
  return line ? line.split(/\s+/)[0] : "";
}

// Bind the closure to a content identity: the ephemeral commit may vanish in a
// squash merge, but the patch id survives as the same content on the base.
export function integratedAnchor({ root, git, fields, head = "HEAD" }) {
  const resolved = git(root, ["rev-parse", head]);
  if (!resolved.ok) return null;
  const sha = resolved.out;
  const base = ticketBase(fields);
  let range = "";
  if (base) {
    const mergeBase = git(root, ["merge-base", base, head]);
    if (mergeBase.ok && mergeBase.out) range = `${mergeBase.out}..${head}`;
  }
  if (range) {
    const diff = git(root, ["diff", range]);
    return { sha, patch: stablePatchId(root, diff.ok ? diff.out : "") };
  }
  const show = git(root, ["show", "--format=", head]);
  return { sha, patch: stablePatchId(root, show.ok ? show.out : "") };
}

function splitPatchIds(output) {
  return String(output ?? "")
    .split("\n")
    .map((line) => line.split(/\s+/)[0])
    .filter((id) => /^[0-9a-f]{40}$/i.test(id));
}

export function rangePatchIds({ root, base, head }) {
  const ids = new Set();
  const log = runGitRaw(root, base ? ["log", "-p", `${base}..${head}`] : ["log", "-p", "-n", "200", head]);
  if (log.ok) for (const id of splitPatchIds(log.out)) ids.add(id);
  if (base) {
    const diff = runGitRaw(root, ["diff", `${base}..${head}`]);
    const combined = stablePatchId(root, diff.ok ? diff.out : "");
    if (combined) ids.add(combined);
  }
  return ids;
}

function claimField(claim, name) {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(claim ?? "")?.[1]?.trim();
}

function readClaimLock(lockPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// A claim is a lease, not a flag: it expires `duration` seconds after its last
// renewal. The lock file is the durable record, so it is overwritten on
// reclaim rather than deleted on release.
export function leaseExpired(claim, now) {
  const start = Date.parse(String(claim?.renew ?? claim?.at ?? ""));
  const duration = Number(claim?.duration);
  const nowMs = Date.parse(String(now ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(duration) || !Number.isFinite(nowMs)) return false;
  return nowMs >= start + duration * 1000;
}

export function claimLease({ fields, root, id }) {
  const claim = fields.get("Claim") ?? "";
  let renew = claimField(claim, "renew");
  let duration = claimField(claim, "duration");
  if (renew === undefined || duration === undefined) {
    const held = readClaimLock(claimLockPath(root, id));
    if (held) {
      renew = renew ?? held.renew;
      duration = duration ?? held.duration;
    }
  }
  if (renew === undefined || duration === undefined) return null;
  return { renew, duration: Number(duration) };
}

function claimAt(fields) {
  const match = /(?:^|;\s*)at=([^;\s]+)/.exec(fields.get("Claim") ?? "");
  return match ? match[1] : "";
}

function lastAttemptAt(fields) {
  const match = /(?:^|;\s*)at=([^;\s]+)/.exec(fields.get("Attempts") ?? "");
  return match ? match[1] : "";
}

// A re-claimed ticket whose ledger still ends under the previous claim has no
// attempt recorded since the current claim: the stall the runner has not seen.
export function stalledClaim(fields) {
  const claimed = claimAt(fields);
  const attempt = lastAttemptAt(fields);
  if (!claimed || !attempt) return null;
  const claimedMs = Date.parse(claimed);
  const attemptMs = Date.parse(attempt);
  if (!Number.isFinite(claimedMs) || !Number.isFinite(attemptMs) || attemptMs >= claimedMs) return null;
  return { claimed, attempt };
}

function attemptBlock(text) {
  const start = text.indexOf("<krn-ticket>");
  const end = text.indexOf("</krn-ticket>");
  if (start === -1 || end === -1 || end < start) throw new Error("ticket has no complete <krn-ticket> block");
  return { start, end, closeLength: "</krn-ticket>".length };
}

export function attemptCount(text) {
  const { start, end } = attemptBlock(text);
  let count = 0;
  for (const line of text.slice(start, end).split("\n")) {
    const match = /^Attempts:\s*count=(\d+)\b/.exec(line.trim());
    if (match) count = Math.max(count, Number(match[1]));
  }
  return count;
}

export function attemptLine({ count, signature, reason, at }) {
  const clean = String(reason ?? "").replace(/[\r\n]+/g, " ").trim() || "unknown";
  const sig = String(signature ?? "").replace(/[\r\n;]+/g, " ").trim();
  const parts = [`count=${count}`];
  if (sig) parts.push(`signature=${sig}`);
  parts.push(`reason=${clean}`, `at=${at}`);
  return `Attempts: ${parts.join("; ")}`;
}

// The ledger grows in place: each stalled session appends one Attempts token
// after the previous one, so the ticket itself is the retry counter.
export function appendAttempt(text, line) {
  const { start, end, closeLength } = attemptBlock(text);
  const block = text.slice(start, end + closeLength);
  let insert = -1;
  for (const match of block.matchAll(/^Attempts:.*$/gm)) insert = match.index + match[0].length;
  const updated = insert === -1
    ? block.replace(/\n?<\/krn-ticket>$/, `\n${line}\n</krn-ticket>`)
    : `${block.slice(0, insert)}\n${line}${block.slice(insert)}`;
  return text.slice(0, start) + updated + text.slice(end + closeLength);
}

// A runner-computed signature names the failure state of one attempt: opaque
// text the ticket only counts. Repeating it proves the retry added no new
// information, so the ledger itself can refuse to spend another lane.
export function repeatedSignature(text) {
  const counts = new Map();
  const { start, end } = attemptBlock(text);
  for (const line of text.slice(start, end).split("\n")) {
    if (!/^Attempts:\s*count=\d+\b/.test(line.trim())) continue;
    const signature = claimField(line.trim(), "signature");
    if (!signature) continue;
    counts.set(signature, (counts.get(signature) ?? 0) + 1);
  }
  let worst = null;
  for (const [signature, count] of counts) {
    if (!worst || count > worst.count) worst = { signature, count };
  }
  return worst;
}

export function costRecord({ wallSeconds, tokens }) {
  if (wallSeconds === undefined || wallSeconds === null || tokens === undefined || tokens === null) return "";
  const wall = Number(wallSeconds);
  const count = Number(tokens);
  if (!Number.isFinite(wall) || !Number.isFinite(count) || wall < 0 || count < 0) return "";
  return `Cost: wall=${wall}s; tokens=${count}`;
}

export function hasCostRecord(value) {
  return COST_RECORD.test(String(value ?? "").trim());
}

export function realResolution(value) {
  const clean = String(value ?? "").trim();
  return clean !== "" && !PLACEHOLDER_RESOLUTIONS.has(clean.toLowerCase());
}

export function envFingerprint({
  hostname = os.hostname(),
  cpus = os.cpus()?.length ?? 0,
  totalmem = os.totalmem(),
  node = process.versions.node,
} = {}) {
  const host = sha256Hex(String(hostname)).slice(0, 12);
  const mem = Math.round(totalmem / 1024 ** 3);
  return `host=${host}; cpu=${cpus}; mem=${mem}; node=${node}`;
}

export function hasEnvFingerprint(value) {
  return ENV_FINGERPRINT.test(String(value ?? "").trim());
}
