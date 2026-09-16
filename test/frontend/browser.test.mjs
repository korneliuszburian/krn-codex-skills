import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { approveEvidence, gateEvidence, measurementEval } from "../../scripts/lib/frontend/browser.mjs";

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

function makeEvidence({ artifact = "<html>ok</html>", manifestPatch = {}, signature = undefined } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "krn-browser-"));
  const output = join(dir, "artifacts");
  mkdirSync(output, { recursive: true });
  writeFileSync(join(output, "open.txt"), artifact);
  writeFileSync(join(output, "cleanup.json"), JSON.stringify({ browsers: [] }));
  const manifest = {
    schema: "krn.frontend.browser-evidence.v1",
    provider: "playwright-cli",
    session: "test-1",
    target: "http://localhost/",
    targetOrigin: "http://localhost",
    viewport: { width: 1280, height: 900 },
    evidence: { required: ["screenshot"] },
    measurements: { overflowX: 0 },
    interactions: [],
    artifacts: [{ path: "open.txt", bytes: Buffer.byteLength(artifact), sha256: sha256(artifact) }],
    ...manifestPatch,
  };
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  if (signature !== undefined) writeFileSync(join(output, "signature.json"), `${JSON.stringify(signature, null, 2)}\n`);
  const config = join(dir, "config.json");
  writeFileSync(config, JSON.stringify({
    workspaceRoot: ".",
    outputDir: "artifacts",
    url: "http://localhost/",
    allowedOrigins: ["http://localhost"],
    viewport: { width: 1280, height: 900 },
    evidence: { required: ["screenshot"] },
    actions: [],
    runtimeEval: "1",
  }));
  return { dir, output, config };
}

test("gateEvidence fails closed when no human signature exists", async () => {
  const { dir, config } = makeEvidence();
  const report = await gateEvidence({ configFile: config });
  assert.equal(report.status, "fail");
  assert.ok(report.failures.some((failure) => /signature/.test(failure)), JSON.stringify(report.failures));
  rmSync(dir, { recursive: true, force: true });
});

test("approveEvidence refuses when an artifact no longer matches the manifest", async () => {
  const { dir, output, config } = makeEvidence();
  writeFileSync(join(output, "open.txt"), "<html>tampered</html>");
  await assert.rejects(() => approveEvidence({ configFile: config, by: "krn", note: "reviewed the diff" }), /refusing to approve/);
  rmSync(dir, { recursive: true, force: true });
});

test("a signed manifest passes the gate until the manifest changes", async () => {
  const { dir, output, config } = makeEvidence();
  const signature = await approveEvidence({ configFile: config, by: "krn", note: "reviewed the screenshot against the design" });
  assert.equal(signature.by, "krn");
  assert.equal(JSON.parse(readFileSync(join(output, "signature.json"), "utf8")).manifest, sha256(readFileSync(join(output, "manifest.json"), "utf8")));
  assert.equal((await gateEvidence({ configFile: config })).status, "pass");

  const manifest = JSON.parse(readFileSync(join(output, "manifest.json"), "utf8"));
  manifest.measurements.overflowX = 12;
  writeFileSync(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const report = await gateEvidence({ configFile: config });
  assert.equal(report.status, "fail");
  assert.ok(report.failures.some((failure) => /manifest changed after approval/.test(failure)), JSON.stringify(report.failures));
  rmSync(dir, { recursive: true, force: true });
});

test("the measurement preset records structure, targets, floors, and contrast", () => {
  const preset = measurementEval("");
  for (const key of ["overflowX", "heightFloors", "smallTargets", "gridTracks", "contrastOffenders", "spills", "viewport"]) {
    assert.ok(preset.includes(key), `${key} missing from the preset`);
  }
  const extra = measurementEval("out.custom = 1;");
  assert.ok(extra.includes("out.custom = 1;"));
  assert.ok(extra.includes("return out;"), "the extra snippet must be able to extend the same result object");
});
