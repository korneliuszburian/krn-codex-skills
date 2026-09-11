import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, realpathSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { scanCatalogUsage } from "../scripts/lib/catalog-usage.mjs";

const line = (value) => `${JSON.stringify(value)}\n`;

test("scanCatalogUsage reads dated rollout evidence end to end", async () => {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), "krn-usage-")));
  try {
    const dayDirectory = path.join(root, "2026", "01", "02");
    mkdirSync(dayDirectory, { recursive: true });
    writeFileSync(
      path.join(dayDirectory, "rollout-2026-01-02T00-00-00.jsonl"),
      line({
        timestamp: "2026-01-02T00:00:00.000Z",
        type: "response_item",
        payload: { type: "function_call", call_id: "c1", name: "exec" },
      }) +
        line({
          timestamp: "2026-01-02T00:00:01.000Z",
          type: "response_item",
          payload: { type: "function_call_output", call_id: "c1" },
        }),
    );

    const report = await scanCatalogUsage({
      sessionsRoot: root,
      canonicalSkillPaths: [],
      sinceDay: "2026-01-01",
    });

    assert.equal(report.scanned_files, 1);
    assert.deepEqual(
      report.aggregates.map(({ kind, id, confirmed_calls, confidence }) => ({
        kind,
        id,
        confirmed_calls,
        confidence,
      })),
      [{ kind: "tool", id: "exec", confirmed_calls: 1, confidence: "confirmed" }],
    );
    assert.equal(report.coverage.source, "since_day");
    assert.equal(report.coverage.absence_means_unused, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
