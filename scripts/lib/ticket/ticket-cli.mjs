import fs from "node:fs";
import path from "node:path";

import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { checkTickets, claimTicket, closeTicket, findTicketFile, parseTicketText } from "./ticket.mjs";

const COMMANDS = new Set(["check", "next", "claim", "close"]);
const VALUE_FLAGS = {
  "--root": "root",
  "--path": "path",
  "--id": "id",
  "--worker": "worker",
  "--session": "session",
  "--evidence": "evidence",
  "--resolution": "resolution",
};

function parseArgs(argv) {
  const positional = [];
  const options = { json: false, source: false, yes: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--source") options.source = true;
    else if (arg === "--yes") options.yes = true;
    else if (Object.hasOwn(VALUE_FLAGS, arg)) {
      const key = VALUE_FLAGS[arg];
      const value = argv[index + 1];
      if (value === undefined || value === "" || value.startsWith("--")) fail(`${arg} requires a value`, EXIT_CODES.USAGE);
      if (options[key] !== undefined) fail(`duplicate option: ${arg}`, EXIT_CODES.USAGE);
      options[key] = value;
      index += 1;
    } else if (arg.startsWith("--")) fail(`unknown option: ${arg}`, EXIT_CODES.USAGE);
    else positional.push(arg);
  }
  return { positional, options };
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

export function runTicketCommand(argv, { usage, requireDirectory }) {
  const { positional, options } = parseArgs(argv);
  const command = positional[0];
  if (command === "show") {
    showTicket(positional, options, usage);
    return;
  }
  rejectOptions(options, ["root", "path", "id", "worker", "session", "evidence", "resolution"]);
  if (!COMMANDS.has(command) || positional.length > 1 || options.source || options.yes || !options.root) fail(usage, EXIT_CODES.USAGE);
  requireDirectory(options.root);
  const dirs = ticketDirs(options.root, options.path);
  if (command === "claim" || command === "close") {
    if (!options.id) fail(usage, EXIT_CODES.USAGE);
    let file;
    try {
      file = findTicketFile({ root: options.root, dirs, id: options.id });
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    try {
      const result = command === "claim"
        ? claimTicket({ file, worker: options.worker ?? "unknown", session: options.session ?? "" })
        : closeTicket({ file, evidence: options.evidence ?? "none", resolution: options.resolution ?? "none" });
      output(result, options.json);
    } catch (error) {
      fail(error.message, EXIT_CODES.USAGE);
    }
    return;
  }
  const report = checkTickets({ root: options.root, dirs });
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
