import fs from "node:fs";
import path from "node:path";

import { parseCliArgs } from "../kernel/cli.mjs";
import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { runTaskCommand } from "../task/task-cli.mjs";
import { checkTickets, claimTicket, closeTicket, findTicketFile, parseTicketText, recordAttempt, reconcileTickets, taskTicketView, ticketLaneBindings } from "./ticket.mjs";
import { rootForTicket } from "./ticket-abi.mjs";
import { readActiveTaskStoreSnapshot } from "./task-store.mjs";

// Compatibility only: selected Git-ref operations are owned by task-cli.mjs;
// this file retains the pre-activation Markdown and file-based ticket ABI.
const LEGACY_COMMANDS = new Set(["check", "next", "claim", "close", "fail", "reconcile"]);
const VALUE_FLAGS = {
  "--root": "root", "--path": "path", "--file": "file", "--id": "id",
  "--base": "base", "--head": "head", "--integrated": "integrated",
  "--worker": "worker", "--session": "session", "--evidence": "evidence",
  "--resolution": "resolution", "--reason": "reason", "--signature": "signature",
  "--wall-seconds": "wallSeconds", "--tokens": "tokens", "--title": "title",
  "--body": "body", "--lane-recipe": "laneRecipeFile", "--type": "type",
  "--actor": "actor", "--status": "status", "--expected-epoch": "expectedEpoch",
  "--intent": "intent", "--to": "to", "--archive": "archive", "--token": "token",
  "--revision": "revision", "--expected-revision": "expectedRevision",
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

function activeFileView(file, parsedFields) {
  const root = rootForTicket(file);
  let snapshot;
  try {
    snapshot = readActiveTaskStoreSnapshot(root);
  } catch (error) {
    fail(`cannot read active task store: ${error?.message ?? String(error)}`, EXIT_CODES.USAGE);
  }
  if (!snapshot) return null;
  if (snapshot.errors.length > 0) fail(`active task store is invalid: ${snapshot.errors.join("; ")}`, EXIT_CODES.USAGE);
  const sourcePath = path.relative(root, path.resolve(file)).split(path.sep).join("/");
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

function showFile(file, json) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ticket file: ${file}`, EXIT_CODES.USAGE);
  }
  const { fields, findings } = parseTicketText(text);
  const view = activeFileView(file, fields);
  const currentFields = view?.fields ?? fields;
  if (!currentFields || (!view && findings.length > 0)) {
    for (const finding of findings) process.stderr.write(`error: ${finding.message}\n`);
    fail(`invalid ticket: ${file}`, EXIT_CODES.USAGE);
  }
  if (json) {
    const rendered = Object.fromEntries(currentFields);
    if (view) rendered.task = { body: view.body, comments: view.comments, history: view.history };
    output(rendered, true);
    return;
  }
  for (const [key, value] of currentFields) process.stdout.write(`${key}: ${value}\n`);
  if (!view) return;
  process.stdout.write(`Body: ${view.body}\n`);
  for (const comment of view.comments) process.stdout.write(`Comment (${comment.author}): ${comment.body}\n`);
  for (const entry of view.history) process.stdout.write(`History: ${JSON.stringify(entry)}\n`);
}

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

function renderFileFields(file, command, json) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ticket file: ${file}`, EXIT_CODES.USAGE);
  }
  const { fields } = parseTicketText(text);
  const currentFields = activeFileView(file, fields)?.fields ?? fields;
  if (command === "env") {
    for (const [name, value] of ticketLaneBindings(currentFields)) process.stdout.write(`${name}=${shellQuote(value)}\n`);
    return;
  }
  const plain = currentFields ? Object.fromEntries(currentFields) : {};
  if (json) output(plain, true);
  else for (const [key, value] of Object.entries(plain)) process.stdout.write(`${key}: ${value}\n`);
}

function legacyQueueCommand(command, options, usage, requireDirectory) {
  rejectOptions(options, ["root", "path", "id", "base", "head", "worker", "session", "evidence", "resolution", "reason", "signature", "wallSeconds", "tokens"]);
  if (!options.root || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  requireDirectory(options.root);
  const dirs = ticketDirs(options.root, options.path);
  if (["claim", "close", "fail"].includes(command)) {
    if (!options.id || (command === "fail" && !options.reason)) fail(usage, EXIT_CODES.USAGE);
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
          : recordAttempt({ file, root: options.root, reason: options.reason ?? "unknown", signature: options.signature ?? "" });
      output(result, options.json);
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    return;
  }
  if (command === "reconcile") {
    try {
      output({ root: options.root, reconciled: reconcileTickets({ root: options.root, dirs, headRef: options.head ?? "HEAD" }) }, options.json);
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

export async function runTicketCommand(argv, { usage, requireDirectory }) {
  const { positional, options } = parseArgs(argv);
  const command = positional[0];
  if (command === "show" && !options.id) {
    rejectOptions(options, []);
    if (positional.length !== 2 || options.root || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
    return showFile(positional[1], options.json);
  }
  if (["fields", "env"].includes(command) && !options.root && !options.id) {
    rejectOptions(options, ["file"]);
    if (positional.length !== 1 || !options.file || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
    return renderFileFields(options.file, command, options.json);
  }
  if (LEGACY_COMMANDS.has(command)) {
    if (positional.length !== 1) fail(usage, EXIT_CODES.USAGE);
    if (command === "reconcile") return legacyQueueCommand(command, options, usage, requireDirectory);
    if (!options.root) fail(usage, EXIT_CODES.USAGE);
    let snapshot;
    try {
      snapshot = readActiveTaskStoreSnapshot(options.root);
    } catch (error) {
      fail(`cannot read active task store: ${error?.message ?? String(error)}`, EXIT_CODES.USAGE);
    }
    if (!snapshot) return legacyQueueCommand(command, options, usage, requireDirectory);
    // Legacy check/next ignored --path on a selected queue. Claim/close/fail
    // rejected it; keep both behaviors without exposing --path on task.
    if (options.path && ["check", "next"].includes(command)) {
      const index = argv.findIndex((value) => value === "--path");
      if (index >= 0) argv = [...argv.slice(0, index), ...argv.slice(index + 2)];
    }
  }
  return runTaskCommand(argv, { usage, requireDirectory });
}
