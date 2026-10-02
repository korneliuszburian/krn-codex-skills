import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const command = (root, ...args) => spawnSync(process.execPath,
  [cli, "task", ...args, "--root", root, "--json"], { encoding: "utf8", cwd: root });
const ok = (root, ...args) => {
  const result = command(root, ...args);
  assert.equal(result.status, 0, `${args.join(" ")}: ${result.stdout}${result.stderr}`);
  return JSON.parse(result.stdout);
};

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "krn-task-admission-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync("git", ["-C", root, "init", "-q", "-b", "main"]);
  execFileSync("git", ["-C", root, "config", "user.email", "lab@krn.local"]);
  execFileSync("git", ["-C", root, "config", "user.name", "lab"]);
  execFileSync("git", ["-C", root, "commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs", "admission"), { recursive: true });
  ok(root, "store", "migrate", "--yes", "--actor", "fixture", "--reason",
    "Activate the isolated empty queue", "--archive", ".krn/runs/admission/queue-backup.json");
  return root;
}

function completePrerequisite(root, id) {
  ok(root, "ready", "--id", id);
  const claim = ok(root, "claim", "--id", id, "--worker", "prerequisite");
  ok(root, "close", "--id", id, "--actor", "prerequisite", "--expected-epoch", String(claim.epoch),
    "--reason", "Fixture prerequisite accepted");
}

test("public pre-admission keeps B unclaimable before A and selectable after A without another ready", (t) => {
  const root = fixture(t);
  ok(root, "add", "--id", "A", "--title", "Prerequisite A");
  ok(root, "add", "--id", "B", "--title", "Approved dependent B", "--depends-on", "A");

  const strict = command(root, "ready", "--id", "B");
  assert.equal(strict.status, 64);
  assert.match(strict.stderr, /unresolved dependencies/);
  const admitted = ok(root, "ready", "--id", "B", "--admit-blocked");
  assert.equal(admitted.status, "ready");
  assert.equal(admitted.epoch, 0);
  assert.equal(admitted.owner, "");
  assert.deepEqual(admitted.history.at(-1), { type: "ready", admitBlocked: true });
  const blocked = ok(root, "next");
  assert.deepEqual(blocked.frontier, []);
  assert.deepEqual(blocked.blockedReady, [{ id: "B", blockedBy: [{ id: "A", status: "open" }] }]);
  assert.deepEqual(blocked.errors, []);

  const direct = command(root, "claim", "--id", "B", "--worker", "too-early");
  assert.equal(direct.status, 64);
  assert.match(direct.stderr, /unresolved dependencies/);
  const atomic = command(root, "claim", "--ready", "--worker", "too-early");
  assert.equal(atomic.status, 64);
  assert.match(atomic.stderr, /no unblocked ready task/);
  assert.deepEqual(ok(root, "list").find(({ id }) => id === "B"), admitted,
    "failed claims must not mutate the admitted task or its generation");

  completePrerequisite(root, "A");
  assert.deepEqual(ok(root, "next").frontier, ["B"]);
  const claimed = ok(root, "claim", "--ready", "--worker", "next-process", "--session", "fresh");
  assert.equal(claimed.id, "B");
  assert.equal(claimed.epoch, 1);
  assert.equal(claimed.lease.worker, "next-process");
  assert.equal(claimed.lease.session, "fresh");
});

test("editing admitted blocked B revokes admission until deliberate re-admission", (t) => {
  const root = fixture(t);
  ok(root, "add", "--id", "A", "--title", "Prerequisite A");
  ok(root, "add", "--id", "B", "--title", "Approved dependent B", "--depends-on", "A");
  ok(root, "ready", "--id", "B", "--admit-blocked");

  const edited = ok(root, "edit", "--id", "B", "--title", "Revised dependent B");
  assert.equal(edited.title, "Revised dependent B");
  assert.equal(edited.status, "open");
  assert.deepEqual(edited.history.at(-1), { type: "edited", fields: ["title"] });

  completePrerequisite(root, "A");
  assert.deepEqual(ok(root, "next").frontier, []);
  const staleAdmission = command(root, "claim", "--ready", "--worker", "too-early");
  assert.equal(staleAdmission.status, 64);
  assert.match(staleAdmission.stderr, /no unblocked ready task/);
  assert.equal(ok(root, "list").find(({ id }) => id === "B").status, "open");

  const readmitted = ok(root, "ready", "--id", "B");
  assert.equal(readmitted.status, "ready");
  assert.deepEqual(ok(root, "next").frontier, ["B"]);
  const claimed = ok(root, "claim", "--ready", "--worker", "after-readmission");
  assert.equal(claimed.id, "B");
  assert.equal(claimed.epoch, 1);
});
