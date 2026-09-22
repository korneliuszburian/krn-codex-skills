
import fs from "node:fs";

import { runGit } from "../kernel/git.mjs";
import { writeAtomic } from "../support/write-atomic.mjs";

import {
  DEFAULT_DIRS,
  INTEGRATION_BRANCH,
  claimLease,
  integratedAnchor,
  leaseExpired,
  rangePatchIds,
  readValidTicket,
  setField,
} from "./ticket-abi.mjs";

// The reconcile writer needs the integration the lane intended before it
// merged: the outbox record. It names the branch the worker committed to and,
// when known, the tip sha and patch id so a deleted branch still reconciles.
function integrationRecord(fields) {
  const raw = (fields.get("Integration") ?? "").trim();
  if (!raw) return null;
  const branch = INTEGRATION_BRANCH.exec(raw)?.[1];
  if (!branch) return null;
  return {
    branch,
    sha: /(?:^|;\s*)sha=([0-9a-f]{40})/i.exec(raw)?.[1] ?? "",
    patch: /(?:^|;\s*)patch=([0-9a-f]{40})/i.exec(raw)?.[1] ?? "",
  };
}

// The merge and the close are two writes; a crash between them leaves a
// claimed ticket whose work is already in headRef. Reconcile is that repair:
// for a claimed ticket that recorded its integration outbox, it closes the
// ticket once the recorded branch is merged into headRef (ancestry or patch
// id) and its lease no longer has a live worker. It reads nothing for a
// ticket with no recorded integration, so it is a no-op for ordinary claims,
// and a closed ticket drops out of the next run, so the repair is idempotent.
export function reconcileTickets({ root, dirs = DEFAULT_DIRS, headRef = "HEAD", git = runGit, at = new Date().toISOString(), now = at, listFiles, parseTicket } = {}) {
  const closed = [];
  if (!git(root, ["rev-parse", "--git-dir"]).ok) return closed;
  for (const file of listFiles(root, dirs)) {
    let entry;
    try {
      entry = readValidTicket(file, parseTicket);
    } catch {
      continue;
    }
    const { text, fields } = entry;
    if (fields.get("Status") !== "claimed") continue;
    const integration = integrationRecord(fields);
    if (!integration) continue;
    // A live lease means another session may still own the close; only an
    // expired or absent one is a crashed lane this writer may repair.
    const lease = claimLease({ fields, root, id: fields.get("Id") });
    if (lease && !leaseExpired(lease, now)) continue;
    // Reuse the sh-12 anchor helper: the branch tip is the integrated sha and
    // its patch id over the ticket base is the content identity that survives
    // a squash. A recorded sha that disagrees with the branch is refused.
    let anchor = integratedAnchor({ root, git, fields, head: integration.branch });
    const branchResolved = Boolean(anchor);
    if (anchor && integration.sha && anchor.sha !== integration.sha) {
      throw new Error(`ticket ${fields.get("Id")} cannot reconcile: reconcile-sha-mismatch: recorded ${integration.sha} but ${integration.branch} is ${anchor.sha}`);
    }
    if (!anchor && integration.sha) anchor = { sha: integration.sha, patch: integration.patch };
    if (!anchor || !anchor.sha) continue;
    // The ticket base is a mutable ref: once the merge lands, `main..branch`
    // collapses. Bound the headRef range by the branch/headRef merge base so a
    // squashed patch id is still visible in the integrated history. A missing
    // branch has no merge base, so recover the fork point from the recorded
    // sha; otherwise let rangePatchIds fall back to its bounded head window.
    const mergeBase = git(root, ["merge-base", integration.branch, headRef]);
    let rangeBase = "";
    if (mergeBase.ok && mergeBase.out) rangeBase = mergeBase.out;
    else {
      const shaMergeBase = git(root, ["merge-base", anchor.sha, headRef]);
      if (shaMergeBase.ok && shaMergeBase.out) rangeBase = shaMergeBase.out;
    }
    const patch = anchor.patch || integration.patch;
    const merged = git(root, ["merge-base", "--is-ancestor", anchor.sha, headRef]).ok
      || (patch !== "" && rangePatchIds({ root, base: rangeBase, head: headRef }).has(patch));
    // With the branch gone the recorded sha is the only identity left; a sha
    // that is neither an ancestor of headRef nor present by patch id cannot be
    // verified, so the fallback refuses instead of closing on a trusted value.
    if (!merged) {
      if (!branchResolved) {
        throw new Error(`ticket ${fields.get("Id")} cannot reconcile: reconcile-sha-unverifiable: recorded ${anchor.sha} is not an ancestor of ${headRef} and its patch id is absent from the bounded range`);
      }
      continue;
    }
    const evidence = `reconciled; integrated=${anchor.sha}${patch ? `; patch=${patch}` : ""}`;
    let next = setField(text, "Status", "done");
    next = setField(next, "Evidence", evidence);
    next = setField(next, "Resolution", `merged into ${headRef} (reconciled ${at})`);
    writeAtomic(file, next);
    closed.push(fields.get("Id"));
  }
  return closed;
}

export function findTicketFile({ root, dirs = DEFAULT_DIRS, id, listFiles, parseTicket } = {}) {
  for (const file of listFiles(root, dirs)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("<krn-ticket>")) continue;
    const { fields } = parseTicket(text);
    if (fields?.get("Id") === id) return file;
  }
  throw new Error(`no ticket with id "${id}" under ${dirs.join(", ")}`);
}
