import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { writeAtomic } from "../../scripts/lib/support/write-atomic.mjs";

// H2 comparison fixture only; this is not a production storage adapter.
const FILE = fileURLToPath(import.meta.url);
const ZERO = "0".repeat(40);
const git = (root, ...args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" }).trim();
const runGit = (root, ...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
class Refused extends Error {}

function commonDir(root) {
  return resolve(root, git(root, "rev-parse", "--git-common-dir"));
}

function paths(root, key) {
  const common = commonDir(root);
  const directory = join(common, "krn-task-h2");
  return {
    directory,
    file: join(directory, `${key}.json`),
    mutex: join(directory, `${key}.mutex`),
    database: join(directory, "trial.sqlite"),
    ref: `refs/krn/h2/${key}`,
  };
}

async function sqliteConstructor() {
  try {
    return (await import("node:sqlite")).DatabaseSync;
  } catch {
    return null;
  }
}

function emptyState() {
  return { version: 0, tasks: {}, intents: { alpha: 1, beta: 1 }, operations: {} };
}

function runDb(file, fn) {
  return sqliteConstructor().then((DatabaseSync) => {
    if (!DatabaseSync) throw new Refused(`node:sqlite unavailable on ${process.version}`);
    const db = new DatabaseSync(file);
    db.exec("PRAGMA busy_timeout = 3000");
    try { return fn(db); } finally { db.close(); }
  });
}

async function initialize(backend, root, key, state = emptyState()) {
  const target = paths(root, key);
  mkdirSync(target.directory, { recursive: true });
  if (backend === "files") {
    writeAtomic(target.file, JSON.stringify(state));
  } else if (backend === "sqlite") {
    await runDb(target.database, (db) => {
      db.exec("CREATE TABLE IF NOT EXISTS snapshot (id TEXT PRIMARY KEY, body TEXT NOT NULL)");
      db.prepare("INSERT OR REPLACE INTO snapshot (id, body) VALUES (?, ?)").run(key, JSON.stringify(state));
    });
  } else if (backend === "git-ref") {
    const stored = spawnSync("git", ["-C", root, "hash-object", "-w", "--stdin"], { input: JSON.stringify(state), encoding: "utf8" });
    if (stored.status !== 0) throw new Error(stored.stderr);
    const created = runGit(root, "update-ref", target.ref, stored.stdout.trim(), ZERO);
    if (created.status !== 0) throw new Refused(created.stderr || "Git-ref already exists");
  } else {
    throw new Error(`unknown backend ${backend}`);
  }
}

async function snapshot(backend, root, key) {
  const target = paths(root, key);
  if (backend === "files") {
    const state = JSON.parse(readFileSync(target.file, "utf8"));
    return { state, token: state.version };
  }
  if (backend === "sqlite") {
    return runDb(target.database, (db) => {
      const state = JSON.parse(db.prepare("SELECT body FROM snapshot WHERE id = ?").get(key).body);
      return { state, token: state.version };
    });
  }
  const token = git(root, "rev-parse", "--verify", target.ref);
  const state = JSON.parse(git(root, "cat-file", "blob", token));
  return { state, token };
}

async function update(backend, root, key, previous, change) {
  const target = paths(root, key);
  if (backend === "files") {
    try { mkdirSync(target.mutex); } catch (error) {
      if (error?.code === "EEXIST") throw new Refused("file mutex is busy");
      throw error;
    }
    try {
      const current = await snapshot(backend, root, key);
      if (current.token !== previous.token) throw new Refused("file snapshot changed");
      const next = structuredClone(current.state);
      const result = change(next);
      next.version = current.state.version + 1;
      writeAtomic(target.file, JSON.stringify(next));
      return { state: next, token: next.version, result };
    } finally {
      rmSync(target.mutex, { recursive: true, force: true });
    }
  }
  if (backend === "sqlite") {
    return runDb(target.database, (db) => {
      db.exec("BEGIN IMMEDIATE");
      try {
        const current = JSON.parse(db.prepare("SELECT body FROM snapshot WHERE id = ?").get(key).body);
        if (current.version !== previous.token) throw new Refused("SQLite snapshot changed");
        const next = structuredClone(current);
        const result = change(next);
        next.version = current.version + 1;
        db.prepare("UPDATE snapshot SET body = ? WHERE id = ?").run(JSON.stringify(next), key);
        db.exec("COMMIT");
        return { state: next, token: next.version, result };
      } catch (error) {
        try { db.exec("ROLLBACK"); } catch { /* transaction already ended */ }
        throw error;
      }
    });
  }
  if (backend === "git-ref") {
    if (git(root, "rev-parse", "--verify", target.ref) !== previous.token) throw new Refused("Git ref changed");
    const next = structuredClone(previous.state);
    const result = change(next);
    next.version = previous.state.version + 1;
    const stored = spawnSync("git", ["-C", root, "hash-object", "-w", "--stdin"], { input: JSON.stringify(next), encoding: "utf8" });
    if (stored.status !== 0) throw new Error(stored.stderr);
    const moved = runGit(root, "update-ref", target.ref, stored.stdout.trim(), previous.token);
    if (moved.status !== 0) throw new Refused("Git ref compare-and-swap refused");
    return { state: next, token: stored.stdout.trim(), result };
  }
  throw new Error(`unknown backend ${backend}`);
}

function addTask(state, { id, title, sourcePath = "", legacyFields = {}, dependencies = [], contextRef = null, lane = false }) {
  if (state.tasks[id]) throw new Refused("task already exists");
  state.tasks[id] = { id, title, sourcePath, legacyFields, dependencies, contextRef, lane, status: "open", epoch: 0, owner: "", comments: [], history: [{ type: "added", title }] };
  return id;
}

function markReady(state, id) {
  const task = state.tasks[id];
  if (!task || task.status !== "open") throw new Refused("task is not open");
  if (hasDependencyCycle(state, id)) throw new Refused("task has a dependency cycle");
  if (!task.dependencies.every((dependency) => state.tasks[dependency]?.status === "done")) throw new Refused("task has unresolved dependencies");
  task.status = "ready";
  task.history.push({ type: "ready" });
}

function hasDependencyCycle(state, root, path = new Set(), visited = new Set()) {
  if (path.has(root)) return true;
  if (visited.has(root)) return false;
  const task = state.tasks[root];
  if (!task) return false;
  path.add(root);
  for (const dependency of task.dependencies) {
    if (hasDependencyCycle(state, dependency, path, visited)) return true;
  }
  path.delete(root);
  visited.add(root);
  return false;
}

function claimTask(state, id, worker) {
  const task = state.tasks[id];
  if (!task || task.status !== "ready") throw new Refused("task is not ready");
  task.status = "claimed";
  task.epoch += 1;
  task.owner = worker;
  task.history.push({ type: "claimed", worker, epoch: task.epoch });
  return task.epoch;
}

function commentTask(state, id, worker, epoch, body) {
  const task = state.tasks[id];
  if (!task || task.status !== "claimed" || task.owner !== worker || task.epoch !== epoch) throw new Refused("stale claim generation");
  task.comments.push({ author: worker, body });
  task.history.push({ type: "comment", author: worker, body });
}

function closeTask(state, id, { actor, reason, epoch, proof }) {
  const task = state.tasks[id];
  if (!task || task.status === "done") throw new Refused("task cannot close");
  if (task.lane) throw new Refused("lane close requires operation readback");
  if (epoch === undefined && (!actor || !reason)) throw new Refused("human close requires actor and reason");
  if (epoch !== undefined && (task.status !== "claimed" || task.owner !== actor || task.epoch !== epoch)) throw new Refused("stale claim generation");
  task.status = "done";
  task.result = { actor, reason, ...(proof ? { proof } : {}) };
  task.history.push({ type: "closed", actor, reason });
}

function reopenTask(state, id, { actor, reason }) {
  const task = state.tasks[id];
  if (!task || task.status !== "done" || !actor || !reason) throw new Refused("reopen requires a done task, actor, and reason");
  task.status = "open";
  task.owner = "";
  task.history.push({ type: "reopened", actor, reason });
}

async function claimWorker({ backend, root, key, id, worker, ready, go }) {
  const observed = await snapshot(backend, root, key);
  writeFileSync(ready, String(observed.state.version));
  await waitForFile(go);
  try {
    const result = await update(backend, root, key, observed, (state) => claimTask(state, id, worker));
    process.stdout.write(JSON.stringify({ won: true, epoch: result.result }));
  } catch (error) {
    if (!(error instanceof Refused)) throw error;
    process.stdout.write(JSON.stringify({ won: false, reason: error.message }));
  }
}

async function crashAfterClaim({ backend, root, key, id, worker }) {
  const prior = await snapshot(backend, root, key);
  await update(backend, root, key, prior, (state) => claimTask(state, id, worker));
  process.exit(86); // committed, but no response reaches the caller
}

async function crashAfterEffect({ root, ref, object }) {
  writeEffectRef(root, ref, object);
  process.exit(87); // external Git effect happened; store receipt has not been recorded
}

async function waitForFile(file, timeout = 5000) {
  const start = Date.now();
  while (!existsSync(file)) {
    if (Date.now() - start > timeout) throw new Error(`timed out waiting for ${file}`);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }
}

function writeEffectRef(root, ref, object) {
  const result = runGit(root, "update-ref", ref, object, ZERO);
  if (result.status !== 0) throw new Refused("external effect already exists");
}

function readEffectRef(root, ref) {
  const result = runGit(root, "rev-parse", "--verify", ref);
  return result.status === 0 ? result.stdout.trim() : "";
}

const workerMode = process.argv[2] === "--h2-worker";
if (workerMode) {
  const [, , , mode, backend, root, key, ...rest] = process.argv;
  if (mode === "claim-race") {
    await claimWorker({ backend, root, key, id: rest[0], worker: rest[1], ready: rest[2], go: rest[3] });
  } else if (mode === "crash-after-claim") {
    await crashAfterClaim({ backend, root, key, id: rest[0], worker: rest[1] });
  } else if (mode === "crash-after-effect") {
    await crashAfterEffect({ root, ref: rest[0], object: rest[1] });
  } else {
    throw new Error(`unknown H2 worker mode ${mode}`);
  }
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-task-h2-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "lab@krn.local");
  git(root, "config", "user.name", "lab");
  git(root, "commit", "-q", "--allow-empty", "-m", "seed H2 fixture");
  const first = join(root, "worktree-a");
  const second = join(root, "worktree-b");
  git(root, "worktree", "add", "-q", "-b", "h2/a", first, "HEAD");
  git(root, "worktree", "add", "-q", "-b", "h2/b", second, "HEAD");
  return { root, first, second };
}

function writeBlob(root, value) {
  const result = spawnSync("git", ["-C", root, "hash-object", "-w", "--stdin"], { input: value, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function normalizedOperationParams(operation) {
  const supplied = operation.params ?? {};
  if (!operation.id || supplied.target !== operation.effectObject || supplied.intentRevision !== operation.intentRevision) {
    throw new Refused("operation parameters disagree with the effect or intent");
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
  const { taskId, owner, epoch, intent, intentRevision } = operation;
  const task = state.tasks[taskId];
  const stored = state.operations[operation.id];
  if (!operationParamsMatch(operation) || stored?.id !== operation.id || stored?.status !== "prepared"
    || !task || task.status !== "claimed" || task.owner !== owner || task.epoch !== epoch
    || typeof intent !== "string" || intent.length === 0 || !Number.isInteger(intentRevision) || state.intents[intent] !== intentRevision
    || !operation.candidateIdentity || operation.checkResult?.candidateIdentity !== operation.candidateIdentity || operation.checkResult.exitCode !== 0) {
    return "rejected";
  }
  if (!operation.effectRef || !operation.effectObject || effectReadback !== operation.effectObject) return "ambiguous";
  return "accepted";
}

function candidateEvidence(root, candidateIdentity) {
  const result = runGit(root, "cat-file", "-e", candidateIdentity);
  return { candidateIdentity, command: "git cat-file -e <candidate>", exitCode: result.status };
}

function readyIds(state) {
  return Object.values(state.tasks)
    .filter((task) => task.status === "ready" && task.dependencies.every((id) => state.tasks[id]?.status === "done"))
    .map((task) => task.id)
    .sort();
}

async function mutate(backend, root, key, change) {
  const prior = await snapshot(backend, root, key);
  return update(backend, root, key, prior, change);
}

async function ensureOperation(backend, root, key, operation) {
  const prior = await snapshot(backend, root, key);
  const current = prior.state.operations[operation.id];
  let parameters;
  try {
    parameters = normalizedOperationParams(operation);
  } catch (error) {
    if (current) throw new Refused("operation id reused with different parameters");
    throw error;
  }
  if (current) {
    if (JSON.stringify(current.params) !== JSON.stringify(parameters)) throw new Refused("operation id reused with different parameters");
    return { state: prior.state, result: { idempotent: true, status: current.status } };
  }
  return update(backend, root, key, prior, (state) => {
    const task = state.tasks[operation.taskId];
    if (!task || task.status !== "claimed" || task.owner !== operation.owner || task.epoch !== operation.epoch) throw new Refused("operation has stale claim generation");
    if (state.intents[operation.intent] !== operation.intentRevision) throw new Refused("operation has stale intent revision");
    if (!operation.candidateIdentity || operation.checkResult?.candidateIdentity !== operation.candidateIdentity || operation.checkResult.exitCode !== 0) throw new Refused("check result is not bound to the candidate");
    state.operations[operation.id] = { ...operation, params: parameters, status: "prepared" };
    task.history.push({ type: "operation-prepared", id: operation.id });
    return { idempotent: false, status: "prepared" };
  });
}

async function completeOperation(backend, root, key, operationId) {
  const prior = await snapshot(backend, root, key);
  const operation = prior.state.operations[operationId];
  if (!operation) throw new Refused("operation does not exist");
  if (operation.status === "observed") return { state: prior.state, result: { idempotent: true, status: "observed" } };
  const initialReadback = operation.effectRef ? readEffectRef(root, operation.effectRef) : "";
  const decision = completionDecision(prior.state, operation, initialReadback);
  if (decision === "ambiguous") return { state: prior.state, result: { status: "ambiguous" } };
  if (decision !== "accepted") throw new Refused("operation acceptance is stale or invalid");
  return update(backend, root, key, prior, (state) => {
    const current = state.operations[operationId];
    const currentReadback = current.effectRef ? readEffectRef(root, current.effectRef) : "";
    if (completionDecision(state, current, currentReadback) !== "accepted") throw new Refused("operation acceptance changed before completion");
    current.status = "observed";
    const task = state.tasks[current.taskId];
    task.status = "done";
    task.result = { operationId, effectObject: current.effectObject };
    task.history.push({ type: "operation-observed", id: operationId });
    return { idempotent: false, status: "observed" };
  });
}

function launchWorker(backend, mode, root, key, ...args) {
  const nodeArgs = [];
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (backend === "sqlite" && major === 22 && minor < 13) nodeArgs.push("--experimental-sqlite");
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [...nodeArgs, FILE, "--h2-worker", mode, backend, root, key, ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectPromise);
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function startClaimRace(backend, fixture) {
  const key = "race";
  const state = emptyState();
  addTask(state, { id: "same-ready-id", title: "one winner" });
  markReady(state, "same-ready-id");
  await initialize(backend, fixture.first, key, state);
  const readyA = join(fixture.root, "worker-a.ready");
  const readyB = join(fixture.root, "worker-b.ready");
  const go = join(fixture.root, "race.go");
  const first = launchWorker(backend, "claim-race", fixture.first, key, "same-ready-id", "worker-a", readyA, go);
  const second = launchWorker(backend, "claim-race", fixture.second, key, "same-ready-id", "worker-b", readyB, go);
  await waitForFile(readyA);
  await waitForFile(readyB);
  writeFileSync(go, "go");
  const outcomes = await Promise.all([first, second]);
  for (const outcome of outcomes) assert.equal(outcome.code, 0, outcome.stderr);
  const results = outcomes.map((outcome) => JSON.parse(outcome.stdout));
  assert.equal(results.filter((result) => result.won).length, 1, `${backend} must admit exactly one claimant: ${JSON.stringify(results)}`);
  const final = await snapshot(backend, fixture.second, key);
  const task = final.state.tasks["same-ready-id"];
  assert.equal(task.status, "claimed");
  assert.equal(task.epoch, 1);
  assert.equal(task.history.filter((entry) => entry.type === "claimed").length, 1);
}

async function exerciseBackend(backend) {
  const fixture = makeRepo();
  try {
    const key = "daily";
    await initialize(backend, fixture.first, key);
    await mutate(backend, fixture.first, key, (state) => {
      addTask(state, { id: "lane-task", title: "automated work", sourcePath: ".scratch/lane.md", legacyFields: { Integration: "branch=lane/x", CustomField: "retained" }, contextRef: { kind: "lesson", revision: "abc123", anchor: "row-18" }, lane: true });
      addTask(state, { id: "human-task", title: "human-only work" });
      addTask(state, { id: "unrelated", title: "unrelated outcome" });
      addTask(state, { id: "dependent-task", title: "waits for human task", dependencies: ["human-task"] });
      addTask(state, { id: "cycle-a", title: "cycle A", dependencies: ["cycle-b"] });
      addTask(state, { id: "cycle-b", title: "cycle B", dependencies: ["cycle-a"] });
      addTask(state, { id: "unknown-dependency", title: "unknown blocker", dependencies: ["missing-task"] });
      for (const id of ["lane-task", "human-task", "unrelated"]) markReady(state, id);
    });
    const ready = await snapshot(backend, fixture.second, key);
    assert.deepEqual(readyIds(ready.state), ["human-task", "lane-task", "unrelated"]);
    assert.throws(() => markReady(structuredClone(ready.state), "dependent-task"), /unresolved dependencies/);
    assert.throws(() => markReady(structuredClone(ready.state), "cycle-a"), /dependency cycle/);
    assert.throws(() => markReady(structuredClone(ready.state), "cycle-b"), /dependency cycle/);
    assert.throws(() => markReady(structuredClone(ready.state), "unknown-dependency"), /unresolved dependencies/);
    const claimed = await mutate(backend, fixture.first, key, (state) => claimTask(state, "lane-task", "worker-a"));
    const epoch = claimed.result;
    await mutate(backend, fixture.second, key, (state) => commentTask(state, "lane-task", "worker-a", epoch, "checked candidate"));
    const laneCandidate = writeBlob(fixture.root, `${backend}-lane-candidate`);
    const laneEffectRef = `refs/krn/h2-effects/${backend}-normal-close`;
    const laneOperation = {
      id: `${backend}-normal-close`, taskId: "lane-task", owner: "worker-a", epoch,
      intent: "alpha", intentRevision: 1, effectRef: laneEffectRef, effectObject: laneCandidate,
      candidateIdentity: laneCandidate, checkResult: candidateEvidence(fixture.root, laneCandidate),
      params: { target: laneCandidate, intentRevision: 1 },
    };
    assert.throws(() => closeTask(structuredClone(ready.state), "lane-task", { actor: "worker-a", reason: "accepted" }), /operation readback/);
    await ensureOperation(backend, fixture.second, key, laneOperation);
    const preparedLane = await snapshot(backend, fixture.first, key);
    const storedLaneOperation = preparedLane.state.operations[laneOperation.id];
    assert.equal(completionDecision(preparedLane.state, {
      ...storedLaneOperation,
      intent: undefined,
      intentRevision: undefined,
      params: { ...storedLaneOperation.params, intent: undefined, intentRevision: undefined },
    }, laneCandidate), "rejected", "normal completion requires an explicit current intent revision");
    assert.equal(completionDecision(preparedLane.state, {
      ...storedLaneOperation,
      params: { ...storedLaneOperation.params, operationId: "different-operation" },
    }, laneCandidate), "rejected", "normal completion binds its operation ID");
    assert.equal(completionDecision(preparedLane.state, {
      ...storedLaneOperation,
      params: { ...storedLaneOperation.params, target: "different-effect" },
    }, laneCandidate), "rejected", "normal completion binds substantive operation parameters");
    assert.equal(completionDecision(preparedLane.state, storedLaneOperation, "different-effect"), "ambiguous", "normal completion requires exact effect readback");
    const beforeEffect = await completeOperation(backend, fixture.first, key, laneOperation.id);
    assert.equal(beforeEffect.result.status, "ambiguous");
    assert.equal(beforeEffect.state.tasks["lane-task"].status, "claimed");
    writeEffectRef(fixture.root, laneEffectRef, laneCandidate);
    await completeOperation(backend, fixture.second, key, laneOperation.id); // ordinary completion path
    await mutate(backend, fixture.second, key, (state) => closeTask(state, "human-task", { actor: "operator", reason: "handled manually" }));
    await mutate(backend, fixture.second, key, (state) => reopenTask(state, "human-task", { actor: "operator", reason: "scope changed" }));
    await assert.rejects(mutate(backend, fixture.first, key, (state) => markReady(state, "dependent-task")), /unresolved dependencies/);
    await mutate(backend, fixture.first, key, (state) => closeTask(state, "human-task", { actor: "operator", reason: "handled after scope change" }));
    await mutate(backend, fixture.second, key, (state) => markReady(state, "dependent-task"));
    const promoted = await snapshot(backend, fixture.first, key);
    assert.deepEqual(readyIds(promoted.state), ["dependent-task", "unrelated"], "closing a dependency advances the ready frontier");
    await mutate(backend, fixture.first, key, (state) => closeTask(state, "dependent-task", { actor: "operator", reason: "dependency completed" }));
    const loop = await snapshot(backend, fixture.first, key);
    assert.equal(loop.state.tasks["lane-task"].status, "done");
    assert.equal(loop.state.tasks["human-task"].status, "done", "human close does not require a prior claim");
    assert.deepEqual(loop.state.tasks["lane-task"].comments, [{ author: "worker-a", body: "checked candidate" }]);
    assert.deepEqual(loop.state.tasks["lane-task"].history.map((entry) => entry.type), ["added", "ready", "claimed", "comment", "operation-prepared", "operation-observed"]);
    assert.deepEqual(loop.state.tasks["human-task"].history.map((entry) => entry.type), ["added", "ready", "closed", "reopened", "closed"]);
    assert.equal(loop.state.tasks["lane-task"].legacyFields.CustomField, "retained");
    assert.deepEqual(loop.state.tasks["lane-task"].contextRef, { kind: "lesson", revision: "abc123", anchor: "row-18" });

    for (const destination of ["files", "git-ref", "sqlite"]) {
      const restoredKey = `restore-${backend}-${destination}`;
      await initialize(destination, fixture.second, restoredKey, loop.state);
      const restored = await snapshot(destination, fixture.first, restoredKey);
      assert.deepEqual(restored.state, loop.state, `${backend} to ${destination} import/export must preserve the full task set`);
    }

    await startClaimRace(backend, fixture);

    const crashKey = "crash";
    const crashState = emptyState();
    addTask(crashState, { id: "crash-task", title: "crash after claim" });
    markReady(crashState, "crash-task");
    await initialize(backend, fixture.first, crashKey, crashState);
    const crashed = await launchWorker(backend, "crash-after-claim", fixture.first, crashKey, "crash-task", "worker-old");
    assert.equal(crashed.code, 86, crashed.stderr);
    const afterCrash = await snapshot(backend, fixture.second, crashKey);
    assert.equal(afterCrash.state.tasks["crash-task"].status, "claimed", "a persisted claim survives a lost response");
    assert.equal(afterCrash.state.tasks["crash-task"].history.filter((entry) => entry.type === "claimed").length, 1);
    await mutate(backend, fixture.second, crashKey, (state) => {
      const task = state.tasks["crash-task"];
      task.epoch += 1;
      task.owner = "worker-new";
      task.history.push({ type: "takeover", worker: task.owner, epoch: task.epoch });
    });
    await assert.rejects(
      update(backend, fixture.first, crashKey, afterCrash, (state) => commentTask(state, "crash-task", "worker-old", 1, "stale")),
      /changed|stale|conflict/i,
      `${backend} must fence the old worker after takeover`,
    );
    const currentCrash = await snapshot(backend, fixture.first, crashKey);
    await assert.rejects(
      update(backend, fixture.first, crashKey, currentCrash, (state) => commentTask(state, "crash-task", "worker-old", 1, "stale")),
      /stale claim generation/,
      `${backend} must reject a stale epoch even when the old worker refreshes its snapshot`,
    );
    const afterFencing = await snapshot(backend, fixture.second, crashKey);
    assert.equal(afterFencing.state.tasks["crash-task"].epoch, 2);
    assert.deepEqual(afterFencing.state.tasks["crash-task"].comments, []);

    const operationKey = "operations";
    const operationState = emptyState();
    addTask(operationState, { id: "effect-task", title: "merge candidate" });
    addTask(operationState, { id: "intent-task", title: "intent-bound operation" });
    addTask(operationState, { id: "unrelated-task", title: "unrelated task" });
    addTask(operationState, { id: "ambiguous-task", title: "effect readback unavailable" });
    for (const id of ["effect-task", "intent-task", "unrelated-task", "ambiguous-task"]) markReady(operationState, id);
    claimTask(operationState, "effect-task", "worker-effect");
    claimTask(operationState, "intent-task", "worker-intent");
    claimTask(operationState, "unrelated-task", "worker-unrelated");
    claimTask(operationState, "ambiguous-task", "worker-ambiguous");
    await initialize(backend, fixture.first, operationKey, operationState);
    const effectObject = writeBlob(fixture.root, `effect-${backend}`);
    const effectRef = `refs/krn/h2-effects/${backend}-merge`;
    const operation = {
    id: `${backend}-merge-1`, taskId: "effect-task", owner: "worker-effect", epoch: 1,
    intent: "alpha", intentRevision: 1, effectRef, effectObject,
      candidateIdentity: writeBlob(fixture.root, `candidate-${backend}`),
      params: { target: effectObject, intentRevision: 1 },
    };
    operation.checkResult = candidateEvidence(fixture.root, operation.candidateIdentity);
    await assert.rejects(
      ensureOperation(backend, fixture.first, operationKey, {
        ...operation,
        id: `${backend}-wrong-check-binding`,
        checkResult: { ...operation.checkResult, candidateIdentity: effectObject },
      }),
      /not bound to the candidate/,
    );
    await assert.rejects(
      ensureOperation(backend, fixture.first, operationKey, {
        ...operation,
        id: `${backend}-wrong-target-binding`,
        params: { ...operation.params, target: "different-effect" },
      }),
      /parameters disagree/,
      "an operation cannot prepare params that target a different effect object",
    );
    await assert.rejects(
      ensureOperation(backend, fixture.first, operationKey, {
        ...operation,
        id: `${backend}-wrong-intent-binding`,
        params: { ...operation.params, intentRevision: 2 },
      }),
      /parameters disagree/,
      "an operation cannot prepare params from a different intent revision",
    );
    const ambiguousObject = writeBlob(fixture.root, `ambiguous-${backend}`);
    const ambiguousOperation = {
      id: `${backend}-ambiguous-operation`, taskId: "ambiguous-task", owner: "worker-ambiguous", epoch: 1,
      intent: "alpha", intentRevision: 1, effectRef: `refs/krn/h2-effects/${backend}-missing`, effectObject: ambiguousObject,
      candidateIdentity: ambiguousObject, checkResult: candidateEvidence(fixture.root, ambiguousObject),
      params: { target: ambiguousObject, intentRevision: 1 },
    };
    await ensureOperation(backend, fixture.first, operationKey, operation);
    await ensureOperation(backend, fixture.first, operationKey, ambiguousOperation);
    const ambiguous = await completeOperation(backend, fixture.first, operationKey, ambiguousOperation.id);
    assert.equal(ambiguous.result.status, "ambiguous");
    assert.equal(ambiguous.state.tasks["ambiguous-task"].status, "claimed", "unreadable effect does not become false success");
    assert.equal(ambiguous.state.operations[ambiguousOperation.id].status, "prepared");
    const same = await ensureOperation(backend, fixture.first, operationKey, operation);
    assert.equal(same.result.idempotent, true, "same ID and parameters are an idempotent retry");
    await assert.rejects(
      ensureOperation(backend, fixture.first, operationKey, {
        ...operation,
        candidateIdentity: ambiguousObject,
        checkResult: candidateEvidence(fixture.root, ambiguousObject),
      }),
      /different parameters/,
      "the same operation ID cannot silently change its checked candidate",
    );
    await assert.rejects(
      ensureOperation(backend, fixture.first, operationKey, { ...operation, params: { target: "different" } }),
      /different parameters/,
    );

    const effectCrash = await launchWorker(backend, "crash-after-effect", fixture.second, operationKey, effectRef, effectObject);
    assert.equal(effectCrash.code, 87, effectCrash.stderr);
    const prepared = await snapshot(backend, fixture.first, operationKey);
    assert.equal(prepared.state.operations[operation.id].status, "prepared", "the effect can precede its stored receipt");
    assert.equal(readEffectRef(fixture.root, effectRef), effectObject);
    await completeOperation(backend, fixture.first, operationKey, operation.id); // recovery uses the same completion path
    const observed = await snapshot(backend, fixture.second, operationKey);
    assert.equal(observed.state.operations[operation.id].status, "observed");
    assert.equal(observed.state.tasks["effect-task"].status, "done");
    await completeOperation(backend, fixture.second, operationKey, operation.id);
    assert.equal(readEffectRef(fixture.root, effectRef), effectObject, "recovery does not repeat the external effect");

    const staleOperation = {
      id: `${backend}-stale-intent`, taskId: "intent-task", owner: "worker-intent", epoch: 1,
      intent: "beta", intentRevision: 1, effectRef: `refs/krn/h2-effects/${backend}-stale`,
      effectObject, candidateIdentity: effectObject, checkResult: candidateEvidence(fixture.root, effectObject),
      params: { target: effectObject, intentRevision: 1 },
    };
    const independentEffect = writeBlob(fixture.root, `independent-${backend}`);
    const independentRef = `refs/krn/h2-effects/${backend}-independent`;
    const independentOperation = {
      id: `${backend}-independent-operation`, taskId: "unrelated-task", owner: "worker-unrelated", epoch: 1,
      intent: "alpha", intentRevision: 1, effectRef: independentRef, effectObject: independentEffect,
      candidateIdentity: independentEffect, checkResult: candidateEvidence(fixture.root, independentEffect),
      params: { target: independentEffect, intentRevision: 1 },
    };
    await ensureOperation(backend, fixture.first, operationKey, independentOperation);
    writeEffectRef(fixture.root, independentRef, independentEffect);
    await ensureOperation(backend, fixture.first, operationKey, staleOperation);
    await mutate(backend, fixture.second, operationKey, (state) => { state.intents.beta += 1; });
    await assert.rejects(completeOperation(backend, fixture.first, operationKey, staleOperation.id), /stale/);
    await completeOperation(backend, fixture.first, operationKey, independentOperation.id);
    const afterIntentChange = await snapshot(backend, fixture.second, operationKey);
    assert.equal(afterIntentChange.state.operations[staleOperation.id].status, "prepared");
    assert.equal(afterIntentChange.state.operations[independentOperation.id].status, "observed", "an unrelated intent and operation remain usable");
    assert.equal(afterIntentChange.state.tasks["unrelated-task"].status, "done", "an unrelated outcome is not blocked by the changed intent");
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}

if (!workerMode) {
  const sqliteReady = Boolean(await sqliteConstructor());
  for (const backend of ["files", "git-ref", "sqlite"]) {
    test(`${backend} H2 candidate shares task, claim, operation and recovery semantics`, { skip: backend === "sqlite" && !sqliteReady ? "node:sqlite is unavailable in this runtime" : false }, async () => {
      await exerciseBackend(backend);
    });
  }
}
