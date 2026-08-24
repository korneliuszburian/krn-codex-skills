import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  sealExperiment,
  validateExperimentTree,
} from "./lib/experiment-artifacts.mjs";

const HEAD = "f".repeat(40);
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
      amendments: [],
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
    manifest.amendments = [{
      path: "amendment.md",
      base_commit: HEAD,
      reviewed_commit: REVIEWED,
      reviewer: "independent-reviewer",
      reviewed_at: "2026-08-21T10:00:00+02:00",
    }];
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

test("requires reviewed evidence when adding a preregistered amendment", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "approved";
    manifest.phase_history = manifest.phase_history.slice(0, 1);
    const allowed = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
    ]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    writeManifest(directory, manifest);
    const previous = structuredClone(manifest);
    const amendmentPath = path.join(directory, "amendment.md");
    fs.writeFileSync(amendmentPath, "reviewed change\n");
    manifest.artifacts.push({
      path: "amendment.md",
      role: "amendment",
      visibility: "reviewer",
      bytes: fs.statSync(amendmentPath).size,
      sha256: sha256(amendmentPath),
    });
    manifest.amendments = [{
      path: "amendment.md",
      base_commit: "f".repeat(40),
      reviewed_commit: "1".repeat(40),
      reviewer: "independent-reviewer",
      reviewed_at: "2026-08-21T10:00:00+02:00",
    }];
    writeManifest(directory, manifest);
    assert.doesNotThrow(() => sealExperiment(directory, { previousManifest: previous }));
    assert.deepEqual(validateExperimentTree(root).errors, []);
  });
});

test("rejects an amendment artifact without a reviewed amendment record", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "approved";
    manifest.phase_history = manifest.phase_history.slice(0, 1);
    const allowed = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
    ]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    const amendmentPath = path.join(directory, "amendment.md");
    fs.writeFileSync(amendmentPath, "unreviewed change\n");
    manifest.artifacts.push({
      path: "amendment.md",
      role: "amendment",
      visibility: "reviewer",
      bytes: fs.statSync(amendmentPath).size,
      sha256: sha256(amendmentPath),
    });
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root);
    assert.ok(
      result.errors.some((error) => error.includes("lacks a reviewed amendment record")),
      result.errors.join("\n"),
    );
  });
});

test("permits executed-to-graded only by adding grades", () => {
  withExperiment(({ root, directory, manifest }) => {
    const executedRoles = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
      "primary-results", "telemetry",
    ]);
    const executed = structuredClone(manifest);
    executed.status = "executed";
    executed.phase_history = executed.phase_history.slice(0, 2);
    for (const artifact of [...executed.artifacts]) {
      if (!executedRoles.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        executed.artifacts = executed.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    writeManifest(directory, executed);
    const previous = structuredClone(executed);
    const gradesPath = path.join(directory, "grades.json");
    fs.writeFileSync(gradesPath, "{}\n");
    executed.status = "graded";
    executed.phase_history = [...executed.phase_history, {
      phase: "grading",
      base_commit: "f".repeat(40),
      reviewed_commit: "1".repeat(40),
      reviewer: "reviewer",
      verdict: "accepted",
      reviewed_at: "2026-08-21T10:00:00+02:00",
    }];
    executed.artifacts.push({
      path: "grades.json",
      role: "grades",
      visibility: "reviewer",
      bytes: fs.statSync(gradesPath).size,
      sha256: sha256(gradesPath),
    });
    writeManifest(directory, executed);
    sealExperiment(directory, { previousManifest: previous });
    assert.deepEqual(validateExperimentTree(root).errors, []);
  });
});

test("rejects skipping required lifecycle statuses", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "planned";
    previous.phase_history = [];
    manifest.status = "decided";
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /status transition is not allowed from planned to decided/,
    );
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

test("rejects fixed-point SHAs that do not exist in the repository", () => {
  withExperiment(({ root }) => {
    const repositoryRoot = path.dirname(root);
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "test"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "fixture"], { cwd: repositoryRoot }).status, 0);
    const result = validateExperimentTree(root, { repositoryRoot });
    assert.ok(result.errors.some((error) => error.includes("target.base_commit does not resolve")), result.errors.join("\n"));
    assert.ok(result.errors.some((error) => error.includes("target.head does not resolve")), result.errors.join("\n"));
  });
});

test("permits unavailable historical target objects for capsule-only records", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "decided";
    manifest.retention = "capsule-only";
    manifest.epistemic_status = "exploratory-backfill";
    manifest.phase_history = [];
    const allowed = new Set(["protocol", "summary", "decision", "reviewer-verdict"]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    manifest.omissions = [{
      class: "historical evidence",
      reason: "private source retained externally",
      reason_code: "external-evidence",
      source_pointer: "sha256:" + "a".repeat(64),
      omitted_roles: ["primary-results"],
      omitted_count: 1,
      aggregate_sha256: "b".repeat(64),
    }];
    writeManifest(directory, manifest);
    const repositoryRoot = path.dirname(root);
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "test"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "capsule fixture"], { cwd: repositoryRoot }).status, 0);
    const result = validateExperimentTree(root, { repositoryRoot });
    assert.ok(!result.errors.some((error) => error.includes("target.base_commit does not resolve")), result.errors.join("\n"));
    assert.ok(!result.errors.some((error) => error.includes("target.head does not resolve")), result.errors.join("\n"));
  });
});

test("verifier rejects a rewritten frozen manifest against its committed predecessor", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "approved";
    manifest.phase_history = manifest.phase_history.slice(0, 1);
    const allowed = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
    ]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    writeManifest(directory, manifest);
    const repositoryRoot = path.dirname(root);
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "test"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "approved checkpoint"], { cwd: repositoryRoot }).status, 0);

    const protocolPath = path.join(directory, "protocol.md");
    fs.appendFileSync(protocolPath, "rewritten after approval\n");
    const protocol = manifest.artifacts.find((artifact) => artifact.role === "protocol");
    protocol.bytes = fs.statSync(protocolPath).size;
    protocol.sha256 = sha256(protocolPath);
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root, { repositoryRoot });
    assert.ok(
      result.errors.some((error) => error.includes("committed checkpoint history: frozen artifact changed")),
      result.errors.join("\n"),
    );
  });
});

test("requires reviewed commits to contain a manifest checkpoint change", () => {
  withExperiment(({ root, directory, manifest }) => {
    const repositoryRoot = path.dirname(root);
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "test"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "experiment snapshot"], { cwd: repositoryRoot }).status, 0);
    const baseCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();
    fs.writeFileSync(path.join(repositoryRoot, "unrelated.txt"), "unrelated\n");
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "unrelated change"], { cwd: repositoryRoot }).status, 0);
    const unrelatedCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();
    manifest.phase_history = manifest.phase_history.map((record) => ({
      ...record,
      base_commit: baseCommit,
      reviewed_commit: unrelatedCommit,
    }));
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root, { repositoryRoot });
    assert.ok(
      result.errors.some((error) => error.includes("does not change the experiment manifest checkpoint")),
      result.errors.join("\n"),
    );
  });
});

test("requires execution review snapshots to contain completed outputs", () => {
  withExperiment(({ root, directory, manifest }) => {
    const complete = structuredClone(manifest);
    const repositoryRoot = path.dirname(root);
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "test"], { cwd: repositoryRoot }).status, 0);
    fs.writeFileSync(path.join(repositoryRoot, ".base"), "base\n");
    assert.equal(spawnSync("git", ["add", ".base"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "base"], { cwd: repositoryRoot }).status, 0);
    const baseCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();

    const baseRoles = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
    ]);
    manifest.status = "running";
    manifest.phase_history = [{
      ...manifest.phase_history[0],
      base_commit: baseCommit,
      reviewed_commit: baseCommit,
    }];
    manifest.target = { base_commit: baseCommit, head: baseCommit };
    manifest.artifacts = manifest.artifacts.filter((artifact) => baseRoles.has(artifact.role));
    writeManifest(directory, manifest);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "running checkpoint"], { cwd: repositoryRoot }).status, 0);
    const reviewedCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();

    const executionRoles = new Set([...baseRoles, "primary-results", "telemetry"]);
    for (const artifact of complete.artifacts) {
      if (!executionRoles.has(artifact.role)) fs.rmSync(path.join(directory, artifact.path));
    }
    complete.status = "executed";
    complete.phase_history = [
      { ...complete.phase_history[0], base_commit: baseCommit, reviewed_commit: baseCommit },
      {
        ...complete.phase_history[1],
        base_commit: baseCommit,
        reviewed_commit: reviewedCommit,
      },
    ];
    complete.target = { base_commit: baseCommit, head: baseCommit };
    complete.artifacts = complete.artifacts.filter((artifact) => executionRoles.has(artifact.role));
    writeManifest(directory, complete);
    const result = validateExperimentTree(root, { repositoryRoot });
    assert.ok(
      result.errors.some((error) => error.includes("phase_history 2: reviewed_commit snapshot status must be between executed and executed")),
      result.errors.join("\n"),
    );
  });
});

test("binds a decision review to a decision-ready checkpoint", () => {
  withExperiment(({ root, directory, manifest }) => {
    const repositoryRoot = path.dirname(root);
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "test"], { cwd: repositoryRoot }).status, 0);
    fs.writeFileSync(path.join(repositoryRoot, ".base"), "base\n");
    assert.equal(spawnSync("git", ["add", ".base"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "base"], { cwd: repositoryRoot }).status, 0);
    const baseCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();

    const gradedRoles = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
      "primary-results", "telemetry", "grades",
    ]);
    const graded = structuredClone(manifest);
    graded.status = "graded";
    graded.phase_history = graded.phase_history.slice(0, 3).map((record) => ({
      ...record,
      base_commit: baseCommit,
      reviewed_commit: baseCommit,
    }));
    graded.target = { base_commit: baseCommit, head: baseCommit };
    graded.artifacts = graded.artifacts.filter((artifact) => gradedRoles.has(artifact.role));
    writeManifest(directory, graded);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "graded checkpoint"], { cwd: repositoryRoot }).status, 0);
    const decisionReady = structuredClone(manifest);
    decisionReady.status = "decision-ready";
    decisionReady.phase_history = graded.phase_history;
    decisionReady.target = { base_commit: baseCommit, head: baseCommit };
    writeManifest(directory, decisionReady);
    assert.equal(spawnSync("git", ["add", "-A"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "decision-ready checkpoint"], { cwd: repositoryRoot }).status, 0);
    const decisionReadyCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();

    manifest.status = "decided";
    manifest.phase_history = [
      ...graded.phase_history,
      {
        ...manifest.phase_history[3],
        base_commit: baseCommit,
        reviewed_commit: decisionReadyCommit,
      },
    ];
    manifest.target = { base_commit: baseCommit, head: baseCommit };
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root, { repositoryRoot });
    assert.ok(
      !result.errors.some((error) => error.includes("phase_history 4: reviewed_commit snapshot status must be between")),
      result.errors.join("\n"),
    );
    assert.ok(
      !result.errors.some((error) => error.includes("phase_history 4: frozen artifact")),
      result.errors.join("\n"),
    );
  });
});

test("seal permits adding final decision artifacts at decision-ready", () => {
  withExperiment(({ root, directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "graded";
    previous.phase_history = previous.phase_history.slice(0, 3);
    const gradedRoles = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
      "primary-results", "telemetry", "grades",
    ]);
    previous.artifacts = previous.artifacts.filter((artifact) => gradedRoles.has(artifact.role));
    manifest.status = "decision-ready";
    manifest.phase_history = structuredClone(previous.phase_history);
    writeManifest(directory, manifest);
    assert.doesNotThrow(() => sealExperiment(directory, { previousManifest: previous }));
    assert.deepEqual(validateExperimentTree(root).errors, []);
  });
});

test("requires a machine-readable decision at decision-ready", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "decision-ready";
    manifest.phase_history = manifest.phase_history.slice(0, 3);
    manifest.decision = {};
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root);
    assert.ok(result.errors.some((error) => error.includes("terminal status requires a supported decision.disposition")), result.errors.join("\n"));
    assert.ok(result.errors.some((error) => error.includes("terminal status requires decision.scope")), result.errors.join("\n"));
  });
});

test("preserves decision-ready artifacts when abandoned", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "abandoned";
    manifest.phase_history = manifest.phase_history.slice(0, 3);
    writeManifest(directory, manifest);
    assert.deepEqual(validateExperimentTree(root).errors, []);
  });
});

test("freezes the machine-readable decision through finalization", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "decision-ready";
    previous.phase_history = previous.phase_history.slice(0, 3);
    manifest.status = "decided";
    manifest.phase_history = structuredClone(previous.phase_history);
    manifest.decision = { disposition: "adopt", scope: "changed after review" };
    writeManifest(directory, manifest);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /frozen decision changed/,
    );
  });
});

test("binds amendment review commits to the amendment artifact and ancestry", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "approved";
    manifest.phase_history = manifest.phase_history.slice(0, 1);
    const allowed = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
    ]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    const amendmentPath = path.join(directory, "amendment.md");
    fs.writeFileSync(amendmentPath, "reviewed amendment\n");
    manifest.artifacts.push({
      path: "amendment.md",
      role: "amendment",
      visibility: "reviewer",
      bytes: fs.statSync(amendmentPath).size,
      sha256: sha256(amendmentPath),
    });

    const repositoryRoot = path.dirname(root);
    assert.equal(spawnSync("git", ["init", "--quiet"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.email", "test@example.invalid"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["config", "user.name", "test"], { cwd: repositoryRoot }).status, 0);
    fs.writeFileSync(path.join(repositoryRoot, ".base"), "base\n");
    assert.equal(spawnSync("git", ["add", ".base"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "base"], { cwd: repositoryRoot }).status, 0);
    const reviewedCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();
    fs.writeFileSync(path.join(repositoryRoot, "later.txt"), "later\n");
    assert.equal(spawnSync("git", ["add", "later.txt"], { cwd: repositoryRoot }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "later"], { cwd: repositoryRoot }).status, 0);
    const baseCommit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repositoryRoot, encoding: "utf8" }).stdout.trim();

    manifest.amendments = [{
      path: "amendment.md",
      base_commit: baseCommit,
      reviewed_commit: reviewedCommit,
      reviewer: "independent-reviewer",
      reviewed_at: "2026-08-21T10:00:00+02:00",
    }];
    writeManifest(directory, manifest);
    const result = validateExperimentTree(root, { repositoryRoot });
    assert.ok(result.errors.some((error) => error.includes("amendment 1: base_commit is not an ancestor")), result.errors.join("\n"));
    assert.ok(result.errors.some((error) => error.includes("amendment 1: reviewed_commit does not contain")), result.errors.join("\n"));
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
    manifest.status = "approved";
    manifest.phase_history = structuredClone(previous.phase_history);
    writeManifest(directory, manifest);
    fs.appendFileSync(path.join(directory, "protocol.md"), "post-approval change\n");
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /frozen artifact changed: protocol protocol.md/,
    );
  });
});

test("seal rejects mutation of earlier phase history records", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "approved";
    previous.phase_history = previous.phase_history.slice(0, 1);
    manifest.status = "approved";
    manifest.phase_history = structuredClone(previous.phase_history);
    manifest.phase_history[0].reviewer = "different-reviewer";
    writeManifest(directory, manifest);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /phase_history is not append-only/,
    );
  });
});

test("seal rejects target fixed-point changes after approval", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "approved";
    previous.phase_history = previous.phase_history.slice(0, 1);
    manifest.status = "approved";
    manifest.phase_history = structuredClone(previous.phase_history);
    manifest.target.head = "2".repeat(40);
    writeManifest(directory, manifest);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /frozen target changed/,
    );
  });
});

test("seal rejects a new artifact in an already frozen protocol role", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "approved";
    previous.phase_history = previous.phase_history.slice(0, 1);
    manifest.status = "approved";
    manifest.phase_history = structuredClone(previous.phase_history);
    const extra = path.join(directory, "protocol-extra.md");
    fs.writeFileSync(extra, "second protocol\n");
    manifest.artifacts.push({
      path: "protocol-extra.md",
      role: "protocol",
      visibility: "reviewer",
      bytes: fs.statSync(extra).size,
      sha256: sha256(extra),
    });
    writeManifest(directory, manifest);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /frozen artifact set changed/,
    );
  });
});

test("seal rejects a new primary-results artifact after execution", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "executed";
    previous.phase_history = previous.phase_history.slice(0, 2);
    manifest.status = "executed";
    manifest.phase_history = structuredClone(previous.phase_history);
    const extra = path.join(directory, "primary-extra.json");
    fs.writeFileSync(extra, "{}\n");
    manifest.artifacts.push({
      path: "primary-extra.json",
      role: "primary-results",
      visibility: "raw",
      bytes: fs.statSync(extra).size,
      sha256: sha256(extra),
    });
    writeManifest(directory, manifest);
    assert.throws(
      () => sealExperiment(directory, { previousManifest: previous }),
      /frozen artifact set changed/,
    );
  });
});

test("seal rejects post-approval content scan exception changes", () => {
  withExperiment(({ directory, manifest }) => {
    const previous = structuredClone(manifest);
    previous.status = "approved";
    previous.phase_history = previous.phase_history.slice(0, 1);
    manifest.status = "approved";
    manifest.phase_history = structuredClone(previous.phase_history);
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

test("preserves all approved preregistration artifacts when abandoned before execution", () => {
  withExperiment(({ root, directory, manifest }) => {
    manifest.status = "abandoned";
    manifest.phase_history = manifest.phase_history.slice(0, 1);
    const allowed = new Set([
      "protocol", "schedule", "model-config", "grader-config", "rubric",
      "allocation-commitment", "stopping-rule", "reviewer-approval",
      "decision", "reviewer-verdict",
    ]);
    for (const artifact of [...manifest.artifacts]) {
      if (!allowed.has(artifact.role)) {
        fs.rmSync(path.join(directory, artifact.path));
        manifest.artifacts = manifest.artifacts.filter((item) => item.path !== artifact.path);
      }
    }
    writeManifest(directory, manifest);
    assert.deepEqual(validateExperimentTree(root).errors, []);
  });
});
