import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./run-review.sh", import.meta.url));

function writeExecutable(filePath, body) {
  fs.writeFileSync(filePath, body, { mode: 0o755 });
}

test("rejects an existing output before model invocation and preserves it", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-runner-test-"));
  const evidenceDirectory = path.join(sandbox, "evidence");
  const passDirectory = path.join(sandbox, "pass");
  const artifact = path.join(evidenceDirectory, "artifact.md");
  const prompt = path.join(passDirectory, "checker.md");
  const output = path.join(passDirectory, "checker.review.json");
  const sentinel = '{"stale":"must survive rejection"}\n';

  try {
    fs.mkdirSync(evidenceDirectory);
    fs.mkdirSync(passDirectory);
    fs.writeFileSync(artifact, "fixed evidence\n");
    fs.writeFileSync(prompt, "fixed checker contract\n");
    fs.writeFileSync(output, sentinel);
    const artifactSha256 = createHash("sha256")
      .update(fs.readFileSync(artifact))
      .digest("hex");
    const result = spawnSync(
      "bash",
      [scriptPath, "artifact", artifact, artifactSha256, prompt, output],
      { encoding: "utf8" },
    );

    assert.equal(result.status, 65);
    assert.match(result.stderr, /review output must not already exist/);
    assert.equal(fs.readFileSync(output, "utf8"), sentinel);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});

test("pins bounded effort and reports a reviewer timeout without publishing output", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "second-opinion-timeout-test-"));
  const evidenceDirectory = path.join(sandbox, "evidence");
  const passDirectory = path.join(sandbox, "pass");
  const fakeBin = path.join(sandbox, "bin");
  const artifact = path.join(evidenceDirectory, "artifact.md");
  const prompt = path.join(passDirectory, "checker.md");
  const output = path.join(passDirectory, "checker.review.json");
  const claudeArgs = path.join(sandbox, "claude.args");

  try {
    fs.mkdirSync(evidenceDirectory);
    fs.mkdirSync(passDirectory);
    fs.mkdirSync(fakeBin);
    fs.writeFileSync(artifact, "fixed evidence\n");
    fs.writeFileSync(prompt, "fixed checker contract\n");
    writeExecutable(path.join(fakeBin, "node"), "#!/usr/bin/env bash\nexit 0\n");
    writeExecutable(
      path.join(fakeBin, "claude"),
      "#!/usr/bin/env bash\nprintf '%s\\n' \"$@\" > \"$CLAUDE_ARGS_PATH\"\nsleep 5\n",
    );
    const artifactSha256 = createHash("sha256")
      .update(fs.readFileSync(artifact))
      .digest("hex");
    const childEnvironment = { ...process.env };
    delete childEnvironment.SECOND_OPINION_MODEL;
    delete childEnvironment.SECOND_OPINION_EFFORT;

    const result = spawnSync(
      "bash",
      [scriptPath, "artifact", artifact, artifactSha256, prompt, output],
      {
        encoding: "utf8",
        env: {
          ...childEnvironment,
          PATH: `${fakeBin}:${process.env.PATH}`,
          CLAUDE_ARGS_PATH: claudeArgs,
          SECOND_OPINION_TIMEOUT_SECONDS: "0.1",
          SECOND_OPINION_PROMPT_MAX_BYTES: "1000",
        },
      },
    );

    assert.equal(result.status, 143);
    assert.match(
      result.stderr,
      /timed out after 0\.1s \(model=opus, effort=medium, exit_status=143\); no review was finalized/,
    );
    assert.match(fs.readFileSync(claudeArgs, "utf8"), /--effort\nmedium\n/);
    assert.equal(fs.existsSync(output), false);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
