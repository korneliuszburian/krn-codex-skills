import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { runProcess } from "../kernel/proc.mjs";

const CAPABILITY_KEYS = ["skills", "memory", "brief", "hooks"];

const LANE_DEFINITIONS = {
  vanilla: { skills: false, memory: false, brief: false, hooks: false },
  full: { skills: true, memory: true, brief: true, hooks: true },
};

const KIND_TO_CAPABILITY = {
  hook: "hooks",
  hooks: "hooks",
  skill: "skills",
  skills: "skills",
  lesson: "memory",
  lessons: "memory",
  memory: "memory",
  brief: "brief",
};

const DETECTABLE_EPSILON = 1e-9;

class HarnessCompareError extends Error {
  constructor(rule, detail) {
    super(`harness compare refused: ${rule}${detail ? ` (${detail})` : ""}`);
    this.name = "HarnessCompareError";
    this.rule = rule;
  }
}

function refuse(rule, detail) {
  throw new HarnessCompareError(rule, detail);
}

function resolveLane(spec) {
  if (typeof spec === "string") {
    const defined = LANE_DEFINITIONS[spec];
    if (!defined) refuse("unknown-lane", spec);
    return { name: spec, enabled: { ...defined }, mutated: null };
  }
  if (!spec || typeof spec !== "object" || typeof spec.name !== "string" || !spec.name.trim()) {
    refuse("malformed-lane", JSON.stringify(spec) ?? String(spec));
  }
  const enabled = {};
  for (const key of CAPABILITY_KEYS) enabled[key] = spec.enabled?.[key] === true;
  return { name: spec.name.trim(), enabled, mutated: null };
}

function mutationCapability(kind) {
  const capability = KIND_TO_CAPABILITY[String(kind ?? "").trim().toLowerCase()];
  if (!capability) refuse("mutation-missing-capability", String(kind ?? ""));
  return capability;
}

export function loadTask(file) {
  const text = fs.readFileSync(file, "utf8");
  const fenced = /```(?:krn-harness-task|krn-task|json)\s*\n([\s\S]*?)```/i.exec(text);
  let payload;
  if (fenced) {
    try {
      payload = JSON.parse(fenced[1]);
    } catch (error) {
      refuse("task-not-json", `${file}: ${error.message}`);
    }
  } else {
    try {
      payload = JSON.parse(text);
    } catch {
      refuse("missing-harness-task-block", file);
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) refuse("malformed-task", file);
  const id = typeof payload.id === "string" && payload.id.trim()
    ? payload.id.trim()
    : path.basename(file).replace(/\.(?:md|markdown|json)$/i, "");
  return {
    id,
    prompt: typeof payload.prompt === "string" ? payload.prompt.trim() : "",
    check: typeof payload.check === "string" ? payload.check.trim() : "",
    workspace: typeof payload.workspace === "string" ? payload.workspace.trim() : "",
    setup: typeof payload.setup === "string" ? payload.setup.trim() : "",
    mutation: payload.mutation && typeof payload.mutation === "object" ? payload.mutation : null,
  };
}

function defaultRunner({ lane, enabled, mutation, task, run, root, runs }) {
  const entrypoint = process.env.KRN_HARNESS_LANE_RUNNER;
  if (!entrypoint) refuse("runner-missing", "set KRN_HARNESS_LANE_RUNNER or inject a runner adapter");
  const payload = JSON.stringify({
    lane,
    enabled,
    mutation,
    task: {
      id: task?.id ?? null,
      check: task?.check ?? null,
      prompt: task?.prompt ?? null,
      workspace: task?.workspace ?? null,
      setup: task?.setup ?? null,
    },
    run,
    runs,
    root,
  });
  const outcome = runProcess(process.execPath, [entrypoint], { cwd: root ?? process.cwd(), input: payload });
  if (outcome.errorCode) refuse("runner-spawn-failed", outcome.errorMessage);
  if (outcome.status !== 0) refuse("runner-failed", `${lane} run ${run} exited ${outcome.status}: ${outcome.err.trim()}`);
  const line = outcome.out.trim().split("\n").filter(Boolean).at(-1);
  try {
    return JSON.parse(line);
  } catch {
    refuse("runner-bad-output", `${lane} run ${run}: ${line ?? ""}`);
  }
}

function runId(task) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = String(task?.id ?? "task").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "task";
  const suffix = Math.random().toString(16).slice(2, 8);
  return `${stamp}-${slug}-${suffix}`;
}

export function summaryLine(report) {
  const lanes = report.lanes
    .map((entry) => `${entry.lane}=${entry.passes}/${entry.runs} tokens=${entry.tokens} wall=${entry.wallSeconds}s`)
    .join(" ");
  const deltas = Object.entries(report.delta)
    .map(([lane, entry]) => `${lane} dpass=${entry.passRate} dtokens=${entry.tokens} dwall=${entry.wallSeconds}`)
    .join(" ");
  return `harness compare ${lanes} | ${deltas} | ${report.note}`;
}

function persistReport({ root, task, report }) {
  const directory = path.join(root, ".krn", "runs", "eval", runId(task));
  fs.mkdirSync(directory, { recursive: true });
  report.run = path.relative(root, directory).split(path.sep).join("/");
  fs.writeFileSync(path.join(directory, "result.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(directory, "summary.txt"), `${summaryLine(report)}\n`);
  return report.run;
}

export async function compareHarness({ task, lanes, runs, runner, root } = {}) {
  const runCount = runs === undefined ? 1 : runs;
  if (!Number.isInteger(runCount) || runCount < 1) refuse("bad-runs", String(runs));
  const check = typeof task?.check === "string" ? task.check.trim() : "";
  if (!check) refuse("missing-deciding-check", String(task?.id ?? "task"));
  const specs = Array.isArray(lanes) ? lanes : [];
  if (specs.length < 2) refuse("too-few-lanes", `${specs.length}`);

  const resolved = specs.map(resolveLane);
  const baseline = resolved.find((entry) => entry.name === "vanilla")?.name ?? resolved[0].name;

  let mutation = null;
  if (task?.mutation && typeof task.mutation === "object") {
    const laneName = typeof task.mutation.lane === "string" ? task.mutation.lane.trim() : "";
    mutation = {
      lane: laneName,
      kind: String(task.mutation.kind ?? "").trim().toLowerCase(),
      name: typeof task.mutation.name === "string" ? task.mutation.name.trim() : "",
      capability: mutationCapability(task.mutation.kind),
    };
    if (laneName && !resolved.some((entry) => entry.name === laneName)) refuse("unknown-mutation-lane", laneName);
  }

  const adapter = typeof runner === "function" ? runner : defaultRunner;
  const lanesReport = [];
  const mutations = [];
  for (const entry of resolved) {
    const effective = { ...entry.enabled };
    let applied = null;
    if (mutation && (!mutation.lane || mutation.lane === entry.name)) {
      effective[mutation.capability] = false;
      applied = { lane: entry.name, kind: mutation.kind, name: mutation.name, capability: mutation.capability };
      mutations.push(applied);
    }
    let passes = 0;
    let tokens = 0;
    let wallSeconds = 0;
    for (let run = 1; run <= runCount; run += 1) {
      const outcome = await adapter({ lane: entry.name, enabled: effective, mutation: applied, task, run, runs: runCount, root });
      if (outcome?.pass === true) passes += 1;
      tokens += Number(outcome?.tokens) || 0;
      wallSeconds += Number(outcome?.wallSeconds) || 0;
    }
    lanesReport.push({ lane: entry.name, runs: runCount, passes, passRate: passes / runCount, tokens, wallSeconds });
  }

  const baselineReport = lanesReport.find((entry) => entry.lane === baseline);
  const delta = {};
  let detectable = false;
  for (const entry of lanesReport) {
    if (entry.lane === baseline) continue;
    const value = {
      passRate: entry.passRate - baselineReport.passRate,
      tokens: entry.tokens - baselineReport.tokens,
      wallSeconds: entry.wallSeconds - baselineReport.wallSeconds,
    };
    delta[entry.lane] = value;
    if (
      Math.abs(value.passRate) > DETECTABLE_EPSILON ||
      Math.abs(value.tokens) > DETECTABLE_EPSILON ||
      Math.abs(value.wallSeconds) > DETECTABLE_EPSILON
    ) {
      detectable = true;
    }
  }

  const report = {
    task: { id: task?.id ?? null, check, prompt: task?.prompt ?? null },
    baseline,
    lanes: lanesReport,
    delta,
    mutations,
    note: detectable ? "detectable-delta" : "no-detectable-delta",
  };
  if (root) persistReport({ root, task, report });
  return report;
}

export async function runHarnessCommand(args, { usage } = {}) {
  const options = { json: false, task: null, lanes: null, runs: 1, root: null };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const take = () => {
      const value = args[index + 1];
      if (value === undefined || value === "" || value.startsWith("--")) refuse("usage", `${arg} requires a value`);
      index += 1;
      return value;
    };
    if (arg === "--json") options.json = true;
    else if (arg === "--task") options.task = take();
    else if (arg === "--lanes") options.lanes = take();
    else if (arg === "--runs") options.runs = take();
    else if (arg === "--root") options.root = take();
    else if (arg.startsWith("--")) refuse("usage", `unknown harness option: ${arg}`);
    else positional.push(arg);
  }
  if (positional.length !== 1 || positional[0] !== "compare" || !options.task || !options.lanes) throw new Error(usage);
  const task = loadTask(options.task);
  const lanes = String(options.lanes).split(",").map((entry) => entry.trim()).filter(Boolean);
  const runs = Number(options.runs);
  const root = path.resolve(options.root ?? process.cwd());
  const report = await compareHarness({ task, lanes, runs, root });
  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${summaryLine(report)}\n`);
  return report;
}
