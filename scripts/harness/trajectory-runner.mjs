#!/usr/bin/env node
// Trajectory runner adapter for the KRN harness. The single-request lane runner
// scores one workspace snapshot; this adapter drives an ordered trajectory in a
// workspace that persists across steps, so an obligation earned at an earlier
// step is re-checked after every later step. A trajectory whose latest request
// passes while an earlier still-applicable obligation broke is rejected. The
// step checks are held outside the workspace while the agent runs and restored
// only for scoring, so the agent can never read or rewrite its own evaluator.
//
// Payload on stdin (one JSON object), one JSON result line on stdout:
//   { task: { id, workspace, hidden, steps: [{ id, prompt, check, retires,
//       intent?: { source, mode: "delta", scope: [priorId],
//         dispositions: [{ id: priorId, action: "revoke" | "replace",
//           mappingCheck?: command }] } }] }, lane, enabled, root }
// Intent is curated by the evaluator caller, not inferred from agent output.
// Its source label does not authenticate the real user who issued a request.
// The agent command comes from KRN_HARNESS_AGENT and receives the same JSON
// envelope the lane runner uses, plus the current `step`.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { runProcess } from "../lib/kernel/proc.mjs";
import { Refusal, lastJsonLine, readStdin, refusalFor } from "./runner-support.mjs";

const refuse = refusalFor("trajectory-runner");

function stringList(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string" && entry.trim()).map((entry) => entry.trim()) : [];
}

// The agent run is a completed trial only when it exits zero and reports real
// token usage; anything else leaves the workspace in an unknown state and the
// step cannot earn an obligation.
function agentInvalidReason(agentRun) {
  if (agentRun.errorCode) return `agent-spawn-failed:${agentRun.errorMessage}`;
  if (agentRun.status !== 0) return `agent-failed:${agentRun.signal ?? agentRun.status}`;
  const outcome = lastJsonLine(agentRun.out);
  if (outcome === null) return "agent-outcome-missing";
  const tokens = outcome.tokens;
  if (!(typeof tokens === "number" && Number.isFinite(tokens) && tokens > 0)) return "agent-usage-missing";
  return null;
}

function main() {
  let payload;
  try {
    payload = JSON.parse(readStdin() || "{}");
  } catch (error) {
    refuse("bad-payload", error.message);
  }
  const task = payload?.task ?? {};
  const steps = Array.isArray(task.steps) ? task.steps : [];
  if (steps.length === 0) refuse("missing-steps", String(task.id ?? "task"));
  const agent = process.env.KRN_HARNESS_AGENT;
  if (!agent || !agent.trim()) refuse("agent-missing", "set KRN_HARNESS_AGENT to the agent command");
  const root = path.resolve(payload.root ?? process.cwd());
  const source = task.workspace ? path.resolve(root, task.workspace) : root;
  if (!existsSync(source)) refuse("workspace-missing", source);

  const disposable = mkdtempSync(path.join(tmpdir(), "krn-trajectory-workspace-"));
  const holding = mkdtempSync(path.join(tmpdir(), "krn-trajectory-held-"));
  const hidden = stringList(task.hidden);
  const held = new Map();
  try {
    cpSync(source, disposable, { recursive: true });
    for (const relative of hidden) {
      const from = path.resolve(disposable, relative);
      if (path.isAbsolute(relative) || (from !== disposable && !from.startsWith(`${disposable}${path.sep}`))) refuse("hidden-outside-workspace", relative);
      if (!existsSync(from)) refuse("hidden-missing", relative);
      const to = path.join(holding, relative);
      mkdirSync(path.dirname(to), { recursive: true });
      renameSync(from, to);
      held.set(relative, to);
    }
    const move = (from, to) => {
      mkdirSync(path.dirname(to), { recursive: true });
      renameSync(from, to);
    };
    const restore = () => {
      for (const [relative, to] of held) move(to, path.join(disposable, relative));
    };
    const hide = () => {
      for (const [relative, from] of held) move(path.join(disposable, relative), from);
    };

    const obligations = [];
    const stepResults = [];
    for (const [index, step] of steps.entries()) {
      const started = Date.now();
      const id = typeof step.id === "string" && step.id.trim() ? step.id.trim() : `step-${index + 1}`;
      if (obligations.some((entry) => entry.id === id)) refuse("duplicate-step-id", id);
      const retiredIds = stringList(step.retires);
      if (step.retires !== undefined
        && (!Array.isArray(step.retires) || step.retires.length !== retiredIds.length)) {
        refuse("retirement-without-authority", "malformed retires");
      }
      const dispositions = step.intent?.dispositions;
      let retirements = [];
      if (retiredIds.length || step.intent !== undefined) {
        const intent = step.intent;
        if (!intent || typeof intent !== "object" || typeof intent.source !== "string" || !intent.source.trim()
          || intent.mode !== "delta" || !Array.isArray(intent.scope)
          || !Array.isArray(dispositions) || intent.scope.length !== stringList(intent.scope).length
          || dispositions.length !== retiredIds.length || new Set(retiredIds).size !== retiredIds.length) {
          refuse("retirement-without-authority", String(step.id ?? index + 1));
        }
        const scoped = new Set(intent.scope);
        if (scoped.size !== intent.scope.length) refuse("retirement-without-authority", "duplicate scope");
        retirements = retiredIds.map((id) => {
          const target = obligations.find((entry) => entry.id === id && entry.active);
          const grants = dispositions.filter((entry) => entry?.id === id);
          if (!target || !scoped.has(id) || grants.length !== 1
            || !["revoke", "replace"].includes(grants[0].action)
            || (grants[0].action === "replace"
              && (typeof grants[0].mappingCheck !== "string" || !grants[0].mappingCheck.trim()))) {
            refuse("retirement-without-authority", id);
          }
          return { target, grant: grants[0] };
        });
      }
      const agentRun = runProcess("sh", ["-c", agent], {
        cwd: disposable,
        input: JSON.stringify({
          lane: payload.lane ?? null,
          enabled: payload.enabled ?? {},
          step: typeof step.id === "string" && step.id.trim() ? step.id.trim() : `step-${index + 1}`,
          prompt: typeof step.prompt === "string" ? step.prompt : "",
          workspace: disposable,
          run: index + 1,
          runs: steps.length,
        }),
      });
      restore();
      const invalid = agentInvalidReason(agentRun);
      const check = typeof step.check === "string" ? step.check.trim() : "";
      if (!check) refuse("missing-check", `${task.id ?? "task"}/${step.id ?? index + 1}`);
      const ownChecked = runProcess("sh", ["-c", check], { cwd: disposable });
      const ownPass = invalid === null && ownChecked.ok;
      // A scoped revocation removes an obligation; a replacement must keep a
      // caller-authored executable mapping live for this and later steps.
      for (const { target, grant } of retirements) {
        if (grant.action === "revoke") target.active = false;
        else target.check = grant.mappingCheck.trim();
      }
      const obligation = { id, check, active: ownPass };
      obligations.push(obligation);
      const lost = [];
      for (const active of obligations) {
        if (!active.active) continue;
        const checked = runProcess("sh", ["-c", active.check], { cwd: disposable });
        if (!checked.ok) lost.push(active.id);
      }
      const wallSeconds = Math.round((Date.now() - started) / 100) / 10;
      stepResults.push({ id, pass: ownPass, invalid, wallSeconds, lost });
      hide();
    }
    const finalLost = [...new Set(stepResults.flatMap((entry) => entry.lost))];
    const complete = stepResults.every((entry) => entry.invalid === null && entry.pass === true) && finalLost.length === 0;
    process.stdout.write(`${JSON.stringify({ steps: stepResults, lost: finalLost, complete })}\n`);
  } finally {
    rmSync(disposable, { recursive: true, force: true });
    rmSync(holding, { recursive: true, force: true });
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
