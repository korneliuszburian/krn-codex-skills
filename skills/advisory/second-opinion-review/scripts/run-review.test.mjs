import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./run-review.sh", import.meta.url));

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
