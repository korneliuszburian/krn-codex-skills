#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomBytes } from "node:crypto";

const diagnosticKeys = new Set([
  "diagnostic_version",
  "command",
  "code",
  "pointer",
  "message",
  "retryable",
]);

function fail(message) {
  throw new Error(message);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function readJson(file, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read ${label} ${file}: ${error.message}`);
  }
}

function privateDirectory(directory) {
  const metadata = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!metadata) {
    fs.mkdirSync(directory, { mode: 0o700 });
    return;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail(`job directory must be a real directory: ${directory}`);
  }
  if ((metadata.mode & 0o077) !== 0) {
    fail(`job directory must not grant group or other permissions: ${directory}`);
  }
}

function atomicJson(file, value, { create = false } = {}) {
  privateDirectory(path.dirname(file));
  const temporary = path.join(
    path.dirname(file),
    `.checker-job-${process.pid}-${randomBytes(6).toString("hex")}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (create) {
      fs.linkSync(temporary, file);
      fs.unlinkSync(temporary);
    } else {
      fs.renameSync(temporary, file);
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
}

function readJob(file) {
  const metadata = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!metadata || !metadata.isFile() || metadata.isSymbolicLink()) {
    fail(`checker job must be a real file: ${file}`);
  }
  const job = object(readJson(file, "checker job"), "checker job");
  if (job.job_version !== "1" || job.role !== "checker") {
    fail("checker job has an invalid identity");
  }
  return job;
}

function positiveInteger(raw, label) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) fail(`${label} must be a positive integer`);
  return value;
}

function diagnostic(file) {
  const value = object(readJson(file, "review diagnostic"), "review diagnostic");
  const keys = Object.keys(value);
  const extra = keys.filter((key) => !diagnosticKeys.has(key));
  const missing = [...diagnosticKeys].filter((key) => !keys.includes(key));
  if (extra.length || missing.length) fail("review diagnostic has invalid keys");
  if (value.diagnostic_version !== "1") fail("review diagnostic version must be '1'");
  if (!new Set(["normalize", "finalize"]).has(value.command)) {
    fail("review diagnostic command must be normalize or finalize");
  }
  for (const key of ["code", "message"]) {
    if (typeof value[key] !== "string" || !value[key].trim()) {
      fail(`review diagnostic ${key} must be a non-empty string`);
    }
  }
  if (typeof value.pointer !== "string") {
    fail("review diagnostic pointer must be a string");
  }
  if (typeof value.retryable !== "boolean") {
    fail("review diagnostic retryable must be a boolean");
  }
  return value;
}

function storedDiagnostic(value) {
  return {
    stage: value.command,
    code: value.code,
    pointer: value.pointer,
    message: value.message,
    retryable: value.retryable,
  };
}

function start(args) {
  if (args.length !== 10) {
    fail("usage: review-job.mjs start <job> <max-attempts> <mode> <target> <prompt> <output> <model> <effort> <budget> <timeout>");
  }
  const [file, rawMaxAttempts, mode, target, prompt, output, model, effort, budget, timeout] = args;
  const maxAttempts = positiveInteger(rawMaxAttempts, "max attempts");
  const startedAt = new Date().toISOString();
  atomicJson(
    file,
    {
      job_version: "1",
      role: "checker",
      state: "running",
      mode,
      target,
      prompt_path: prompt,
      result_path: output,
      requested_model: model,
      effort,
      max_budget_usd: budget,
      timeout_seconds: Number(timeout),
      attempt: 0,
      max_attempts: maxAttempts,
      normalization_changes: [],
      started_at: startedAt,
      finished_at: null,
      failure_kind: null,
      diagnostic: null,
    },
    { create: true },
  );
}

function beginAttempt(args) {
  if (args.length !== 2) fail("usage: review-job.mjs attempt <job> <attempt>");
  const [file, rawAttempt] = args;
  const attempt = positiveInteger(rawAttempt, "attempt");
  const job = readJob(file);
  if (job.state !== "running" || attempt > job.max_attempts) {
    fail("cannot advance a terminal or out-of-range checker job");
  }
  atomicJson(file, { ...job, attempt });
}

function recordRetry(args) {
  if (args.length !== 3) fail("usage: review-job.mjs retry <job> <attempt> <diagnostic>");
  const [file, rawAttempt, diagnosticFile] = args;
  const attempt = positiveInteger(rawAttempt, "attempt");
  const job = readJob(file);
  if (job.state !== "running" || attempt !== job.attempt || attempt >= job.max_attempts) {
    fail("cannot retry a terminal or exhausted checker job");
  }
  const value = diagnostic(diagnosticFile);
  if (!value.retryable) fail("cannot retry a non-retryable diagnostic");
  atomicJson(file, { ...job, last_diagnostic: storedDiagnostic(value) });
}

function normalizationChanges(file) {
  const normalization = object(
    readJson(file, "normalization record"),
    "normalization record",
  );
  if (normalization.normalization_version !== "1" || !Array.isArray(normalization.changes)) {
    fail("normalization record must define version 1 and changes");
  }
  return normalization.changes;
}

function complete(args) {
  if (args.length !== 3) fail("usage: review-job.mjs complete <job> <attempt> <normalization>");
  const [file, rawAttempt, normalizationFile] = args;
  const attempt = positiveInteger(rawAttempt, "attempt");
  const job = readJob(file);
  if (job.state !== "running" || attempt !== job.attempt) {
    fail("cannot complete a terminal or stale checker attempt");
  }
  atomicJson(file, {
    ...job,
    state: "complete",
    normalization_changes: normalizationChanges(normalizationFile),
    finished_at: new Date().toISOString(),
    failure_kind: null,
    diagnostic: null,
  });
}

function failDiagnostic(args) {
  if (args.length !== 4) {
    fail("usage: review-job.mjs fail-diagnostic <job> <attempt> <failure-kind> <diagnostic>");
  }
  const [file, rawAttempt, failureKind, diagnosticFile] = args;
  const attempt = positiveInteger(rawAttempt, "attempt");
  const job = readJob(file);
  if (job.state !== "running" || attempt !== job.attempt) {
    fail("cannot fail a terminal or stale checker attempt");
  }
  atomicJson(file, {
    ...job,
    state: "failed",
    finished_at: new Date().toISOString(),
    failure_kind: failureKind,
    diagnostic: storedDiagnostic(diagnostic(diagnosticFile)),
  });
}

function failRunner(args) {
  if (args.length !== 8) {
    fail("usage: review-job.mjs fail-runner <job> <attempt> <failure-kind> <stage> <code> <pointer> <message> <retryable>");
  }
  const [file, rawAttempt, failureKind, stage, code, pointer, message, rawRetryable] = args;
  const attempt = Number(rawAttempt);
  if (!Number.isSafeInteger(attempt) || attempt < 0) fail("attempt must be a non-negative integer");
  const job = readJob(file);
  if (job.state !== "running" || attempt !== job.attempt) {
    fail("cannot fail a terminal or stale checker attempt");
  }
  if (!new Set(["true", "false"]).has(rawRetryable)) fail("retryable must be true or false");
  atomicJson(file, {
    ...job,
    state: "failed",
    finished_at: new Date().toISOString(),
    failure_kind: failureKind,
    diagnostic: {
      stage,
      code,
      pointer,
      message,
      retryable: rawRetryable === "true",
    },
  });
}

function diagnosticRetryable(args) {
  if (args.length !== 1) fail("usage: review-job.mjs diagnostic-retryable <diagnostic>");
  process.exitCode = diagnostic(args[0]).retryable ? 0 : 1;
}

function main([command, ...args]) {
  switch (command) {
    case "start":
      return start(args);
    case "attempt":
      return beginAttempt(args);
    case "retry":
      return recordRetry(args);
    case "complete":
      return complete(args);
    case "fail-diagnostic":
      return failDiagnostic(args);
    case "fail-runner":
      return failRunner(args);
    case "diagnostic-retryable":
      return diagnosticRetryable(args);
    default:
      fail("usage: review-job.mjs <start|attempt|retry|complete|fail-diagnostic|fail-runner|diagnostic-retryable> ...");
  }
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`checker job failed: ${error.message}\n`);
  process.exitCode = 64;
}
