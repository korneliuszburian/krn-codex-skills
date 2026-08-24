import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const runner = path.resolve("skills/advisory/opencode-second-opinion/scripts/run-opinion.sh");
const reviewerModel = "opencode-go/gpt-5.6";

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "opencode-opinion-test-"));
  const target = path.join(root, "target");
  const run = path.join(target, ".krn", "runs", "opencode-second-opinion", "one");
  const bin = path.join(root, "bin");
  const invocation = path.join(root, "invocation.txt");
  fs.mkdirSync(run, { recursive: true });
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(run, "prompt.md"), "Inspect only src/ and return prose findings.");
  fs.writeFileSync(
    path.join(bin, "opencode"),
    `#!/usr/bin/env bash
printf '%s\\n' "$*" > "$OPENCODE_TEST_INVOCATION"
printf '%s\\n' '{"type":"text","part":{"messageID":"msg_plan","text":"planning"}}'
if [ "\${OPENCODE_TEST_INCOMPLETE:-}" = "1" ]; then
  exit 0
fi
if [ "\${OPENCODE_TEST_HANG:-}" = "1" ]; then
  sleep 60
fi
printf '%s\\n' '{"type":"step_finish","part":{"messageID":"msg_plan","reason":"tool"}}'
node -e 'console.log(JSON.stringify({type: "text", part: {messageID: "msg_final", text: process.env.OPENCODE_TEST_FINAL_TEXT || "COMPLETE_OPINION"}}))'
printf '%s\\n' '{"type":"step_finish","part":{"messageID":"msg_final","reason":"stop"}}'
`,
    { mode: 0o755 },
  );
  return { root, target, run, bin, invocation };
}

function invoke(runnerArgs, env, options = {}) {
  return execFileSync(runner, runnerArgs, {
    env: { ...process.env, OPENCODE_SECOND_OPINION_MODEL: reviewerModel, ...env },
    stdio: "pipe",
    ...options,
  });
}

test("runs the explicit reviewer model at max effort non-interactively and writes opinion, raw stream, and meta identity", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    invoke([target, path.join(run, "prompt.md"), output], { PATH: `${bin}:${process.env.PATH}`, OPENCODE_TEST_INVOCATION: invocation });
    const argumentsText = fs.readFileSync(invocation, "utf8");
    assert.match(argumentsText, /run --model opencode-go\/gpt-5\.6 --variant max --format json --dir/);
    assert.doesNotMatch(argumentsText, /--interactive|--auto|--continue|--session/);
    assert.match(argumentsText, /Do not edit files, propose a patch, emit a diff/);
    assert.equal(fs.readFileSync(output, "utf8"), "COMPLETE_OPINION\n");
    assert.match(fs.readFileSync(path.join(run, "raw.jsonl"), "utf8"), /msg_final/);
    const meta = JSON.parse(fs.readFileSync(path.join(run, "meta.json"), "utf8"));
    assert.match(meta.promptSha256, /^[a-f0-9]{64}$/);
    assert.equal(meta.model, reviewerModel);
    assert.equal(meta.target, target);
    assert.equal(fs.existsSync(path.join(run, "raw.failed.jsonl")), false);
    assert.equal(fs.existsSync(path.join(run, "failure.txt")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("normalizes one embedded nested JSON object only in strict JSON mode", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    invoke([target, path.join(run, "prompt.md"), output], {
      PATH: `${bin}:${process.env.PATH}`,
      OPENCODE_SECOND_OPINION_OUTPUT: "json",
      OPENCODE_TEST_FINAL_TEXT:
        'review complete {"findings":[{"severity":"P2","message":"preserve nested object"}],"head":"abc"}',
      OPENCODE_TEST_INVOCATION: invocation,
    });
    assert.deepEqual(JSON.parse(fs.readFileSync(output, "utf8")), {
      findings: [{ severity: "P2", message: "preserve nested object" }],
      head: "abc",
    });
    assert.match(fs.readFileSync(invocation, "utf8"), /Return exactly one JSON object only/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects mixed fenced and unfenced JSON candidates", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    assert.throws(
      () => invoke([target, path.join(run, "prompt.md"), output], {
        PATH: `${bin}:${process.env.PATH}`,
        OPENCODE_SECOND_OPINION_OUTPUT: "json",
        OPENCODE_TEST_FINAL_TEXT: "```json\n{\"first\":true}\n```\n{\"second\":true}",
        OPENCODE_TEST_INVOCATION: invocation,
      }),
      (error) => error.status === 78,
    );
    assert.equal(fs.existsSync(output), false);
    assert.ok(fs.existsSync(path.join(run, "raw.failed.jsonl")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an existing unformatted relative citation outside the target", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  const outside = path.join(root, "outside", "secret.txt");
  try {
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, "secret\n");
    assert.throws(
      () => invoke([target, path.join(run, "prompt.md"), output], {
        PATH: `${bin}:${process.env.PATH}`,
        OPENCODE_TEST_FINAL_TEXT: "Finding in ../outside/secret.txt:1",
        OPENCODE_TEST_INVOCATION: invocation,
      }),
      (error) => error.status === 78,
    );
    assert.equal(fs.existsSync(output), false);
    assert.ok(fs.existsSync(path.join(run, "raw.failed.jsonl")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an existing backtick citation with line and column outside the target", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  const outside = path.join(root, "outside", "secret.txt");
  try {
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, "secret\n");
    assert.throws(
      () => invoke([target, path.join(run, "prompt.md"), output], {
        PATH: `${bin}:${process.env.PATH}`,
        OPENCODE_TEST_FINAL_TEXT: "Finding in `../outside/secret.txt:1:2`",
        OPENCODE_TEST_INVOCATION: invocation,
      }),
      (error) => error.status === 78,
    );
    assert.equal(fs.existsSync(output), false);
    assert.ok(fs.existsSync(path.join(run, "raw.failed.jsonl")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an existing absolute citation with a line suffix", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    assert.throws(
      () => invoke([target, path.join(run, "prompt.md"), output], {
        PATH: `${bin}:${process.env.PATH}`,
        OPENCODE_TEST_FINAL_TEXT: "Finding in /etc/passwd:1",
        OPENCODE_TEST_INVOCATION: invocation,
      }),
      (error) => error.status === 78,
    );
    assert.equal(fs.existsSync(output), false);
    assert.ok(fs.existsSync(path.join(run, "raw.failed.jsonl")));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("passes through one explicit non-empty provider variant", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    invoke([target, path.join(run, "prompt.md"), output], {
      PATH: `${bin}:${process.env.PATH}`,
      OPENCODE_SECOND_OPINION_VARIANT: "high",
      OPENCODE_TEST_INVOCATION: invocation,
    });
    assert.match(fs.readFileSync(invocation, "utf8"), /--variant high/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("fails closed when no reviewer model is named and no default exists", () => {
  const { root, target, run, bin } = sandbox();
  try {
    assert.throws(
      () =>
        execFileSync(runner, [target, path.join(run, "prompt.md"), path.join(run, "opinion.md")], {
          env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, OPENCODE_SECOND_OPINION_MODEL: "" },
          stdio: "pipe",
        }),
      (error) => error.status === 64 && /OPENCODE_SECOND_OPINION_MODEL must name the explicit reviewer model/.test(error.stderr.toString()),
    );
    assert.equal(fs.existsSync(path.join(run, "opinion.md")), false);
    assert.equal(fs.existsSync(path.join(run, "raw.jsonl")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("times out a hanging run and retains the failure note", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    assert.throws(
      () =>
        invoke([target, path.join(run, "prompt.md"), output], {
          PATH: `${bin}:${process.env.PATH}`,
          OPENCODE_SECOND_OPINION_TIMEOUT_SECONDS: "1",
          OPENCODE_TEST_HANG: "1",
          OPENCODE_TEST_INVOCATION: invocation,
        }),
      (error) => error.status === 124,
    );
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.existsSync(path.join(run, "raw.jsonl")), false);
    assert.match(fs.readFileSync(path.join(run, "failure.txt"), "utf8"), /timed out after 1s/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a zero timeout before invoking the reviewer", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    assert.throws(
      () => invoke([target, path.join(run, "prompt.md"), output], {
        PATH: `${bin}:${process.env.PATH}`,
        OPENCODE_SECOND_OPINION_MODEL: reviewerModel,
        OPENCODE_SECOND_OPINION_TIMEOUT_SECONDS: "0",
        OPENCODE_TEST_INVOCATION: invocation,
      }),
      (error) => error.status === 64,
    );
    assert.equal(fs.existsSync(invocation), false);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects a partial stream and retains the partial raw evidence", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    assert.throws(
      () =>
        invoke([target, path.join(run, "prompt.md"), output], {
          PATH: `${bin}:${process.env.PATH}`,
          OPENCODE_TEST_INCOMPLETE: "1",
          OPENCODE_TEST_INVOCATION: invocation,
        }),
      (error) => error.status === 78,
    );
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.existsSync(path.join(run, "raw.jsonl")), false);
    assert.match(fs.readFileSync(path.join(run, "raw.failed.jsonl"), "utf8"), /msg_plan/);
    assert.match(
      fs.readFileSync(path.join(run, "failure.txt"), "utf8"),
      /opinion extraction rejected: Error: OpenCode did not emit a completed final answer\./,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an opinion that cites a path outside the target scope", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    assert.throws(
      () =>
        invoke([target, path.join(run, "prompt.md"), output], {
          PATH: `${bin}:${process.env.PATH}`,
          OPENCODE_TEST_FINAL_TEXT: "finding cites `/etc/passwd`",
          OPENCODE_TEST_INVOCATION: invocation,
        }),
      (error) => error.status === 78,
    );
    assert.equal(fs.existsSync(output), false);
    assert.equal(fs.existsSync(path.join(run, "raw.jsonl")), false);
    assert.match(fs.readFileSync(path.join(run, "raw.failed.jsonl"), "utf8"), /step_finish/);
    assert.match(
      fs.readFileSync(path.join(run, "failure.txt"), "utf8"),
      /opinion extraction rejected: Error: opinion cites a path outside the target scope: \/etc\/passwd/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("permits a regex literal in a completed opinion", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    invoke([target, path.join(run, "prompt.md"), output], {
      PATH: `${bin}:${process.env.PATH}`,
      OPENCODE_TEST_FINAL_TEXT: "src/cli.ts:72 - validates `/^[a-f0-9]{64}$/`",
      OPENCODE_TEST_INVOCATION: invocation,
    });
    assert.equal(
      fs.readFileSync(output, "utf8"),
      "src/cli.ts:72 - validates `/^[a-f0-9]{64}$/`\n",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("permits a non-existent traversal-shaped test literal", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    invoke([target, path.join(run, "prompt.md"), output], {
      PATH: `${bin}:${process.env.PATH}`,
      OPENCODE_TEST_FINAL_TEXT: "test/decision.test.ts:1 - rejects `../outside`",
      OPENCODE_TEST_INVOCATION: invocation,
    });
    assert.equal(
      fs.readFileSync(output, "utf8"),
      "test/decision.test.ts:1 - rejects `../outside`\n",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an existing relative path outside the target scope", () => {
  const { root, target, run, bin, invocation } = sandbox();
  const output = path.join(run, "opinion.md");
  try {
    fs.writeFileSync(path.join(root, "outside"), "outside target\n");
    assert.throws(
      () =>
        invoke([target, path.join(run, "prompt.md"), output], {
          PATH: `${bin}:${process.env.PATH}`,
          OPENCODE_TEST_FINAL_TEXT: "finding cites `../outside`",
          OPENCODE_TEST_INVOCATION: invocation,
        }),
      (error) => error.status === 78,
    );
    assert.match(
      fs.readFileSync(path.join(run, "failure.txt"), "utf8"),
      /opinion extraction rejected: Error: opinion cites a path outside the target scope: \.\.\/outside/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an output outside the owned opinion run", () => {
  const { root, target, run, bin } = sandbox();
  try {
    assert.throws(
      () => invoke([target, path.join(run, "prompt.md"), path.join(target, "opinion.md")], { PATH: `${bin}:${process.env.PATH}` }),
      /output must be <target>/,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
