#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const HELP = `usage: gate-check.mjs [--status|--approve|--reverify] [--approval-dir DIR] [--timeout SECONDS] GATES.md`;
const DEFAULT_TIMEOUT_SECONDS = 120;
const MAX_OUTPUT_BYTES = 1024 * 1024;
const KNOWN_ATTRIBUTES = new Set(["CHECK", "EXPECT", "CWD", "EVIDENCE"]);
const ATTRIBUTE_LIKE = /^\s{2,}([A-Za-z][A-Za-z0-9_-]*)[ \t]*:(?:[ \t]*(.*))?$/;
const MALFORMED_KNOWN_ATTRIBUTE = /^\s*(CHECK|EXPECT|CWD|EVIDENCE)\b/;

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
    if (/^- \[[ xX]\]/.test(line)) throw new Error(`malformed gate line ${index + 1}`);
    if (line.startsWith("ABANDON")) {
      const abandonedMatch = line.match(/^ABANDON: ([A-Za-z0-9][A-Za-z0-9._-]*) (\S.*)$/);
      if (!abandonedMatch) throw new Error(`malformed ABANDON directive ${index + 1}`);
      if (abandoned.has(abandonedMatch[1])) throw new Error(`duplicate ABANDON for ${abandonedMatch[1]}`);
      abandoned.set(abandonedMatch[1], abandonedMatch[2].trim());
      continue;
    }
    const attribute = line.match(ATTRIBUTE_LIKE);
    if (!attribute) {
      const malformed = line.match(MALFORMED_KNOWN_ATTRIBUTE);
      if (malformed) throw new Error(`${current?.id || "ledger"}: malformed ${malformed[1]} attribute`);
      continue;
    }
    const [, key, value = ""] = attribute;
    if (!KNOWN_ATTRIBUTES.has(key)) throw new Error(`${current?.id || "ledger"}: unknown attribute ${key}`);
    if (!current) throw new Error(`${key} attribute appears outside a gate`);
    if (!value.trim()) throw new Error(`${current.id}: ${key} must not be empty`);
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

function gitTopLevelProbe(ledgerPath) {
  const result = spawnSync("git", ["-C", path.dirname(ledgerPath), "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  if (result.error || result.status === null) return { failed: true, root: null };
  return { failed: false, root: result.status === 0 ? result.stdout.trim() : null };
}

function repositoryRootFor(ledgerPath) {
  return gitTopLevelProbe(ledgerPath).root;
}

function isWithin(root, candidate) {
  const resolvedRoot = fs.realpathSync(root);
  let existing = path.resolve(candidate);
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  const resolvedCandidate = path.resolve(fs.realpathSync(existing), ...missing);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

function ledgerIsIgnored(repositoryRoot, ledgerPath) {
  const relative = path.relative(repositoryRoot, ledgerPath);
  return spawnSync("git", ["-C", repositoryRoot, "check-ignore", "--quiet", "--", relative], { encoding: "utf8" }).status === 0;
}

function environmentHash() {
  const entries = Object.entries(process.env).sort(([left], [right]) => left.localeCompare(right));
  return crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex");
}

function bindingFor(ledgerPath, gate, cwd, timeout) {
  return {
    ledger: path.resolve(ledgerPath), gate: gate.id, check: gate.check,
    expect: gate.expect, cwd, shell: "/bin/sh", timeout,
    pathEnv: process.env.PATH || "", platform: process.platform, nodeVersion: process.version,
    environmentHash: environmentHash(),
  };
}

function approvalPath(directory, binding) {
  const stableKey = {
    ledger: binding.ledger, gate: binding.gate, check: binding.check,
    expect: binding.expect, cwd: binding.cwd, shell: binding.shell, timeout: binding.timeout,
  };
  const digest = crypto.createHash("sha256").update(JSON.stringify(stableKey)).digest("hex");
  return path.join(directory, `${digest}.json`);
}

function readApproval(directory, binding) {
  const file = approvalPath(directory, binding);
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return { valid: false, reason: "approval pending", exists: false };
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
    return { valid: false, exists: true, reason: "approval invalid: record must be a regular single-link file" };
  }
  let record;
  try {
    record = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { valid: false, exists: true, reason: "approval invalid: record is not valid JSON" };
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, exists: true, reason: "approval invalid: record must be a JSON object" };
  }
  const storedBinding = {
    ledger: record.ledger, gate: record.gate, check: record.check,
    expect: record.expect, cwd: record.cwd, shell: record.shell,
    timeout: record.timeout, pathEnv: record.pathEnv,
    platform: record.platform, nodeVersion: record.nodeVersion,
    environmentHash: record.environmentHash,
  };
  if (JSON.stringify(storedBinding) !== JSON.stringify(binding)) {
    return { valid: false, exists: true, reason: "approval invalid: binding differs" };
  }
  return { valid: true, exists: true };
}

function expectedMatches(expect, output) {
  const want = expect.trim();
  if (want === "") return false;
  const trimmed = output.trim();
  return trimmed === want || trimmed.split(/\r?\n/).some((line) => line.trim() === want);
}

function compactOutput(output) {
  return output.replace(/[\r\n\t]+/g, " ").trim().slice(-800);
}

function resolveGateCwd(baseDirectory, gate) {
  const requested = gate.cwd ?? ".";
  if (path.isAbsolute(requested)) return { error: "CWD must be repository-relative" };
  let candidate;
  try {
    candidate = path.resolve(baseDirectory, requested);
    if (!isWithin(baseDirectory, candidate)) return { error: "CWD escapes repository" };
    if (!fs.existsSync(candidate)) return { error: `cwd-missing=${candidate}` };
    const resolved = fs.realpathSync(candidate);
    if (!isWithin(baseDirectory, resolved)) return { error: "CWD escapes repository through symlink" };
    return { cwd: resolved };
  } catch {
    return { error: "CWD is not a valid repository-relative path" };
  }
}

function runGate(ledgerPath, gate, options, requireApproval) {
  const baseDirectory = repositoryRootFor(ledgerPath) || path.dirname(ledgerPath);
  const cwdResult = resolveGateCwd(baseDirectory, gate);
  if (!cwdResult.cwd) return { ok: false, evidence: cwdResult.error };
  const { cwd } = cwdResult;
  const binding = bindingFor(ledgerPath, gate, cwd, options.timeout);
  const directory = approvalDirectory(options);
  const approval = approvalPath(directory, binding);
  const approvalState = readApproval(directory, binding);
  if (approvalState.exists && !approvalState.valid) {
    return { ok: false, pending: true, evidence: approvalState.reason };
  }
  if (requireApproval && !approvalState.valid) return { ok: false, pending: true, evidence: approvalState.reason };
  if (options.mode === "approve") {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (!approvalState.exists) fs.writeFileSync(approval, `${JSON.stringify({ ...binding, approvedAt: new Date().toISOString() }, null, 2)}\n`, { mode: 0o600 });
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
    if (!result || !gate.check) continue;
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
  const probe = gitTopLevelProbe(ledger);
  if (probe.failed) {
    fail("git could not be probed; refusing to write evidence without the repository guards");
    return 2;
  }
  const repositoryRoot = probe.root;
  const approvals = approvalDirectory(options);
  if (repositoryRoot && isWithin(repositoryRoot, approvals)) {
    fail("approval directory must be outside the repository");
    return 2;
  }
  if (repositoryRoot && options.mode !== "status" && !ledgerIsIgnored(repositoryRoot, ledger)) {
    fail("ledger must be ignored before writing evidence");
    return 2;
  }
  let parsed;
  try { parsed = parseLedger(ledger); } catch (error) { fail(error.message); return 2; }
  const results = new Map();
  let unmet = 0;
  for (const gate of parsed.gates) {
    if (gate.abandoned) { console.log(`ABANDONED ${gate.id}: ${gate.abandoned}`); unmet += 1; continue; }
    if (!gate.check) {
      const manualMet = gate.checked && gate.evidence.trim().toLowerCase() !== "pending";
      console.log(`${manualMet ? "MET" : "UNMET"} ${gate.id} (manual)`);
      if (!manualMet) unmet += 1;
      continue;
    }
    const shouldRun = options.mode === "approve" || options.mode === "reverify" || (!gate.checked && options.mode === "run");
    if (!shouldRun) { if (!gate.checked) unmet += 1; continue; }
    const result = runGate(ledger, gate, options, options.mode !== "approve");
    results.set(gate.id, result);
    if (result.pending) { console.log(`UNMET ${gate.id}: ${result.evidence}`); unmet += 1; continue; }
    console.log(`${result.ok ? "PASS" : "FAIL"} ${gate.id}: ${result.evidence}`);
    if (!result.ok) unmet += 1;
  }
  if (options.mode !== "status" && results.size > 0) writeLedger(ledger, parsed, results);
  console.log(`GATES.md: ${parsed.gates.length} gates`);
  console.log(`UNMET: ${unmet} (met: ${parsed.gates.length - unmet})`);
  return unmet === 0 ? 0 : 1;
}

process.exitCode = main();
