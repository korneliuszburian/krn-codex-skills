import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scripts = fileURLToPath(new URL("../skills/advisory/second-opinion/scripts", import.meta.url));
const extract = join(scripts, "extract-opinion.mjs");
const checkOpinion = join(scripts, "check-opinion.sh");
const runOpinion = join(scripts, "run-opinion.sh");

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const bash = (script, args, options = {}) => spawnSync("bash", [script, ...args], { encoding: "utf8", ...options });

const runDirUnder = (root, id) => join(root, ".krn", "runs", "second-opinion", id);

test("check-opinion.sh classifies pending, completed, failed, and invalid runs", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-state-"));
  try {
    const runDir = runDirUnder(root, "run-1");
    mkdirSync(runDir, { recursive: true });
    assert.equal(bash(checkOpinion, [runDir]).status, 2);
    assert.match(bash(checkOpinion, [runDir]).stdout, /pending/);

    writeFileSync(join(runDir, "opinion.md"), "opinion\n");
    assert.equal(bash(checkOpinion, [runDir]).status, 2);

    writeFileSync(join(runDir, "raw.jsonl"), "{}\n");
    writeFileSync(join(runDir, "meta.json"), "{}\n");
    const completed = bash(checkOpinion, [runDir]);
    assert.equal(completed.status, 0, completed.stderr);
    assert.match(completed.stdout, /completed/);

    writeFileSync(join(runDir, "failure.txt"), "boom\n");
    assert.equal(bash(checkOpinion, [runDir]).status, 64);

    const failedDir = runDirUnder(root, "run-2");
    mkdirSync(failedDir, { recursive: true });
    writeFileSync(join(failedDir, "failure.txt"), "boom\n");
    assert.equal(bash(checkOpinion, [failedDir]).status, 1);
    assert.equal(bash(checkOpinion, [root]).status, 64);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-opinion.sh rejects invalid inputs before invoking a transport", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-run-"));
  try {
    const target = join(root, "target");
    const runDir = runDirUnder(target, "run-1");
    mkdirSync(runDir, { recursive: true });
    const prompt = join(root, "prompt.md");
    writeFileSync(prompt, "advise\n");
    const output = join(runDir, "opinion.md");

    assert.equal(bash(runOpinion, []).status, 64);
    assert.equal(bash(runOpinion, ["bogus", target, prompt, output]).status, 64);
    assert.equal(bash(runOpinion, ["opencode", join(root, "missing"), prompt, output]).status, 66);
    assert.equal(bash(runOpinion, ["opencode", target, join(root, "missing.md"), output]).status, 66);
    assert.equal(bash(runOpinion, ["opencode", target, prompt, "relative.md"]).status, 66);
    assert.equal(bash(runOpinion, ["opencode", target, prompt, join(target, "opinion.md")]).status, 65);

    writeFileSync(output, "already\n");
    assert.equal(bash(runOpinion, ["opencode", target, prompt, output]).status, 65);
    rmSync(output);
    writeFileSync(join(runDir, "raw.jsonl"), "{}\n");
    assert.equal(bash(runOpinion, ["opencode", target, prompt, output]).status, 65);
    rmSync(join(runDir, "raw.jsonl"));

    const noCli = bash(runOpinion, ["opencode", target, prompt, output], { env: { PATH: "/bin", HOME: root } });
    assert.equal(noCli.status, 127, noCli.stderr || noCli.error?.message || "");
    assert.match(noCli.stderr, /opencode CLI not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extract-opinion.mjs writes the terminal answer and refuses bad input", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-"));
  try {
    const target = join(root, "target");
    mkdirSync(target);
    const raw = join(root, "raw.jsonl");
    const output = join(root, "opinion.md");
    const terminal = (text) =>
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n");

    writeFileSync(raw, terminal("Final answer"));
    assert.equal(run(extract, ["opencode", raw, output, target, "prose"]).status, 0);
    assert.equal(readFileSync(output, "utf8"), "Final answer\n");

    const empty = join(root, "empty.jsonl");
    writeFileSync(empty, `${JSON.stringify({ type: "text", part: { messageID: "m1", text: "x" } })}\n`);
    assert.equal(run(extract, ["opencode", empty, output, target, "prose"]).status, 1);

    const malformed = join(root, "bad.jsonl");
    writeFileSync(malformed, "{oops\n");
    assert.equal(run(extract, ["opencode", malformed, output, target, "prose"]).status, 1);

    const secret = join(root, "secret.txt");
    writeFileSync(secret, "s\n");
    const leaky = join(root, "leaky.jsonl");
    writeFileSync(leaky, terminal(`see ${secret}:1`));
    const escaped = run(extract, ["opencode", leaky, output, target, "prose"]);
    assert.equal(escaped.status, 1);
    assert.match(escaped.stderr, /outside the target scope/);

    const relativeLeak = join(root, "relative.jsonl");
    writeFileSync(relativeLeak, terminal("see ../secret.txt:1"));
    assert.equal(run(extract, ["opencode", relativeLeak, output, target, "prose"]).status, 1);

    const jsonOutput = join(root, "opinion.json");
    const jsonRaw = join(root, "json.jsonl");
    writeFileSync(jsonRaw, terminal('verdict below\n```json\n{"verdict":"ok"}\n```'));
    assert.equal(run(extract, ["opencode", jsonRaw, jsonOutput, target, "json"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(jsonOutput, "utf8")), { verdict: "ok" });

    const multiRaw = join(root, "multi.jsonl");
    writeFileSync(multiRaw, terminal('{"a":1} {"b":2}'));
    assert.equal(run(extract, ["opencode", multiRaw, jsonOutput, target, "json"]).status, 1);

    const arrayRaw = join(root, "array.jsonl");
    writeFileSync(arrayRaw, terminal('[{"verdict":"ok"}]'));
    assert.equal(run(extract, ["opencode", arrayRaw, jsonOutput, target, "json"]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

const stubTransport = (root, name, lines) => {
  const bin = join(root, "bin");
  mkdirSync(bin, { recursive: true });
  const stub = join(bin, name);
  writeFileSync(stub, ["#!/usr/bin/env bash", ...lines, "exit 0", ""].join("\n"));
  chmodSync(stub, 0o755);
  return bin;
};

test("run-opinion records transport, model, and elapsed time in meta.json", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-meta-"));
  try {
    const target = join(root, "target");
    const runDir = runDirUnder(target, "run-1");
    mkdirSync(runDir, { recursive: true });
    const prompt = join(root, "prompt.md");
    writeFileSync(prompt, "advise\n");
    const output = join(runDir, "opinion.md");
    const bin = stubTransport(root, "opencode", [
      "sleep 1",
      'printf \'%s\\n\' \'{"type":"text","part":{"messageID":"m1","text":"Final answer"}}\'',
      'printf \'%s\\n\' \'{"type":"step_finish","part":{"reason":"stop","messageID":"m1"}}\'',
    ]);
    const result = bash(runOpinion, ["opencode", target, prompt, output], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(result.status, 0, result.stderr);
    const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
    assert.equal(meta.transport, "opencode");
    assert.equal(meta.target, target);
    assert.ok(Number.isInteger(meta.elapsed_seconds) && meta.elapsed_seconds >= 1, JSON.stringify(meta));
    assert.equal(bash(checkOpinion, [runDir]).status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the codex transport writes the -o message and refuses an empty one", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-codex-"));
  try {
    const target = join(root, "target");
    const runDir = runDirUnder(target, "run-1");
    mkdirSync(runDir, { recursive: true });
    const prompt = join(root, "prompt.md");
    writeFileSync(prompt, "advise\n");
    const output = join(runDir, "opinion.md");
    const bin = stubTransport(root, "codex", [
      'out=""',
      'while [ $# -gt 0 ]; do if [ "$1" = "-o" ]; then out="$2"; fi; shift; done',
      'printf \'%s\\n\' "codex opinion" > "$out"',
      'printf \'%s\\n\' \'{"type":"turn.completed"}\'',
    ]);
    const result = bash(runOpinion, ["codex", target, prompt, output], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(output, "utf8"), "codex opinion\n");
    const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
    assert.equal(meta.transport, "codex");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
