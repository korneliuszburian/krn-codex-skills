import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseChangeContract } from "../contract/change-contract.mjs";
import { runGit, runGitRaw } from "../support/git-cli.mjs";
import { writeAtomic } from "../support/write-atomic.mjs";

const STATUSES = new Set(["ready", "claimed", "blocked", "in-review", "done", "abandoned", "deferred"]);
const TYPES = new Set(["task", "bug", "refactor", "research", "decision", "epic"]);
const REQUIRED = [
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
const DEFAULT_DIRS = [".scratch", ".krn/tickets"];

export function parseTicketText(text) {
  const start = text.indexOf("<krn-ticket>");
  const end = text.indexOf("</krn-ticket>");
  if (start === -1 || end === -1 || end < start) {
    return { fields: null, findings: [{ rule: "missing-block", message: "no complete <krn-ticket> block" }] };
  }
  const fields = new Map();
  for (const line of text.slice(start + "<krn-ticket>".length, end).split("\n")) {
    const match = /^([A-Za-z][A-Za-z ()-]*):\s*(.*)$/.exec(line.trim());
    if (match) fields.set(match[1], match[2].trim());
  }
  const findings = [];
  for (const name of REQUIRED) {
    if (!fields.has(name) || fields.get(name) === "") findings.push({ rule: "missing-field", message: `missing field: ${name}` });
  }
  const status = fields.get("Status");
  if (status && !STATUSES.has(status)) findings.push({ rule: "invalid-status", message: `unknown Status "${status}"` });
  const type = fields.get("Type");
  if (type && !TYPES.has(type)) findings.push({ rule: "invalid-type", message: `unknown Type "${type}"` });
  return { fields, findings };
}

function setField(text, name, value) {
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

function readValidTicket(file) {
  const text = fs.readFileSync(file, "utf8");
  const { fields, findings } = parseTicketText(text);
  if (findings.length) throw new Error(`ticket is invalid: ${findings[0].message}`);
  return { text, fields };
}

function rootForTicket(file) {
  const resolved = path.resolve(file);
  for (const dir of DEFAULT_DIRS) {
    const marker = `${path.sep}${dir.split("/").join(path.sep)}${path.sep}`;
    const index = resolved.lastIndexOf(marker);
    if (index > 0) return resolved.slice(0, index);
  }
  return path.dirname(resolved);
}

function nextEpoch(fields) {
  const match = /(?:^|;\s*)epoch=(\d+)/.exec(fields.get("Claim") ?? "");
  return match ? Number(match[1]) + 1 : 1;
}

const DEFAULT_CLAIM_DURATION = 3600;

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
function leaseExpired(claim, now) {
  const start = Date.parse(String(claim?.renew ?? claim?.at ?? ""));
  const duration = Number(claim?.duration);
  const nowMs = Date.parse(String(now ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(duration) || !Number.isFinite(nowMs)) return false;
  return nowMs >= start + duration * 1000;
}

function claimField(claim, name) {
  return new RegExp(`(?:^|;\\s*)${name}=([^;]*)`).exec(claim ?? "")?.[1]?.trim();
}

function claimLease({ fields, root, id }) {
  const claim = fields.get("Claim") ?? "";
  let renew = claimField(claim, "renew");
  let duration = claimField(claim, "duration");
  if (renew === undefined || duration === undefined) {
    const held = readClaimLock(path.join(root, ".krn", "claims", `${id}.lock`));
    if (held) {
      renew = renew ?? held.renew;
      duration = duration ?? held.duration;
    }
  }
  if (renew === undefined || duration === undefined) return null;
  return { renew, duration: Number(duration) };
}

const INTEGRATED_ANCHOR = /(?:^|[;\s])integrated=([0-9a-f]{7,40})/i;
const PATCH_ANCHOR = /(?:^|[;\s])patch=([0-9a-f]{40})/i;

// `git patch-id` only reads a patch from stdin, so it needs a runner that
// forwards input; runGit deliberately does not expose one.
function gitWithInput(root, args, input) {
  try {
    return {
      ok: true,
      out: execFileSync("git", ["-C", root, ...args], {
        input,
        encoding: "utf8",
        maxBuffer: 512 * 1024 * 1024,
        timeout: 600_000,
        killSignal: "SIGKILL",
      }).trim(),
    };
  } catch (error) {
    return { ok: false, out: typeof error?.stdout === "string" ? error.stdout : "" };
  }
}

function stablePatchId(root, diff) {
  if (typeof diff !== "string" || diff.trim() === "") return "";
  const result = gitWithInput(root, ["patch-id", "--stable"], diff);
  if (!result.ok) return "";
  const line = result.out.split("\n").map((entry) => entry.trim()).find(Boolean);
  return line ? line.split(/\s+/)[0] : "";
}

function ticketBase(fields) {
  const value = (fields.get("Repository-base") ?? "").trim();
  return value && !/^none$/i.test(value) ? value : "";
}

// Bind the closure to a content identity: the ephemeral commit may vanish in a
// squash merge, but the patch id survives as the same content on the base.
function integratedAnchor({ root, git, fields, head = "HEAD" }) {
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

function rangePatchIds({ root, base, head }) {
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

function anchorError(ticket, head) {
  const evidence = ticket.fields.get("Evidence") ?? "";
  const integrated = INTEGRATED_ANCHOR.exec(evidence);
  if (!integrated) {
    return { path: ticket.path, rule: "evidence-anchor-missing", message: `ticket "${ticket.id}" is done without an integrated=<sha> anchor` };
  }
  return {
    sha: integrated[1],
    patch: PATCH_ANCHOR.exec(evidence)?.[1] ?? "",
    path: ticket.path,
    message: `ticket "${ticket.id}" anchor ${integrated[1]} is not an ancestor of ${head}`,
  };
}

function anchorErrors({ root, git, ticket, base, head }) {
  const anchor = anchorError(ticket, head);
  if (!anchor.sha) return [anchor];
  if (git(root, ["merge-base", "--is-ancestor", anchor.sha, head]).ok) return [];
  if (anchor.patch && rangePatchIds({ root, base, head }).has(anchor.patch)) return [];
  return [{ path: anchor.path, rule: "evidence-anchor-missing", message: `${anchor.message} and its patch id is absent from the range` }];
}

export function claimTicket({ file, root, id, worker, session = "", at = new Date().toISOString(), duration = DEFAULT_CLAIM_DURATION, observer } = {}) {
  const claimRoot = root ?? rootForTicket(file);
  const ticketId = id ?? readValidTicket(file).fields.get("Id");
  const lockPath = path.join(claimRoot, ".krn", "claims", `${ticketId}.lock`);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const { text, fields } = readValidTicket(file);
  const held = readClaimLock(lockPath);
  const status = fields.get("Status");
  if (status === "ready") {
    if (held && !leaseExpired(held, at)) throw new Error(`ticket ${ticketId} is already-claimed`);
  } else if (status === "claimed" && held) {
    if (!leaseExpired(held, at)) throw new Error(`ticket ${ticketId} is already-claimed`);
  } else {
    throw new Error(`ticket ${ticketId} is not ready (Status: ${status})`);
  }
  let handle = null;
  try {
    if (!held) {
      try {
        handle = fs.openSync(lockPath, "wx");
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const raced = readClaimLock(lockPath);
        if (raced && !leaseExpired(raced, at)) throw new Error(`ticket ${ticketId} is already-claimed`);
      }
    }
    const epoch = Math.max(nextEpoch(fields), (Number(held?.epoch) || 0) + 1);
    const claim = { worker, session, at, epoch, renew: at, duration };
    writeAtomic(lockPath, JSON.stringify(claim));
    observer?.({ id: ticketId, lockPath, claim });
    let next = setField(text, "Status", "claimed");
    next = setField(next, "Claim", `worker=${worker}; session=${session}; at=${at}; epoch=${epoch}; renew=${at}; duration=${duration}`);
    writeAtomic(file, next);
    return { id: ticketId, path: file, status: "claimed", claim };
  } finally {
    if (handle !== null) fs.closeSync(handle);
  }
}

const MAX_ATTEMPTS = 3;

function attemptBlock(text) {
  const start = text.indexOf("<krn-ticket>");
  const end = text.indexOf("</krn-ticket>");
  if (start === -1 || end === -1 || end < start) throw new Error("ticket has no complete <krn-ticket> block");
  return { start, end, closeLength: "</krn-ticket>".length };
}

function attemptCount(text) {
  const { start, end } = attemptBlock(text);
  let count = 0;
  for (const line of text.slice(start, end).split("\n")) {
    const match = /^Attempts:\s*count=(\d+)\b/.exec(line.trim());
    if (match) count = Math.max(count, Number(match[1]));
  }
  return count;
}

function attemptLine({ count, signature, reason, at }) {
  const clean = String(reason ?? "").replace(/[\r\n]+/g, " ").trim() || "unknown";
  const sig = String(signature ?? "").replace(/[\r\n;]+/g, " ").trim();
  const parts = [`count=${count}`];
  if (sig) parts.push(`signature=${sig}`);
  parts.push(`reason=${clean}`, `at=${at}`);
  return `Attempts: ${parts.join("; ")}`;
}

// The ledger grows in place: each stalled session appends one Attempts token
// after the previous one, so the ticket itself is the retry counter.
function appendAttempt(text, line) {
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
function repeatedSignature(text) {
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

export function recordAttempt({ file, signature = "", reason = "unknown", at = new Date().toISOString() } = {}) {
  const { text, fields } = readValidTicket(file);
  const id = fields.get("Id");
  const status = fields.get("Status");
  if (status !== "claimed") throw new Error(`ticket ${id} cannot record an attempt (Status: ${status})`);
  const count = attemptCount(text) + 1;
  const exhausted = count >= MAX_ATTEMPTS;
  const cleanSignature = String(signature ?? "").replace(/[\r\n;]+/g, " ").trim();
  let next = appendAttempt(text, attemptLine({ count, signature: cleanSignature, reason, at }));
  if (exhausted) {
    next = setField(next, "Status", "blocked");
    next = setField(next, "Gate", "retries-exhausted");
  }
  writeAtomic(file, next);
  return {
    id,
    path: file,
    status: exhausted ? "blocked" : "claimed",
    attempts: count,
    signature: cleanSignature || null,
    gate: exhausted ? "retries-exhausted" : null,
  };
}

// Infrastructure configuration swings agent evals as much as model choice does,
// so a closure pins the measured environment. The host is reduced to a hash:
// the fingerprint must distinguish machines without naming or locating them.
const ENV_FINGERPRINT = /^host=[0-9a-f]{12,64}; cpu=\d+; mem=\d+; node=\S+$/;

export function envFingerprint({
  hostname = os.hostname(),
  cpus = os.cpus()?.length ?? 0,
  totalmem = os.totalmem(),
  node = process.versions.node,
} = {}) {
  const host = createHash("sha256").update(String(hostname)).digest("hex").slice(0, 12);
  const mem = Math.round(totalmem / 1024 ** 3);
  return `host=${host}; cpu=${cpus}; mem=${mem}; node=${node}`;
}

export function hasEnvFingerprint(value) {
  return ENV_FINGERPRINT.test(String(value ?? "").trim());
}

// The lane runner already measures wall time and billed tokens, so a closure
// carries them on the Evidence value: upkeep versus outcome becomes a query.
const COST_RECORD = /(?:^|;\s*)Cost:\s*wall=(\d+(?:\.\d+)?)s;\s*tokens=(\d+)(?:;|$)/;

function costRecord({ wallSeconds, tokens }) {
  if (wallSeconds === undefined || wallSeconds === null || tokens === undefined || tokens === null) return "";
  const wall = Number(wallSeconds);
  const count = Number(tokens);
  if (!Number.isFinite(wall) || !Number.isFinite(count) || wall < 0 || count < 0) return "";
  return `Cost: wall=${wall}s; tokens=${count}`;
}

function hasCostRecord(value) {
  return COST_RECORD.test(String(value ?? "").trim());
}

const ANCHOR_BYPASS = "allow-unanchored";

export function closeTicket({ file, root, git = runGit, evidence = "none", resolution = "none", at = new Date().toISOString(), base, head = "HEAD", env = envFingerprint(), wallSeconds, tokens, allowUnanchored = false }) {
  const { text, fields } = readValidTicket(file);
  const status = fields.get("Status");
  if (status === "done" || status === "abandoned") throw new Error(`ticket ${fields.get("Id")} is already terminal (Status: ${status})`);
  const anchorRoot = root ?? rootForTicket(file);
  const ticket = { id: fields.get("Id"), path: file, fields };
  // Closing consumes the same scope and contract verdicts the lane used, so a
  // closure cannot be written over a diff or trailer `ticket check` rejects.
  // The base is resolved from the ticket when the caller omits it: an
  // unresolved base is a refusal, never a silent skip. A working tree outside
  // any repository has no range to audit, so it keeps the legacy write path.
  const inRepo = git(anchorRoot, ["rev-parse", "--git-dir"]).ok;
  if (inRepo && !allowUnanchored) {
    const resolvedBase = base ?? ticketBase(fields);
    if (!baseRefExists({ root: anchorRoot, git, base: resolvedBase })) {
      throw new Error(`ticket ${ticket.id} cannot close: close-base-unresolved: cannot resolve Repository-base "${resolvedBase || "(missing)"}"`);
    }
    const body = git(anchorRoot, ["show", "-s", "--format=%B", head]);
    if (!body.ok || !namesTicket(body.out, ticket.id)) {
      throw new Error(`ticket ${ticket.id} cannot close: close-anchor-missing: head commit ${head} carries no "Ticket: ${ticket.id}" trailer`);
    }
    const violations = [
      ...scopeErrors({ root: anchorRoot, git, ticket, base: resolvedBase, head }),
      ...contractErrors({ root: anchorRoot, git, ticket, head }),
    ];
    if (violations.length > 0) {
      throw new Error(`ticket ${ticket.id} cannot close: ${violations.map((entry) => `${entry.rule}: ${entry.message}`).join("; ")}`);
    }
  }
  const anchor = integratedAnchor({ root: anchorRoot, git, fields });
  const cost = costRecord({ wallSeconds, tokens });
  let evidenceLine = anchor ? `${evidence}; integrated=${anchor.sha}; patch=${anchor.patch}` : evidence;
  if (cost) evidenceLine = `${evidenceLine}; ${cost}`;
  const recorded = allowUnanchored ? `${resolution}; bypass=${ANCHOR_BYPASS}` : resolution;
  let next = setField(text, "Status", "done");
  next = setField(next, "Evidence", evidenceLine);
  next = setField(next, "Env", env);
  next = setField(next, "Resolution", `${recorded} (closed ${at})`);
  writeAtomic(file, next);
  return { id: fields.get("Id"), path: file, status: "done", anchor };
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
function stalledClaim(fields) {
  const claimed = claimAt(fields);
  const attempt = lastAttemptAt(fields);
  if (!claimed || !attempt) return null;
  const claimedMs = Date.parse(claimed);
  const attemptMs = Date.parse(attempt);
  if (!Number.isFinite(claimedMs) || !Number.isFinite(attemptMs) || attemptMs >= claimedMs) return null;
  return { claimed, attempt };
}

export function findTicketFile({ root, dirs = DEFAULT_DIRS, id } = {}) {
  for (const file of markdownFiles(root, dirs)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("<krn-ticket>")) continue;
    const { fields } = parseTicketText(text);
    if (fields?.get("Id") === id) return file;
  }
  throw new Error(`no ticket with id "${id}" under ${dirs.join(", ")}`);
}

function markdownFiles(root, dirs) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
    }
  };
  for (const dir of dirs) walk(path.join(root, dir));
  return files.sort();
}

function blockerIds(value) {
  const raw = (value ?? "").trim();
  if (!raw || /^none$/i.test(raw)) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function scopeEntries(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/^\.\//, ""))
    .filter(Boolean);
}

function globToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function scopeDeclares(entry, file) {
  if (entry.endsWith("/")) return file.startsWith(entry);
  if (/[*?]/.test(entry)) return globToRegExp(entry).test(file);
  return file === entry || file.startsWith(`${entry}/`);
}

function scopeErrors({ root, git, ticket, base, head }) {
  const errors = [];
  const scope = scopeEntries(ticket.fields.get("Scope"));
  const diff = git(root, ["-c", "core.quotePath=false", "diff", "--name-only", `${base}..${head}`]);
  if (!diff.ok) {
    errors.push({ path: ticket.path, rule: "scope-diff-unavailable", message: `cannot diff ${base}..${head}` });
    return errors;
  }
  for (const file of diff.out.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
    if (!scope.some((entry) => scopeDeclares(entry, file))) {
      errors.push({ path: ticket.path, rule: "scope-undeclared", message: `changed file outside Scope: ${file}` });
    }
  }
  return errors;
}

const CONTRACT_DIRECTION = /:\s*(red|green)\s*->\s*(red|green)\s*$/i;

function contractRef(value) {
  return String(value ?? "").trim().replace(/^\.\//, "").replace(CONTRACT_DIRECTION, "").trim();
}

function namesTicket(body, id) {
  return String(body ?? "")
    .split("\n")
    .some((line) => /^Ticket:\s*(\S+)\s*$/.exec(line.trim())?.[1] === id);
}

// The lane gate trusted the worker's own `Change-contract` trailer, so a
// renamed observer passed unremarked. Cross-check the trailer on the ticket's
// own head commit against the envelope's declared Contract ref.
function contractErrors({ root, git, ticket, head }) {
  const declared = (ticket.fields.get("Contract") ?? "").trim();
  if (!declared || !contractRef(declared)) return [];
  const body = git(root, ["show", "-s", "--format=%B", head]);
  if (!body.ok || !namesTicket(body.out, ticket.id)) return [];
  if (!/^(?:Change-contract|Prediction):/im.test(body.out)) {
    return [{ path: ticket.path, rule: "contract-missing", message: `head commit ${head} carries no Change-contract trailer; the ticket declares "${declared}"` }];
  }
  const refs = parseChangeContract(body.out).contracts.map((entry) => contractRef(entry.ref)).filter(Boolean);
  if (!refs.includes(contractRef(declared))) {
    return [{ path: ticket.path, rule: "contract-mismatch", message: `head commit contract "${refs.join(", ")}" does not name the ticket Contract "${declared}"` }];
  }
  return [];
}

const TEST_REF = /(?:^|\/)test\/|\.test\.(?:mjs|cjs|js)$/;

function baseRefExists({ root, git, base }) {
  return Boolean(base) && git(root, ["cat-file", "-e", `${base}^{commit}`]).ok;
}

function absentAtBase({ root, git, base, file }) {
  if (!base || !file || !baseRefExists({ root, git, base })) return false;
  return !git(root, ["cat-file", "-e", `${base}:${file}`]).ok;
}

function presentAtBase({ root, git, base, file }) {
  if (!base || !file || !baseRefExists({ root, git, base })) return false;
  return git(root, ["cat-file", "-e", `${base}:${file}`]).ok;
}

function contractDirection(value) {
  const match = CONTRACT_DIRECTION.exec(String(value ?? "").trim());
  return match ? { from: match[1].toLowerCase(), to: match[2].toLowerCase() } : null;
}

function namesNewObserver(acceptance, ref) {
  const text = String(acceptance ?? "");
  return /\bnew observer\b/i.test(text) || (ref !== "" && text.includes(ref));
}

function envelopeLintErrors({ root, git, ticket }) {
  const errors = [];
  const base = ticketBase(ticket.fields);
  const ref = contractRef(ticket.fields.get("Contract"));
  if (!base || !ref || !TEST_REF.test(ref)) return errors;
  // An existing observer already passes at base, so `red->green` cannot be the
  // closure's transition: the lane preflight refuses it as already-passing.
  const direction = contractDirection(ticket.fields.get("Contract"));
  if (presentAtBase({ root, git, base, file: ref })) {
    if (direction?.from === "red" && direction?.to === "green") {
      errors.push({
        path: ticket.path,
        rule: "existing-check-red-flip",
        message: `ticket "${ticket.id}" Contract names existing test file "${ref}" with direction red->green; it already passes at ${base}, so the lane preflight refuses it`,
      });
    }
    return errors;
  }
  if (!absentAtBase({ root, git, base, file: ref })) return errors;
  const scope = scopeEntries(ticket.fields.get("Scope"));
  if (!scope.some((entry) => scopeDeclares(entry, "package.json"))) {
    errors.push({
      path: ticket.path,
      rule: "scope-missing-package-json",
      message: `ticket "${ticket.id}" Contract names new test file "${ref}"; wire it into test:lib and add package.json to Scope`,
    });
  }
  if (!namesNewObserver(ticket.fields.get("Acceptance"), ref)) {
    errors.push({
      path: ticket.path,
      rule: "contract-ref-new",
      message: `ticket "${ticket.id}" Contract ref "${ref}" is absent from ${base}; Acceptance must name the new observer`,
    });
  }
  return errors;
}

export function checkTickets({ root, dirs = DEFAULT_DIRS, git = runGit, id, base, head = "HEAD", now = new Date().toISOString() } = {}) {
  const tickets = [];
  const errors = [];
  const warnings = [];
  for (const file of markdownFiles(root, dirs)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("<krn-ticket>")) continue;
    const relative = path.relative(root, file);
    const { fields, findings } = parseTicketText(text);
    for (const finding of findings) errors.push({ path: relative, ...finding });
    if (!fields) continue;
    tickets.push({
      id: fields.get("Id"),
      path: relative,
      status: fields.get("Status"),
      blockedBy: blockerIds(fields.get("Blocked by")),
      fields,
      text,
    });
  }
  const byId = new Map();
  for (const ticket of tickets) {
    if (byId.has(ticket.id)) {
      errors.push({ path: ticket.path, rule: "duplicate-id", message: `duplicate ticket id "${ticket.id}"` });
    } else {
      byId.set(ticket.id, ticket);
    }
  }
  if (id && base) {
    const scoped = byId.get(id);
    if (!scoped) errors.push({ rule: "unknown-ticket", message: `no ticket with id "${id}"` });
    else {
      errors.push(...scopeErrors({ root, git, ticket: scoped, base, head }));
      errors.push(...contractErrors({ root, git, ticket: scoped, head }));
    }
  }
  for (const ticket of tickets) {
    for (const blocker of ticket.blockedBy) {
      if (!byId.has(blocker)) {
        errors.push({ path: ticket.path, rule: "unknown-blocker", message: `Blocked by names unknown ticket "${blocker}"` });
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (ticket, trail) => {
    if (visited.has(ticket.id)) return;
    if (visiting.has(ticket.id)) {
      errors.push({ path: ticket.path, rule: "dependency-cycle", message: `dependency cycle: ${[...trail, ticket.id].join(" -> ")}` });
      return;
    }
    visiting.add(ticket.id);
    for (const blocker of ticket.blockedBy) {
      const next = byId.get(blocker);
      if (next) visit(next, [...trail, ticket.id]);
    }
    visiting.delete(ticket.id);
    visited.add(ticket.id);
  };
  for (const ticket of tickets) visit(ticket, []);
  const isDone = (id) => byId.get(id)?.status === "done";
  const frontier = tickets
    .filter((ticket) => ticket.status === "ready" && ticket.blockedBy.every(isDone))
    .map((ticket) => ticket.id)
    .sort();
  const trailered = new Set();
  const gitRepo = git(root, ["rev-parse", "--git-dir"]).ok;
  if (gitRepo) {
    const log = git(root, ["log", "-n", "200", "--format=%B"]);
    if (log.ok) {
      for (const match of log.out.matchAll(/^Ticket:\s*(\S+)\s*$/gim)) trailered.add(match[1]);
    }
    for (const ticket of tickets) {
      if (ticket.status === "done") errors.push(...anchorErrors({ root, git, ticket, base, head }));
    }
  }
  for (const id of trailered) {
    const ticket = byId.get(id);
    if (!ticket) warnings.push({ rule: "orphan-commit-ticket", message: `commit names unknown ticket "${id}"` });
    else if (ticket.status !== "done") warnings.push({ path: ticket.path, rule: "open-ticket-committed", message: `commits exist for open ticket "${id}"` });
  }
  for (const ticket of tickets) {
    if (!id && ticket.status === "ready") errors.push(...envelopeLintErrors({ root, git, ticket }));
    if (ticket.status === "done" && !trailered.has(ticket.id)) {
      warnings.push({ path: ticket.path, rule: "done-without-commit", message: `ticket "${ticket.id}" is done with no Ticket trailer in recent commits` });
    }
    if (ticket.status === "done" && !hasEnvFingerprint(ticket.fields.get("Env"))) {
      warnings.push({ path: ticket.path, rule: "missing-env-fingerprint", message: `ticket "${ticket.id}" is done without an Env fingerprint` });
    }
    if (ticket.status === "done" && !hasCostRecord(ticket.fields.get("Evidence"))) {
      warnings.push({ path: ticket.path, rule: "missing-cost", message: `ticket "${ticket.id}" is done without a wall/token cost record` });
    }
    if (ticket.status === "claimed") {
      const lease = claimLease({ fields: ticket.fields, root, id: ticket.id });
      if (lease && leaseExpired(lease, now)) {
        warnings.push({
          path: ticket.path,
          rule: "claim-expired",
          message: `ticket "${ticket.id}" lease expired (renew=${lease.renew}, duration=${lease.duration}s)`,
        });
      }
      const stalled = stalledClaim(ticket.fields);
      if (stalled) {
        warnings.push({
          path: ticket.path,
          rule: "stalled-claim",
          message: `ticket "${ticket.id}" was claimed at ${stalled.claimed} but its last attempt is older (${stalled.attempt})`,
        });
      }
    }
    const repeated = repeatedSignature(ticket.text);
    if (repeated && repeated.count >= MAX_ATTEMPTS) {
      errors.push({
        path: ticket.path,
        rule: "stalled-signature",
        message: `ticket "${ticket.id}" repeated attempt signature "${repeated.signature}" ${repeated.count} times`,
      });
    } else if (repeated && repeated.count >= 2) {
      warnings.push({
        path: ticket.path,
        rule: "repeated-attempt-signature",
        message: `ticket "${ticket.id}" repeated attempt signature "${repeated.signature}" (${repeated.count} attempts)`,
      });
    }
  }
  return { root, tickets: tickets.map(({ fields, text, ...rest }) => rest), frontier, errors, warnings };
}
