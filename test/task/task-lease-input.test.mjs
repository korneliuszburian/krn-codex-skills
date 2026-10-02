import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const at = "2000-01-01T01:00:00+01:00";
const command = (root, ...args) => spawnSync(process.execPath,
  [cli, "task", ...args, "--root", root, "--json"], { cwd: root, encoding: "utf8" });
const ok = (root, ...args) => {
  const result = command(root, ...args);
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  return JSON.parse(result.stdout);
};
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "krn-lease-input-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["-C", root, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", root, "-c", "user.name=fixture", "-c", "user.email=fixture@krn.local",
    "commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn/tickets"), { recursive: true });
  mkdirSync(join(root, ".krn/runs/lease-input"), { recursive: true });
  return root;
}
function legacyClaim(root, overrides = {}) {
  const lease = { at, renew: at, ...overrides };
  writeFileSync(join(root, ".krn/tickets/lease.md"), [
    "<krn-ticket>", "Id: lease", "Title: Synthetic active lease", "Status: claimed", "Type: task",
    "Repository-base: main", "Scope: test/**, package.json", "Deciding check: node --test test/check.test.mjs",
    "Contract: test/check.test.mjs:red->green", "Acceptance: preserve synthetic state", "Blocked by: none",
    `Claim: worker=old-worker; session=old-session; at=${lease.at}; epoch=2; renew=${lease.renew}; duration=1`,
    "</krn-ticket>", "",
  ].join("\n"));
}
const migrate = (root) => command(root, "store", "migrate", "--yes", "--actor", "operator", "--reason",
  "Qualify synthetic lease input", "--archive", ".krn/runs/lease-input/backup.json");
function noQueue(root) {
  for (const ref of ["refs/krn/queue", "refs/krn/queue-active"]) {
    assert.equal(spawnSync("git", ["-C", root, "rev-parse", "--verify", "--quiet", ref]).status, 1,
      "refusing invalid input must not create operating queue refs");
  }
}

function restoreRequest(root, archive, change = () => {}) {
  const request = structuredClone(archive);
  const state = JSON.parse(request.refs[0].content);
  change(state.tasks.lease);
  request.refs[0].content = JSON.stringify(state);
  request.refs[0].oid = execFileSync("git", ["-C", root, "hash-object", "--stdin"], {
    input: request.refs[0].content, encoding: "utf8",
  }).trim();
  writeFileSync(join(root, ".krn/runs/lease-input/request.json"), JSON.stringify(request));
  return command(root, "store", "restore", "--file", ".krn/runs/lease-input/request.json");
}

test("public migration refuses malformed active at and renew without activating a queue", (t) => {
  const valid = fixture(t);
  legacyClaim(valid);
  const control = migrate(valid);
  assert.equal(control.status, 0, `${control.stdout}${control.stderr}`);
  const imported = ok(valid, "list")[0];
  assert.equal(imported.epoch, 2);
  assert.equal(imported.lease.at, at);
  assert.equal(imported.lease.renew, at);
  const recovered = ok(valid, "takeover", "--id", "lease", "--worker", "fresh-worker", "--expected-epoch", "2",
    "--reason", "Recover the valid expired imported lease");
  assert.equal(recovered.epoch, 3);
  assert.deepEqual(recovered.history.slice(0, imported.history.length), imported.history);
  assert.deepEqual(recovered.legacyFields, imported.legacyFields);

  for (const field of ["at", "renew"]) {
    const root = fixture(t);
    legacyClaim(root, { [field]: "not-a-timestamp" });
    const rejected = migrate(root);
    assert.equal(rejected.status, 64, `malformed ${field}: ${rejected.stdout}${rejected.stderr}`);
    assert.match(rejected.stderr, new RegExp(`invalid lease ${field}`));
    noQueue(root);
  }
});

test("public restore validates active timestamps after a correct archive rehash", (t) => {
  const source = fixture(t);
  legacyClaim(source);
  assert.equal(migrate(source).status, 0);
  const original = ok(source, "list")[0];
  const archive = ok(source, "store", "export");
  const valid = fixture(t);
  const restored = restoreRequest(valid, archive);
  assert.equal(restored.status, 0, restored.stderr);
  assert.deepEqual(ok(valid, "list")[0], original);

  for (const field of ["at", "renew"]) {
    for (const value of ["not-a-timestamp", "", null, 42]) {
      const root = fixture(t);
      const rejected = restoreRequest(root, archive, (task) => { task.lease[field] = value; });
      assert.equal(rejected.status, 64, `${field}=${value}: ${rejected.stdout}${rejected.stderr}`);
      assert.match(rejected.stderr, new RegExp(`invalid lease ${field}`));
      assert.doesNotMatch(rejected.stderr, /identity mismatch/, "archive identity must not be the rejection cause");
      noQueue(root);
    }
  }
});

test("valid restore keeps the legacy missing-renew fallback and expired takeover", (t) => {
  const source = fixture(t);
  legacyClaim(source);
  assert.equal(migrate(source).status, 0);
  const original = ok(source, "list")[0];
  const root = fixture(t);
  const restored = restoreRequest(root, ok(source, "store", "export"), (task) => { delete task.lease.renew; });
  assert.equal(restored.status, 0, restored.stderr);
  const before = ok(root, "list")[0];
  assert.equal(before.lease.renew, undefined);
  assert.equal(before.epoch, 2);
  assert.deepEqual(before.history, original.history);
  const fresh = ok(root, "takeover", "--id", "lease", "--worker", "new-worker", "--expected-epoch", "2",
    "--reason", "Recover the valid expired at-only lease");
  assert.equal(fresh.epoch, 3);
  assert.deepEqual(fresh.history.slice(0, before.history.length), before.history);
});

test("public restore preserves malformed historical claim metadata without an active lease", (t) => {
  const source = fixture(t);
  legacyClaim(source);
  assert.equal(migrate(source).status, 0);
  const archive = ok(source, "store", "export");
  const historicalClaim = {
    type: "historical-claim",
    claim: { at: "not-a-timestamp", renew: "" },
  };
  const expectedHistory = [...JSON.parse(archive.refs[0].content).tasks.lease.history, historicalClaim];
  const root = fixture(t);
  const restored = restoreRequest(root, archive, (task) => {
    task.status = "open";
    task.owner = "";
    delete task.lease;
    task.history.push(historicalClaim);
  });
  assert.equal(restored.status, 0, restored.stderr);
  const [readback] = ok(root, "list");
  assert.equal(readback.status, "open");
  assert.equal(readback.owner, "");
  assert.equal(readback.lease, undefined);
  assert.equal(readback.epoch, 2);
  assert.deepEqual(readback.history, expectedHistory);
});
