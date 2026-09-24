import { randomUUID } from "node:crypto";

import { gitTopLevel, runGit, runGitInput } from "../kernel/git.mjs";
import { DEFAULT_CLAIM_DURATION, leaseExpired } from "./ticket-abi.mjs";

const QUEUE_REF = "refs/krn/queue";

class StoreConflict extends Error {
  constructor(message = "task store changed during update") {
    super(message);
    this.name = "StoreConflict";
  }
}

function emptyState() {
  return { version: 0, tasks: {}, operations: {}, intents: {} };
}

function repositoryRoot(root) {
  const resolved = gitTopLevel(root);
  if (!resolved) throw new Error(`task store requires a Git worktree: ${root}`);
  return resolved;
}

function readSnapshot(root) {
  const ref = runGit(root, ["rev-parse", "--verify", "--quiet", QUEUE_REF]);
  if (!ref.ok) {
    if (ref.status === 1) return { oid: "", state: emptyState() };
    throw new Error(ref.stderr || "cannot read task-store ref");
  }
  const blob = runGit(root, ["cat-file", "blob", ref.out]);
  if (!blob.ok) throw new Error(blob.stderr || "cannot read task-store snapshot");
  let state;
  try {
    state = JSON.parse(blob.out);
  } catch {
    throw new Error(`task-store snapshot ${ref.out} is invalid JSON`);
  }
  if (!state || typeof state !== "object" || Array.isArray(state)
    || !Number.isInteger(state.version) || state.version < 1 || !state.tasks || typeof state.tasks !== "object" || Array.isArray(state.tasks)
    || !state.operations || typeof state.operations !== "object" || Array.isArray(state.operations)
    || !state.intents || typeof state.intents !== "object" || Array.isArray(state.intents)) {
    throw new Error(`task-store snapshot ${ref.out} has an unsupported shape`);
  }
  return { oid: ref.out, state };
}

function writeSnapshot(root, previousOid, state) {
  const blob = runGitInput(root, ["hash-object", "-w", "--stdin"], JSON.stringify(state));
  if (!blob.ok || !blob.out) throw new Error(blob.stderr || "cannot write task-store snapshot");
  const objectId = blob.out.trim();
  const updated = previousOid
    ? runGit(root, ["update-ref", QUEUE_REF, objectId, previousOid])
    : runGitInput(root, ["update-ref", "--stdin"], `create ${QUEUE_REF} ${objectId}\n`);
  if (!updated.ok) throw new StoreConflict(updated.stderr || "task-store compare-and-swap refused");
  return objectId;
}

function commitSnapshot(root, previous, next) {
  next.version = previous.state.version + 1;
  return writeSnapshot(root, previous.oid, next);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasDependencyCycle(state, rootId, path = new Set(), visited = new Set()) {
  if (path.has(rootId)) return true;
  if (visited.has(rootId)) return false;
  const task = taskFor(state, rootId);
  if (!task) return false;
  path.add(rootId);
  for (const dependency of task.dependencies) {
    if (hasDependencyCycle(state, dependency, path, visited)) return true;
  }
  path.delete(rootId);
  visited.add(rootId);
  return false;
}

function taskFor(state, id) {
  return Object.hasOwn(state.tasks, id) ? state.tasks[id] : null;
}

function typedContextReference(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("context reference must be a typed source reference");
  }
  const fields = Object.keys(value);
  if (fields.some((field) => !["kind", "revision", "anchor"].includes(field))) {
    throw new Error("unsupported context reference field; store a source reference, not copied lesson text");
  }
  if (["kind", "revision", "anchor"].some((field) => typeof value[field] !== "string" || value[field].trim() === "")) {
    throw new Error("context reference must be a typed source reference with kind, revision and anchor");
  }
  return clone(value);
}

function normalizedOperationParams(operation) {
  const supplied = operation.params ?? {};
  if (!operation.id || supplied.target !== operation.effectObject || supplied.intentRevision !== operation.intentRevision) {
    throw new Error("operation parameters disagree with effect or intent");
  }
  return {
    ...supplied,
    operationId: operation.id,
    candidateIdentity: operation.candidateIdentity,
    checkResult: operation.checkResult,
    effectRef: operation.effectRef,
    effectObject: operation.effectObject,
    taskId: operation.taskId,
    owner: operation.owner,
    epoch: operation.epoch,
    intent: operation.intent,
    intentRevision: operation.intentRevision,
  };
}

function operationParamsMatch(operation) {
  try {
    return JSON.stringify(operation.params) === JSON.stringify(normalizedOperationParams(operation));
  } catch {
    return false;
  }
}

function completionDecision(state, operation, effectReadback) {
  const task = taskFor(state, operation.taskId);
  const stored = Object.hasOwn(state.operations, operation.id) ? state.operations[operation.id] : null;
  if (!operationParamsMatch(operation) || stored?.id !== operation.id || stored?.status !== "prepared"
    || !task || task.status !== "claimed" || task.owner !== operation.owner || task.epoch !== operation.epoch
    || typeof operation.intent !== "string" || operation.intent.length === 0
    || !Number.isInteger(operation.intentRevision) || !Object.hasOwn(state.intents, operation.intent)
    || state.intents[operation.intent] !== operation.intentRevision
    || !operation.candidateIdentity || operation.checkResult?.candidateIdentity !== operation.candidateIdentity
    || operation.checkResult.exitCode !== 0) {
    return "rejected";
  }
  if (!operation.effectRef || !operation.effectObject || effectReadback !== operation.effectObject) return "ambiguous";
  return "accepted";
}

function readRef(root, ref) {
  const result = runGit(root, ["rev-parse", "--verify", "--quiet", ref]);
  if (result.ok) return result.out;
  if (result.status === 1) return "";
  throw new Error(result.stderr || `cannot read Git ref ${ref}`);
}

function objectExists(root, object) {
  return runGit(root, ["cat-file", "-e", object]).ok;
}

function taskStoreErrors(state) {
  const errors = [];
  const entries = Object.entries(state.tasks);
  for (const [id, task] of entries) {
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      errors.push(`task ${id} is not an object`);
      continue;
    }
    if (task.id !== id) errors.push(`task ${id} has a mismatched ID`);
    if (!Array.isArray(task.dependencies)) {
      errors.push(`task ${id} dependencies are not an array`);
      continue;
    }
    for (const dependency of task.dependencies) {
      if (!taskFor(state, dependency)) errors.push(`task ${id} has unknown dependency ${dependency}`);
    }
    if (task.status === "ready" && !task.dependencies.every((dependency) => taskFor(state, dependency)?.status === "done")) {
      errors.push(`task ${id} is ready with unresolved dependencies`);
    }
  }
  for (const [id, task] of entries) {
    if (task && typeof task === "object" && Array.isArray(task.dependencies) && hasDependencyCycle(state, id)) {
      errors.push(`task ${id} has a dependency cycle`);
    }
  }
  return [...new Set(errors)].sort();
}

export function openTaskStore(root) {
  const repo = repositoryRoot(root);

  async function transition(change) {
    const previous = readSnapshot(repo);
    const next = clone(previous.state);
    const result = change(next);
    commitSnapshot(repo, previous, next);
    return clone(result);
  }

  return Object.freeze({
    async read() {
      return clone(readSnapshot(repo).state);
    },

    async list({ status } = {}) {
      const state = readSnapshot(repo).state;
      return clone(Object.values(state.tasks)
        .filter((task) => status === undefined || task.status === status)
        .sort((left, right) => left.id.localeCompare(right.id)));
    },

    async show(id) {
      const state = readSnapshot(repo).state;
      return clone(taskFor(state, id));
    },

    async check() {
      const state = readSnapshot(repo).state;
      const errors = taskStoreErrors(state);
      return { ok: errors.length === 0, errors };
    },

    async ready() {
      const state = readSnapshot(repo).state;
      return clone(Object.values(state.tasks)
        .filter((task) => task.status === "ready" && task.dependencies.every((dependency) => taskFor(state, dependency)?.status === "done"))
        .sort((left, right) => left.id.localeCompare(right.id)));
    },

    async add({ id = `task-${randomUUID()}`, title, body = "", sourcePath = "", dependencies = [], contextRef = null, lane = false } = {}) {
      if (typeof id !== "string" || id.length === 0) throw new Error("task id must be a non-empty string");
      if (typeof title !== "string" || title.trim() === "") throw new Error("task title is required");
      if (typeof body !== "string" || typeof sourcePath !== "string") throw new Error("task body and source path must be strings");
      if (typeof lane !== "boolean") throw new Error("lane must be boolean");
      if (!Array.isArray(dependencies) || dependencies.some((dependency) => typeof dependency !== "string" || dependency === "")) {
        throw new Error("task dependencies must be non-empty ids");
      }
      const previous = readSnapshot(repo);
      if (Object.hasOwn(previous.state.tasks, id)) throw new Error(`task ${id} already exists`);
      const next = clone(previous.state);
      const task = {
        id,
        title: title.trim(),
        body,
        sourcePath,
        legacyFields: {},
        dependencies: [...dependencies],
        contextRef: typedContextReference(contextRef),
        lane,
        status: "open",
        epoch: 0,
        owner: "",
        comments: [],
        history: [{ type: "added", title: title.trim() }],
      };
      Object.defineProperty(next.tasks, id, { value: task, enumerable: true, configurable: true, writable: true });
      commitSnapshot(repo, previous, next);
      return clone(task);
    },

    async markReady(id) {
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "open") throw new Error(`task ${id} is not open`);
        if (hasDependencyCycle(state, id)) throw new Error(`task ${id} has a dependency cycle`);
        if (!task.dependencies.every((dependency) => taskFor(state, dependency)?.status === "done")) {
          throw new Error(`task ${id} has unresolved dependencies`);
        }
        task.status = "ready";
        task.history.push({ type: "ready" });
        return task;
      });
    },

    async edit(id, patch = {}) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new Error("task edit must be an object");
      const allowed = new Set(["title", "body", "dependencies", "contextRef"]);
      const fields = Object.keys(patch);
      if (fields.length === 0 || fields.some((field) => !allowed.has(field))) throw new Error("task edit requires supported content or dependency fields");
      if (Object.hasOwn(patch, "title") && (typeof patch.title !== "string" || patch.title.trim() === "")) throw new Error("task title is required");
      if (Object.hasOwn(patch, "body") && typeof patch.body !== "string") throw new Error("task body must be a string");
      if (Object.hasOwn(patch, "dependencies") && (!Array.isArray(patch.dependencies)
        || patch.dependencies.some((dependency) => typeof dependency !== "string" || dependency === ""))) {
        throw new Error("task dependencies must be non-empty ids");
      }
      const changes = {
        ...(Object.hasOwn(patch, "title") ? { title: patch.title.trim() } : {}),
        ...(Object.hasOwn(patch, "body") ? { body: patch.body } : {}),
        ...(Object.hasOwn(patch, "dependencies") ? { dependencies: [...patch.dependencies] } : {}),
        ...(Object.hasOwn(patch, "contextRef") ? { contextRef: typedContextReference(patch.contextRef) } : {}),
      };
      const previous = readSnapshot(repo);
      const next = clone(previous.state);
      const task = taskFor(next, id);
      if (!task || !["open", "ready"].includes(task.status)) throw new Error(`task ${id} cannot edit in its current state`);
      const changed = Object.keys(changes).filter((field) => JSON.stringify(task[field]) !== JSON.stringify(changes[field]));
      if (changed.length === 0) return clone(task);
      Object.assign(task, changes);
      if (changed.includes("dependencies") && hasDependencyCycle(next, id)) throw new Error(`task ${id} has a dependency cycle`);
      const demoted = task.status === "ready" && !task.dependencies.every((dependency) => taskFor(next, dependency)?.status === "done");
      if (demoted) task.status = "open";
      task.history.push({ type: "edited", fields: changed });
      commitSnapshot(repo, previous, next);
      return clone(task);
    },

    async claim(id, { worker, session = "", at = new Date().toISOString(), duration = DEFAULT_CLAIM_DURATION } = {}) {
      if (typeof worker !== "string" || worker.trim() === "") throw new Error("claim worker is required");
      if (!Number.isFinite(Date.parse(at)) || !Number.isFinite(duration) || duration <= 0) throw new Error("claim lease is invalid");
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "ready") throw new Error(`task ${id} is not ready`);
        task.status = "claimed";
        task.epoch += 1;
        task.owner = worker;
        task.lease = { worker, session, at, epoch: task.epoch, renew: at, duration };
        task.history.push({ type: "claimed", worker, epoch: task.epoch });
        return task;
      });
    },

    async renewClaim(id, { worker, epoch, at = new Date().toISOString(), duration } = {}) {
      if (typeof worker !== "string" || worker.trim() === "" || !Number.isInteger(epoch) || !Number.isFinite(Date.parse(at))) {
        throw new Error("claim owner, generation and renewal time are required");
      }
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "claimed" || task.owner !== worker || task.epoch !== epoch || task.lease?.epoch !== epoch) {
          throw new Error("stale claim generation");
        }
        if (leaseExpired(task.lease, at)) throw new Error("claim lease has expired");
        const nextDuration = duration ?? task.lease.duration;
        if (!Number.isFinite(nextDuration) || nextDuration <= 0) throw new Error("claim lease is invalid");
        task.lease = { ...task.lease, renew: at, duration: nextDuration };
        return task;
      });
    },

    async takeover(id, { worker, session = "", expectedEpoch, at = new Date().toISOString(), duration = DEFAULT_CLAIM_DURATION } = {}) {
      if (typeof worker !== "string" || worker.trim() === "" || !Number.isInteger(expectedEpoch)) {
        throw new Error("takeover worker and expected claim generation are required");
      }
      if (!Number.isFinite(Date.parse(at)) || !Number.isFinite(duration) || duration <= 0) throw new Error("claim lease is invalid");
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "claimed" || task.epoch !== expectedEpoch || task.lease?.epoch !== expectedEpoch) {
          throw new Error("claim generation changed");
        }
        if (!leaseExpired(task.lease, at)) throw new Error("claim lease is still active");
        const previousOwner = task.owner;
        task.epoch += 1;
        task.owner = worker;
        task.lease = { worker, session, at, epoch: task.epoch, renew: at, duration };
        task.history.push({ type: "takeover", previousOwner, worker, previousEpoch: expectedEpoch, epoch: task.epoch });
        return task;
      });
    },

    async comment(id, { worker, epoch, body } = {}) {
      if (typeof body !== "string" || body.trim() === "") throw new Error("comment body is required");
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "claimed" || task.owner !== worker || task.epoch !== epoch) {
          throw new Error("stale claim generation");
        }
        const comment = { author: worker, body };
        task.comments.push(comment);
        task.history.push({ type: "comment", author: worker, body });
        return comment;
      });
    },

    async close(id, { actor, reason, epoch, proof } = {}) {
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status === "done") throw new Error(`task ${id} cannot close`);
        if (task.lane) throw new Error("lane close requires operation readback");
        if (epoch === undefined && task.status === "claimed") throw new Error("active claim requires its generation or an explicit takeover");
        if (epoch === undefined && (!actor || !reason)) throw new Error("human close requires actor and reason");
        if (epoch !== undefined && (task.status !== "claimed" || task.owner !== actor || task.epoch !== epoch)) {
          throw new Error("stale claim generation");
        }
        task.status = "done";
        task.result = { actor, reason, ...(proof ? { proof } : {}) };
        task.history.push({ type: "closed", actor, reason });
        return task;
      });
    },

    async reopen(id, { actor, reason } = {}) {
      if (!actor || !reason) throw new Error("reopen requires actor and reason");
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "done") throw new Error(`task ${id} cannot reopen`);
        task.status = "open";
        task.owner = "";
        task.history.push({ type: "reopened", actor, reason });
        return task;
      });
    },

    async setIntentRevision(intent, revision) {
      if (typeof intent !== "string" || intent.length === 0 || !Number.isInteger(revision) || revision < 1) {
        throw new Error("intent and positive revision are required");
      }
      const previous = readSnapshot(repo);
      const current = Object.hasOwn(previous.state.intents, intent) ? previous.state.intents[intent] : 0;
      if (revision < current) throw new Error(`intent ${intent} revision cannot move backwards`);
      if (revision === current) return { intent, revision, idempotent: true };
      const next = clone(previous.state);
      Object.defineProperty(next.intents, intent, { value: revision, enumerable: true, configurable: true, writable: true });
      commitSnapshot(repo, previous, next);
      return { intent, revision, idempotent: false };
    },

    async prepareOperation(operation = {}) {
      const params = normalizedOperationParams(operation);
      if (typeof operation.id !== "string" || operation.id.length === 0) throw new Error("operation id is required");
      if (typeof operation.effectRef !== "string" || !runGit(repo, ["check-ref-format", operation.effectRef]).ok) {
        throw new Error("operation effect ref is invalid");
      }
      if (typeof operation.effectObject !== "string" || !objectExists(repo, operation.effectObject)) {
        throw new Error("operation effect object does not exist");
      }
      if (typeof operation.candidateIdentity !== "string" || !objectExists(repo, operation.candidateIdentity)
        || operation.checkResult?.candidateIdentity !== operation.candidateIdentity || operation.checkResult.exitCode !== 0) {
        throw new Error("check result is not bound to the existing candidate");
      }
      const previous = readSnapshot(repo);
      const current = Object.hasOwn(previous.state.operations, operation.id) ? previous.state.operations[operation.id] : null;
      if (current) {
        if (JSON.stringify(current.params) !== JSON.stringify(params)) throw new Error("operation id reused with different parameters");
        return { idempotent: true, status: current.status };
      }
      const next = clone(previous.state);
      const task = taskFor(next, operation.taskId);
      if (!task || task.status !== "claimed" || task.owner !== operation.owner || task.epoch !== operation.epoch) {
        throw new Error("operation has stale claim generation");
      }
      if (typeof operation.intent !== "string" || !Object.hasOwn(next.intents, operation.intent)
        || next.intents[operation.intent] !== operation.intentRevision) {
        throw new Error("operation has stale intent revision");
      }
      const stored = { ...clone(operation), params, status: "prepared" };
      Object.defineProperty(next.operations, operation.id, { value: stored, enumerable: true, configurable: true, writable: true });
      task.history.push({ type: "operation-prepared", id: operation.id });
      commitSnapshot(repo, previous, next);
      return { idempotent: false, status: "prepared" };
    },

    async completeOperation(operationId) {
      const previous = readSnapshot(repo);
      const operation = Object.hasOwn(previous.state.operations, operationId) ? previous.state.operations[operationId] : null;
      if (!operation) throw new Error(`operation ${operationId} does not exist`);
      if (operation.status === "observed") return { idempotent: true, status: "observed" };
      const firstDecision = completionDecision(previous.state, operation, readRef(repo, operation.effectRef));
      if (firstDecision !== "accepted") {
        if (firstDecision === "ambiguous") return { idempotent: false, status: "ambiguous" };
        throw new Error("operation acceptance is stale or invalid");
      }
      const next = clone(previous.state);
      const current = next.operations[operationId];
      const effectReadback = readRef(repo, current.effectRef);
      if (completionDecision(next, current, effectReadback) !== "accepted") {
        throw new Error("operation acceptance changed before completion");
      }
      current.status = "observed";
      const task = taskFor(next, current.taskId);
      task.status = "done";
      task.result = { operationId, effectObject: current.effectObject };
      task.history.push({ type: "operation-observed", id: operationId });
      commitSnapshot(repo, previous, next);
      return { idempotent: false, status: "observed" };
    },
  });
}
