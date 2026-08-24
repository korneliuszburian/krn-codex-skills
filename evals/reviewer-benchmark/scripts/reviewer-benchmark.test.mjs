import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const scorer = path.resolve("evals/reviewer-benchmark/scripts/score-review.mjs");

function score(text) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-")), "review.json");
  fs.writeFileSync(file, text);
  try {
    return JSON.parse(execFileSync(process.execPath, [scorer, file], { encoding: "utf8" }));
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
}

const ALL_CLASSES = JSON.stringify({
  verdict: "changes_requested",
  summary: "review",
  findings: [
    {
      severity: "high",
      title: "trustWebhookPayload trusts external payloads after shallow checks",
      evidence: "normalizeWebhook accepts untrusted external payloads",
      file: "src/processor.ts",
      line: 20,
      impact: "malformed input reaches formatting",
      recommendation: "validate fields",
    },
    {
      severity: "medium",
      title: "Boolean(customerId) and minAmountCents truthiness",
      evidence: "Boolean(value['customerId']) and retryAfterMs zero-value checks",
      file: "src/processor.ts",
      line: 27,
      impact: "zero thresholds ignored",
      recommendation: "use non-nullish checks",
    },
    {
      severity: "medium",
      title: "hasInvoiceShape type predicate broader than runtime checks",
      evidence: "hasInvoiceShape uses kind.startsWith, overclaims narrowing",
      file: "src/processor.ts",
      line: 55,
      impact: "stronger guarantees than validation",
      recommendation: "narrow types",
    },
    {
      severity: "medium",
      title: "dedupeKey collision between two different rules",
      evidence: "dedupeKey collapses two different rules for same event",
      file: "src/processor.ts",
      line: 90,
      impact: "independent deliveries dropped",
      recommendation: "add rule identity",
    },
    {
      severity: "low",
      title: "tests do not cover adversarial boundary cases",
      evidence: "run-tests covers happy paths only; missing zero-value cases",
      file: "test/run-tests.ts",
      line: 10,
      impact: "regressions undetected",
      recommendation: "add boundary tests",
    },
  ],
});

test("a review covering all five rubric classes scores 10", () => {
  const result = score(ALL_CLASSES);
  assert.equal(result.score, 10);
  assert.deepEqual(result.matchedClasses.sort(), ["dedupeCollision", "externalTrust", "testGaps", "truthiness", "typePredicate"].sort());
});

test("the retained Codex baseline artifact scores 5.5 (trust + truthiness + evidence)", () => {
  const baseline = fs.readFileSync(path.resolve("evals/reviewer-benchmark/review-inputs/codex-reviewer-output.json"), "utf8");
  const result = score(baseline);
  assert.equal(result.score, 5.5);
  assert.deepEqual(result.matchedClasses, ["externalTrust", "truthiness"]);
});

test("an empty review scores 0", () => {
  const result = score(JSON.stringify({ verdict: "approve", summary: "nothing found", findings: [] }));
  assert.equal(result.score, 0);
  assert.equal(result.findingsCount, 0);
});

test("non-JSON review input scores 0 with reason", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-")), "review.txt");
  fs.writeFileSync(file, "this is prose, not json");
  try {
    const output = execFileSync(process.execPath, [scorer, file], { encoding: "utf8" });
    assert.equal(JSON.parse(output).score, 0);
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

test("refuses to overwrite a same-day benchmark result", () => {
  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-results-"));
  const outputPath = path.join(resultsDir, "review.json");
  const review = JSON.stringify({ verdict: "approve", summary: "nothing found", findings: [] });
  const env = { ...process.env, REVIEWER_BENCHMARK_RESULTS_DIR: resultsDir };
  const runner = path.resolve("evals/reviewer-benchmark/scripts/reviewer-benchmark.mjs");
  try {
    const first = execFileSync(process.execPath, [runner, "run", `printf '%s' '${review}'`, outputPath, "collision-test"], {
      encoding: "utf8",
      env,
    });
    assert.match(first, /collision-test/);
    const second = spawnSync(process.execPath, [runner, "run", `printf '%s' '${review}'`, outputPath, "collision-test"], {
      encoding: "utf8",
      env,
    });
    assert.notEqual(second.status, 0);
    assert.match(`${second.stdout}\n${second.stderr}`, /already exists/);
  } finally {
    fs.rmSync(resultsDir, { recursive: true, force: true });
  }
});
