import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runProcess } from "../kernel/proc.mjs";

const IGNORED = new Set([".git", ".krn", "node_modules"]);

export const MUTATIONS = [
  {
    id: "quality-audit-test-dynamic-importer",
    file: "scripts/lib/audit/quality-audit.mjs",
    symbol: "productionImported",
    find: "productionDynamic.has(file) ||",
    replace: "dynamicTargets.has(file) ||",
    suite: "test/audit/quality-audit.test.mjs",
    focus: "test dynamic import",
  },
  {
    id: "quality-audit-test-static-importer",
    file: "scripts/lib/audit/quality-audit.mjs",
    symbol: "productionImported",
    find: "runtimeSet.has(importer) && ",
    replace: "",
    suite: "test/audit/quality-audit.test.mjs",
    focus: "reachable only from tests",
  },
  {
    id: "quality-audit-imported-local-binding",
    file: "scripts/lib/audit/quality-audit.mjs",
    symbol: "importedNames",
    find: "const local = part.split(/\\s+as\\s+/).pop().trim();",
    replace: "const local = part.split(/\\s+as\\s+/)[0].trim();",
    suite: "test/audit/quality-audit.test.mjs",
    focus: "aliased import",
  },
  {
    id: "quality-audit-consumed-source-binding",
    file: "scripts/lib/audit/quality-audit.mjs",
    symbol: "clauseNames",
    find: "const sourceName = part.split(/\\s+as\\s+/)[0].trim();",
    replace: "const sourceName = part.split(/\\s+as\\s+/).pop().trim();",
    suite: "test/audit/quality-audit.test.mjs",
    focus: "aliased import consumes the source name",
  },
  {
    id: "quality-audit-star-target",
    file: "scripts/lib/audit/quality-audit.mjs",
    symbol: "starTargets",
    find: "starTargets.add(target);",
    replace: "void target;",
    suite: "test/audit/quality-audit.test.mjs",
    focus: "namespace and default imports",
  },
  {
    id: "quality-audit-test-only-export",
    file: "scripts/lib/audit/quality-audit.mjs",
    symbol: "testOnlyImporters",
    find: "return importers.every(isTestFile) ? importers : [];",
    replace: "return importers;",
    suite: "test/audit/quality-audit-test-only.test.mjs",
    focus: "runtime consumer keeps",
  },
  {
    id: "change-contract-deny-list",
    file: "scripts/lib/contract/change-contract-runs.mjs",
    symbol: "DENY",
    find: 'const DENY = new Set(["changes:check"]);',
    replace: "const DENY = new Set([]);",
    suite: "test/contract/change-contract.test.mjs",
    focus: "denied check cannot be referenced",
  },
  {
    id: "change-contract-glob-guard",
    file: "scripts/lib/contract/change-contract-runs.mjs",
    symbol: "scriptNonLiteral",
    find: "return /[*?\\[]/.test(command)",
    replace: "return false",
    suite: "test/contract/change-contract.test.mjs",
    focus: "globs with",
  },
  {
    id: "change-contract-redefinition-check",
    file: "scripts/lib/contract/change-contract-runs.mjs",
    symbol: "checkFileRedefined",
    find: "return before.ok && (!now.ok || before.out.trim() !== now.out.trim());",
    replace: "return false;",
    suite: "test/contract/change-contract.test.mjs",
    focus: "self-authorized",
  },
  {
    id: "change-contract-resolve-script",
    file: "scripts/lib/contract/change-contract-runs.mjs",
    symbol: "resolveCheck",
    find: 'if (Object.hasOwn(scripts, name) && typeof scripts[name] === "string") return { kind: "script", name };',
    replace: 'if (Object.hasOwn(scripts, name) && typeof scripts[name] === "number") return { kind: "script", name };',
    suite: "test/contract/change-contract.test.mjs",
    focus: "npm run",
  },
  {
    id: "change-contract-non-literal-guard",
    file: "scripts/lib/contract/change-contract-runs.mjs",
    symbol: "scriptRedefinition",
    find: 'if (scriptNonLiteral(root, command)) return "non-literal";',
    replace: 'if (scriptNonLiteral(root, command)) return "clean";',
    suite: "test/contract/change-contract.test.mjs",
    focus: "non-literal",
  },
];

function isIgnored(source, root) {
  const relative = source.slice(root.length).replace(/^[/\\]/, "");
  const [head] = relative.split(/[/\\]/);
  return IGNORED.has(head);
}

function copyTree(root, destination) {
  cpSync(root, destination, { recursive: true, filter: (source) => source === root || !isIgnored(source, root) });
}

function occurrences(text, needle) {
  let count = 0;
  for (let index = text.indexOf(needle); index !== -1; index = text.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

function focusedArgs(mutation) {
  const args = ["--test", "--test-reporter=tap"];
  if (mutation.focus) args.push(`--test-name-pattern=${mutation.focus}`);
  args.push(mutation.suite);
  return args;
}

function probeEnv() {
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function parseTap(output) {
  const tests = Number((/^# tests (\d+)$/m.exec(output) ?? [])[1] ?? "0");
  const fail = Number((/^# fail (\d+)$/m.exec(output) ?? [])[1] ?? "0");
  return { tests, fail };
}

// A killed mutant requires observed failing tests from the same focused
// selection the baseline ran: only the declared mutation differs between the
// two runs. A nonzero exit without a failing test (load error, timeout, runner
// failure) is unclassified, not a kill; a baseline that is not green makes that
// selection's mutants invalid.
function classify(result) {
  const { tests, fail } = parseTap(`${result.out}${result.err}`);
  if (tests > 0 && fail > 0) return { state: result.ok ? "invalid" : "red", tests, fail };
  if (result.ok && tests > 0) return { state: "green", tests, fail };
  return { state: "invalid", tests, fail };
}

function baselineFor({ workspace, mutation, run, cache }) {
  const key = `${mutation.suite}\u0000${mutation.focus ?? ""}`;
  if (cache.has(key)) return cache.get(key);
  const { state, tests, fail } = classify(run(process.execPath, focusedArgs(mutation), { cwd: workspace, env: probeEnv() }));
  const baseline = state === "green"
    ? { ok: true }
    : { ok: false, detail: `baseline not green for the mutation's focused selection: tests=${tests} fail=${fail}` };
  cache.set(key, baseline);
  return baseline;
}

function runMutation({ workspace, mutation, baseline, run }) {
  const target = join(workspace, mutation.file);
  const original = readFileSync(target, "utf8");
  if (!original.includes(mutation.symbol)) {
    return { id: mutation.id, file: mutation.file, killed: false, applied: false, invalid: true, detail: `symbol ${mutation.symbol} is missing from ${mutation.file}` };
  }
  const matches = occurrences(original, mutation.find);
  if (matches !== 1) {
    return { id: mutation.id, file: mutation.file, killed: false, applied: false, invalid: true, detail: `anchor matched ${matches} time(s), expected exactly 1` };
  }
  if (!baseline.ok) {
    return { id: mutation.id, file: mutation.file, killed: false, applied: false, invalid: true, detail: baseline.detail };
  }
  writeFileSync(target, original.replace(mutation.find, mutation.replace));
  try {
    const { state, tests, fail } = classify(run(process.execPath, focusedArgs(mutation), { cwd: workspace, env: probeEnv() }));
    const killed = state === "red";
    const invalid = state === "invalid";
    const detail = killed
      ? ""
      : state === "green"
        ? "the focused suite stayed green"
        : tests === 0
          ? "the focused suite produced no test results"
          : `the focused suite failed without a failing test (tests=${tests}, fail=${fail})`;
    return { id: mutation.id, file: mutation.file, killed, applied: true, invalid, tests, detail };
  } finally {
    writeFileSync(target, original);
  }
}

export function runMutationProbe({ root, mutations = MUTATIONS, run = runProcess } = {}) {
  const workspace = mkdtempSync(join(tmpdir(), "krn-mutation-"));
  try {
    copyTree(root, workspace);
    const baselines = new Map();
    return mutations.map((mutation) => runMutation({
      workspace,
      mutation,
      baseline: baselineFor({ workspace, mutation, run, cache: baselines }),
      run,
    }));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
