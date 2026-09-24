import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { gitTopLevel, runGit, runGitInput } from "../kernel/git.mjs";
import { sha256Hex } from "../kernel/digest.mjs";
import { hasActionableReason } from "./ticket-abi.mjs";

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HOST = sha256Hex(os.hostname());
const ACTIVATION_FENCE_REF = "refs/krn/queue-activation-fence";
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

function readActivationFence(root) {
  if (runGit(root, ["symbolic-ref", "--quiet", ACTIVATION_FENCE_REF]).ok) throw new Error("queue activation fence must not be symbolic");
  const result = runGit(root, ["rev-parse", "--verify", "--quiet", ACTIVATION_FENCE_REF]);
  if (result.ok && OID.test(result.out)) return result.out;
  if (result.status === 1) return "";
  throw new Error(result.stderr || "cannot read queue activation fence");
}

function activationFence(root, token) {
  const object = (state) => {
    const result = runGitInput(root, ["hash-object", "-w", "--stdin"], JSON.stringify({ token, state }));
    if (!result.ok || !OID.test(result.out.trim())) throw new Error(result.stderr || "cannot prepare queue activation fence");
    return result.out.trim();
  };
  return { ref: ACTIVATION_FENCE_REF, oid: object("active"), revoked: object("revoked"), previous: readActivationFence(root) };
}

function replaceActivationFence(root, next, previous) {
  return runGit(root, ["update-ref", "--no-deref", ACTIVATION_FENCE_REF, next, previous]);
}

function revokeActivationFence(root, fence) {
  if (!fence) return;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const current = readActivationFence(root);
    if (current === fence.revoked) return;
    if (current !== fence.oid && current !== fence.previous) throw new Error("queue activation fence owner changed before recovery");
    if (replaceActivationFence(root, fence.revoked, current).ok) return;
  }
  throw new Error("queue activation is still in flight or its fence changed; retry recovery after readback");
}

function directory(parent, names, create) {
  let current = parent;
  for (const name of names) {
    current = path.join(current, name);
    if (create) {
      try { fs.mkdirSync(current, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; }
    }
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`unsafe queue guard directory: ${current}`);
    } catch (error) {
      if (!create && error.code === "ENOENT") continue;
      throw error;
    }
  }
  return current;
}

function location(root, create = false) {
  const requested = fs.realpathSync(root);
  const top = gitTopLevel(requested);
  let base;
  // File-only callers must not create state in an unrelated enclosing repo
  // (notably a foreign /tmp/.git). Linked worktree roots share the common dir.
  if (top && fs.realpathSync(top) === requested) {
    const common = runGit(requested, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
    if (!common.ok) throw new Error("cannot resolve the queue guard Git directory");
    base = directory(fs.realpathSync(common.out), ["krn-ticket-writes"], create);
  } else {
    base = directory(requested, [".krn", "queue-writes"], create);
  }
  return { base, held: path.join(base, "held") };
}

function readRecord(dir, file) {
  let stat;
  try { stat = fs.lstatSync(dir); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`unsafe queue guard directory: ${dir}`);
  const target = path.join(dir, file);
  try {
    const entry = fs.lstatSync(target);
    if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("not a regular record");
    const value = JSON.parse(fs.readFileSync(target, "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value;
  } catch (error) {
    throw new Error(`queue guard record is unreadable: ${target}: ${error.message}`);
  }
}

function validOwner(owner) {
  return owner?.version === 1 && TOKEN.test(owner.token) && Number.isSafeInteger(owner.pid) && owner.pid > 0
    && typeof owner.host === "string" && /^[0-9a-f]{64}$/.test(owner.host)
    && typeof owner.operation === "string" && owner.operation.length > 0
    && Number.isFinite(Date.parse(owner.startedAt))
    && (owner.fence === undefined || (owner.fence?.ref === ACTIVATION_FENCE_REF && OID.test(owner.fence.oid)
      && OID.test(owner.fence.revoked) && (owner.fence.previous === "" || OID.test(owner.fence.previous))));
}

function readOwner(dir) {
  const owner = readRecord(dir, "owner.json");
  if (owner && !validOwner(owner)) throw new Error(`queue guard owner is invalid: ${dir}`);
  return owner;
}

function ownerState(owner) {
  if (owner.host !== HOST) return "unknown";
  try { process.kill(owner.pid, 0); return "alive"; } catch (error) { return error.code === "ESRCH" ? "dead" : "unknown"; }
}

function preparedDirectory(base, file, value) {
  const temp = fs.mkdtempSync(path.join(base, ".pending-"));
  try {
    const fd = fs.openSync(path.join(temp, file), "wx", 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return temp;
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    throw error;
  }
}

function busy(owner) {
  return new Error(`queue-write-busy: already-claimed by pid ${owner.pid}; token=${owner.token}; inspect ticket store lock before retry or explicit recovery`);
}

export function inspectQueueWriteLock(root) {
  const paths = location(root);
  const owner = readOwner(paths.held);
  return owner ? { status: "held", owner, ownerState: ownerState(owner) } : { status: "free" };
}

// The callback is synchronous. Nonempty directory renames publish a complete
// owner, and release moves only this owner's directory before deleting it.
export function withQueueWriteLock(root, operation, action, { fenceActivation = false } = {}) {
  const paths = location(root, true);
  const existing = readOwner(paths.held);
  if (existing) throw busy(existing);
  const owner = { version: 1, token: randomUUID(), pid: process.pid, host: HOST, operation, startedAt: new Date().toISOString() };
  if (fenceActivation) owner.fence = activationFence(root, owner.token);
  const temp = preparedDirectory(paths.base, "owner.json", owner);
  try {
    fs.renameSync(temp, paths.held);
  } catch (error) {
    fs.rmSync(temp, { recursive: true, force: true });
    const winner = readOwner(paths.held);
    if (winner) throw busy(winner);
    throw error;
  }
  try {
    if (owner.fence && !replaceActivationFence(root, owner.fence.oid, owner.fence.previous).ok) {
      throw new Error("queue activation fence changed before acquisition; retry the operation");
    }
    return action(owner.fence);
  } finally {
    const current = readOwner(paths.held);
    if (current?.token !== owner.token) throw new Error("queue guard ownership changed; refusing cleanup");
    const released = path.join(paths.base, `released-${owner.token}`);
    fs.renameSync(paths.held, released);
    fs.rmSync(released, { recursive: true });
  }
}

function readRecovery(dir, token, actor, reason) {
  const receipt = readRecord(dir, "recovery.json");
  if (receipt && (receipt.version !== 1 || receipt.token !== token || !validOwner(receipt.owner)
    || receipt.owner.token !== token || receipt.actor !== actor || receipt.reason !== reason)) {
    throw new Error("queue recovery token is bound to different or invalid parameters");
  }
  return receipt;
}

function recoveredOwner(dir, receipt) {
  const owner = readOwner(path.join(dir, "owner"));
  if (owner && JSON.stringify(owner) !== JSON.stringify(receipt.owner)) throw new Error("queue recovery owner identity differs");
  return owner;
}

export function recoverQueueWriteLock(root, { token, actor, reason } = {}) {
  if (typeof token !== "string" || !TOKEN.test(token) || typeof actor !== "string" || !hasActionableReason(actor)
    || typeof reason !== "string" || !hasActionableReason(reason)) {
    throw new Error("queue recovery requires an exact token, actor and non-placeholder reason");
  }
  const paths = location(root);
  const recoveries = directory(paths.base, ["recoveries"], false);
  const target = path.join(recoveries, token);
  let receipt = readRecovery(target, token, actor, reason);
  // A completed tombstone wins before inspecting a subsequently acquired guard.
  if (receipt && recoveredOwner(target, receipt)) return { recovered: false, token, actor, reason };
  const owner = readOwner(paths.held);
  if (!owner || owner.token !== token) {
    if (receipt && recoveredOwner(target, receipt)) return { recovered: false, token, actor, reason };
    throw new Error("queue recovery token does not match the current owner");
  }
  if (ownerState(owner) !== "dead") throw new Error("queue owner is alive or its process liveness is unknown");
  if (!receipt) {
    directory(paths.base, ["recoveries"], true);
    const proposed = { version: 1, token, owner, actor, reason };
    const temp = preparedDirectory(paths.base, "recovery.json", proposed);
    try { fs.renameSync(temp, target); } catch (error) {
      fs.rmSync(temp, { recursive: true, force: true });
      receipt = readRecovery(target, token, actor, reason);
      if (!receipt) throw error;
    }
    receipt ??= proposed;
  }
  if (recoveredOwner(target, receipt)) return { recovered: false, token, actor, reason };
  const current = readOwner(paths.held);
  if (!current || JSON.stringify(current) !== JSON.stringify(receipt.owner)) {
    if (recoveredOwner(target, receipt)) return { recovered: false, token, actor, reason };
    throw new Error("queue owner changed before recovery");
  }
  if (ownerState(current) !== "dead") throw new Error("queue owner is alive or its process liveness is unknown");
  // Revoke in Git before admitting another filesystem writer. A child Git
  // process can survive its parent; the activation transaction verifies this
  // fence atomically with the queue/selector writes. CAS also fences a delayed
  // acquisition helper and a recovery helper that outlives its own parent.
  revokeActivationFence(root, current.fence);
  try { fs.renameSync(paths.held, path.join(target, "owner")); } catch (error) {
    if (recoveredOwner(target, receipt)) return { recovered: false, token, actor, reason };
    throw error;
  }
  // Retain the nonempty tombstone while legacy writer support exists: removing
  // it would let a delayed recoverer move a new live guard into the old path.
  return { recovered: true, token, actor, reason };
}
