import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "seal-experiment.mjs");

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

test("public seal refuses a terminal record with no committed predecessor", () => {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-seal-cli-test-"));
  try {
    const root = path.join(sandbox, "repo");
    const directory = path.join(root, "evals/experiments/2026-08-21-backfill-v1");
    fs.mkdirSync(directory, { recursive: true });
    const files = {
      "protocol.md": "protocol\n",
      "summary.json": "{}\n",
      "decision.md": "reject\n",
      "review.md": "accepted\n",
    };
    const artifacts = [];
    for (const [name, content] of Object.entries(files)) {
      const file = path.join(directory, name);
      fs.writeFileSync(file, content);
      artifacts.push({
        path: name,
        role: name === "protocol.md" ? "protocol" : name.replace(".json", "").replace(".md", ""),
        visibility: "reviewer",
        bytes: fs.statSync(file).size,
        sha256: sha256(file),
      });
    }
    artifacts[1].role = "summary";
    artifacts[2].role = "decision";
    artifacts[3].role = "reviewer-verdict";
    const manifest = {
      schema_version: 2,
      experiment_id: "2026-08-21-backfill-v1",
      status: "decided",
      retention: "capsule-only",
      epistemic_status: "exploratory-backfill",
      owner: "source-to-decision",
      reviewer: "maintainer",
      ownership: {
        lifecycle_owner: "delivery-loop",
        decision_owner: "source-to-decision",
        manifest_writer: "owner",
        grading_owner: "none",
        reveal_owner: "coordinator",
        merge_owner: "maintainer",
      },
      target: { base_commit: "0".repeat(40), head: "0".repeat(40) },
      phase_history: [],
      content_scan_exceptions: [],
      artifacts,
      omissions: [{
        class: "historical",
        reason: "not copied",
        reason_code: "backfill",
        source_pointer: "sha256:" + "a".repeat(64),
        omitted_roles: ["primary-results"],
        omitted_count: 1,
        aggregate_sha256: "a".repeat(64),
      }],
      decision: { disposition: "reject", scope: "historical" },
    };
    fs.writeFileSync(path.join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const initialized = spawnSync("git", ["init", "--quiet"], { cwd: root, encoding: "utf8" });
    assert.equal(initialized.status, 0, initialized.stderr);
    const staged = spawnSync("git", ["add", "-A"], { cwd: root, encoding: "utf8" });
    assert.equal(staged.status, 0, staged.stderr);
    const before = fs.readFileSync(path.join(directory, "manifest.json"));
    const result = spawnSync(process.execPath, [SCRIPT, "--root", root, "2026-08-21-backfill-v1"], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stderr, /terminal records require a previously committed checkpoint manifest/);
    assert.deepEqual(fs.readFileSync(path.join(directory, "manifest.json")), before);
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
});
