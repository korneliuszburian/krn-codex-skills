#!/usr/bin/env node
// SWE-bench scale runner. For each frozen instance and lane it starts the lane
// agent inside the instance image at /testbed, captures the git diff as the
// model patch, and hands the predictions to the official swebench harness. The
// runner is checkout-local: the harness virtualenv and the images are host
// state, so the recorded commands in LT-103 are what make it reproducible.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

import { runProcess } from "../lib/kernel/proc.mjs";

const ALL_ON = { skills: true, memory: true, brief: true, hooks: true };
export const LANES = {
  vanilla: { skills: false, memory: false, brief: false, hooks: false },
  full: { ...ALL_ON },
  "no-skills": { ...ALL_ON, skills: false },
  "no-memory": { ...ALL_ON, memory: false },
  "no-brief": { ...ALL_ON, brief: false },
  "no-hooks": { ...ALL_ON, hooks: false },
};
export const DEFAULT_MODEL = "opencode-go/deepseek-v4.1-flash";
const PROMPT =
  "Read /problem.txt and fix the reported issue in this repository. Make the minimal change and do not edit tests.";

export function parseTokens(eventsText) {
  let total = 0;
  for (const line of String(eventsText ?? "").split("\n")) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type === "step_finish" && event.part?.tokens) total += Number(event.part.tokens.total) || 0;
  }
  return total;
}

export function buildPredictions(lane, patches) {
  return patches.map(({ instanceId, patch }) => ({
    instance_id: instanceId,
    model_name_or_path: `krn-${lane}`,
    model_patch: patch,
  }));
}

export function resolvedRate(report) {
  const resolved = Array.isArray(report?.resolved) ? report.resolved.length : 0;
  const unresolved = Array.isArray(report?.unresolved) ? report.unresolved.length : 0;
  const total = resolved + unresolved;
  return { resolved, total, rate: total === 0 ? 0 : resolved / total };
}

// The lane home is materialized on the host and mounted at /root: the real
// config and its symlink targets (the release tree and the upstream cache) are
// mounted read-only so the KRN plugin and the skills resolve inside the image.
export function laneMounts(enabled, home = homedir()) {
  const mounts = [];
  const add = (source, target, mode = "ro") => mounts.push("-v", `${source}:${target}:${mode}`);
  const configDir = path.join(home, ".config", "opencode");
  if (enabled.brief || enabled.hooks) {
    add(configDir, "/root/.config/opencode");
  } else {
    const minimal = mkdtempSync(path.join(tmpdir(), "krn-swebench-config-"));
    writeFileSync(path.join(minimal, "opencode.json"), '{ "$schema": "https://opencode.ai/config.json", "autoupdate": false }\n');
    if (enabled.memory || enabled.skills) {
      writeFileSync(path.join(minimal, "AGENTS.md"), "Before editing, run `krn memory recall --root <repository> --changed <path>` and apply the lesson it returns.\n");
    }
    add(minimal, "/root/.config/opencode");
  }
  add(path.join(home, ".config", "opencode", "secrets"), path.join(home, ".config", "opencode", "secrets"));
  if (enabled.skills) {
    add(path.join(home, ".agents"), "/root/.agents");
    add(path.join(home, ".cache", "krn-upstream"), path.join(home, ".cache", "krn-upstream"));
  }
  add(path.join(home, ".codex", "krn"), path.join(home, ".codex", "krn"));
  add(path.join(home, ".opencode"), "/opencode");
  add(path.join(home, ".local", "share", "opencode"), "/root/.local/share/opencode", "rw");
  return mounts;
}

export function containerArgs({ image, mounts, model = DEFAULT_MODEL, problemFile, outDir }) {
  const inner = [
    "cd /testbed",
    `/opencode/bin/opencode run --model ${model} --format json --auto --dir /testbed ${JSON.stringify(PROMPT)} > /out/events.jsonl 2> /out/err.txt`,
    "git diff > /out/patch.diff",
    "git status --short > /out/status.txt",
  ].join(" && ");
  return [
    "run",
    "--rm",
    ...mounts,
    "-v",
    `${problemFile}:/problem.txt:ro`,
    "-v",
    `${outDir}:/out`,
    image,
    "sh",
    "-c",
    inner,
  ];
}

function main() {
  const options = { slice: null, problems: null, lane: "full", out: null, model: DEFAULT_MODEL, runId: "krn-scale" };
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const take = () => {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${args[index]} requires a value`);
      index += 1;
      return value;
    };
    if (args[index] === "--slice") options.slice = take();
    else if (args[index] === "--problems") options.problems = take();
    else if (args[index] === "--lane") options.lane = take();
    else if (args[index] === "--out") options.out = take();
    else if (args[index] === "--model") options.model = take();
    else if (args[index] === "--run-id") options.runId = take();
    else throw new Error(`unrecognized option: ${args[index]}`);
  }
  if (!options.slice || !options.problems || !options.out) throw new Error("--slice, --problems, and --out are required");
  const enabled = LANES[options.lane];
  if (!enabled) throw new Error(`unknown lane: ${options.lane}`);
  const slice = JSON.parse(readFileSync(options.slice, "utf8"));
  const problems = JSON.parse(readFileSync(options.problems, "utf8"));
  const mounts = laneMounts(enabled);
  const patches = [];
  const started = Date.now();
  for (const instance of slice) {
    const outDir = mkdtempSync(path.join(tmpdir(), `krn-swebench-${instance.instance_id}-`));
    writeFileSync(path.join(outDir, "problem.txt"), problems[instance.instance_id] ?? "");
    const problemFile = path.join(outDir, "problem.txt");
    const result = runProcess("docker", containerArgs({ image: instance.image, mounts, model: options.model, problemFile, outDir }), {
      timeout: 1_500_000,
    });
    const events = existsSync(path.join(outDir, "events.jsonl")) ? readFileSync(path.join(outDir, "events.jsonl"), "utf8") : "";
    const patch = existsSync(path.join(outDir, "patch.diff")) ? readFileSync(path.join(outDir, "patch.diff"), "utf8") : "";
    const tokens = parseTokens(events);
    patches.push({ instanceId: instance.instance_id, patch });
    process.stdout.write(`instance ${instance.instance_id} status=${result.status} tokens=${tokens} patch=${patch.length}\n`);
    rmSync(outDir, { recursive: true, force: true });
  }
  const predictions = buildPredictions(options.lane, patches);
  const predictionsPath = path.join(options.out, `${options.lane}.predictions.json`);
  mkdirSync(options.out, { recursive: true });
  writeFileSync(predictionsPath, `${JSON.stringify(predictions, null, 2)}\n`);
  process.stdout.write(`predictions ${predictionsPath} wall=${Math.round((Date.now() - started) / 1000)}s\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
