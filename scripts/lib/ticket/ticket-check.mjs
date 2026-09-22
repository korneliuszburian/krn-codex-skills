
import fs from "node:fs";
import path from "node:path";

import { parseChangeContract } from "../contract/change-contract.mjs";
import { runGit } from "../kernel/git.mjs";
import { globToRegex } from "../kernel/text.mjs";

import {
  CLOSED_STATUSES,
  CONTRACT_DIRECTION,
  DEFAULT_DIRS,
  INTEGRATED_ANCHOR,
  MAX_ATTEMPTS,
  PATCH_ANCHOR,
  TEST_REF,
  blockerIds,
  claimLease,
  hasCostRecord,
  hasEnvFingerprint,
  leaseExpired,
  rangePatchIds,
  repeatedSignature,
  stalledClaim,
  ticketBase,
} from "./ticket-abi.mjs";
import { reconcileTickets } from "./ticket-reconcile.mjs";

function scopeEntries(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/^\.\//, ""))
    .filter(Boolean);
}

function scopeDeclares(entry, file) {
  if (entry.endsWith("/")) return file.startsWith(entry);
  if (/[*?]/.test(entry)) return globToRegex(entry).test(file);
  return file === entry || file.startsWith(`${entry}/`);
}

export function scopeErrors({ root, git, ticket, base, head }) {
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

function contractRef(value) {
  return String(value ?? "").trim().replace(/^\.\//, "").replace(CONTRACT_DIRECTION, "").trim();
}

export function namesTicket(body, id) {
  return String(body ?? "")
    .split("\n")
    .some((line) => /^Ticket:\s*(\S+)\s*$/.exec(line.trim())?.[1] === id);
}

// The lane gate trusted the worker's own `Change-contract` trailer, so a
// renamed observer passed unremarked. Cross-check the trailer on the ticket's
// own head commit against the envelope's declared Contract ref.
export function contractErrors({ root, git, ticket, head }) {
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

export function baseRefExists({ root, git, base }) {
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

export function checkTickets({ root, dirs = DEFAULT_DIRS, git = runGit, id, base, head = "HEAD", now = new Date().toISOString(), listFiles, parseTicket } = {}) {
  const tickets = [];
  const errors = [];
  const warnings = [];
  // `ticket next` reads the frontier through this report, so the repair runs
  // first: a crashed merge-then-close heals before the frontier is computed
  // and the merged ticket never re-enters the queue.
  const reconciled = [];
  try {
    reconciled.push(...reconcileTickets({ root, dirs, headRef: head, git, at: now, now, listFiles, parseTicket }));
  } catch (error) {
    errors.push({ rule: "reconcile-refused", message: error?.message ?? String(error) });
  }
  for (const file of listFiles(root, dirs)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("<krn-ticket>")) continue;
    const relative = path.relative(root, file);
    const { fields, findings } = parseTicket(text);
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
    else if (!CLOSED_STATUSES.has(ticket.status)) warnings.push({ path: ticket.path, rule: "open-ticket-committed", message: `commits exist for open ticket "${id}"` });
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
    if (ticket.status === "blocked" && String(ticket.fields.get("Gate") ?? "").trim() === "") {
      errors.push({ path: ticket.path, rule: "blocked-without-gate", message: `ticket "${ticket.id}" is blocked without a Gate` });
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
  return { root, tickets: tickets.map(({ fields, text, ...rest }) => rest), frontier, reconciled, errors, warnings };
}
