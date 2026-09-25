import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const CLI = path.join(root, "scripts", "krn.mjs");

// A frozen run applies the base case list through the candidate runner. A case
// the candidate manifest no longer declares is a deliberate surface removal, so
// it is dropped and reported, not failed.
test("a frozen run drops a case the candidate manifest no longer declares", () => {
  const base = mkdtempSync(path.join(tmpdir(), "krn-frozen-drop-"));
  try {
    mkdirSync(path.join(base, "config"), { recursive: true });
    const manifest = {
      version: 1,
      program: "scripts/krn.mjs",
      cases: [
        { id: "removed-surface-a", steps: [{ message: "chore: baseline", files: {} }], run: ["state", "check"], expect: { exit: 0 } },
        { id: "removed-surface-b", steps: [{ message: "chore: baseline", files: {} }], run: ["state", "check"], expect: { exit: 0 } },
      ],
    };
    writeFileSync(path.join(base, "config", "conformance.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(process.execPath, [CLI, "conformance", "check", "--root", base, "--candidate", root, "--frozen"], { encoding: "utf8", cwd: root });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    for (const id of ["removed-surface-a", "removed-surface-b"]) {
      assert.match(result.stdout, new RegExp(`ok ${id} - dropped`), `the removed case ${id} must be reported as dropped`);
    }
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// A required case is part of the approved acceptance policy: the candidate
// cannot retire it by omission, rename, or self-authorization. Retiring a
// required case is a visible edit to the approved base policy.
test("a frozen run fails when the candidate manifest drops a required case", () => {
  const base = mkdtempSync(path.join(tmpdir(), "krn-frozen-required-"));
  try {
    mkdirSync(path.join(base, "config"), { recursive: true });
    const manifest = {
      version: 1,
      program: "scripts/krn.mjs",
      cases: [
        { id: "required-surface-a", required: true, steps: [{ message: "chore: baseline", files: {} }], run: ["state", "check"], expect: { exit: 0 } },
        { id: "removable-surface-b", steps: [{ message: "chore: baseline", files: {} }], run: ["state", "check"], expect: { exit: 0 } },
      ],
    };
    writeFileSync(path.join(base, "config", "conformance.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    const result = spawnSync(process.execPath, [CLI, "conformance", "check", "--root", base, "--candidate", root, "--frozen"], { encoding: "utf8", cwd: root });
    assert.equal(result.status, 1, `a dropped required case must fail the frozen run:\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /not ok required-surface-a - required case missing/, "the dropped required case must be reported as a failure");
    assert.match(result.stdout, /ok removable-surface-b - dropped/, "a non-required case keeps the dropped report");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

// A --filter may narrow the advisory cases, but it can never hide a required
// base case from the retention check.
test("a frozen run keeps every required case even when --filter narrows the set", () => {
  const base = mkdtempSync(path.join(tmpdir(), "krn-frozen-filter-"));
  const candidate = mkdtempSync(path.join(tmpdir(), "krn-frozen-filter-candidate-"));
  try {
    mkdirSync(path.join(base, "config"), { recursive: true });
    const cases = [
      { id: "required-surface-a", required: true, steps: [{ message: "chore: baseline", files: { "a.txt": "1\n" } }], run: [], expect: { exit: 0 } },
      { id: "optional-surface-b", steps: [{ message: "chore: baseline", files: { "a.txt": "1\n" } }], run: [], expect: { exit: 0 } },
    ];
    writeFileSync(path.join(base, "config", "conformance.json"), `${JSON.stringify({ version: 1, program: "tool.mjs", rootArg: null, cases }, null, 2)}\n`);
    // The candidate passes the case it keeps and silently drops the required one.
    writeFileSync(path.join(candidate, "tool.mjs"), "process.exit(0);\n");
    mkdirSync(path.join(candidate, "config"), { recursive: true });
    writeFileSync(path.join(candidate, "config", "conformance.json"), `${JSON.stringify({ version: 1, program: "tool.mjs", rootArg: null, cases: [cases[1]] }, null, 2)}\n`);
    const result = spawnSync(process.execPath, [CLI, "conformance", "check", "--root", base, "--candidate", candidate, "--frozen", "--filter", "optional-surface-b"], { encoding: "utf8", cwd: root });
    assert.equal(result.status, 1, `a narrowed frozen run must still fail on a dropped required case:\n${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /not ok required-surface-a - required case missing/, "the required case must stay evaluated under --filter");
    assert.match(result.stdout, /ok optional-surface-b/, "the filtered advisory case still runs");
  } finally {
    rmSync(base, { recursive: true, force: true });
    rmSync(candidate, { recursive: true, force: true });
  }
});

// Pointing --root and --candidate at the same tree lets a candidate's own
// manifest authorize the required set, so a frozen run refuses that shape.
test("a frozen run refuses to evaluate the candidate tree as its own base", () => {
  const base = mkdtempSync(path.join(tmpdir(), "krn-frozen-same-"));
  try {
    mkdirSync(path.join(base, "config"), { recursive: true });
    const cases = [{ id: "required-probe", required: true, steps: [{ message: "chore: baseline", files: { "a.txt": "1\n" } }], run: [], expect: { exit: 0 } }];
    writeFileSync(path.join(base, "config", "conformance.json"), `${JSON.stringify({ version: 1, program: "tool.mjs", rootArg: null, cases }, null, 2)}\n`);
    writeFileSync(path.join(base, "tool.mjs"), "process.exit(0);\n");
    const result = spawnSync(process.execPath, [CLI, "conformance", "check", "--root", base, "--candidate", base, "--frozen"], { encoding: "utf8", cwd: root });
    assert.notEqual(result.status, 0, `a self-evaluating frozen run must be refused:\n${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /separate approved base/i, "the refusal must name the reason");
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
