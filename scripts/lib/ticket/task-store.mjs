import { randomUUID } from "node:crypto";
import path from "node:path";

import { gitTopLevel, runGit, runGitInput } from "../kernel/git.mjs";
import { sha256Hex } from "../kernel/digest.mjs";
import { DEFAULT_CLAIM_DURATION, MAX_ATTEMPTS, leaseExpired, STATUSES, TYPES } from "./ticket-abi.mjs";

const QUEUE_REF = "refs/krn/queue";
const ACTIVE_QUEUE_REF = "refs/krn/queue-active";
const ACTIVE_QUEUE_SELECTOR = { version: 1, queueRef: QUEUE_REF };
const LANE_RECIPE_FIELDS = ["base", "scope", "check", "contract", "acceptance"];
const PLACEHOLDER_REASONS = new Set(["none", "unknown", "n/a", "not applicable", "todo", "tbd", "placeholder"]);

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

function writeSnapshotAndRef(root, previous, state, ref, newObject, expectedObject) {
  state.version = previous.state.version + 1;
  const blob = runGitInput(root, ["hash-object", "-w", "--stdin"], JSON.stringify(state));
  if (!blob.ok || !blob.out) throw new Error(blob.stderr || "cannot write task-store snapshot");
  const objectId = blob.out.trim();
  const effectUpdate = expectedObject
    ? `update ${ref} ${newObject} ${expectedObject}`
    : `create ${ref} ${newObject}`;
  const transaction = [
    "start",
    `update ${QUEUE_REF} ${objectId} ${previous.oid}`,
    effectUpdate,
    "prepare",
    "commit",
    "",
  ].join("\n");
  const updated = runGitInput(root, ["update-ref", "--stdin"], transaction);
  if (!updated.ok) throw new StoreConflict(updated.stderr || "atomic task/effect ref transaction refused");
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

function normalizedLaneRecipe(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("lane recipe must be an object");
  const keys = Object.keys(value);
  if (keys.some((key) => !LANE_RECIPE_FIELDS.includes(key))) throw new Error("lane recipe has an unsupported field");
  if (LANE_RECIPE_FIELDS.some((key) => typeof value[key] !== "string" || value[key].trim() === "")) {
    throw new Error("lane recipe requires base, scope, check, contract and acceptance");
  }
  return Object.fromEntries(LANE_RECIPE_FIELDS.map((key) => [key, value[key].trim()]));
}

function normalizedIntegration(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("integration must be a typed outbox record");
  const keys = Object.keys(value);
  if (keys.some((key) => !["branch", "sha", "patch", "legacyRaw"].includes(key))) {
    throw new Error("integration has an unsupported field");
  }
  if (typeof value.branch !== "string" || value.branch.trim() === ""
    || typeof value.sha !== "string" || typeof value.patch !== "string" || typeof value.legacyRaw !== "string") {
    throw new Error("integration requires branch, sha, patch and legacyRaw strings");
  }
  return { branch: value.branch.trim(), sha: value.sha, patch: value.patch, legacyRaw: value.legacyRaw };
}

function normalizedGate(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("gate must be a typed legacy gate record");
  const keys = Object.keys(value);
  if (keys.some((key) => !["kind", "detail", "legacyRaw"].includes(key))) throw new Error("gate has an unsupported field");
  if (!["none", "human", "ci", "tracker"].includes(value.kind)
    || typeof value.detail !== "string" || typeof value.legacyRaw !== "string"
    || (value.kind === "none" ? value.detail !== "" : value.detail.trim() === "")) {
    throw new Error("gate requires a supported kind and its original text");
  }
  return { kind: value.kind, detail: value.detail, legacyRaw: value.legacyRaw };
}

function normalizedExecutionHint(value) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("execution hint must be typed");
  const keys = Object.keys(value);
  if (keys.some((key) => !["agentHint", "legacyRaw"].includes(key))) throw new Error("execution hint has an unsupported field");
  if (!["codex", "opencode"].includes(value.agentHint)) {
    throw new Error("execution agentHint must be codex or opencode");
  }
  if (value.legacyRaw !== undefined && typeof value.legacyRaw !== "string") throw new Error("execution legacyRaw must be a string");
  return { agentHint: value.agentHint, ...(value.legacyRaw !== undefined ? { legacyRaw: value.legacyRaw } : {}) };
}

function priorAttemptCount(task) {
  const raw = task.legacyFields?.Attempts;
  const values = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map(String);
  const legacyCount = values.reduce((count, value) => {
    const match = /(?:^|;\s*)count=(\d+)\b/.exec(value);
    return match ? Math.max(count, Number(match[1])) : count;
  }, 0);
  const typedCount = (task.attempts ?? []).reduce((count, attempt) => Math.max(count, Number(attempt.count) || 0), 0);
  return Math.max(legacyCount, typedCount);
}

function hasActionableReason(reason) {
  const normalized = String(reason ?? "").trim().toLowerCase();
  return normalized !== "" && !PLACEHOLDER_REASONS.has(normalized);
}

function normalizedOperationParams(operation) {
  const supplied = operation.params ?? {};
  if (!operation.id || operation.candidateIdentity !== operation.effectObject
    || supplied.target !== operation.effectObject || supplied.intentRevision !== operation.intentRevision
    || typeof operation.expectedEffectValue !== "string"
    || supplied.expectedEffectValue !== operation.expectedEffectValue) {
    throw new Error("operation parameters disagree with effect or intent");
  }
  return {
    ...supplied,
    operationId: operation.id,
    candidateIdentity: operation.candidateIdentity,
    checkResult: operation.checkResult,
    effectRef: operation.effectRef,
    effectObject: operation.effectObject,
    expectedEffectValue: operation.expectedEffectValue,
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

function operationAuthorized(state, operation, { worker, epoch } = {}) {
  const task = taskFor(state, operation.taskId);
  const stored = Object.hasOwn(state.operations, operation.id) ? state.operations[operation.id] : null;
  const originalOwner = worker === operation.owner && epoch === operation.epoch;
  const recoveredOwner = operation.recovery?.worker === worker && operation.recovery?.epoch === epoch;
  if (!operationParamsMatch(operation) || stored?.id !== operation.id || stored?.status !== "prepared"
    || !task || task.status !== "claimed" || task.owner !== worker || task.epoch !== epoch
    || (!originalOwner && !recoveredOwner)
    || typeof operation.intent !== "string" || operation.intent.length === 0
    || !Number.isInteger(operation.intentRevision) || !Object.hasOwn(state.intents, operation.intent)
    || state.intents[operation.intent] !== operation.intentRevision
    || !operation.candidateIdentity || operation.checkResult?.candidateIdentity !== operation.candidateIdentity
    || operation.checkResult.exitCode !== 0) {
    return false;
  }
  return true;
}

function completionDecision(state, operation, effectReadback, identity) {
  if (!operationAuthorized(state, operation, identity)) return "rejected";
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
    if (task.status !== "open" && !STATUSES.has(task.status)) errors.push(`task ${id} has an invalid status`);
    if (task.type !== undefined && !TYPES.has(task.type)) errors.push(`task ${id} has an invalid type`);
    if (!task.legacyFields || typeof task.legacyFields !== "object" || Array.isArray(task.legacyFields)) {
      errors.push(`task ${id} legacy fields are not an object`);
    }
    if (task.laneRecipe !== undefined && task.laneRecipe !== null) {
      try { normalizedLaneRecipe(task.laneRecipe); } catch { errors.push(`task ${id} has an invalid lane recipe`); }
    }
    if (task.lane === true && !task.laneRecipe) errors.push(`task ${id} lane tasks require a complete lane recipe`);
    if (task.integration !== undefined && task.integration !== null) {
      try { normalizedIntegration(task.integration); } catch { errors.push(`task ${id} has an invalid integration outbox`); }
      if (task.lane !== true) errors.push(`task ${id} has an integration outbox but is not a lane task`);
    }
    if (task.gate !== undefined && task.gate !== null) {
      try { normalizedGate(task.gate); } catch { errors.push(`task ${id} has an invalid gate record`); }
    }
    if (task.executionHint !== undefined && task.executionHint !== null) {
      try { normalizedExecutionHint(task.executionHint); } catch { errors.push(`task ${id} has an invalid execution hint`); }
    }
    if (task.attempts !== undefined && (!Array.isArray(task.attempts) || task.attempts.some((attempt) =>
      !attempt || !Number.isInteger(attempt.count) || attempt.count < 1
      || typeof attempt.signature !== "string" || typeof attempt.reason !== "string" || typeof attempt.at !== "string"))) {
      errors.push(`task ${id} has invalid attempt records`);
    }
    if (task.lane === true && task.status === "done" && task.legacyCloseProofRequired !== true) {
      const operation = state.operations[task.result?.operationId];
      if (!operation || operation.taskId !== id || operation.status !== "observed"
        || operation.effectObject !== task.result?.effectObject) {
        errors.push(`task ${id} is done without an observed lane operation`);
      }
    }
    if (!Array.isArray(task.dependencies)) {
      errors.push(`task ${id} dependencies are not an array`);
      continue;
    }
    for (const dependency of task.dependencies) {
      if (!taskFor(state, dependency)) errors.push(`task ${id} has unknown dependency ${dependency}`);
    }
  }
  for (const [id, operation] of Object.entries(state.operations)) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      errors.push(`operation ${id} is not an object`);
      continue;
    }
    if (operation.id !== id || operation.candidateIdentity !== operation.effectObject
      || operation.checkResult?.candidateIdentity !== operation.candidateIdentity || operation.checkResult?.exitCode !== 0) {
      errors.push(`operation ${id} effect is not the checked candidate`);
    }
  }
  for (const [id, task] of entries) {
    if (task && typeof task === "object" && Array.isArray(task.dependencies) && hasDependencyCycle(state, id)) {
      errors.push(`task ${id} has a dependency cycle`);
    }
  }
  return [...new Set(errors)].sort();
}

function readTaskStoreSnapshot(root) {
  const repo = gitTopLevel(root);
  if (!repo) return null;
  const snapshot = readSnapshot(repo);
  if (!snapshot.oid) return null;
  return {
    oid: snapshot.oid,
    state: clone(snapshot.state),
    errors: taskStoreErrors(snapshot.state),
  };
}

export function readActiveTaskStoreSnapshot(root) {
  const repo = gitTopLevel(root);
  if (!repo) return null;
  const selector = runGit(repo, ["rev-parse", "--verify", "--quiet", ACTIVE_QUEUE_REF]);
  if (!selector.ok) {
    if (selector.status === 1) return null;
    throw new Error(selector.stderr || "cannot read active task-queue selector");
  }
  const blob = runGit(repo, ["cat-file", "blob", selector.out]);
  if (!blob.ok) throw new Error(blob.stderr || "cannot read active task-queue selector blob");
  let activation;
  try { activation = JSON.parse(blob.out); } catch { throw new Error("active task-queue selector is invalid JSON"); }
  if (!activation || typeof activation !== "object" || Array.isArray(activation)
    || activation.version !== ACTIVE_QUEUE_SELECTOR.version || activation.queueRef !== ACTIVE_QUEUE_SELECTOR.queueRef) {
    throw new Error("active task-queue selector has an unsupported shape");
  }
  const snapshot = readTaskStoreSnapshot(repo);
  if (!snapshot) throw new Error("active task-queue selector points at a missing task store");
  return snapshot;
}

export function copyActiveTaskStoreSnapshot(sourceRoot, destinationRoot) {
  const source = repositoryRoot(sourceRoot);
  const destination = repositoryRoot(destinationRoot);
  const sourceCommon = runGit(source, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const destinationCommon = runGit(destination, ["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  if (!sourceCommon.ok || !destinationCommon.ok) throw new Error("task snapshot copy requires two readable Git repositories");
  if (path.resolve(sourceCommon.out) === path.resolve(destinationCommon.out)) {
    throw new Error("task snapshot copy requires an isolated Git clone, not a linked worktree");
  }

  const snapshot = readActiveTaskStoreSnapshot(source);
  if (!snapshot) throw new Error("source Git-ref task queue is not active");
  if (snapshot.errors.length > 0) throw new Error(`source Git-ref task queue is invalid: ${snapshot.errors.join("; ")}`);

  const refs = [QUEUE_REF, ACTIVE_QUEUE_REF];
  const updates = [];
  let alreadyCopied = true;
  for (const ref of refs) {
    const sourceObject = runGit(source, ["rev-parse", "--verify", ref]);
    if (!sourceObject.ok) throw new Error(sourceObject.stderr || `cannot read source task ref ${ref}`);
    const destinationObject = runGit(destination, ["rev-parse", "--verify", "--quiet", ref]);
    if (destinationObject.ok) {
      if (destinationObject.out !== sourceObject.out) throw new Error(`destination task ref ${ref} already has different state`);
      continue;
    }
    if (destinationObject.status !== 1) throw new Error(destinationObject.stderr || `cannot read destination task ref ${ref}`);
    const content = runGit(source, ["cat-file", "blob", sourceObject.out]);
    if (!content.ok) throw new Error(content.stderr || `cannot read task snapshot object for ${ref}`);
    const copied = runGitInput(destination, ["hash-object", "-w", "--stdin"], content.out);
    if (!copied.ok || copied.out.trim() !== sourceObject.out) throw new Error(copied.stderr || `task snapshot object changed while copying ${ref}`);
    updates.push(`create ${ref} ${sourceObject.out}`);
    alreadyCopied = false;
  }

  if (updates.length > 0) {
    const applied = runGitInput(destination, ["update-ref", "--stdin"], `${updates.join("\n")}\n`);
    if (!applied.ok) throw new Error(applied.stderr || "cannot atomically activate copied task snapshot refs");
  }
  return { copied: !alreadyCopied, refs };
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

    async importSnapshot(prepared, { acceptClaimSessionAmbiguities = false } = {}) {
      if (typeof acceptClaimSessionAmbiguities !== "boolean") throw new Error("claim ambiguity acknowledgement must be boolean");
      const taskImport = await import("./task-import.mjs");
      taskImport.verifyPreparedLegacyQueueImport(prepared);
      const candidate = prepared?.state;
      const report = prepared?.report;
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)
        || candidate.version !== 0 || !candidate.tasks || typeof candidate.tasks !== "object" || Array.isArray(candidate.tasks)
        || !candidate.operations || typeof candidate.operations !== "object" || Array.isArray(candidate.operations)
        || !candidate.intents || typeof candidate.intents !== "object" || Array.isArray(candidate.intents)
        || !report || !Array.isArray(report.errors) || !Array.isArray(report.ambiguities)
        || !Array.isArray(report.pathIds) || !Array.isArray(report.archivePaths) || !Array.isArray(report.unmappedFields)
        || !prepared.archive || prepared.archive.version !== 1 || !Array.isArray(prepared.archive.entries)) {
        throw new Error("legacy import snapshot has an unsupported shape");
      }
      if (report.errors.length > 0) throw new Error("legacy import snapshot has blocking errors");
      if (report.ambiguities.length > 0 && !acceptClaimSessionAmbiguities) {
        throw new Error("legacy import snapshot has unresolved claim ambiguities");
      }
      const archivePaths = new Set(report.archivePaths);
      if (archivePaths.size !== report.archivePaths.length || archivePaths.size !== prepared.archive.entries.length) {
        throw new Error("legacy import archive manifest is incomplete");
      }
      for (const entry of prepared.archive.entries) {
        if (!entry || typeof entry.path !== "string" || !archivePaths.has(entry.path) || typeof entry.content !== "string") {
          throw new Error("legacy import archive manifest does not match its files");
        }
        const bytes = Buffer.from(entry.content, "base64");
        if (bytes.toString("base64") !== entry.content || sha256Hex(bytes) !== entry.sha256) {
          throw new Error(`legacy import archive digest mismatch: ${entry.path}`);
        }
      }
      if (report.pathIds.length !== Object.keys(candidate.tasks).length) throw new Error("legacy import path/ID set does not match its task records");
      for (const { path: sourcePath, id } of report.pathIds) {
        const task = taskFor(candidate, id);
        if (!task || task.sourcePath !== sourcePath || !archivePaths.has(sourcePath)) throw new Error(`legacy import path/ID mapping is incomplete for ${id}`);
      }
      const stateErrors = taskStoreErrors(candidate);
      if (stateErrors.length > 0) throw new Error(`legacy import candidate has task-state errors: ${stateErrors.join("; ")}`);
      for (const ambiguity of report.ambiguities) {
        const task = taskFor(candidate, ambiguity.id);
        if (ambiguity.field !== "Claim.session" || !ambiguity.claimLockPath || !archivePaths.has(ambiguity.claimLockPath)
          || typeof task?.legacyFields?.Claim !== "string") {
          throw new Error(`legacy import cannot preserve claim ambiguity for ${ambiguity.id}`);
        }
      }
      for (const { id, field, path: sourcePath } of report.unmappedFields) {
        const task = taskFor(candidate, id);
        if (!task || task.sourcePath !== sourcePath || !Object.hasOwn(task.legacyFields, field)) {
          throw new Error(`legacy import lost unmapped field ${field} for ${id}`);
        }
      }
      const previous = readSnapshot(repo);
      if (previous.oid) throw new Error("task store is already initialized");
      const next = clone(candidate);
      next.version = 1;
      writeSnapshot(repo, "", next);
      return {
        tasks: Object.keys(next.tasks).length,
        version: next.version,
        acknowledgedClaimSessionAmbiguities: report.ambiguities.length,
      };
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

    async add({ id = `task-${randomUUID()}`, title, body = "", sourcePath = "", dependencies = [], contextRef = null, type = "task", laneRecipe = null, executionHint = null, lane = false } = {}) {
      if (typeof id !== "string" || id.length === 0) throw new Error("task id must be a non-empty string");
      if (typeof title !== "string" || title.trim() === "") throw new Error("task title is required");
      if (typeof body !== "string" || typeof sourcePath !== "string") throw new Error("task body and source path must be strings");
      if (!TYPES.has(type)) throw new Error("task type is invalid");
      if (typeof lane !== "boolean") throw new Error("lane must be boolean");
      const normalizedRecipe = normalizedLaneRecipe(laneRecipe);
      const normalizedExecution = normalizedExecutionHint(executionHint);
      if (lane && !normalizedRecipe) throw new Error("lane tasks require a complete lane recipe");
      if (!Array.isArray(dependencies) || dependencies.some((dependency) => typeof dependency !== "string" || dependency === "")) {
        throw new Error("task dependencies must be non-empty ids");
      }
      const previous = readSnapshot(repo);
      if (Object.hasOwn(previous.state.tasks, id)) throw new Error(`task ${id} already exists`);
      const unknownDependency = dependencies.find((dependency) => !Object.hasOwn(previous.state.tasks, dependency));
      if (unknownDependency) throw new Error(`task ${id} has unknown dependency ${unknownDependency}`);
      const next = clone(previous.state);
      const task = {
        id,
        title: title.trim(),
        type,
        body,
        sourcePath,
        legacyFields: {},
        dependencies: [...dependencies],
        contextRef: typedContextReference(contextRef),
        laneRecipe: normalizedRecipe,
        executionHint: normalizedExecution,
        lane,
        status: "open",
        epoch: 0,
        owner: "",
        comments: [],
        attempts: [],
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
      const allowed = new Set(["title", "body", "dependencies", "contextRef", "type", "laneRecipe", "executionHint"]);
      const fields = Object.keys(patch);
      if (fields.length === 0 || fields.some((field) => !allowed.has(field))) throw new Error("task edit requires supported content or dependency fields");
      if (Object.hasOwn(patch, "title") && (typeof patch.title !== "string" || patch.title.trim() === "")) throw new Error("task title is required");
      if (Object.hasOwn(patch, "body") && typeof patch.body !== "string") throw new Error("task body must be a string");
      if (Object.hasOwn(patch, "type") && !TYPES.has(patch.type)) throw new Error("task type is invalid");
      if (Object.hasOwn(patch, "dependencies") && (!Array.isArray(patch.dependencies)
        || patch.dependencies.some((dependency) => typeof dependency !== "string" || dependency === ""))) {
        throw new Error("task dependencies must be non-empty ids");
      }
      const changes = {
        ...(Object.hasOwn(patch, "title") ? { title: patch.title.trim() } : {}),
        ...(Object.hasOwn(patch, "type") ? { type: patch.type } : {}),
        ...(Object.hasOwn(patch, "body") ? { body: patch.body } : {}),
        ...(Object.hasOwn(patch, "dependencies") ? { dependencies: [...patch.dependencies] } : {}),
        ...(Object.hasOwn(patch, "contextRef") ? { contextRef: typedContextReference(patch.contextRef) } : {}),
        ...(Object.hasOwn(patch, "laneRecipe") ? { laneRecipe: normalizedLaneRecipe(patch.laneRecipe) } : {}),
        ...(Object.hasOwn(patch, "executionHint") ? { executionHint: normalizedExecutionHint(patch.executionHint) } : {}),
      };
      const previous = readSnapshot(repo);
      const next = clone(previous.state);
      const task = taskFor(next, id);
      if (!task || !["open", "ready"].includes(task.status)) throw new Error(`task ${id} cannot edit in its current state`);
      const unknownDependency = changes.dependencies?.find((dependency) => !Object.hasOwn(next.tasks, dependency));
      if (unknownDependency) throw new Error(`task ${id} has unknown dependency ${unknownDependency}`);
      const changed = Object.keys(changes).filter((field) => JSON.stringify(task[field]) !== JSON.stringify(changes[field]));
      if (changed.length === 0) return clone(task);
      const updatedTask = { ...task, ...changes };
      if (updatedTask.lane === true && !updatedTask.laneRecipe) throw new Error("lane tasks require a complete lane recipe");
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
        if (!task.dependencies.every((dependency) => taskFor(state, dependency)?.status === "done")) {
          throw new Error(`task ${id} has unresolved dependencies`);
        }
        task.status = "claimed";
        task.epoch += 1;
        task.owner = worker;
        task.lease = { worker, session, at, epoch: task.epoch, renew: at, duration };
        task.history.push({ type: "claimed", worker, epoch: task.epoch });
        return task;
      });
    },

    async claimReady({ worker, session = "", at = new Date().toISOString(), duration = DEFAULT_CLAIM_DURATION } = {}) {
      if (typeof worker !== "string" || worker.trim() === "") throw new Error("claim worker is required");
      if (!Number.isFinite(Date.parse(at)) || !Number.isFinite(duration) || duration <= 0) throw new Error("claim lease is invalid");
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const previous = readSnapshot(repo);
        const next = clone(previous.state);
        const task = Object.values(next.tasks)
          .filter((entry) => entry.status === "ready" && entry.dependencies.every((dependency) => taskFor(next, dependency)?.status === "done"))
          .sort((left, right) => left.id.localeCompare(right.id))[0];
        if (!task) throw new Error("no unblocked ready task");
        task.status = "claimed";
        task.epoch += 1;
        task.owner = worker;
        task.lease = { worker, session, at, epoch: task.epoch, renew: at, duration };
        task.history.push({ type: "claimed", worker, epoch: task.epoch });
        try {
          commitSnapshot(repo, previous, next);
          return clone(task);
        } catch (error) {
          if (!(error instanceof StoreConflict) || attempt === 7) throw error;
        }
      }
      throw new Error("task-store claim-ready contention exceeded retries");
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

    async takeover(id, { worker, session = "", expectedEpoch, reason, at = new Date().toISOString(), duration = DEFAULT_CLAIM_DURATION } = {}) {
      if (typeof worker !== "string" || worker.trim() === "" || !Number.isInteger(expectedEpoch) || !hasActionableReason(reason)) {
        throw new Error("takeover requires worker, expected claim generation and a non-placeholder reason");
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
      task.history.push({ type: "takeover", previousOwner, worker, previousEpoch: expectedEpoch, epoch: task.epoch, reason: reason.trim() });
      for (const operation of Object.values(state.operations)) {
        if (operation?.taskId !== id || operation.status !== "prepared") continue;
        operation.recovery = { worker, epoch: task.epoch, at };
        task.history.push({ type: "operation-recovery-assigned", id: operation.id, worker, epoch: task.epoch });
      }
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
      if (!actor || !hasActionableReason(reason)) throw new Error("human close requires actor and a non-placeholder reason");
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status === "done") throw new Error(`task ${id} cannot close`);
        if (task.lane || task.legacyCloseProofRequired) throw new Error("proof-gated close requires operation readback");
        if (epoch === undefined && task.status === "claimed") throw new Error("active claim requires its generation or an explicit takeover");
        if (epoch !== undefined && (task.status !== "claimed" || task.owner !== actor || task.epoch !== epoch)) {
          throw new Error("stale claim generation");
        }
        task.status = "done";
        task.owner = "";
        delete task.lease;
        task.result = { actor, reason, ...(proof ? { proof } : {}) };
        task.history.push({ type: "closed", actor, reason });
        return task;
      });
    },

    async reopen(id, { actor, reason } = {}) {
      if (!actor || !hasActionableReason(reason)) throw new Error("reopen requires actor and a non-placeholder reason");
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "done") throw new Error(`task ${id} cannot reopen`);
        task.status = "open";
        task.owner = "";
        delete task.lease;
        task.history.push({ type: "reopened", actor, reason });
        return task;
      });
    },

    async release(id, { actor, reason, epoch } = {}) {
      if (!actor || !hasActionableReason(reason) || !Number.isInteger(epoch)) {
        throw new Error("release requires actor, a non-placeholder reason and claim generation");
      }
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "claimed" || task.owner !== actor || task.epoch !== epoch) {
          throw new Error("stale claim generation");
        }
        task.status = "abandoned";
        task.owner = "";
        delete task.lease;
        task.history.push({ type: "released", actor, reason, epoch });
        return task;
      });
    },

    async recordFailure(id, { worker, epoch, signature = "", reason = "unknown", at = new Date().toISOString() } = {}) {
      if (typeof worker !== "string" || worker.trim() === "" || !Number.isInteger(epoch) || !Number.isFinite(Date.parse(at))) {
        throw new Error("failure requires claim owner, generation and timestamp");
      }
      const cleanSignature = String(signature).replace(/[\r\n;]+/g, " ").trim();
      const cleanReason = String(reason).replace(/[\r\n]+/g, " ").trim() || "unknown";
      return transition((state) => {
        const task = taskFor(state, id);
        if (!task || task.status !== "claimed" || task.owner !== worker || task.epoch !== epoch) {
          throw new Error("stale claim generation");
        }
        const count = priorAttemptCount(task) + 1;
        const attempt = { count, signature: cleanSignature, reason: cleanReason, at };
        if (!Array.isArray(task.attempts)) task.attempts = [];
        task.attempts.push(attempt);
        task.history.push({ type: "attempt-failed", ...attempt });
        if (count >= MAX_ATTEMPTS) {
          task.status = "blocked";
          const priorGate = task.legacyFields.Gate;
          const legacyGates = (Array.isArray(priorGate) ? priorGate : priorGate === undefined ? [] : [priorGate]).map(String);
          if (task.gate?.legacyRaw && !legacyGates.includes(task.gate.legacyRaw)) legacyGates.push(task.gate.legacyRaw);
          legacyGates.push("retries-exhausted");
          task.legacyFields.Gate = legacyGates.length === 1 ? legacyGates[0] : legacyGates;
          task.gate = null;
          task.owner = "";
          delete task.lease;
        }
        return {
          id,
          status: task.status,
          attempts: count,
          signature: cleanSignature || null,
          gate: count >= MAX_ATTEMPTS ? "retries-exhausted" : null,
        };
      });
    },

    async setIntentRevision(intent, revision, { expectedRevision } = {}) {
      if (typeof intent !== "string" || intent.length === 0 || !Number.isInteger(revision) || revision < 1) {
        throw new Error("intent and positive revision are required");
      }
      const previous = readSnapshot(repo);
      const current = Object.hasOwn(previous.state.intents, intent) ? previous.state.intents[intent] : 0;
      if (expectedRevision !== undefined && (!Number.isInteger(expectedRevision) || expectedRevision !== current)) {
        throw new Error(`intent ${intent} revision changed (expected ${expectedRevision}, found ${current})`);
      }
      if (revision < current) throw new Error(`intent ${intent} revision cannot move backwards`);
      if (revision === current) return { intent, revision, idempotent: true };
      const next = clone(previous.state);
      Object.defineProperty(next.intents, intent, { value: revision, enumerable: true, configurable: true, writable: true });
      commitSnapshot(repo, previous, next);
      return { intent, revision, idempotent: false };
    },

    async prepareOperation(operation = {}) {
      if (typeof operation.id !== "string" || operation.id.length === 0) throw new Error("operation id is required");
      if (operation.candidateIdentity !== operation.effectObject) {
        throw new Error("effect object must be the checked candidate");
      }
      if (typeof operation.effectRef !== "string" || !runGit(repo, ["check-ref-format", operation.effectRef]).ok) {
        throw new Error("operation effect ref is invalid");
      }
      const previous = readSnapshot(repo);
      const current = Object.hasOwn(previous.state.operations, operation.id) ? previous.state.operations[operation.id] : null;
      const currentEffectValue = current?.expectedEffectValue ?? readRef(repo, operation.effectRef);
      const expectedEffectValue = operation.expectedEffectValue ?? currentEffectValue;
      if (typeof expectedEffectValue !== "string" || (!current && expectedEffectValue !== currentEffectValue)) {
        throw new Error("operation expected effect value does not match the current ref");
      }
      const boundOperation = {
        ...operation,
        expectedEffectValue,
        params: { ...(operation.params ?? {}), expectedEffectValue },
      };
      const params = normalizedOperationParams(boundOperation);
      if (operation.effectRef === QUEUE_REF || operation.effectRef === ACTIVE_QUEUE_REF) {
        throw new Error("operation effect ref cannot replace KRN task-store refs");
      }
      if (typeof operation.effectObject !== "string" || !objectExists(repo, operation.effectObject)) {
        throw new Error("operation effect object does not exist");
      }
      if (typeof operation.candidateIdentity !== "string" || !objectExists(repo, operation.candidateIdentity)
        || operation.checkResult?.candidateIdentity !== operation.candidateIdentity || operation.checkResult.exitCode !== 0) {
        throw new Error("check result is not bound to the existing candidate");
      }
      if (current) {
        if (JSON.stringify(current.params) !== JSON.stringify(params)) throw new Error("operation id reused with different parameters");
        if (current.status === "observed") return { idempotent: true, status: current.status };
        const currentTask = taskFor(previous.state, operation.taskId);
        if (!currentTask || currentTask.status !== "claimed" || currentTask.owner !== operation.owner || currentTask.epoch !== operation.epoch) {
          throw new Error("operation has stale claim generation");
        }
        if (typeof operation.intent !== "string" || !Object.hasOwn(previous.state.intents, operation.intent)
          || previous.state.intents[operation.intent] !== operation.intentRevision) {
          throw new Error("operation has stale intent revision");
        }
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
      const stored = { ...clone(boundOperation), params, status: "prepared" };
      Object.defineProperty(next.operations, operation.id, { value: stored, enumerable: true, configurable: true, writable: true });
      task.history.push({ type: "operation-prepared", id: operation.id });
      commitSnapshot(repo, previous, next);
      return { idempotent: false, status: "prepared" };
    },

    async applyOperation(operationId, actor = {}) {
      const previous = readSnapshot(repo);
      const operation = Object.hasOwn(previous.state.operations, operationId) ? previous.state.operations[operationId] : null;
      if (!operation) throw new Error(`operation ${operationId} does not exist`);
      if (operation.status === "observed") return { idempotent: true, status: "observed" };
      const identity = { worker: actor.worker ?? operation.owner, epoch: actor.epoch ?? operation.epoch };
      if (!operationAuthorized(previous.state, operation, identity)) {
        throw new Error("operation authority or claim generation is stale; effect was not applied");
      }
      if (readRef(repo, operation.effectRef) !== operation.expectedEffectValue) {
        return { idempotent: false, status: "ambiguous" };
      }
      const next = clone(previous.state);
      const current = next.operations[operationId];
      current.status = "observed";
      const task = taskFor(next, current.taskId);
      task.status = "done";
      task.owner = "";
      delete task.lease;
      task.result = { operationId, effectObject: current.effectObject };
      task.history.push({ type: "operation-observed", id: operationId });
      writeSnapshotAndRef(repo, previous, next, current.effectRef, current.effectObject, current.expectedEffectValue);
      return { idempotent: false, status: "observed" };
    },

    async completeOperation(operationId, actor = {}) {
      const previous = readSnapshot(repo);
      const operation = Object.hasOwn(previous.state.operations, operationId) ? previous.state.operations[operationId] : null;
      if (!operation) throw new Error(`operation ${operationId} does not exist`);
      if (operation.status === "observed") return { idempotent: true, status: "observed" };
      const worker = actor.worker ?? operation.owner;
      const epoch = actor.epoch ?? operation.epoch;
      const identity = { worker, epoch };
      const firstDecision = completionDecision(previous.state, operation, readRef(repo, operation.effectRef), identity);
      if (firstDecision !== "accepted") {
        if (firstDecision === "ambiguous") return { idempotent: false, status: "ambiguous" };
        throw new Error("operation acceptance is stale or invalid for the current claim generation");
      }
      const next = clone(previous.state);
      const current = next.operations[operationId];
      const effectReadback = readRef(repo, current.effectRef);
      if (completionDecision(next, current, effectReadback, identity) !== "accepted") {
        throw new Error("operation acceptance changed before completion or claim generation is stale");
      }
      current.status = "observed";
      const task = taskFor(next, current.taskId);
      task.status = "done";
      task.owner = "";
      delete task.lease;
      task.result = { operationId, effectObject: current.effectObject };
      task.history.push({ type: "operation-observed", id: operationId });
      commitSnapshot(repo, previous, next);
      return { idempotent: false, status: "observed" };
    },
  });
}
