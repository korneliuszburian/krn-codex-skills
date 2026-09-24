import fs from "node:fs";
import path from "node:path";

import { parseCliArgs } from "../kernel/cli.mjs";
import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { checkTickets, claimTicket, closeTicket, findTicketFile, parseTicketText, recordAttempt, reconcileTickets, taskTicketView, ticketLaneBindings } from "./ticket.mjs";
import { rootForTicket } from "./ticket-abi.mjs";
import { copyActiveTaskStoreSnapshot, exportTaskStoreSnapshot, openTaskStore, readActiveTaskStoreSnapshot, restoreTaskStoreSnapshot } from "./task-store.mjs";

const COMMANDS = new Set(["add", "check", "next", "ready", "reconcile", "claim", "comment", "close", "reopen", "release", "takeover", "list", "edit", "fail", "fields", "env"]);
const VALUE_FLAGS = {
  "--root": "root",
  "--path": "path",
  "--file": "file",
  "--id": "id",
  "--base": "base",
  "--head": "head",
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
  "--type": "type",
  "--actor": "actor",
  "--status": "status",
  "--expected-epoch": "expectedEpoch",
  "--intent": "intent",
  "--to": "to",
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

function ticketDirs(root, dir) {
  if (!dir) return undefined;
  return [path.isAbsolute(dir) ? path.relative(root, dir) : dir];
}

function showTicket(positional, options, usage) {
  rejectOptions(options, ["root", "id"]);
  if (options.id) {
    if (positional.length !== 1 || !options.root || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
    renderTaskView(activeTaskView(options.root, options.id), options.json);
    return;
  }
  if (positional.length !== 2 || options.root || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  const file = positional[1];
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ticket file: ${file}`, EXIT_CODES.USAGE);
  }
  const { fields, findings } = parseTicketText(text);
  const view = fieldsFromTicketFile(file, fields);
  const currentFields = view?.fields ?? fields;
  if (!currentFields || (!view && findings.length > 0)) {
    for (const finding of findings) process.stderr.write(`error: ${finding.message}\n`);
    fail(`invalid ticket: ${file}`, EXIT_CODES.USAGE);
  }
  renderTaskView(view, options.json, currentFields);
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
    add: ["root", "id", "title", "body", "type", "dependencies"],
    ready: ["root", "id"],
    claim: ["root", "id", "worker", "session", "ready"],
    comment: ["root", "id", "worker", "body"],
    close: ["root", "id", "actor", "reason", "resolution"],
    reopen: ["root", "id", "actor", "reason"],
    release: ["root", "id", "actor", "reason"],
    takeover: ["root", "id", "worker", "session", "expectedEpoch", "reason"],
    fail: ["root", "id", "worker", "reason", "signature"],
    list: ["root", "status"],
    edit: ["root", "id", "title", "body", "type", "dependencies"],
  };
  const allowed = allowedByCommand[command] ?? [];
  rejectOptions(options, allowed);
  if (positional.length !== 1 || options.source || options.yes || !options.root) fail(usage, EXIT_CODES.USAGE);
  requireDirectory(options.root);
  if (command === "add" && !options.title) fail("ticket add requires --title", EXIT_CODES.USAGE);
  if (command === "ready" && !options.id) fail("ticket ready requires --id", EXIT_CODES.USAGE);
  if (["claim", "comment", "close", "reopen", "fail", "takeover"].includes(command) && !options.id
    && !(command === "claim" && options.ready)) fail(`ticket ${command} requires --id`, EXIT_CODES.USAGE);
  if (["edit", "release"].includes(command) && !options.id) fail(`ticket ${command} requires --id`, EXIT_CODES.USAGE);
  if (command === "claim" && !options.worker) fail("ticket claim requires --worker", EXIT_CODES.USAGE);
  if (command === "claim" && options.ready && options.id) fail("ticket claim --ready does not accept --id", EXIT_CODES.USAGE);
  if (command === "fail" && (!options.worker || !options.reason)) fail("ticket fail requires --worker and --reason", EXIT_CODES.USAGE);
  if (command === "takeover" && (!options.worker || !options.expectedEpoch || !options.reason)) {
    fail("ticket takeover requires --worker, --expected-epoch and --reason", EXIT_CODES.USAGE);
  }
  if (command === "takeover" && (!Number.isInteger(Number(options.expectedEpoch)) || Number(options.expectedEpoch) < 1)) {
    fail("ticket takeover requires a positive --expected-epoch", EXIT_CODES.USAGE);
  }
  if (command === "comment" && (!options.worker || !options.body)) fail("ticket comment requires --worker and --body", EXIT_CODES.USAGE);
  if (["close", "reopen"].includes(command) && !(options.reason ?? options.resolution)) fail(`ticket ${command} requires --reason`, EXIT_CODES.USAGE);
  if (["close", "reopen", "release"].includes(command) && !options.actor) fail(`ticket ${command} requires --actor`, EXIT_CODES.USAGE);
  const store = selectedTaskStore(options.root);
  try {
    let result;
    if (command === "add") {
      result = await store.add({ id: options.id, title: options.title, body: options.body ?? "", type: options.type ?? "task", dependencies: options.dependencies ?? [] });
    } else if (command === "ready") {
      result = await store.markReady(options.id);
    } else if (command === "claim") {
      const claim = { worker: options.worker, session: options.session ?? "" };
      result = options.ready ? await store.claimReady(claim) : await store.claim(options.id, claim);
    } else if (command === "comment") {
      const task = await store.show(options.id);
      result = await store.comment(options.id, { worker: options.worker, epoch: task?.epoch, body: options.body });
    } else if (command === "close") {
      const actor = options.actor;
      const task = await store.show(options.id);
      const epoch = task?.status === "claimed" && task.owner === actor ? task.epoch : undefined;
      result = await store.close(options.id, { actor, reason: options.reason ?? options.resolution, epoch });
    } else if (command === "reopen") {
      result = await store.reopen(options.id, { actor: options.actor, reason: options.reason });
    } else if (command === "release") {
      const actor = options.actor;
      const task = await store.show(options.id);
      result = await store.release(options.id, { actor, reason: options.reason, epoch: task?.epoch });
    } else if (command === "takeover") {
      result = await store.takeover(options.id, {
        worker: options.worker,
        session: options.session ?? "",
        expectedEpoch: Number(options.expectedEpoch),
        reason: options.reason,
      });
    } else if (command === "fail") {
      const task = await store.show(options.id);
      result = await store.recordFailure(options.id, {
        worker: options.worker,
        epoch: task?.epoch,
        signature: options.signature ?? "",
        reason: options.reason,
      });
    } else if (command === "list") {
      result = await store.list({ status: options.status });
    } else {
      const patch = {
        ...(options.title !== undefined ? { title: options.title } : {}),
        ...(options.body !== undefined ? { body: options.body } : {}),
        ...(options.type !== undefined ? { type: options.type } : {}),
        ...(options.dependencies !== undefined ? { dependencies: options.dependencies } : {}),
      };
      if (Object.keys(patch).length === 0) fail("ticket edit requires at least one content or dependency field", EXIT_CODES.USAGE);
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
    if (!options.file) fail("ticket operation prepare requires --file", EXIT_CODES.USAGE);
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
      fail("ticket operation complete requires --id, --worker and positive --expected-epoch", EXIT_CODES.USAGE);
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
      fail("ticket operation apply requires --id, --worker and positive --expected-epoch", EXIT_CODES.USAGE);
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

function runTaskStoreTransfer(positional, options, usage, requireDirectory) {
  const command = positional[1];
  if (positional.length !== 2 || !["copy", "export", "restore"].includes(command)
    || !options.root || options.source || options.yes) {
    fail(usage, EXIT_CODES.USAGE);
  }
  rejectOptions(options, ["root", ...(command === "copy" ? ["to"] : command === "restore" ? ["file"] : [])]);
  if (command === "copy" && !options.to) fail("ticket store copy requires --to", EXIT_CODES.USAGE);
  if (command === "restore" && !options.file) fail("ticket store restore requires --file", EXIT_CODES.USAGE);
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
      fail("ticket intent set requires positive --revision and non-negative --expected-revision", EXIT_CODES.USAGE);
    }
    const result = await store.setIntentRevision(options.intent, Number(options.revision), {
      expectedRevision: Number(options.expectedRevision),
    });
    output(result, options.json);
  } catch (error) {
    fail(error?.message ?? String(error), EXIT_CODES.USAGE);
  }
}

function fieldsFromTicketFile(file, parsedFields) {
  const root = rootForTicket(file);
  let snapshot;
  try {
    snapshot = readActiveTaskStoreSnapshot(root);
  } catch (error) {
    fail(`cannot read active task store: ${error?.message ?? String(error)}`, EXIT_CODES.USAGE);
  }
  if (!snapshot) return null;
  if (snapshot.errors.length > 0) fail(`active task store is invalid: ${snapshot.errors.join("; ")}`, EXIT_CODES.USAGE);
  const absolute = path.resolve(file);
  const sourcePath = path.relative(root, absolute).split(path.sep).join("/");
  const id = parsedFields?.get("Id");
  const pathTask = Object.values(snapshot.state.tasks).find((entry) => entry.sourcePath === sourcePath);
  const idTask = id ? snapshot.state.tasks[id] : null;
  if (pathTask && id && pathTask.id !== id) {
    fail(`ticket path/ID mismatch: ${sourcePath} names ${pathTask.id}, but the file declares ${id}`, EXIT_CODES.USAGE);
  }
  if (idTask?.sourcePath && idTask.sourcePath !== sourcePath) {
    fail(`ticket path/ID mismatch: ${id} belongs to ${idTask.sourcePath}, not ${sourcePath}`, EXIT_CODES.USAGE);
  }
  const task = pathTask ?? idTask;
  if (!task) fail(`ticket ${id ?? sourcePath} is not present in the active Git-ref task store`, EXIT_CODES.USAGE);
  return taskTicketView(task);
}

// Single-quote a value for `eval` in POSIX shells so a scope or contract field
// with spaces survives `eval "$(... ticket env ...)"` unchanged.
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

// `fields` and `env` render the owner's parse: the lane consumes `env`, and the
// plugin and hooks read the same map through `krn ticket fields`.
function renderTicketFile(positional, options, usage) {
  const byId = options.root !== undefined || options.id !== undefined;
  rejectOptions(options, byId ? ["root", "id"] : ["file"]);
  if (positional.length !== 1 || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);

  let currentFields;
  if (byId) {
    if (!options.root || !options.id || options.file) fail(usage, EXIT_CODES.USAGE);
    currentFields = activeTaskView(options.root, options.id).fields;
  } else {
    if (!options.file) fail(usage, EXIT_CODES.USAGE);
    let text;
    try {
      text = fs.readFileSync(options.file, "utf8");
    } catch {
      fail(`cannot read ticket file: ${options.file}`, EXIT_CODES.USAGE);
    }
    const { fields } = parseTicketText(text);
    const view = fieldsFromTicketFile(options.file, fields);
    currentFields = view?.fields ?? fields;
  }
  if (positional[0] === "env") {
    for (const [name, value] of ticketLaneBindings(currentFields)) process.stdout.write(`${name}=${shellQuote(value)}\n`);
    return;
  }
  const plain = currentFields ? Object.fromEntries(currentFields) : {};
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

export async function runTicketCommand(argv, { usage, requireDirectory }) {
  const { positional, options } = parseArgs(argv);
  const command = positional[0];
  if (command === "intent") {
    await runTaskIntent(positional, options, usage, requireDirectory);
    return;
  }
  if (command === "store") {
    runTaskStoreTransfer(positional, options, usage, requireDirectory);
    return;
  }
  if (command === "operation") {
    await runTaskOperation(positional, options, usage, requireDirectory);
    return;
  }
  if (command === "show") {
    showTicket(positional, options, usage);
    return;
  }
  if (command === "fields" || command === "env") {
    renderTicketFile(positional, options, usage);
    return;
  }
  if (["add", "ready", "comment", "reopen", "release", "takeover", "list", "edit"].includes(command)
    || (command === "claim" && options.ready)) {
    await runTaskStoreCommand(command, positional, options, usage, requireDirectory);
    return;
  }
  if (["claim", "close", "fail"].includes(command) && options.root) {
    let activeSnapshot;
    try {
      activeSnapshot = readActiveTaskStoreSnapshot(options.root);
    } catch (error) {
      fail(`cannot read active task store: ${error?.message ?? String(error)}`, EXIT_CODES.USAGE);
    }
    if (activeSnapshot) {
      await runTaskStoreCommand(command, positional, options, usage, requireDirectory);
      return;
    }
  }
  rejectOptions(options, ["root", "path", "id", "base", "head", "worker", "session", "evidence", "resolution", "reason", "signature", "wallSeconds", "tokens"]);
  if (!COMMANDS.has(command) || positional.length > 1 || options.source || options.yes || !options.root) fail(usage, EXIT_CODES.USAGE);
  requireDirectory(options.root);
  const dirs = ticketDirs(options.root, options.path);
  if (command === "claim" || command === "close" || command === "fail") {
    if (!options.id) fail(usage, EXIT_CODES.USAGE);
    if (command === "fail" && !options.reason) fail(usage, EXIT_CODES.USAGE);
    let file;
    try {
      file = findTicketFile({ root: options.root, dirs, id: options.id });
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    try {
      const result = command === "claim"
        ? claimTicket({ file, root: options.root, id: options.id, worker: options.worker ?? "unknown", session: options.session ?? "" })
        : command === "close"
          ? closeTicket({ file, root: options.root, evidence: options.evidence ?? "none", resolution: options.resolution ?? "none", base: options.base, head: options.head, wallSeconds: options.wallSeconds, tokens: options.tokens })
          : recordAttempt({ file, reason: options.reason ?? "unknown", signature: options.signature ?? "" });
      output(result, options.json);
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    return;
  }
  if (command === "reconcile") {
    try {
      const reconciled = reconcileTickets({ root: options.root, dirs, headRef: options.head ?? "HEAD" });
      output({ root: options.root, reconciled }, options.json);
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    return;
  }
  const scope = command === "check" ? { id: options.id, base: options.base, head: options.head } : {};
  const report = checkTickets({ root: options.root, dirs, ...scope });
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
