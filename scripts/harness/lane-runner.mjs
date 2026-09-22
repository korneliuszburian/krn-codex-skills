#!/usr/bin/env node
// Lane runner adapter for `krn harness compare`. The harness sends one JSON
// payload on stdin and reads one JSON result line from stdout. The adapter runs
// the configured agent command inside the task workspace with the lane's
// enabled components, then runs the task's deciding check there and reports the
// pass verdict, the agent's token count, and the wall time.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { runProcess } from "../lib/kernel/proc.mjs";

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// A refusal is thrown, not exited, so the `finally` that removes the disposable
// workspace and the held evaluator always runs.
class Refusal extends Error {
  constructor(rule, detail) {
    super(`lane-runner refused: ${rule}${detail ? ` (${detail})` : ""}`);
    this.name = "Refusal";
    this.rule = rule;
    this.detail = detail;
  }
}

function refuse(rule, detail) {
  throw new Refusal(rule, detail);
}

function lastJsonLine(text) {
  const line = String(text ?? "").trim().split("\n").filter(Boolean).at(-1);
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || "{}");
  } catch (error) {
    refuse("bad-payload", error.message);
  }
  const task = payload?.task ?? {};
  const check = typeof task.check === "string" ? task.check.trim() : "";
  if (!check) refuse("missing-check", String(task.id ?? "task"));
  const agent = process.env.KRN_HARNESS_AGENT;
  if (!agent || !agent.trim()) refuse("agent-missing", "set KRN_HARNESS_AGENT to the agent command");
  const root = path.resolve(payload.root ?? process.cwd());
  const source = task.workspace ? path.resolve(root, task.workspace) : root;
  if (!existsSync(source)) refuse("workspace-missing", source);
  // Each run gets its own copy so a repository-tracked task is never mutated
  // and two lanes can never share state.
  const disposable = mkdtempSync(path.join(tmpdir(), "krn-harness-workspace-"));
  const workspace = disposable;
  const hidden = Array.isArray(task.hidden) ? task.hidden : [];
  // The agent must not read or tamper with the evaluator, so the task's
  // declared hidden files (the deciding check and any gold answer) are held in
  // this process's memory while the agent runs and written back for scoring.
  // Nothing readable or writable is left on disk.
  const held = new Map();
  try {
    cpSync(source, disposable, { recursive: true });
    for (const relative of hidden) {
      const from = path.resolve(disposable, relative);
      if (path.isAbsolute(relative) || (from !== disposable && !from.startsWith(`${disposable}${path.sep}`))) refuse("hidden-outside-workspace", relative);
      if (!existsSync(from)) refuse("hidden-missing", relative);
      if (!statSync(from).isFile()) refuse("hidden-not-file", relative);
      held.set(relative, readFileSync(from));
      rmSync(from, { force: true });
    }
    if (task.setup) {
      const setup = runProcess("sh", ["-c", task.setup], { cwd: workspace });
      if (!setup.ok) refuse("setup-failed", setup.err.trim() || `exit ${setup.status}`);
    }

    const started = Date.now();
    const agentRun = runProcess("sh", ["-c", agent], {
      cwd: workspace,
      input: JSON.stringify({
        lane: payload.lane ?? null,
        enabled: payload.enabled ?? {},
        prompt: task.prompt ?? "",
        workspace,
        run: payload.run ?? null,
        runs: payload.runs ?? null,
      }),
    });
    if (agentRun.errorCode) refuse("agent-spawn-failed", agentRun.errorMessage);
    // A provider failure or an interrupted transport surfaces as a nonzero agent
    // exit; it is not a completed trial and must never be scored.
    if (agentRun.status !== 0) refuse("agent-failed", agentRun.signal ? `signal ${agentRun.signal}` : `exit ${agentRun.status}`);
    for (const [relative, content] of held) {
      const to = path.join(disposable, relative);
      mkdirSync(path.dirname(to), { recursive: true });
      writeFileSync(to, content);
    }
    const agentOutcome = lastJsonLine(agentRun.out);
    if (agentOutcome === null) refuse("agent-outcome-missing", "the agent produced no JSON outcome line");
    const tokens = agentOutcome.tokens;
    if (!(typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0)) {
      refuse("agent-tokens-invalid", JSON.stringify(tokens ?? null));
    }
    // A token-only outcome with a zero count carries no usage, so it is a
    // provider or transport failure, not a free pass.
    if (tokens === 0) refuse("agent-usage-missing", "the agent reported no token usage");
    const checked = runProcess("sh", ["-c", check], { cwd: workspace });
    const wallSeconds = Math.round((Date.now() - started) / 100) / 10;
    if (!(Number.isFinite(wallSeconds) && wallSeconds >= 0)) refuse("wall-invalid", String(wallSeconds));
    process.stdout.write(`${JSON.stringify({ pass: checked.ok, tokens, wallSeconds })}\n`);
  } finally {
    rmSync(disposable, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  if (error instanceof Refusal) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
  throw error;
}
