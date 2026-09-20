#!/usr/bin/env node
// Lane runner adapter for `krn harness compare`. The harness sends one JSON
// payload on stdin and reads one JSON result line from stdout. The adapter runs
// the configured agent command inside the task workspace with the lane's
// enabled components, then runs the task's deciding check there and reports the
// pass verdict, the agent's token count, and the wall time.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { runProcess } from "../lib/kernel/proc.mjs";

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function refuse(rule, detail) {
  process.stderr.write(`lane-runner refused: ${rule}${detail ? ` (${detail})` : ""}\n`);
  process.exit(2);
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
  const workspace = task.workspace ? path.resolve(root, task.workspace) : root;
  if (!fs.existsSync(workspace)) refuse("workspace-missing", workspace);

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
  const tokens = Number(lastJsonLine(agentRun.out)?.tokens) || 0;
  const checked = runProcess("sh", ["-c", check], { cwd: workspace });
  const wallSeconds = Math.round((Date.now() - started) / 100) / 10;
  process.stdout.write(`${JSON.stringify({ pass: checked.ok, tokens, wallSeconds })}\n`);
}

main();
