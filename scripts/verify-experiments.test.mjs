import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  sealExperiment,
  validateExperimentTree,
} from "./lib/experiment-artifacts.mjs";

const HEAD = "0".repeat(40);
const REVIEWED = "1".repeat(40);

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function writeManifest(directory, manifest) {
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

function withExperiment(run) {
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "krn-experiment-test-"));
  const root = path.join(sandbox, "experiments");
  const id = "2026-08-21-routing-gate-v1";
  const directory = path.join(root, id);
  try {
    fs.mkdirSync(directory, { recursive: true });
    const definitions = {
      "protocol.md": ["protocol", "# Frozen protocol\n"],
      "schedule.md": ["schedule", "# Frozen schedule\n"],
      "config/model.json": ["model-config", '{"model":"fixed"}\n'],
      "config/grader.json": ["grader-config", '{"grader":"fixed"}\n'],
      "rubric.md": ["rubric", "# Frozen rubric\n"],
      "allocation-commitment.json": ["allocation-commitment", '{"sha256":"commitment"}\n'],
      "stopping-rule.md": ["stopping-rule", "# Frozen stopping rule\n"],
      "reviews/preregistration.md": ["reviewer-approval", "# Approved preregistration\n"],
      "results/primary.json": ["primary-results", '{"completed":2}\n'],
      "grades/results.json": ["grades", '{"scored":2}\n'],
      "telemetry.json": ["telemetry", '{"tokens":20}\n'],
      "allocation-reveal.json": ["allocation-reveal", '{"arms":2}\n'],
      "summary.json": ["summary", '{"winner":"baseline"}\n'],
      "decision.md": ["decision", "# Decision\n\nReject.\n"],
      "review.md": ["reviewer-verdict", "# Review\n\nAccepted.\n"],
    };
    for (const [relative, [, content]] of Object.entries(definitions)) {
      const file = path.join(directory, relative);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    }
    const artifacts = Object.entries(definitions).map(([relative, [role]]) => {
      const file = path.join(directory, relative);
      return {
        path: relative,
        role,
        visibility: role.startsWith("allocation-") ? "coordinator" : "reviewer",
        bytes: fs.statSync(file).size,
        sha256: sha256(file),
      };
    });
    const phase_history = ["preregistration", "execution", "grading", "decision"].map(
      (phase) => ({
        phase,
        base_commit: HEAD,
        reviewed_commit: REVIEWED,
        reviewer: "independent-reviewer",
        verdict: phase === "preregistration" ? "approved" : "accepted",
        reviewed_at: "2026-08-21T09:00:00+02:00",
      }),
    );
    const manifest = {
      schema_version: 2,
      experiment_id: id,
      status: "decided",
      retention: "full",
      epistemic_status: "preregistered",
      owner: "source-to-decision",
      reviewer: "independent-reviewer",
      ownership: {
        lifecycle_owner: "delivery-loop",
        decision_owner: "source-to-decision",
        manifest_writer: "experiment-owner",
        grading_owner: "independent-grader",
        reveal_owner: "coordinator",
        merge_owner: "maintainer",
      },
      target: { base_commit: HEAD, head: REVIEWED },
      phase_history,
      content_scan_exceptions: [],
      artifacts,
      omissions: [],
      decision: { disposition: "reject", scope: "exact frozen treatment" },
    };
    writeManifest(directory, manifest);
    return run({ root, directory, manifest });
  } finally {
    fs.rmSync(sandbox, { recursive: true, force: true });
  }
}

test("accepts one complete decided experiment", () => {
  withExperiment(({ root }) => {
    const result = validateExperimentTree(root);
    assert.deepEqual(result.errors, []);
    assert.equal(result.experimentCount, 1);
    assert.equal(result.artifactCount, 15);
  });
});

test("accepts executed results with amendment but rejects grades and reveal before grading", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "executed";
    manifest.phase_history = manifest.phase_history.slice(0, 2);
    const allowed = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
      "primary-results", "telemetry",
    ]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    const amendmentPath = path.join(directory, "amendment.md");
    fs.writeFileSync(amendmentPath, "pre-reveal amendment\n");
    manifest.artifacts.push({
      path: "amendment.md",
      role: "amendment",
      visibility: "reviewer",
      bytes: fs.statSync(amendmentPath).size,
      sha256: sha256(amendmentPath),
    });
    writeManifest(directory, manifest);
    assert.deepEqual(validateExperimentTree(root).errors, []);

    const gradePath = path.join(directory, "grades.json");
    fs.writeFileSync(gradePath, "{}\n");
    manifest.artifacts.push({
      path: "grades.json",
      role: "grades",
      visibility: "reviewer",
      bytes: fs.statSync(gradePath).size,
      sha256: sha256(gradePath),
    });
    writeManifest(directory, manifest);
    assert.ok(validateExperimentTree(root).errors.some((error) => error.includes("role grades is not allowed")));
  });
});

test("rejects a result changed after its manifest was frozen", () => {
  withExperiment(({ root, directory }) => {
    fs.appendFileSync(path.join(directory, "summary.json"), "tampered\n");
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("byte count mismatch")));
    assert.ok(result.errors.some((error) => error.includes("SHA-256 mismatch")));
  });
});

test("rejects an unmanifested experiment output", () => {
  withExperiment(({ root, directory }) => {
    fs.writeFileSync(path.join(directory, "unreviewed-result.json"), "{}\n");
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("unmanifested file")));
  });
});

test("rejects untracked manifests and artifacts when Git enforcement is enabled", () => {
  withExperiment(({ root }) => {
    const result = validateExperimentTree(root, { trackedFiles: new Set() });
    assert.ok(result.errors.some((error) => error.includes("manifest.json: must be tracked")));
    assert.ok(result.errors.some((error) => error.includes("must be tracked or staged")));
  });
});

test("rejects secret content under a neutral artifact path", () => {
  withExperiment(({ root, directory, manifest }) => {
    const relative = "results/provider-response.json";
    const file = path.join(directory, relative);
    fs.writeFileSync(file, '{"api_key":"sk-123456789012345678901234"}\n');
    manifest.artifacts.push({
      path: relative,
      role: "supporting-evidence",
      visibility: "raw",
      bytes: fs.statSync(file).size,
      sha256: sha256(file),
    });
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("content scan")));
  });
});

test("rejects secret and runtime shaped artifact paths", () => {
  withExperiment(({ root, directory, manifest }) => {
    const secret = path.join(directory, "codex-home", "auth.json");
    fs.mkdirSync(path.dirname(secret), { recursive: true });
    fs.writeFileSync(secret, "{}\n");
    manifest.artifacts.push({
      path: "codex-home/auth.json",
      role: "supporting-evidence",
      visibility: "coordinator",
      bytes: fs.statSync(secret).size,
      sha256: sha256(secret),
    });
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("forbidden secret/runtime artifact path")));
  });
});

test("rejects hardlinked artifacts", () => {
  withExperiment(({ root, directory }) => {
    const linked = path.join(directory, "linked-output.json");
    fs.linkSync(path.join(directory, "summary.json"), linked);
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("forbidden hardlink")));
  });
});

test("seal rejects a manifest symlink before writing", () => {
  withExperiment(({ directory, manifest }) => {
    const manifestPath = path.join(directory, "manifest.json");
    fs.renameSync(manifestPath, path.join(directory, "manifest-target.json"));
    fs.symlinkSync("manifest-target.json", manifestPath);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: manifest }),
      /manifest.json must be a regular single-link file before seal/,
    );
  });
});

test("requires machine-readable capsule omissions and epistemic status", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.retention = "capsule-only";
    manifest.epistemic_status = "exploratory-backfill";
    manifest.omissions = [];
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("requires explicit omissions")));
  });
});

test("requires complete monotonic phase history for full decided experiments", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.phase_history = manifest.phase_history.slice(0, 2);
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("requires phase history")));
  });
});

test("seal is deterministic and terminal committed manifests cannot be resealed", () => {
  withExperiment(({ directory, manifest }) => {
    const first = sealExperiment(directory);
    const second = sealExperiment(directory);
    assert.equal(second.manifestSha256, first.manifestSha256);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: manifest }),
      /terminal experiment decided cannot be resealed/,
    );
  });
});

test("seal rejects changes to protocol evidence frozen by an approved checkpoint", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "approved";
    previous.phase_history = previous.phase_history.slice(0, 1);
    fs.appendFileSync(path.join(directory, "protocol.md"), "post-approval change\n");
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /frozen artifact changed: protocol protocol.md/,
    );
  });
});

test("seal rejects post-approval content scan exception changes", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "approved";
    previous.phase_history = previous.phase_history.slice(0, 1);
    manifest.content_scan_exceptions = [{
      path: "protocol.md",
      rule: "secret-json-value",
      artifact_sha256: sha256(path.join(directory, "protocol.md")),
      reason: "false positive",
      reviewer: "reviewer",
    }];
    writeManifest(directory, manifest);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /frozen content_scan_exceptions changed/,
    );
  });
});

test("preserves the achieved phase prefix for an abandoned full experiment", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "abandoned";
    manifest.phase_history = manifest.phase_history.slice(0, 2);
    const allowed = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
      "primary-results", "telemetry", "decision", "reviewer-verdict",
    ]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root);
    assert.deepEqual(result.errors, []);
  });
});
