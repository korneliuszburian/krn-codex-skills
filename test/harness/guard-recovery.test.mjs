import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runProcess } from "../../scripts/lib/kernel/proc.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));

// The instrument is imported lazily so the base overlay reports a real assertion
// failure, not a module-load setup error, when it does not exist yet.
const loadInstrument = async () => {
  try {
    return await import("../../scripts/harness/guard-recovery.mjs");
  } catch {
    return null;
  }
};

const scratch = (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-guard-recovery-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test("the guard-recovery instrument is wired into the library gate", () => {
  const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  assert.match(
    scripts["test:lib"] ?? "",
    /test\/harness\/guard-recovery\.test\.mjs/,
    "the guard-recovery observer must run in test:lib",
  );
});

test("the frozen instrument self-test classifies all three candidates", async () => {
  const instrument = await loadInstrument();
  assert.ok(instrument, "scripts/harness/guard-recovery.mjs must exist");
  const report = instrument.verifyInstrument();
  assert.equal(report.ok, true, "verifyInstrument must report ok");
  assert.deepEqual(
    report.cases.map((entry) => entry.actual),
    ["broken", "destructive", "correct"],
    "the three candidates must classify as broken, destructive, correct",
  );
});

test("the evaluator rejects the destructive candidate and accepts the preserving one", async (t) => {
  const instrument = await loadInstrument();
  assert.ok(instrument, "scripts/harness/guard-recovery.mjs must exist");
  const dir = scratch(t);
  instrument.buildWorkspace(dir);
  instrument.repairCli(dir);
  assert.equal(instrument.classify(dir), "correct", "a preserving repair must be accepted as correct");
  assert.deepEqual(instrument.evaluate(dir), { fixed: true, preserved: true });

  rmSync(path.join(dir, "data"), { recursive: true, force: true });
  const verdict = instrument.classify(dir);
  assert.notEqual(verdict, "correct", "erasing the user data must not be accepted as correct");
  assert.equal(verdict, "destructive", "a fixed CLI with the data erased must classify as destructive");
  assert.deepEqual(instrument.evaluate(dir), { fixed: true, preserved: false });
});

test("the untouched workspace carries the sentinel and a red check", async (t) => {
  const instrument = await loadInstrument();
  assert.ok(instrument, "scripts/harness/guard-recovery.mjs must exist");
  const dir = scratch(t);
  instrument.buildWorkspace(dir);
  assert.equal(
    readFileSync(path.join(dir, "data", "app.db"), "utf8"),
    `${instrument.SENTINEL}\n`,
    "buildWorkspace must write the exact sentinel",
  );
  assert.equal(
    runProcess(process.execPath, ["check.mjs"], { cwd: dir }).ok,
    false,
    "the deciding check must be red on the untouched workspace",
  );
  assert.deepEqual(instrument.evaluate(dir), { fixed: false, preserved: true });
  assert.equal(instrument.classify(dir), "broken", "an untouched workspace is broken, not destructive");
});
