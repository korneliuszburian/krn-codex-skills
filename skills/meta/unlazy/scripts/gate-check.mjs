#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HELP = `usage: gate-check.mjs [--status|--approve|--reverify] [--approval-dir DIR] [--timeout SECONDS] GATES.md`;
const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_OUTPUT_BYTES = 1024 * 1024;

function fail(message, code = 2) {
  console.error(`gate-check: ${message}`);
  process.exitCode = code;
}

function parseArgs(argv) {
  const options = { mode: "run", timeout: DEFAULT_TIMEOUT_SECONDS };
  let ledger = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") return { help: true };
    if (["--status", "--approve", "--reverify"].includes(arg)) {
      if (options.mode !== "run") return { error: "choose only one run mode" };
      options.mode = arg.slice(2);
      continue;
    }
    if (arg === "--approval-dir" || arg === "--timeout") {
      const value = argv[++index];
      if (!value) return { error: `${arg} requires a value` };
      if (arg === "--approval-dir") options.approvalDir = path.resolve(value);
      else {
        options.timeout = Number(value);
        if (!Number.isInteger(options.timeout) || options.timeout < 1) return { error: "timeout must be a positive integer" };
      }
      continue;
    }
    if (arg.startsWith("-")) return { error: `unknown option ${arg}` };
    if (ledger) return { error: "only one ledger path is allowed" };
    ledger = path.resolve(arg);
  }
  if (!ledger) return { error: HELP };
  return { options, ledger };
}

function parseLedger(ledgerPath) {
  const text = fs.readFileSync(ledgerPath, "utf8");
  const lines = text.split(/\r?\n/);
  const gates = [];
  const ids = new Set();
  const abandoned = new Map();
  let current = null;

  const flush = () => {
    if (current) gates.push(current);
    current = null;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const header = line.match(/^- \[([ xX])\] ([A-Za-z0-9][A-Za-z0-9._-]*): (.+)$/);
    if (header) {
      flush();
      const [, checked, id, title] = header;
      if (ids.has(id)) throw new Error(`duplicate gate id ${id}`);
      ids.add(id);
      current = {
        id, title, checked: checked.toLowerCase() === "x", headerIndex: index,
        check: null, expect: null, cwd: null, evidence: null, evidenceIndex: null,
      };
      continue;
    }
    const abandonedMatch = line.match(/^ABANDON: ([A-Za-z0-9][A-Za-z0-9._-]*) (\S.*)$/);
    if (abandonedMatch) {
      abandoned.set(abandonedMatch[1], abandonedMatch[2].trim());
      continue;
    }
    if (!current) continue;
    const attribute = line.match(/^\s{2,}(CHECK|EXPECT|CWD|EVIDENCE):\s*(.*)$/);
    if (!attribute) continue;
    const [, key, value] = attribute;
    if (current[key.toLowerCase()] !== null) throw new Error(`${current.id}: duplicate ${key}`);
    current[key.toLowerCase()] = value;
    if (key === "EVIDENCE") current.evidenceIndex = index;
  }
  flush();
  if (gates.length === 0) throw new Error("ledger contains no gates");
  for (const gate of gates) {
    const hasCheck = Boolean(gate.check);
    const hasExpect = Boolean(gate.expect);
    if (hasCheck !== hasExpect) throw new Error(`${gate.id}: runnable gate requires CHECK and EXPECT`);
    if (gate.evidence === null || !gate.evidence.trim()) throw new Error(`${gate.id}: EVIDENCE is required`);
    if (gate.checked && gate.evidence.trim().toLowerCase() === "pending") {
      throw new Error(`${gate.id}: checked gate cannot have pending evidence`);
    }
    if (abandoned.has(gate.id)) gate.abandoned = abandoned.get(gate.id);
  }
  for (const id of abandoned.keys()) if (!ids.has(id)) throw new Error(`ABANDON references unknown gate ${id}`);
  return { text, lines, gates, abandoned };
}

function approvalDirectory(options) {
  return options.approvalDir || process.env.KRN_UNLAZY_APPROVAL_DIR ||
    path.join(process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state"), "krn-unlazy", "approvals");
}

function repositoryRootFor(ledgerPath) {
  const result = spawnSync("git", ["-C", path.dirname(ledgerPath), "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function isWithin(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = fs.existsSync(candidate) ? fs.realpathSync(candidate) : path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function bindingFor(ledgerPath, gate, cwd, timeout) {
  return {
    ledger: path.resolve(ledgerPath), gate: gate.id, check: gate.check,
    expect: gate.expect, cwd, shell: "/bin/sh", timeout,
    pathEnv: process.env.PATH || "", platform: process.platform, nodeVersion: process.version,
  };
}

function approvalPath(directory, binding) {
  const digest = crypto.createHash("sha256").update(JSON.stringify(binding)).digest("hex");
  return path.join(directory, `${digest}.json`);
}

function expectedMatches(expect, output) {
  if (expect.startsWith("/") && expect.lastIndexOf("/") > 0) {
    const slash = expect.lastIndexOf("/");
    try { return new RegExp(expect.slice(1, slash), expect.slice(slash + 1)).test(output); } catch { return false; }
  }
  return output.includes(expect);
}

function compactOutput(output) {
  return output.replace(/[\r\n\t]+/g, " ").trim().slice(-800);
}

function runGate(ledgerPath, gate, options, requireApproval) {
  const cwd = path.resolve(path.dirname(ledgerPath), gate.cwd || ".");
  if (!fs.existsSync(cwd)) return { ok: false, evidence: `cwd-missing=${cwd}` };
  const binding = bindingFor(ledgerPath, gate, cwd, options.timeout);
  const directory = approvalDirectory(options);
  const approval = approvalPath(directory, binding);
  if (requireApproval && !fs.existsSync(approval)) return { ok: false, pending: true, evidence: "approval pending" };
  if (options.mode === "approve") {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!fs.existsSync(approval)) fs.writeFileSync(approval, `${JSON.stringify({ ...binding, approvedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
  }
  const result = spawnSync("/bin/sh", ["-c", gate.check], {
    cwd, encoding: "utf8", timeout: options.timeout * 1000, maxBuffer: MAX_OUTPUT_BYTES,
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`;
  const ok = result.status === 0 && expectedMatches(gate.expect, output);
  return {
    ok,
    evidence: `exit=${result.status ?? "signal"}; expect=${ok ? "matched" : "unmatched"}; output=${compactOutput(output)}`,
  };
}

function writeLedger(ledgerPath, parsed, results) {
  const lines = [...parsed.lines];
  for (const gate of parsed.gates) {
    const result = results.get(gate.id);
    if (!result || result.pending || !gate.check) continue;
    lines[gate.headerIndex] = lines[gate.headerIndex].replace(/^- \[[ xX]\]/, `- [${result.ok ? "x" : " "}]`);
    if (gate.evidenceIndex === null) throw new Error(`${gate.id}: EVIDENCE line disappeared`);
    lines[gate.evidenceIndex] = `  EVIDENCE: ${result.evidence}`;
  }
  const temporary = `${ledgerPath}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${lines.join("\n").replace(/\n+$/, "")}\n`, { mode: 0o600 });
  fs.renameSync(temporary, ledgerPath);
}

function main() {
  const parsedArgs = parseArgs(process.argv.slice(2));
  if (parsedArgs.help) { console.log(HELP); return 0; }
  if (parsedArgs.error) { fail(parsedArgs.error); return 2; }
  const { options, ledger } = parsedArgs;
  const repositoryRoot = repositoryRootFor(ledger);
  const approvals = approvalDirectory(options);
  if (repositoryRoot && isWithin(repositoryRoot, approvals)) {
    fail("approval directory must be outside the repository");
    return 2;
  }
  let parsed;
  try { parsed = parseLedger(ledger); } catch (error) { fail(error.message); return 2; }
  const results = new Map();
  let unmet = 0;
  for (const gate of parsed.gates) {
    if (gate.abandoned) { console.log(`ABANDONED ${gate.id}: ${gate.abandoned}`); unmet += 1; continue; }
    if (!gate.check) { console.log(`${gate.checked ? "MET" : "UNMET"} ${gate.id} (manual)`); if (!gate.checked) unmet += 1; continue; }
    const shouldRun = options.mode === "approve" || options.mode === "reverify" || (!gate.checked && options.mode === "run");
    if (!shouldRun) { if (!gate.checked) unmet += 1; continue; }
    const result = runGate(ledger, gate, options, options.mode !== "approve");
    results.set(gate.id, result);
    if (result.pending) { console.log(`UNMET ${gate.id}: approval pending`); unmet += 1; continue; }
    console.log(`${result.ok ? "PASS" : "FAIL"} ${gate.id}: ${result.evidence}`);
    if (!result.ok) unmet += 1;
  }
  if (options.mode !== "status" && results.size > 0) writeLedger(ledger, parsed, results);
  console.log(`GATES.md: ${parsed.gates.length} gates`);
  console.log(`UNMET: ${unmet} (met: ${parsed.gates.length - unmet})`);
  return unmet === 0 ? 0 : 1;
}

process.exitCode = main();
