import fs from "node:fs";
import path from "node:path";

import { parseCliArgs } from "../kernel/cli.mjs";
import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { checkTickets, taskTicketView, ticketLaneBindings } from "../ticket/ticket.mjs";
import { copyActiveTaskStoreSnapshot, exportTaskStoreSnapshot, openTaskStore, readActiveTaskStoreSnapshot, restoreTaskStoreSnapshot } from "./task-store.mjs";
import { inspectQueueWriteLock, recoverQueueWriteLock } from "./queue-write-lock.mjs";
const VALUE_FLAGS = {
  "--root": "root",
  "--path": "path",
  "--file": "file",
  "--id": "id",
  "--base": "base",
  "--head": "head",
  "--integrated": "integrated",
  "--worker": "worker",
  "--session": "session",
  "--evidence": "evidence",
  "--resolution": "resolution",
  "--reason": "reason",
  "--signature": "signature",
  "--wall-seconds": "wallSeconds",
  "--tokens": "tokens",
  "--title": "title",
  "--body": "body",
  "--lane-recipe": "laneRecipeFile",
  "--type": "type",
  "--actor": "actor",
  "--status": "status",
  "--expected-epoch": "expectedEpoch",
  "--intent": "intent",
  "--to": "to",
  "--archive": "archive",
  "--token": "token",
  "--revision": "revision",
  "--expected-revision": "expectedRevision",
};

function parseArgs(argv) {
  return parseCliArgs(argv, {
    booleans: { "--json": "json", "--source": "source", "--yes": "yes", "--ready": "ready" },
    values: VALUE_FLAGS,
    lists: { "--depends-on": "dependencies" },
    defaults: { json: false, source: false, yes: false },
    fail: (message) => fail(message, EXIT_CODES.USAGE),
  });
}

function rejectOptions(options, allowed) {
  const permitted = new Set(["json", ...allowed]);
  for (const [key, value] of Object.entries(options)) {
    if (value === undefined || value === false) continue;
    if (!permitted.has(key)) fail(`unknown option for this command: --${key}`, EXIT_CODES.USAGE);
  }
}

function output(value, json) {
  const text = json || typeof value !== "string" ? JSON.stringify(value, null, 2) : value;
  process.stdout.write(`${text}\n`);
}

function showTask(positional, options, usage) {
  rejectOptions(options, ["root", "id"]);
  if (positional.length !== 1 || !options.root || !options.id || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  renderTaskView(activeTaskView(options.root, options.id), options.json);
}

function renderTaskView(view, json, fields = view.fields) {
  if (json) {
    const rendered = Object.fromEntries(fields);
    if (view) rendered.task = { body: view.body, comments: view.comments, history: view.history };
    output(rendered, true);
    return;
  }
  for (const [key, value] of fields) process.stdout.write(`${key}: ${value}\n`);
  if (!view) return;
  process.stdout.write(`Body: ${view.body}\n`);
  for (const comment of view.comments) process.stdout.write(`Comment (${comment.author}): ${comment.body}\n`);
  for (const entry of view.history) process.stdout.write(`History: ${JSON.stringify(entry)}\n`);
}

function selectedTaskStore(root) {
  let snapshot;
  try {
    snapshot = readActiveTaskStoreSnapshot(root);
  } catch (error) {
    fail(`cannot read active task store: ${error?.message ?? String(error)}`, EXIT_CODES.USAGE);
  }
  if (!snapshot) fail("Git-ref task queue is not active; Markdown remains authoritative", EXIT_CODES.USAGE);
  if (snapshot.errors.length > 0) fail(`active task store is invalid: ${snapshot.errors.join("; ")}`, EXIT_CODES.USAGE);
  return openTaskStore(root);
}

async function runTaskStoreCommand(command, positional, options, usage, requireDirectory) {
  const allowedByCommand = {
    add: ["root", "id", "title", "body", "type", "dependencies", "laneRecipeFile"],
    ready: ["root", "id"],
    claim: ["root", "id", "worker", "session", "ready"],
    renew: ["root", "id", "worker", "expectedEpoch"],
    comment: ["root", "id", "worker", "body", "expectedEpoch"],
    close: ["root", "id", "actor", "reason", "resolution", "expectedEpoch", "base", "head", "integrated"],
    reopen: ["root", "id", "actor", "reason"],
    release: ["root", "id", "actor", "reason", "expectedEpoch"],
    takeover: ["root", "id", "worker", "session", "expectedEpoch", "reason"],
    fail: ["root", "id", "worker", "reason", "signature", "expectedEpoch"],
    list: ["root", "status"],
    edit: ["root", "id", "title", "body", "type", "dependencies", "laneRecipeFile"],
  };
  const allowed = allowedByCommand[command] ?? [];
  rejectOptions(options, allowed);
  if (positional.length !== 1 || options.source || options.yes || !options.root) fail(usage, EXIT_CODES.USAGE);
  requireDirectory(options.root);
  if (command === "add" && !options.title) fail("task add requires --title", EXIT_CODES.USAGE);
  if (command === "ready" && !options.id) fail("task ready requires --id", EXIT_CODES.USAGE);
  if (["claim", "renew", "comment", "close", "reopen", "fail", "takeover"].includes(command) && !options.id
    && !(command === "claim" && options.ready)) fail(`task ${command} requires --id`, EXIT_CODES.USAGE);
  if (["edit", "release"].includes(command) && !options.id) fail(`task ${command} requires --id`, EXIT_CODES.USAGE);
  if (["claim", "renew"].includes(command) && !options.worker) fail(`task ${command} requires --worker`, EXIT_CODES.USAGE);
  if (command === "claim" && options.ready && options.id) fail("task claim --ready does not accept --id", EXIT_CODES.USAGE);
  if (command === "fail" && (!options.worker || !options.reason)) fail("task fail requires --worker and --reason", EXIT_CODES.USAGE);
  if (command === "takeover" && (!options.worker || !options.expectedEpoch || !options.reason)) {
    fail("task takeover requires --worker, --expected-epoch and --reason", EXIT_CODES.USAGE);
  }
  if (command === "comment" && (!options.worker || !options.body)) fail("task comment requires --worker and --body", EXIT_CODES.USAGE);
  if (["close", "reopen"].includes(command) && !(options.reason ?? options.resolution)) fail(`task ${command} requires --reason`, EXIT_CODES.USAGE);
  if (["close", "reopen", "release"].includes(command) && !options.actor) fail(`task ${command} requires --actor`, EXIT_CODES.USAGE);
  if (["comment", "renew", "release", "fail"].includes(command) && options.expectedEpoch === undefined) {
    fail(`task ${command} requires --expected-epoch from the claim response`, EXIT_CODES.USAGE);
  }
  const epoch = options.expectedEpoch === undefined ? undefined : Number(options.expectedEpoch);
  if (epoch !== undefined && (!Number.isSafeInteger(epoch) || epoch < 1)) {
    fail(`task ${command} requires a positive --expected-epoch`, EXIT_CODES.USAGE);
  }
  const store = selectedTaskStore(options.root);
  try {
    let result;
    const laneAssignment = options.laneRecipeFile ? { lane: true, laneRecipe: JSON.parse(fs.readFileSync(options.laneRecipeFile, "utf8")) } : {};
    if (command === "add") {
      result = await store.add({ id: options.id, title: options.title, body: options.body ?? "", type: options.type ?? "task", dependencies: options.dependencies ?? [], ...laneAssignment });
    } else if (command === "ready") {
      result = await store.markReady(options.id);
    } else if (command === "claim") {
      const claim = { worker: options.worker, session: options.session ?? "" };
      result = options.ready ? await store.claimReady(claim) : await store.claim(options.id, claim);
    } else if (command === "renew") {
      result = await store.renewClaim(options.id, { worker: options.worker, epoch });
    } else if (command === "comment") {
      result = await store.comment(options.id, { worker: options.worker, epoch, body: options.body });
    } else if (command === "close") {
      const actor = options.actor;
      const task = await store.show(options.id);
      const hasProofFlags = options.base !== undefined || options.head !== undefined || options.integrated !== undefined;
      if (hasProofFlags && (!task || task.lane || task.legacyCloseProofRequired !== true)) {
        throw new Error("retrospective close is limited to imported non-lane proof tasks");
      }
      const proof = hasProofFlags ? { kind: "imported-checked", base: options.base,
        head: options.head, integrated: options.integrated } : undefined;
      result = await store.close(options.id, { actor, reason: options.reason ?? options.resolution, epoch, proof });
    } else if (command === "reopen") {
      result = await store.reopen(options.id, { actor: options.actor, reason: options.reason });
    } else if (command === "release") {
      const actor = options.actor;
      result = await store.release(options.id, { actor, reason: options.reason, epoch });
    } else if (command === "takeover") {
      result = await store.takeover(options.id, {
        worker: options.worker,
        session: options.session ?? "",
        expectedEpoch: epoch,
        reason: options.reason,
      });
    } else if (command === "fail") {
      result = await store.recordFailure(options.id, {
        worker: options.worker,
        epoch,
        signature: options.signature ?? "",
        reason: options.reason,
      });
    } else if (command === "list") {
      result = await store.list({ status: options.status });
    } else {
      const patch = {
        ...laneAssignment,
        ...(options.title !== undefined ? { title: options.title } : {}),
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(options.type !== undefined ? { type: options.type } : {}),
        ...(options.dependencies !== undefined ? { dependencies: options.dependencies } : {}),
      };
      if (Object.keys(patch).length === 0) fail("task edit requires at least one content or dependency field", EXIT_CODES.USAGE);
      result = await store.edit(options.id, patch);
    }
    output(result, options.json);
  } catch (error) {
    fail(error?.message ?? String(error), EXIT_CODES.USAGE);
  }
}

function operationInputPath(root, file) {
  const repo = fs.realpathSync(root);
  const absolute = path.resolve(repo, file);
  const relative = path.relative(repo, absolute);
  const parts = relative.split(path.sep);
  if (parts[0] !== ".krn" || parts[1] !== "runs" || parts.length < 4 || parts.some((part) => part === ".." || part === "")) {
    throw new Error("operation input must be a file under .krn/runs/");
  }

  let current = repo;
  for (const [index, part] of parts.entries()) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) throw new Error("operation input path contains a symlink");
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error("operation input parent is not a directory");
    if (index === parts.length - 1 && !stat.isFile()) throw new Error("operation input is not a regular file");
  }
  return absolute;
}

function readOperationInput(root, file) {
  const absolute = operationInputPath(root, file);
  let value;
  try {
    value = JSON.parse(fs.readFileSync(absolute, "utf8"));
  } catch (error) {
    throw new Error(`cannot read operation JSON: ${error?.message ?? String(error)}`);
  }
  const allowed = new Set(["id", "taskId", "intent", "intentRevision", "effectRef", "effectObject", "expectedEffectValue", "candidateIdentity", "checkResult", "params"]);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new Error("operation JSON has an unsupported shape");
  }
  return value;
}

async function runTaskOperation(positional, options, usage, requireDirectory) {
  if (positional.length !== 2 || !options.root || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  requireDirectory(options.root);
  const action = positional[1];

  if (action === "prepare") {
    rejectOptions(options, ["root", "file"]);
    if (!options.file) fail("task operation prepare requires --file", EXIT_CODES.USAGE);
    try {
      const operation = readOperationInput(options.root, options.file);
      const store = selectedTaskStore(options.root);
      const task = await store.show(operation.taskId);
      if (!task || task.status !== "claimed" || task.lane !== true || !task.laneRecipe) {
        throw new Error("operation task must be a claimed lane task with a typed recipe");
      }
      if (operation.checkResult?.candidateIdentity !== operation.candidateIdentity
        || operation.checkResult?.command !== task.laneRecipe.check
        || operation.checkResult?.exitCode !== 0) {
        throw new Error("check result does not prove the task recipe on the exact candidate");
      }
      const result = await store.prepareOperation({ ...operation, owner: task.owner, epoch: task.epoch });
      output(result, options.json);
    } catch (error) {
      fail(error?.message ?? String(error), EXIT_CODES.USAGE);
    }
    return;
  }

  if (action === "complete") {
    rejectOptions(options, ["root", "id", "worker", "expectedEpoch"]);
    if (!options.id || !options.worker || !options.expectedEpoch
      || !Number.isInteger(Number(options.expectedEpoch)) || Number(options.expectedEpoch) < 1) {
      fail("task operation complete requires --id, --worker and positive --expected-epoch", EXIT_CODES.USAGE);
    }
    try {
      const store = selectedTaskStore(options.root);
      const result = await store.completeOperation(options.id, {
        worker: options.worker,
        epoch: Number(options.expectedEpoch),
      });
      output(result, options.json);
    } catch (error) {
      fail(error?.message ?? String(error), EXIT_CODES.USAGE);
    }
    return;
  }

  if (action === "apply") {
    rejectOptions(options, ["root", "id", "worker", "expectedEpoch"]);
    if (!options.id || !options.worker || !options.expectedEpoch
      || !Number.isInteger(Number(options.expectedEpoch)) || Number(options.expectedEpoch) < 1) {
      fail("task operation apply requires --id, --worker and positive --expected-epoch", EXIT_CODES.USAGE);
    }
    try {
      const store = selectedTaskStore(options.root);
      output(await store.applyOperation(options.id, {
        worker: options.worker,
        epoch: Number(options.expectedEpoch),
      }), options.json);
    } catch (error) {
      fail(error?.message ?? String(error), EXIT_CODES.USAGE);
    }
    return;
  }

  fail(usage, EXIT_CODES.USAGE);
}

async function runTaskStoreTransfer(positional, options, usage, requireDirectory) {
  const command = positional[1];
  if (["migrate", "lock", "unlock"].includes(command)) {
    const allowed = { migrate: ["root", "yes", "archive", "actor", "reason", "file"], lock: ["root"], unlock: ["root", "token", "actor", "reason"] };
    rejectOptions(options, allowed[command]);
    if (positional.length !== 2 || !options.root) fail(usage, EXIT_CODES.USAGE);
    requireDirectory(options.root);
    try {
      if (command === "lock") output(inspectQueueWriteLock(options.root), options.json);
      else if (command === "unlock") output(recoverQueueWriteLock(options.root, options), options.json);
      else {
        const resolutions = options.file ? JSON.parse(fs.readFileSync(options.file, "utf8")) : [];
        if (!Array.isArray(resolutions)) fail("migration decision file must contain an array", EXIT_CODES.USAGE);
        const result = await openTaskStore(options.root).migrateLegacyQueue({
          apply: options.yes, archiveFile: options.archive, actor: options.actor, reason: options.reason, claimSessionResolutions: resolutions,
        });
        output(result, options.json);
        if (result.report?.errors.length > 0) process.exitCode = EXIT_CODES.SOURCE;
      }
    } catch (error) { fail(error.message, EXIT_CODES.USAGE); }
    return;
  }
  if (positional.length !== 2 || !["copy", "export", "restore"].includes(command)
    || !options.root || options.source || options.yes) {
    fail(usage, EXIT_CODES.USAGE);
  }
  rejectOptions(options, ["root", ...(command === "copy" ? ["to"] : command === "restore" ? ["file"] : [])]);
  if (command === "copy" && !options.to) fail("task store copy requires --to", EXIT_CODES.USAGE);
  if (command === "restore" && !options.file) fail("task store restore requires --file", EXIT_CODES.USAGE);
  requireDirectory(options.root);
  try {
    if (command === "copy") {
      requireDirectory(options.to);
      output(copyActiveTaskStoreSnapshot(options.root, options.to), options.json);
    } else if (command === "export") {
      output(exportTaskStoreSnapshot(options.root), true);
    } else {
      const archive = JSON.parse(fs.readFileSync(options.file, "utf8"));
      output(restoreTaskStoreSnapshot(options.root, archive), options.json);
    }
  } catch (error) {
    fail(error?.message ?? String(error), EXIT_CODES.USAGE);
  }
}

async function runTaskIntent(positional, options, usage, requireDirectory) {
  if (positional.length !== 2 || !options.root || !options.intent || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  requireDirectory(options.root);
  try {
    const store = selectedTaskStore(options.root);
    if (positional[1] === "get") {
      rejectOptions(options, ["root", "intent"]);
      const state = await store.read();
      output({ intent: options.intent, revision: state.intents[options.intent] ?? 0 }, options.json);
      return;
    }
    if (positional[1] !== "set") fail(usage, EXIT_CODES.USAGE);
    rejectOptions(options, ["root", "intent", "revision", "expectedRevision"]);
    if (!/^[1-9][0-9]*$/.test(options.revision ?? "") || !/^(?:0|[1-9][0-9]*)$/.test(options.expectedRevision ?? "")) {
      fail("task intent set requires positive --revision and non-negative --expected-revision", EXIT_CODES.USAGE);
    }
    const result = await store.setIntentRevision(options.intent, Number(options.revision), {
      expectedRevision: Number(options.expectedRevision),
    });
    output(result, options.json);
  } catch (error) {
    fail(error?.message ?? String(error), EXIT_CODES.USAGE);
  }
}

// The lane consumes task env as shell assignments; no Markdown file input is
// accepted on this public seam.
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

function renderTaskFields(positional, options, usage) {
  rejectOptions(options, ["root", "id"]);
  if (positional.length !== 1 || !options.root || !options.id || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  const fields = activeTaskView(options.root, options.id).fields;
  if (positional[0] === "env") {
    for (const [name, value] of ticketLaneBindings(fields)) process.stdout.write(`${name}=${shellQuote(value)}\n`);
    return;
  }
  const plain = Object.fromEntries(fields);
  if (options.json) output(plain, true);
  else for (const [key, value] of Object.entries(plain)) process.stdout.write(`${key}: ${value}\n`);
}

function activeTaskView(root, id) {
  let snapshot;
  try {
    snapshot = readActiveTaskStoreSnapshot(root);
  } catch (error) {
    fail(`cannot read active task store: ${error?.message ?? String(error)}`, EXIT_CODES.USAGE);
  }
  if (!snapshot) fail("Git-ref task queue is not active; Markdown remains authoritative", EXIT_CODES.USAGE);
  if (snapshot.errors.length > 0) fail(`active task store is invalid: ${snapshot.errors.join("; ")}`, EXIT_CODES.USAGE);
  if (!Object.hasOwn(snapshot.state.tasks, id)) fail(`task ${id} is not present in the active Git-ref task store`, EXIT_CODES.USAGE);
  return taskTicketView(snapshot.state.tasks[id]);
}

export async function runTaskCommand(argv, { usage, requireDirectory }) {
  const { positional, options } = parseArgs(argv);
  if (!options.root) fail("task requires --root", EXIT_CODES.USAGE);
  requireDirectory(options.root);
  // Archive restore validates and installs the selector in a clean successor.
  // All other operations require the selected queue before dispatch.
  const storageTransition = positional[0] === "store" && ["migrate", "lock", "unlock", "restore"].includes(positional[1]);
  if (!storageTransition) selectedTaskStore(options.root);
  const command = positional[0];
  if (command === "reconcile") fail("task reconcile is not available during the Git-ref CLI expansion", EXIT_CODES.USAGE);
  if (command === "intent") return runTaskIntent(positional, options, usage, requireDirectory);
  if (command === "store") return runTaskStoreTransfer(positional, options, usage, requireDirectory);
  if (command === "operation") return runTaskOperation(positional, options, usage, requireDirectory);
  if (command === "show") return showTask(positional, options, usage);
  if (command === "fields" || command === "env") return renderTaskFields(positional, options, usage);
  if (["add", "ready", "claim", "renew", "comment", "close", "reopen", "release", "takeover", "list", "edit", "fail"].includes(command)) {
    return runTaskStoreCommand(command, positional, options, usage, requireDirectory);
  }
  rejectOptions(options, ["root", "id", "base", "head"]);
  if (!["check", "next"].includes(command) || positional.length !== 1 || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  const scope = command === "check" ? { id: options.id, base: options.base, head: options.head } : {};
  const report = checkTickets({ root: options.root, ...scope });
  if (command === "next") {
    if (options.json) output({ root: options.root, frontier: report.frontier }, true);
    else for (const id of report.frontier) process.stdout.write(`${id}\n`);
    return;
  }
  output(report, options.json);
  if (!options.json) {
    for (const warning of report.warnings) process.stderr.write(`warning: ${warning.rule}${warning.path ? ` ${warning.path}` : ""}: ${warning.message}\n`);
    for (const error of report.errors) process.stderr.write(`error: ${error.rule}${error.path ? ` ${error.path}` : ""}: ${error.message}\n`);
  }
  if (report.errors.length) process.exitCode = 1;
}
