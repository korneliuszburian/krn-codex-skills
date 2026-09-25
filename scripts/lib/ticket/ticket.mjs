
import fs from "node:fs";
import path from "node:path";

import { runGit } from "../kernel/git.mjs";
import { walkFiles } from "../kernel/walk.mjs";
import { writeAtomic } from "../support/write-atomic.mjs";

import {
  ANCHOR_BYPASS,
  DEFAULT_CLAIM_DURATION,
  DEFAULT_DIRS,
  MAX_ATTEMPTS,
  REQUIRED,
  STATUSES,
  TERMINAL_STATUSES,
  TYPES,
  appendAttempt,
  attemptCount,
  attemptLine,
  blockerIds,
  claimLockPath,
  costRecord,
  envFingerprint,
  integratedAnchor,
  leaseExpired,
  readValidTicket,
  realResolution,
  rootForTicket,
  setField,
  ticketBase,
  ticketLaneBindings,
} from "./ticket-abi.mjs";
import { baseRefExists, checkTickets as checkTicketsImpl, contractErrors, namesTicket, scopeErrors } from "./ticket-check.mjs";
import { findTicketFile as findTicketFileImpl, reconcileTickets as reconcileTicketsImpl } from "./ticket-reconcile.mjs";
import { readActiveTaskStoreSnapshot, withLegacyQueueWrite } from "./task-store.mjs";

export { ticketLaneBindings };

export function parseTicketText(text) {
  const occurrences = parseTicketFieldOccurrences(text);
  if (!occurrences) {
    return { fields: null, findings: [{ rule: "missing-block", message: "no complete <krn-ticket> block" }] };
  }
  const fields = new Map(occurrences);
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

export function parseTicketFieldOccurrences(text) {
  const start = text.indexOf("<krn-ticket>");
  const end = text.indexOf("</krn-ticket>");
  if (start === -1 || end === -1 || end < start) {
    return null;
  }
  const occurrences = [];
  for (const line of text.slice(start + "<krn-ticket>".length, end).split("\n")) {
    const match = /^([A-Za-z][A-Za-z ()-]*):\s*(.*)$/.exec(line.trim());
    if (match) occurrences.push([match[1], match[2].trim()]);
  }
  return occurrences;
}

export function taskTicketView(task) {
  const fields = new Map();
  const occurrences = new Map();
  for (const [name, supplied] of Object.entries(task.legacyFields ?? {})) {
    const values = (Array.isArray(supplied) ? supplied : [supplied]).map((value) => String(value));
    if (values.length === 0) continue;
    fields.set(name, values[values.length - 1]);
    occurrences.set(name, values);
  }
  const set = (name, value) => {
    if (value === null || value === undefined) return;
    const text = String(value);
    fields.set(name, text);
    occurrences.set(name, [text]);
  };
  set("Id", task.id);
  set("Title", task.title);
  set("Status", task.status);
  set("Type", task.type ?? "task");
  set("Blocked by", task.dependencies?.join(", ") || "none");
  set("Repository-base", task.laneRecipe?.base);
  set("Scope", task.laneRecipe?.scope);
  set("Deciding check", task.laneRecipe?.check);
  set("Contract", task.laneRecipe?.contract);
  set("Acceptance", task.laneRecipe?.acceptance);
  set("Integration", task.integration?.legacyRaw);
  set("Gate", task.gate?.legacyRaw);
  set("Execution", task.executionHint?.legacyRaw ?? (task.executionHint ? `agent=${task.executionHint.agentHint}` : null));
  const attempts = task.attempts ?? [];
  if (attempts.length > 0) {
    const previousAttempts = occurrences.get("Attempts") ?? [];
    const currentAttempts = attempts.map((attempt) => [
      `count=${attempt.count}`,
      ...(attempt.signature ? [`signature=${attempt.signature}`] : []),
      `reason=${attempt.reason}`,
      `at=${attempt.at}`,
    ].join("; "));
    occurrences.set("Attempts", [...previousAttempts, ...currentAttempts]);
    fields.set("Attempts", currentAttempts[currentAttempts.length - 1]);
  }
  if (task.status === "claimed" && task.lease) {
    const { worker = "", session = "", at = "", epoch = "", renew = "", duration = "" } = task.lease;
    set("Claim", `worker=${worker}; session=${session}; at=${at}; epoch=${epoch}; renew=${renew}; duration=${duration}`);
  }
  if (task.status === "done" && task.result?.operationId && task.result?.effectObject) {
    const evidence = fields.get("Evidence") ?? "";
    set(
      "Evidence",
      /integrated=[0-9a-f]{40}/.test(evidence)
        ? evidence.replace(/integrated=[0-9a-f]{40}/, `integrated=${task.result.effectObject}`)
        : `${evidence}${evidence ? "; " : ""}integrated=${task.result.effectObject}`,
    );
  }
  const lines = ["<krn-ticket>"];
  for (const [name, value] of fields) {
    for (const occurrence of occurrences.get(name) ?? [value]) lines.push(`${name}: ${occurrence}`);
  }
  lines.push("</krn-ticket>");
  return {
    id: task.id,
    path: task.sourcePath || task.id,
    status: task.status,
    blockedBy: [...(task.dependencies ?? [])],
    fields,
    text: lines.join("\n"),
    body: task.body ?? "",
    comments: task.comments ?? [],
    history: task.history ?? [],
    taskStore: true,
    lane: task.lane === true,
    legacyCloseProofRequired: task.legacyCloseProofRequired === true,
    gateKind: task.gate?.kind ?? null,
    taskLease: task.lease ?? null,
    taskResult: task.result ?? null,
  };
}

function nextEpoch(fields) {
  const match = /(?:^|;\s*)epoch=(\d+)/.exec(fields.get("Claim") ?? "");
  return match ? Number(match[1]) + 1 : 1;
}

// The lenient reader above cannot tell an absent lock from an empty or corrupt
// one, which is fine for lease lookups but not for the claim itself. The claim
// must fail closed: an existing-but-unreadable lock never grants a fresh epoch.
function readClaimLockStrict(lockPath) {
  let raw;
  try {
    raw = fs.readFileSync(lockPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { status: "absent" };
    return { status: "invalid", reason: `cannot read ${lockPath}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "invalid", reason: `${lockPath} is empty or unparseable` };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { status: "invalid", reason: `${lockPath} is empty or unparseable` };
  }
  return { status: "held", value: parsed };
}

export function claimTicket(options = {}) {
  return withLegacyQueueWrite(options.root ?? rootForTicket(options.file), "claim", () => claimTicketUnlocked(options));
}

function claimTicketUnlocked({ file, root, id, worker, session = "", at = new Date().toISOString(), duration = DEFAULT_CLAIM_DURATION, observer } = {}) {
  const claimRoot = root ?? rootForTicket(file);
  const ticketId = id ?? readValidTicket(file, parseTicketText).fields.get("Id");
  const lockPath = claimLockPath(claimRoot, ticketId);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const { text, fields } = readValidTicket(file, parseTicketText);
  assertClaimUnblocked({ file, root: claimRoot, fields });
  const lockState = readClaimLockStrict(lockPath);
  if (lockState.status === "invalid") {
    throw new Error(`ticket ${ticketId} cannot claim: claim-lock-unreadable: ${lockState.reason}`);
  }
  const held = lockState.status === "held" ? lockState.value : null;
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
        const racedState = readClaimLockStrict(lockPath);
        if (racedState.status === "invalid") {
          throw new Error(`ticket ${ticketId} cannot claim: claim-lock-unreadable: ${racedState.reason}`);
        }
        const raced = racedState.status === "held" ? racedState.value : null;
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

export function recordAttempt(options = {}) {
  return withLegacyQueueWrite(options.root ?? rootForTicket(options.file), "record an attempt", () => recordAttemptUnlocked(options));
}

function recordAttemptUnlocked({ file, signature = "", reason = "unknown", at = new Date().toISOString() } = {}) {
  const { text, fields } = readValidTicket(file, parseTicketText);
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

export function closeTicket(options) {
  return withLegacyQueueWrite(options.root ?? rootForTicket(options.file), "close", () => closeTicketUnlocked(options));
}

function closeTicketUnlocked({ file, root, git = runGit, evidence = "none", resolution = "none", at = new Date().toISOString(), base, head = "HEAD", env = envFingerprint(), wallSeconds, tokens, allowUnanchored = false }) {
  const { text, fields } = readValidTicket(file, parseTicketText);
  const status = fields.get("Status");
  if (TERMINAL_STATUSES.has(status)) throw new Error(`ticket ${fields.get("Id")} is already terminal (Status: ${status})`);
  // Closing is the terminal transition of a claimed lifecycle: a ticket that
  // was never claimed, or whose resolution is a placeholder, has no closure to
  // record. Refuse both before touching the file.
  if (status !== "claimed" && status !== "in-review") {
    throw new Error(`ticket ${fields.get("Id")} cannot close: close-status: Status must be claimed or in-review (Status: ${status})`);
  }
  if (!realResolution(resolution)) {
    throw new Error(`ticket ${fields.get("Id")} cannot close: close-resolution: a real non-placeholder Resolution is required (got "${resolution}")`);
  }
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
  const anchor = integratedAnchor({ root: anchorRoot, git, fields, head });
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

// `ticket-abi.mjs` owns the envelope parser and this module owns the walker, so
// the facade binds them into the reconcile owner rather than letting the lower
// module import upward.
export function findTicketFile(options = {}) {
  return findTicketFileImpl({ listFiles: markdownFiles, parseTicket: parseTicketText, ...options });
}

function markdownFiles(root, dirs) {
  return dirs
    .flatMap((dir) => walkFiles(path.join(root, dir), { filter: (entry) => entry.dirent.name.endsWith(".md") }).map((entry) => entry.path))
    .sort();
}

// A claim must resolve each declared blocker from the queue the ticket lives
// in: its own directory tree plus the default ticket locations. An unknown id
// is refused the same way as an open blocker, never silently ignored.
function queueDirsFor({ file, root }) {
  const dirs = new Set(DEFAULT_DIRS);
  if (file) {
    const relative = path.relative(root, path.dirname(path.resolve(file)));
    if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
      dirs.add(relative.split(path.sep).join("/"));
    }
  }
  return [...dirs];
}

function assertClaimUnblocked({ file, root, fields }) {
  const id = fields.get("Id");
  const blockers = blockerIds(fields.get("Blocked by"));
  if (blockers.length === 0) return;
  const dirs = queueDirsFor({ file, root });
  for (const blockerId of blockers) {
    let blocker = null;
    try {
      const blockerFile = findTicketFile({ root, dirs, id: blockerId });
      blocker = parseTicketText(fs.readFileSync(blockerFile, "utf8")).fields;
    } catch {
      blocker = null;
    }
    if (!blocker) throw new Error(`ticket ${id} cannot claim: blocked-by-unknown: Blocked by names unknown ticket "${blockerId}"`);
    if (blocker.get("Status") !== "done") {
      throw new Error(`ticket ${id} cannot claim: blocked-by-open: blocker "${blockerId}" is not done (Status: ${blocker.get("Status")})`);
    }
  }
}

// The merge and the close are two writes; a crash between them leaves a
// claimed ticket whose work is already in headRef. Reconcile is that repair:
// for a claimed ticket that recorded its integration outbox, it closes the
// ticket once the recorded branch is merged into headRef (ancestry or patch
// id) and its lease no longer has a live worker. It reads nothing for a
// ticket with no recorded integration, so it is a no-op for ordinary claims,
// and a closed ticket drops out of the next run, so the repair is idempotent.
export function reconcileTickets(options = {}) {
  return reconcileTicketsImpl({ listFiles: markdownFiles, parseTicket: parseTicketText, ...options });
}

// `ticket-check.mjs` owns the check and its scope/contract helpers, but it may
// not import the envelope parser (the sh-91 single-owner guard pins it here)
// nor the walker, so the facade binds both into it.
export function checkTickets(options = {}) {
  let snapshot;
  try {
    snapshot = readActiveTaskStoreSnapshot(options.root);
  } catch (error) {
    return {
      root: options.root,
      tickets: [],
      frontier: [],
      reconciled: [],
      errors: [{ rule: "task-store-read-failed", message: error?.message ?? String(error) }],
      warnings: [],
    };
  }
  if (snapshot) {
    return checkTicketsImpl({
      ...options,
      sourceTickets: Object.values(snapshot.state.tasks)
        .sort((left, right) => left.id.localeCompare(right.id))
        .map(taskTicketView),
      sourceErrors: snapshot.errors.map((message) => ({ rule: "task-store-invalid", message })),
    });
  }
  return checkTicketsImpl({ listFiles: markdownFiles, parseTicket: parseTicketText, ...options });
}
