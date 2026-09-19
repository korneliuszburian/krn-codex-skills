import fs from "node:fs";
import process from "node:process";

import { ABI_LABELS, fieldLine } from "./capsule-abi.mjs";
import { compileCapsule, resumeBrief } from "./state-brief.mjs";
import { inspectSpineState } from "./state-check.mjs";
import { EXIT_CODES, fail, renderDiagnostics } from "../support/diagnostics.mjs";

const VALUE_FLAGS = {
  "--root": "root",
  "--file": "file",
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
      options[key] = value;
      index += 1;
    } else if (arg.startsWith("--")) fail(`unknown option: ${arg}`, EXIT_CODES.USAGE);
    else positional.push(arg);
  }
  return { positional, options };
}

function print(value, json) {
  if (json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  else if (typeof value === "string") process.stdout.write(`${value}\n`);
  else process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function readOrFail(file, label) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    fail(`cannot read ${label} file: ${file}`, EXIT_CODES.USAGE);
  }
}

export function runStateCommand(argv, { usage } = {}) {
  const { positional, options } = parseArgs(argv);
  const command = positional[0];
  if (command === "fields") {
    if (positional.length !== 1 || !options.file || options.source || options.yes || options.root) fail(usage, EXIT_CODES.USAGE);
    const text = readOrFail(options.file, "capsule");
    print(Object.fromEntries(ABI_LABELS.map((label) => [label, fieldLine(text, label)])), options.json);
    return;
  }
  if (!["check", "compile", "resume"].includes(command) || positional.length > 2 || options.source || options.yes || options.file || (options.root && positional[1])) fail(usage, EXIT_CODES.USAGE);
  const repo = options.root ?? positional[1] ?? process.cwd();
  let report;
  try {
    report = command === "check"
      ? inspectSpineState({ repo })
      : command === "compile"
        ? compileCapsule({ repo })
        : resumeBrief({ repo });
  } catch (error) {
    fail(error.message, EXIT_CODES.USAGE);
  }
  if (command === "compile" && !options.json) process.stdout.write(`${report.capsule}\n`);
  else if (command === "resume" && !options.json) process.stdout.write(`${report.text}\n`);
  else print(report, options.json);
  const diagnostics = renderDiagnostics(report);
  for (const warning of diagnostics.warnings) process.stderr.write(`warning: ${warning}\n`);
  for (const error of diagnostics.errors) process.stderr.write(`error: ${error}\n`);
  if (report.errors.length > 0 || report.status === "divergent") process.exitCode = 1;
}
