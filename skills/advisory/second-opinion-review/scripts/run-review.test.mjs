import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./run-review.sh", import.meta.url));
const preparePath = fileURLToPath(new URL("./prepare-artifacts.mjs", import.meta.url));
const validatorPath = fileURLToPath(new URL("./validate-review.py", import.meta.url));

function writeExecutable(filePath, body) {
  fs.writeFileSync(filePath, `${body.trim()}\n`, { mode: 0o755 });
}

function run(command, args, cwd, options = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", ...options });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fingerprint(repository) {
  return JSON.parse(
    run("python3", [validatorPath, "fingerprint-git", repository], repository),
  );
}

function makeFixture(slug = "runner-proof") {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-runner-test-"));
  const repository = path.join(sandbox, "repository");
  const fakeBin = path.join(sandbox, "bin");
  fs.mkdirSync(repository);
  fs.mkdirSync(fakeBin);
  fs.mkdirSync(path.join(repository, ".krn", "runs"), { recursive: true });
  fs.writeFileSync(
    path.join(repository, ".krn", "runs", ".gitignore"),
    "*\n!.gitignore\n",
  );
  fs.writeFileSync(
    path.join(repository, "evidence.txt"),
    Array.from({ length: 30 }, (_, index) => `evidence line ${index + 1}`).join("\n") + "\n",
  );
  run("git", ["init", "-q"], repository);
  run("git", ["config", "user.name", "Checker Test"], repository);
  run("git", ["config", "user.email", "checker@example.invalid"], repository);
  run("git", ["add", "-A"], repository);
  run("git", ["commit", "-qm", "checker fixture"], repository);

  const passDirectory = run(process.execPath, [preparePath, slug, "check"], repository);
  const prompt = path.join(passDirectory, "checker.md");
  const output = path.join(passDirectory, "checker.review.json");
  const job = path.join(passDirectory, "jobs", "checker.job.json");
  fs.writeFileSync(prompt, "fixed checker contract\n");
  const identity = fingerprint(repository);
  assert.equal(run("git", ["status", "--porcelain"], repository), "");

  writeExecutable(
    path.join(fakeBin, "node"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "case \"${1:-}\" in",
      "  */check-claude-window.mjs) exit 0 ;;",
      "  *) exec \"$REAL_NODE\" \"$@\" ;;",
      "esac",
    ].join("\n"),
  );

  return {
    sandbox,
    repository,
    fakeBin,
    passDirectory,
    prompt,
    output,
    job,
    identity,
  };
}

function runnerArgs(fixture) {
  return [
    scriptPath,
    "git",
    fixture.repository,
    fixture.identity.commit,
    fixture.identity.tree,
    fixture.identity.dirty,
    fixture.identity.state_sha256,
    fixture.prompt,
    fixture.output,
  ];
}

function childEnvironment(fixture, extra = {}) {
  const environment = { ...process.env };
  for (const name of [
    "SECOND_OPINION_MODEL",
    "SECOND_OPINION_EFFORT",
    "SECOND_OPINION_SCHEMA_RETRIES",
    "SECOND_OPINION_TIMEOUT_SECONDS",
    "SECOND_OPINION_PROMPT_MAX_BYTES",
  ]) {
    delete environment[name];
  }
  return {
    ...environment,
    PATH: `${fixture.fakeBin}:${process.env.PATH}`,
    REAL_NODE: process.execPath,
    SECOND_OPINION_PROMPT_MAX_BYTES: "1000",
    ...extra,
  };
}

function reviewEnvelope({ ranges = [[1, 1]], doesNotProve = ["advisory only"] } = {}) {
  return {
    structured_output: {
      review_version: "1",
      scope_summary: "bounded checker scope",
      findings: ranges.map(([lineStart, lineEnd], index) => ({
          id: `F${index + 1}`,
          severity: "LOW",
          path: "evidence.txt",
          line_start: lineStart,
          line_end: lineEnd,
          claim: "The fixed evidence supports one bounded claim.",
          impact: "The claim remains local to the fixed evidence.",
          minimal_fix: "Keep the result evidence-bounded.",
        })),
      evidence_gaps: [],
      human_decisions: [],
      does_not_prove: doesNotProve,
    },
    session_id: "00000000-0000-4000-8000-000000000001",
    total_cost_usd: 0.25,
  };
}

function installEnvelopeClaude(fixture, envelopeOrSequence) {
  const envelopes = Array.isArray(envelopeOrSequence)
    ? envelopeOrSequence
    : [envelopeOrSequence];
  const envelopePrefix = path.join(fixture.sandbox, "claude-envelope-");
  const countPath = path.join(fixture.sandbox, "claude-count");
  const promptsDirectory = path.join(fixture.sandbox, "system-prompts");
  envelopes.forEach((envelope, index) => {
    fs.writeFileSync(`${envelopePrefix}${index + 1}.json`, `${JSON.stringify(envelope)}\n`);
  });
  fs.mkdirSync(promptsDirectory);
  writeExecutable(
    path.join(fixture.fakeBin, "claude"),
    [
      "#!/usr/bin/env bash",
      "set -euo pipefail",
      "count=0",
      "if [[ -f \"$CLAUDE_COUNT_PATH\" ]]; then read -r count < \"$CLAUDE_COUNT_PATH\"; fi",
      "count=$((count + 1))",
      "printf '%s\\n' \"$count\" > \"$CLAUDE_COUNT_PATH\"",
      "system_prompt=",
      "while (( $# )); do",
      "  if [[ \"$1\" == \"--system-prompt\" ]]; then",
      "    shift",
      "    system_prompt=$1",
      "  fi",
      "  shift",
      "done",
      "printf '%s' \"$system_prompt\" > \"$CLAUDE_SYSTEM_PROMPTS/$count.txt\"",
      "envelope_path=\"${CLAUDE_ENVELOPE_PREFIX}${count}.json\"",
      "if [[ ! -f \"$envelope_path\" ]]; then envelope_path=\"${CLAUDE_ENVELOPE_PREFIX}1.json\"; fi",
      "cat \"$envelope_path\"",
    ].join("\n"),
  );
  return {
    countPath,
    promptsDirectory,
    env: {
      CLAUDE_ENVELOPE_PREFIX: envelopePrefix,
      CLAUDE_COUNT_PATH: countPath,
      CLAUDE_SYSTEM_PROMPTS: promptsDirectory,
    },
  };
}

function assertRepositoryUnchanged(fixture) {
  assert.deepEqual(fingerprint(fixture.repository), fixture.identity);
  assert.equal(run("git", ["status", "--porcelain"], fixture.repository), "");
}

test("rejects an existing output before model invocation and preserves it", () => {
  const fixture = makeFixture("existing-output");
  const sentinel = '{"stale":"must survive rejection"}\n';
  try {
    fs.writeFileSync(fixture.output, sentinel);
    const result = spawnSync("bash", runnerArgs(fixture), { encoding: "utf8" });

    assert.equal(result.status, 65);
    assert.match(result.stderr, /review output must not already exist/);
    assert.equal(fs.readFileSync(fixture.output, "utf8"), sentinel);
    assert.equal(fs.existsSync(fixture.job), false);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("retries oversized evidence until the checker splits it without data loss", () => {
  const fixture = makeFixture("split-evidence");
  const claude = installEnvelopeClaude(fixture, [
    reviewEnvelope({ ranges: [[1, 25]] }),
    reviewEnvelope({ ranges: [[1, 20], [21, 25]] }),
  ]);
  try {
    const result = spawnSync("bash", runnerArgs(fixture), {
      encoding: "utf8",
      env: childEnvironment(fixture, claude.env),
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), fixture.output);
    assert.equal(fs.readFileSync(claude.countPath, "utf8").trim(), "2");
    const review = JSON.parse(fs.readFileSync(fixture.output, "utf8"));
    assert.deepEqual(
      review.findings.map(({ id, line_start, line_end }) => ({ id, line_start, line_end })),
      [
        { id: "F1", line_start: 1, line_end: 20 },
        { id: "F2", line_start: 21, line_end: 25 },
      ],
    );
    assert.ok(
      review.findings.every(
        (finding) => finding.line_end - finding.line_start + 1 <= 20,
      ),
    );
    assert.deepEqual(review.validation.normalization.changes, []);
    assert.equal(
      run(
        "python3",
        [validatorPath, "check", fixture.output, fixture.prompt],
        fixture.repository,
      ),
      "valid evidence-bounded review",
    );

    const job = JSON.parse(fs.readFileSync(fixture.job, "utf8"));
    assert.equal(job.role, "check");
    assert.equal(job.state, "complete");
    assert.equal(job.attempt, 2);
    assert.equal(job.max_attempts, 2);
    assert.deepEqual(job.normalization_changes, []);
    const retryPrompt = fs.readFileSync(
      path.join(claude.promptsDirectory, "2.txt"),
      "utf8",
    );
    assert.match(retryPrompt, /findings\/0\/line_end/);
    assert.match(retryPrompt, /split the evidence into separately identified findings/);
    assert.equal(fs.statSync(fixture.job).mode & 0o777, 0o600);
    assertRepositoryUnchanged(fixture);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("bounds retryable schema failures and records the terminal diagnostic without output", () => {
  const fixture = makeFixture("bounded-schema-failure");
  const claude = installEnvelopeClaude(
    fixture,
    reviewEnvelope({ doesNotProve: [] }),
  );
  try {
    const result = spawnSync("bash", runnerArgs(fixture), {
      encoding: "utf8",
      env: childEnvironment(fixture, {
        ...claude.env,
        SECOND_OPINION_SCHEMA_RETRIES: "2",
      }),
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /schema failed after 3\/3 attempts/);
    assert.equal(fs.readFileSync(claude.countPath, "utf8").trim(), "3");
    assert.equal(fs.existsSync(fixture.output), false);

    const job = JSON.parse(fs.readFileSync(fixture.job, "utf8"));
    assert.equal(job.state, "failed");
    assert.equal(job.attempt, 3);
    assert.equal(job.max_attempts, 3);
    assert.equal(job.failure_kind, "schema_failed");
    assert.equal(job.diagnostic.stage, "normalize");
    assert.equal(job.diagnostic.code, "model_output_invalid");
    assert.equal(job.diagnostic.pointer, "/structured_output/does_not_prove");
    assert.match(job.diagnostic.message, /at least one boundary/);
    assert.equal(job.diagnostic.retryable, true);

    const retryPrompt = fs.readFileSync(
      path.join(claude.promptsDirectory, "2.txt"),
      "utf8",
    );
    const marker =
      "The previous structured output was rejected. Correct exactly this validator diagnostic and return a complete replacement:\n";
    const markerIndex = retryPrompt.indexOf(marker);
    assert.notEqual(markerIndex, -1);
    const suppliedDiagnostic = JSON.parse(
      retryPrompt.slice(markerIndex + marker.length),
    );
    assert.equal(suppliedDiagnostic.command, job.diagnostic.stage);
    for (const key of ["code", "pointer", "message", "retryable"]) {
      assert.equal(suppliedDiagnostic[key], job.diagnostic[key]);
    }
    assertRepositoryUnchanged(fixture);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects schema retry configuration above three before model invocation", () => {
  const fixture = makeFixture("invalid-retry-config");
  try {
    const result = spawnSync("bash", runnerArgs(fixture), {
      encoding: "utf8",
      env: childEnvironment(fixture, { SECOND_OPINION_SCHEMA_RETRIES: "4" }),
    });

    assert.equal(result.status, 64);
    assert.match(result.stderr, /must be an integer from 0 through 3/);
    assert.equal(fs.existsSync(fixture.job), false);
    assert.equal(fs.existsSync(fixture.output), false);
    assertRepositoryUnchanged(fixture);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("rejects a zero timeout before model invocation", () => {
  const fixture = makeFixture("zero-timeout");
  try {
    const result = spawnSync("bash", runnerArgs(fixture), {
      encoding: "utf8",
      env: childEnvironment(fixture, { SECOND_OPINION_TIMEOUT_SECONDS: "0" }),
    });

    assert.equal(result.status, 64);
    assert.match(result.stderr, /must be a positive number/);
    assert.equal(fs.existsSync(fixture.job), false);
    assert.equal(fs.existsSync(fixture.output), false);
    assertRepositoryUnchanged(fixture);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});

test("pins bounded effort and reports a reviewer timeout without retrying or publishing", () => {
  const fixture = makeFixture("timeout");
  const countPath = path.join(fixture.sandbox, "claude-count");
  try {
    writeExecutable(
      path.join(fixture.fakeBin, "claude"),
      [
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        "printf '1\\n' > \"$CLAUDE_COUNT_PATH\"",
        "printf '%s\\n' \"$@\" > \"$CLAUDE_ARGS_PATH\"",
        "sleep 5",
      ].join("\n"),
    );
    const claudeArgs = path.join(fixture.sandbox, "claude.args");
    const result = spawnSync("bash", runnerArgs(fixture), {
      encoding: "utf8",
      env: childEnvironment(fixture, {
        CLAUDE_ARGS_PATH: claudeArgs,
        CLAUDE_COUNT_PATH: countPath,
        SECOND_OPINION_TIMEOUT_SECONDS: "0.1",
        SECOND_OPINION_SCHEMA_RETRIES: "3",
      }),
    });

    assert.equal(result.status, 143);
    assert.match(
      result.stderr,
      /timed out after 0\.1s \(model=opus, effort=medium, exit_status=143\); no review was finalized/,
    );
    assert.match(fs.readFileSync(claudeArgs, "utf8"), /--effort\nmedium\n/);
    assert.equal(fs.readFileSync(countPath, "utf8").trim(), "1");
    assert.equal(fs.existsSync(fixture.output), false);
    const job = JSON.parse(fs.readFileSync(fixture.job, "utf8"));
    assert.equal(job.state, "failed");
    assert.equal(job.attempt, 1);
    assert.equal(job.max_attempts, 4);
    assert.equal(job.failure_kind, "timeout");
    assert.equal(job.diagnostic.stage, "transport");
    assert.equal(job.diagnostic.code, "timeout");
    assert.equal(job.diagnostic.retryable, false);
    assertRepositoryUnchanged(fixture);
  } finally {
    fs.rmSync(fixture.sandbox, { recursive: true, force: true });
  }
});
