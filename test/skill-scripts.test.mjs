import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const extract = fileURLToPath(new URL("../skills/advisory/opencode-second-opinion/scripts/extract-final-opinion.mjs", import.meta.url));
const checkOpinion = fileURLToPath(new URL("../skills/advisory/opencode-second-opinion/scripts/check-opinion.sh", import.meta.url));
const runOpinion = fileURLToPath(new URL("../skills/advisory/opencode-second-opinion/scripts/run-opinion.sh", import.meta.url));

const run = (script, args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const bash = (script, args, options = {}) => spawnSync("bash", [script, ...args], { encoding: "utf8", ...options });

test("check-opinion.sh classifies pending, completed, failed, and invalid runs", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-state-"));
  try {
    const runDir = join(root, ".krn", "runs", "opencode-second-opinion", "run-1");
    mkdirSync(runDir, { recursive: true });
    assert.equal(bash(checkOpinion, [runDir]).status, 2);
    assert.match(bash(checkOpinion, [runDir]).stdout, /pending/);

    writeFileSync(join(runDir, "opinion.md"), "opinion\n");
    const partial = bash(checkOpinion, [runDir]);
    assert.equal(partial.status, 2, partial.stdout + partial.stderr);
    assert.match(partial.stdout, /pending/);

    writeFileSync(join(runDir, "raw.jsonl"), "{}\n");
    writeFileSync(join(runDir, "meta.json"), "{}\n");
    const completed = bash(checkOpinion, [runDir]);
    assert.equal(completed.status, 0, completed.stderr);
    assert.match(completed.stdout, /completed/);

    writeFileSync(join(runDir, "failure.txt"), "boom\n");
    assert.equal(bash(checkOpinion, [runDir]).status, 64);

    mkdirSync(join(root, ".krn", "runs", "opencode-second-opinion", "run-2"));
    writeFileSync(join(root, ".krn", "runs", "opencode-second-opinion", "run-2", "failure.txt"), "boom\n");
    assert.equal(bash(checkOpinion, [join(root, ".krn", "runs", "opencode-second-opinion", "run-2")]).status, 1);
    assert.equal(bash(checkOpinion, [root]).status, 64);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-opinion.sh rejects invalid inputs before invoking opencode", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-run-"));
  try {
    const target = join(root, "target");
    const runDir = join(target, ".krn", "runs", "opencode-second-opinion", "run-1");
    mkdirSync(runDir, { recursive: true });
    const prompt = join(root, "prompt.md");
    writeFileSync(prompt, "advise\n");
    const output = join(runDir, "opinion.md");

    assert.equal(bash(runOpinion, []).status, 64);
    assert.equal(bash(runOpinion, [join(root, "missing"), prompt, output]).status, 66);
    assert.equal(bash(runOpinion, [target, join(root, "missing.md"), output]).status, 66);
    assert.equal(bash(runOpinion, [target, prompt, "relative.md"]).status, 66);
    assert.equal(bash(runOpinion, [target, prompt, join(target, "opinion.md")]).status, 65);

    writeFileSync(output, "already\n");
    assert.equal(bash(runOpinion, [target, prompt, output]).status, 65);
    rmSync(output);
    writeFileSync(join(runDir, "raw.jsonl"), "{}\n");
    assert.equal(bash(runOpinion, [target, prompt, output]).status, 65);
    rmSync(join(runDir, "raw.jsonl"));

    const noOpencode = bash(runOpinion, [target, prompt, output], { env: { PATH: "/bin", HOME: root } });
    assert.equal(noOpencode.status, 127, noOpencode.stderr || noOpencode.error?.message || "");
    assert.match(noOpencode.stderr, /opencode CLI not found/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("extract-final-opinion writes the terminal answer and refuses bad input", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-"));
  try {
    const target = join(root, "target");
    mkdirSync(target);
    const raw = join(root, "raw.jsonl");
    const output = join(root, "opinion.md");
    writeFileSync(
      raw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: "Final answer" } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [raw, output, target, "prose"]).status, 0);
    assert.equal(readFileSync(output, "utf8"), "Final answer\n");

    const empty = join(root, "empty.jsonl");
    writeFileSync(empty, `${JSON.stringify({ type: "text", part: { messageID: "m1", text: "x" } })}\n`);
    assert.equal(run(extract, [empty, output, target, "prose"]).status, 1);

    const malformed = join(root, "bad.jsonl");
    writeFileSync(malformed, "{oops\n");
    assert.equal(run(extract, [malformed, output, target, "prose"]).status, 1);

    const secret = join(root, "secret.txt");
    writeFileSync(secret, "s\n");
    const leaky = join(root, "leaky.jsonl");
    writeFileSync(
      leaky,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: `see ${secret}:1` } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    const escaped = run(extract, [leaky, output, target, "prose"]);
    assert.equal(escaped.status, 1);
    assert.match(escaped.stderr, /outside the target scope/);

    const relativeLeak = join(root, "relative.jsonl");
    writeFileSync(
      relativeLeak,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: "see ../secret.txt:1" } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [relativeLeak, output, target, "prose"]).status, 1);

    const jsonRaw = join(root, "json.jsonl");
    writeFileSync(
      jsonRaw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: "verdict below\n```json\n{\"verdict\":\"ok\"}\n```" } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    const jsonOutput = join(root, "opinion.json");
    assert.equal(run(extract, [jsonRaw, jsonOutput, target, "json"]).status, 0);
    assert.deepEqual(JSON.parse(readFileSync(jsonOutput, "utf8")), { verdict: "ok" });

    const multiRaw = join(root, "multi.jsonl");
    writeFileSync(
      multiRaw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: '{"a":1} {"b":2}' } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [multiRaw, jsonOutput, target, "json"]).status, 1);

    const arrayRaw = join(root, "array.jsonl");
    writeFileSync(
      arrayRaw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: '[{"verdict":"ok"}]' } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [arrayRaw, jsonOutput, target, "json"]).status, 1);

    const proseArrayRaw = join(root, "prose-array.jsonl");
    writeFileSync(
      proseArrayRaw,
      [
        JSON.stringify({ type: "text", part: { messageID: "m1", text: 'Here is my answer:\n[{"verdict":"low"}]' } }),
        JSON.stringify({ type: "step_finish", part: { reason: "stop", messageID: "m1" } }),
        "",
      ].join("\n"),
    );
    assert.equal(run(extract, [proseArrayRaw, jsonOutput, target, "json"]).status, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("run-opinion records elapsed time and token usage in meta.json", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-opinion-meta-"));
  try {
    const target = join(root, "target");
    const runDir = join(target, ".krn", "runs", "opencode-second-opinion", "run-1");
    mkdirSync(runDir, { recursive: true });
    const prompt = join(root, "prompt.md");
    writeFileSync(prompt, "advise\n");
    const output = join(runDir, "opinion.md");
    const bin = join(root, "bin");
    mkdirSync(bin);
    const stub = join(bin, "opencode");
    writeFileSync(stub, [
      "#!/usr/bin/env bash",
      "sleep 1",
      'printf \'%s\\n\' \'{"type":"text","part":{"messageID":"m1","text":"Final answer"}}\'',
      'printf \'%s\\n\' \'{"type":"step_finish","part":{"reason":"stop","messageID":"m1","tokens":{"input":11,"output":22,"reasoning":3,"total":36,"cache":{"read":4,"write":5}}}}\'',
      "exit 0",
      "",
    ].join("\n"));
    chmodSync(stub, 0o755);
    const result = bash(runOpinion, [target, prompt, output], { env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(result.status, 0, result.stderr);
    const meta = JSON.parse(readFileSync(join(runDir, "meta.json"), "utf8"));
    assert.equal(meta.usage.input, 11);
    assert.equal(meta.usage.output, 22);
    assert.equal(meta.usage.cacheRead, 4);
    assert.ok(Number.isInteger(meta.elapsedSeconds) && meta.elapsedSeconds >= 1, JSON.stringify(meta));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
