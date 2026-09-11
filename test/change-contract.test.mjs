import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkChangeContract, contractSurface, parseChangeContract } from "../scripts/lib/change-contract.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "krn-contract-"));
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:lessons": "x", "test:lib": "x" }\n}\n');
  return root;
}

function fakeGit({ commits, files }) {
  return (_root, args) => {
    if (args[0] === "log") {
      return { ok: true, out: commits.map((commit) => `${commit.sha}\u001f${commit.subject}\u001f${commit.body ?? ""}`).join("\u001e") };
    }
    if (args[0] === "show") return { ok: true, out: (files[args[args.length - 1]] ?? []).join("\n") };
    return { ok: false, out: "" };
  };
}

test("contractSurface scopes the harness surfaces", () => {
  assert.equal(contractSurface(["scripts/lib/lessons.mjs"]), true);
  assert.equal(contractSurface(["package.json"]), true);
  assert.equal(contractSurface([".github/workflows/validate.yml"]), true);
  assert.equal(contractSurface(["docs/research/workflow-lessons.md"]), false);
});

test("parseChangeContract reads contract, at-risk, and falsifier trailers", () => {
  const parsed = parseChangeContract("feat: x\n\nChange-contract: test:lessons:red->green\nAt-risk: test:lib\nFalsifier: test/x.test.mjs::probe@abcdef0\n");
  assert.deepEqual(parsed.contracts, [{ ref: "test:lessons", after: "green" }]);
  assert.deepEqual(parsed.atRisk, ["test:lib"]);
  assert.deepEqual(parsed.falsifiers, ["test/x.test.mjs::probe@abcdef0"]);
});

test("a surface commit without a contract fails closed", () => {
  const root = makeRoot();
  const git = fakeGit({ commits: [{ sha: "a1", subject: "fix: gate" }], files: { a1: ["scripts/lib/lessons.mjs"] } });
  const report = checkChangeContract({ root, base: "base", git, run: () => ({ ok: true, status: 0 }) });
  assert.ok(report.errors.some((error) => error.rule === "missing-change-contract"));
  rmSync(root, { recursive: true, force: true });
});

test("a met prediction passes and an unmet one blocks", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
  });
  const met = checkChangeContract({ root, base: "base", git, run: () => ({ ok: true, status: 0 }) });
  assert.deepEqual(met.errors, []);
  const unmet = checkChangeContract({ root, base: "base", git, run: () => ({ ok: false, status: 1 }) });
  assert.ok(unmet.errors.some((error) => error.rule === "unmet-prediction"));
  rmSync(root, { recursive: true, force: true });
});

test("an at-risk regression and an unknown check both block", () => {
  const root = makeRoot();
  const git = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:lessons:red->green\nAt-risk: test:lib" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
  });
  const report = checkChangeContract({ root, base: "base", git, run: ({ target }) => ({ ok: target.name !== "test:lib", status: 0 }) });
  assert.ok(report.errors.some((error) => error.rule === "regressed-at-risk"));
  const unknown = checkChangeContract({ root, base: "base", git, run: () => ({ ok: true, status: 0 }) });
  assert.deepEqual(unknown.errors, []);
  const bad = fakeGit({
    commits: [{ sha: "a1", subject: "fix: gate", body: "Change-contract: test:nope:red->green" }],
    files: { a1: ["scripts/lib/lessons.mjs"] },
  });
  assert.ok(checkChangeContract({ root, base: "base", git: bad, run: () => ({ ok: true, status: 0 }) }).errors.some((error) => error.rule === "unknown-check"));
  rmSync(root, { recursive: true, force: true });
});

test("the guard disables the check when set in the environment", () => {
  const root = makeRoot();
  process.env.KRN_CHANGE_CONTRACT = "0";
  try {
    const report = checkChangeContract({ root, base: "base", git: () => ({ ok: true, out: "" }), run: () => ({ ok: true, status: 0 }) });
    assert.equal(report.skipped, true);
  } finally {
    delete process.env.KRN_CHANGE_CONTRACT;
  }
  rmSync(root, { recursive: true, force: true });
});
