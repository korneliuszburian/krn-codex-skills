import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { openTaskStore } from "../../scripts/lib/task/task-store.mjs";
import { prepareLegacyQueueImport } from "../../scripts/lib/task/task-import.mjs";
import { taskTicketView } from "../../scripts/lib/ticket/ticket.mjs";
import { activateTaskQueueFixture } from "./task-queue-fixture.mjs";

const cli = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const command = (root, ...args) => spawnSync(process.execPath, [cli, "task", ...args], { encoding: "utf8", cwd: root });
const ticket = (fields) =>
  ["<krn-ticket>", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "</krn-ticket>", ""].join("\n");
const baseFields = {
  Id: "t-1", Title: "Example ticket", Status: "ready", Type: "task", "Repository-base": "origin/main",
  Scope: "scripts/a.mjs", "Deciding check": "node --test test/a.test.mjs",
  Contract: "test/a.test.mjs:red->green", Acceptance: "the check passes", "Blocked by": "none",
};

test("public task show, fields and env read the selected Git-ref record rather than Markdown", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-task-view-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    mkdirSync(join(dir, ".krn", "tickets"), { recursive: true });
    const file = join(dir, ".krn", "tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    writeFileSync(join(dir, ".krn", "tickets", "legacy-only.md"), ticket({ ...baseFields, Id: "legacy-only" }));
    const store = openTaskStore(dir);
    await store.add({
      id: "t-1", title: "Current task-store title", body: "task-store body",
      sourcePath: ".krn/tickets/t-1.md", type: "task", lane: true,
      laneRecipe: { base: "main", scope: "package.json, test/a.test.mjs", check: "node --test test/a.test.mjs",
        contract: "test/a.test.mjs:red->green", acceptance: "the selected task is authoritative" },
      executionHint: { agentHint: "opencode" },
    });
    await store.markReady("t-1");
    const claim = await store.claim("t-1", { worker: "maintainer", session: "task-view" });
    await store.comment("t-1", { worker: "maintainer", epoch: claim.epoch, body: "first comment" });
    activateTaskQueueFixture(dir);

    const next = command(dir, "next", "--root", dir, "--json");
    assert.equal(next.status, 0, `${next.stdout}${next.stderr}`);
    assert.deepEqual(JSON.parse(next.stdout).frontier, []);
    const show = command(dir, "show", "--root", dir, "--id", "t-1", "--json");
    assert.equal(show.status, 0, `${show.stdout}${show.stderr}`);
    const view = JSON.parse(show.stdout);
    assert.equal(view.Title, "Current task-store title");
    assert.equal(view.Status, "claimed");
    assert.equal(view.task.body, "task-store body");
    assert.deepEqual(view.task.comments, [{ author: "maintainer", body: "first comment" }]);
    assert.deepEqual(view.task.history.map((entry) => entry.type), ["added", "ready", "claimed", "comment"]);
    const human = command(dir, "show", "--root", dir, "--id", "t-1");
    assert.equal(human.status, 0, `${human.stdout}${human.stderr}`);
    assert.match(human.stdout, /^Body: task-store body$/m);
    assert.match(human.stdout, /^Comment \(maintainer\): first comment$/m);

    const fields = command(dir, "fields", "--root", dir, "--id", "t-1", "--json");
    assert.equal(fields.status, 0, `${fields.stdout}${fields.stderr}`);
    assert.equal(JSON.parse(fields.stdout).Acceptance, "the selected task is authoritative");
    const env = command(dir, "env", "--root", dir, "--id", "t-1");
    assert.equal(env.status, 0, `${env.stdout}${env.stderr}`);
    assert.match(env.stdout, /^TICKET_AGENT='opencode'$/m);
    assert.match(env.stdout, /^BASE_REF='main'$/m);
    assert.match(env.stdout, /^TICKET_ID='t-1'$/m, "the retained lane binding names the selected task ID");

    writeFileSync(file, ticket({ ...baseFields, Id: "legacy-only", Title: "stale path content" }));
    const afterDecoy = command(dir, "show", "--root", dir, "--id", "t-1", "--json");
    assert.equal(afterDecoy.status, 0, afterDecoy.stderr);
    assert.equal(JSON.parse(afterDecoy.stdout).Title, "Current task-store title", "the Markdown decoy cannot change the selected view");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public task next fails with checker diagnostics but succeeds for a valid empty frontier", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-task-next-errors-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    const store = openTaskStore(dir);
    await store.add({ id: "missing-observer", title: "Observer not yet available", lane: true,
      laneRecipe: { base: "main", scope: "test/missing.test.mjs", check: "node --test test/missing.test.mjs",
        contract: "test/missing.test.mjs:red->green", acceptance: "the declared check passes" } });
    activateTaskQueueFixture(dir);

    const empty = command(dir, "next", "--root", dir, "--json");
    assert.equal(empty.status, 0, `${empty.stdout}${empty.stderr}`);
    assert.deepEqual(JSON.parse(empty.stdout).frontier, []);
    assert.deepEqual(JSON.parse(empty.stdout).errors, []);
    assert.equal(JSON.parse(empty.stdout).pending.open, 1);
    const humanEmpty = command(dir, "next", "--root", dir);
    assert.equal(humanEmpty.status, 0, humanEmpty.stderr);
    assert.equal(humanEmpty.stdout, "");
    assert.match(humanEmpty.stderr, /No runnable tasks/);
    assert.match(humanEmpty.stderr, /open=1/);

    await store.markReady("missing-observer");
    const check = command(dir, "check", "--root", dir, "--json");
    assert.equal(check.status, 1, `${check.stdout}${check.stderr}`);
    const errors = JSON.parse(check.stdout).errors;
    assert.ok(errors.some(({ rule }) => rule === "scope-missing-package-json"));
    const next = command(dir, "next", "--root", dir, "--json");
    assert.deepEqual(JSON.parse(next.stdout).errors, errors);
    assert.deepEqual(JSON.parse(next.stdout).frontier, []);
    assert.equal(next.status, 1, `${next.stdout}${next.stderr}`);
    const human = command(dir, "next", "--root", dir);
    assert.equal(human.status, 1, human.stderr);
    assert.equal(human.stdout, "");
    assert.match(human.stderr, /error: scope-missing-package-json:/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("public task views render a current claim without erasing the imported claim", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-task-imported-view-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
    mkdirSync(join(dir, ".krn/tickets"), { recursive: true });
    const historicalClaim = "worker=old-worker; session=old-session; at=2000-01-01T00:00:00Z; epoch=1; renew=2000-01-01T00:00:00Z; duration=3600; future=retained";
    writeFileSync(join(dir, ".krn/tickets/t-1.md"), ticket({ ...baseFields, Status: "done", Claim: historicalClaim }));
    const prepared = prepareLegacyQueueImport(dir);
    const store = openTaskStore(dir);
    await store.importSnapshot(prepared);
    activateTaskQueueFixture(dir);
    const ok = (verb, ...args) => {
      const result = command(dir, verb, "--root", dir, "--id", "t-1", ...args, "--json");
      assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
      return JSON.parse(result.stdout);
    };
    ok("reopen", "--actor", "operator", "--reason", "Follow-up after import");
    ok("ready");
    assert.equal(ok("claim", "--worker", "new-worker", "--session", "new-session").epoch, 2);
    rmSync(join(dir, ".krn/tickets"), { recursive: true });
    for (const verb of ["show", "fields"]) {
      const view = ok(verb);
      assert.equal(view.Status, "claimed");
      assert.match(view.Claim, /(?:^|; )worker=new-worker(?:;|$)/);
      assert.match(view.Claim, /(?:^|; )session=new-session(?:;|$)/);
      assert.match(view.Claim, /(?:^|; )epoch=2(?:;|$)/);
      assert.doesNotMatch(view.Claim, /old-worker|old-session|future=retained/);
    }
    const source = await store.show("t-1");
    assert.equal(source.legacyFields.Claim, historicalClaim);
    assert.equal(source.history[0].claim.worker, "old-worker");
    assert.equal(source.lease.worker, "new-worker");
    const archiveResult = command(dir, "store", "export", "--root", dir, "--json");
    assert.equal(archiveResult.status, 0, archiveResult.stderr);
    const archive = JSON.parse(archiveResult.stdout);
    assert.equal(JSON.parse(archive.refs[0].content).tasks["t-1"].legacyFields.Claim, historicalClaim);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const [id, legacyFields, effectObject] of [
  ["t-1", { Evidence: "gate exit0", Contract: "test/a.test.mjs:red->green" }, "1".repeat(40)],
  ["t-2", { Evidence: `gate exit0; integrated=${"0".repeat(40)}` }, "1".repeat(40)],
]) {
  test(`operation-closed imported task ${id} projects the observed integrated anchor`, () => {
    const view = taskTicketView({ id, title: "Example", status: "done", type: "task", dependencies: [], legacyFields,
      result: { operationId: `op-${id}`, effectObject }, legacyCloseProofRequired: true });
    assert.match(view.fields.get("Evidence"), new RegExp(`integrated=${effectObject}`));
    if (id === "t-2") assert.doesNotMatch(view.fields.get("Evidence"), /integrated=0{40}/);
  });
}
