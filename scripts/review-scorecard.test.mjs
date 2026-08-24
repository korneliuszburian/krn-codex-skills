import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve("scripts/review-scorecard.mjs");

test("selects the chronologically latest benchmark score for a lane", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "krn-scorecard-test-"));
  const resultsDir = path.join(root, "results");
  const reviewsDir = path.join(root, "reviews");
  fs.mkdirSync(resultsDir);
  fs.mkdirSync(reviewsDir);
  try {
    fs.writeFileSync(
      path.join(resultsDir, "a-newer.json"),
      JSON.stringify({ lane: "codex", score: 9, scoredAt: "2026-08-24T10:00:00Z" }),
    );
    fs.writeFileSync(
      path.join(resultsDir, "z-older.json"),
      JSON.stringify({ lane: "codex", score: 3, scoredAt: "2026-08-23T10:00:00Z" }),
    );
    const result = spawnSync(process.execPath, [script], {
      encoding: "utf8",
      env: {
        ...process.env,
        KRN_REVIEW_SCORECARD_RESULTS_DIR: resultsDir,
        KRN_REVIEW_SCORECARD_REVIEWS_DIR: reviewsDir,
      },
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.benchmarkLanes[0].latestScore, 9);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
