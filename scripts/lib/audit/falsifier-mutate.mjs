import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const IGNORED = new Set([".git", ".krn", "node_modules"]);
const MUTATION_CAP = 8;
const WEAK = "falsifier-weak";
const STRONG = "falsifier-strong";

// A cheap mutant is only useful when it is syntactically plausible: a mutant
// that cannot load would kill every check regardless of its oracle. So the
// operators stay local and total (return, comparison, boolean, dropped
// statement) rather than rewriting structure.
const isIgnored = (source, root) => IGNORED.has(relative(root, source).split(sep)[0]);

const copyTree = (root, destination) => {
  cpSync(root, destination, {
    recursive: true,
    filter: (source) => source === root || !isIgnored(source, root),
  });
};

const replaceAt = (source, index, length, replacement) =>
  `${source.slice(0, index)}${replacement}${source.slice(index + length)}`;

const returnOperandMutations = (source) => {
  const mutants = [];
  for (const match of source.matchAll(/return\s+([^;\n]+?)\s*;/g)) {
    if (match[1].trim() === "undefined") continue;
    mutants.push({ kind: "return-operand", source: replaceAt(source, match.index, match[0].length, "return undefined;") });
  }
  return mutants;
};

const COMPARISON_FLIP = new Map([
  ["===", "!=="],
  ["!==", "==="],
  ["==", "!="],
  ["!=", "=="],
  ["<=", ">"],
  [">=", "<"],
]);

const comparisonMutations = (source) => {
  const mutants = [];
  for (const match of source.matchAll(/===|!==|<=|>=|==|!=/g)) {
    const flip = COMPARISON_FLIP.get(match[0]);
    if (flip) mutants.push({ kind: "comparison", source: replaceAt(source, match.index, match[0].length, flip) });
  }
  return mutants;
};

const booleanMutations = (source) => {
  const mutants = [];
  for (const match of source.matchAll(/\b(true|false)\b/g)) {
    const flip = match[1] === "true" ? "false" : "true";
    mutants.push({ kind: "boolean", source: replaceAt(source, match.index, match[0].length, flip) });
  }
  return mutants;
};

const DROP_CANDIDATE = /^(?:const|let|var|[A-Za-z_$][A-Za-z0-9_$]*\s*[=(])/;
const DROP_EXCLUDED = /^(?:import|export|return|throw|break|continue)\b/;

const statementDropMutations = (source) => {
  const mutants = [];
  let offset = 0;
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.endsWith(";") && DROP_CANDIDATE.test(trimmed) && !DROP_EXCLUDED.test(trimmed)) {
      mutants.push({ kind: "drop-statement", source: replaceAt(source, offset, line.length, "") });
    }
    offset += line.length + 1;
  }
  return mutants;
};

const OPERATORS = [returnOperandMutations, comparisonMutations, booleanMutations, statementDropMutations];

export function generateMutants(source, cap = MUTATION_CAP) {
  const seen = new Set();
  const mutants = [];
  for (const operator of OPERATORS) {
    let index = 0;
    for (const candidate of operator(source)) {
      if (mutants.length >= cap) return mutants;
      if (seen.has(candidate.source)) continue;
      seen.add(candidate.source);
      index += 1;
      mutants.push({ id: `${candidate.kind}-${index}`, kind: candidate.kind, source: candidate.source });
    }
  }
  return mutants;
}

const runMutant = ({ workspace, target, mutant, command, spawn, env }) => {
  writeFileSync(join(workspace, target), mutant.source);
  const result = spawn(command[0], command.slice(1), { cwd: workspace, encoding: "utf8", env });
  return { id: mutant.id, kind: mutant.kind, killed: result.status !== 0 };
};

export function runFalsifierMutate({ root = process.cwd(), target, command = [process.execPath, "--test"], cap = MUTATION_CAP, spawn = spawnSync } = {}) {
  if (typeof target !== "string" || target.length === 0) {
    throw new Error("runFalsifierMutate requires a target module");
  }
  const workspace = mkdtempSync(join(tmpdir(), "krn-falsifier-"));
  try {
    copyTree(root, workspace);
    const mutants = generateMutants(readFileSync(join(workspace, target), "utf8"), cap);
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    const results = mutants.map((mutant) => runMutant({ workspace, target, mutant, command, spawn, env }));
    const killed = results.filter((result) => result.killed).length;
    const weak = killed === 0;
    return { mutants: results, killed, weak, phrase: weak ? WEAK : STRONG, status: weak ? 1 : 0 };
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

const parseArgs = (argv) => {
  const options = { root: process.cwd(), target: "", command: [process.execPath, "--test"] };
  const rest = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--") { rest.push(...argv.slice(index + 1)); break; }
    else if (arg === "--root") { options.root = argv[index + 1]; index += 1; }
    else if (arg === "--target") { options.target = argv[index + 1]; index += 1; }
    else rest.push(arg);
  }
  if (rest.length > 0) options.command = rest;
  return options;
};

const main = (argv = process.argv.slice(2)) => {
  const { root, target, command } = parseArgs(argv);
  const report = runFalsifierMutate({ root, target, command });
  process.stdout.write(`${report.phrase} (killed ${report.killed}/${report.mutants.length})\n`);
  return report.status;
};

const invokedDirectly = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (invokedDirectly) process.exit(main());
