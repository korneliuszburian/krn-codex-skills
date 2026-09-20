import fs from "node:fs";
import path from "node:path";

import { parseCliArgs } from "../kernel/cli.mjs";
import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { checkTickets, claimTicket, closeTicket, findTicketFile, parseTicketText, recordAttempt, ticketLaneBindings } from "./ticket.mjs";

const COMMANDS = new Set(["check", "next", "claim", "close", "fail", "fields", "env"]);
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
};

function parseArgs(argv) {
  return parseCliArgs(argv, {
    booleans: { "--json": "json", "--source": "source", "--yes": "yes" },
    values: VALUE_FLAGS,
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
  rejectOptions(options, []);
  if (positional.length !== 2 || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  const file = positional[1];
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ticket file: ${file}`, EXIT_CODES.USAGE);
  }
  const { fields, findings } = parseTicketText(text);
  if (!fields || findings.length > 0) {
    for (const finding of findings) process.stderr.write(`error: ${finding.message}\n`);
    fail(`invalid ticket: ${file}`, EXIT_CODES.USAGE);
  }
  if (options.json) output(Object.fromEntries(fields), true);
  else for (const [key, value] of fields) process.stdout.write(`${key}: ${value}\n`);
}

// Single-quote a value for `eval` in POSIX shells so a scope or contract field
// with spaces survives `eval "$(... ticket env ...)"` unchanged.
const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

// `fields` and `env` render the owner's parse: the lane consumes `env`, and the
// plugin and hooks read the same map through `krn ticket fields`.
function renderTicketFile(positional, options, usage) {
  rejectOptions(options, ["file"]);
  if (positional.length !== 1 || !options.file || options.source || options.yes) fail(usage, EXIT_CODES.USAGE);
  let text;
  try {
    text = fs.readFileSync(options.file, "utf8");
  } catch {
    fail(`cannot read ticket file: ${options.file}`, EXIT_CODES.USAGE);
  }
  const { fields } = parseTicketText(text);
  if (positional[0] === "env") {
    for (const [name, value] of ticketLaneBindings(fields)) process.stdout.write(`${name}=${shellQuote(value)}\n`);
    return;
  }
  const plain = fields ? Object.fromEntries(fields) : {};
  if (options.json) output(plain, true);
  else for (const [key, value] of Object.entries(plain)) process.stdout.write(`${key}: ${value}\n`);
}

export function runTicketCommand(argv, { usage, requireDirectory }) {
  const { positional, options } = parseArgs(argv);
  const command = positional[0];
  if (command === "show") {
    showTicket(positional, options, usage);
    return;
  }
  if (command === "fields" || command === "env") {
    renderTicketFile(positional, options, usage);
    return;
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
