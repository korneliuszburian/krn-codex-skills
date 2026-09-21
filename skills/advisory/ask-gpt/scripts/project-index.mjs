#!/usr/bin/env node
// Append-only project index for ask-gpt. The ChatGPT project surface accepts
// additions only, so an entry is only ever appended; `show` prints the entries
// so the next invocation recalls which project a repository belongs to.
import { appendFileSync, existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const HEADER = [
  "| at | project | repository | instructions | paths | standards |",
  "|---|---|---|---|---|---|",
].join("\n");

export function parseEntries(text) {
  return String(text ?? "")
    .split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| at ") && !line.startsWith("|---"))
    .map((line) => line.slice(1, -1).split("|").map((cell) => cell.trim()))
    .filter((cells) => cells.length === 6 && cells[0] !== "at");
}

export function entryLine({ at, project, repository, instructions, paths, standards }) {
  const clean = (value) => String(value ?? "").replace(/\|/g, "/").trim();
  return `| ${clean(at)} | ${clean(project)} | ${clean(repository)} | ${clean(instructions)} | ${clean(paths)} | ${clean(standards)} |`;
}

export function appendEntry({ index, entry }) {
  if (!existsSync(index)) {
    writeFileSync(index, `${HEADER}\n`, "utf8");
  }
  appendFileSync(index, `${entryLine(entry)}\n`, "utf8");
  return parseEntries(readFileSync(index, "utf8"));
}

export function latestFor({ index, repository }) {
  if (!existsSync(index)) return null;
  const entries = parseEntries(readFileSync(index, "utf8"));
  const matches = entries.filter((cells) => !repository || cells[2] === repository);
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

function parseArgs(args) {
  const options = { command: null, index: null };
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!options.command && !arg.startsWith("--")) {
      options.command = arg;
      continue;
    }
    const key = arg.replace(/^--/, "");
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    values[key] = value;
    index += 1;
  }
  return { command: options.command, values };
}

function main() {
  const { command, values } = parseArgs(process.argv.slice(2));
  if (!values.index) throw new Error("--index is required");
  if (command === "show") {
    const entries = existsSync(values.index) ? parseEntries(readFileSync(values.index, "utf8")) : [];
    if (entries.length === 0) process.stdout.write("no project entries\n");
    else for (const cells of entries) process.stdout.write(`${cells.join(" | ")}\n`);
    return;
  }
  if (command === "append") {
    const required = ["project", "repository", "instructions"];
    for (const key of required) if (!values[key]) throw new Error(`--${key} is required to append`);
    const entries = appendEntry({
      index: values.index,
      entry: {
        at: values.at ?? new Date().toISOString().slice(0, 10),
        project: values.project,
        repository: values.repository,
        instructions: values.instructions,
        paths: values.paths ?? "",
        standards: values.standards ?? "",
      },
    });
    process.stdout.write(`appended ${entries.length} entr${entries.length === 1 ? "y" : "ies"}\n`);
    return;
  }
  throw new Error("command must be show or append");
}

const invokedAsScript = (() => {
  try {
    return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (invokedAsScript) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`ask-gpt index refused: ${error.message}\n`);
    process.exit(2);
  }
}
