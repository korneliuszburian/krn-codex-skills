import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { openTaskStore } from "../../scripts/lib/ticket/task-store.mjs";
import { activateTaskQueueFixture } from "./task-queue-fixture.mjs";

const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));

const ticket = (fields) =>
  ["<krn-ticket>", ...Object.entries(fields).map(([key, value]) => `${key}: ${value}`), "</krn-ticket>", ""].join("\n");

const baseFields = {
  Id: "t-1",
  Title: "Example ticket",
  Status: "ready",
  Type: "task",
  "Repository-base": "origin/main",
  Scope: "scripts/a.mjs",
  "Deciding check": "node --test test/a.test.mjs",
  Contract: "test/a.test.mjs:red->green",
  Acceptance: "the check passes",
  "Blocked by": "none",
};

const withFile = (content, body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-show-"));
  try {
    const file = join(dir, "ticket.md");
    writeFileSync(file, content);
    body(file);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("ticket show prints a ticket's fields as JSON", () => {
  withFile(ticket(baseFields), (file) => {
    const result = spawnSync(process.execPath, [cli, "ticket", "show", file, "--json"], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.deepEqual(JSON.parse(result.stdout), baseFields);
  });
});

test("ticket show, fields and env read the active Git-ref task view instead of Markdown", async () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-task-view-"));
  try {
    execFileSync("git", ["-C", dir, "init", "-q", "-b", "main"]);
    execFileSync("git", ["-C", dir, "config", "user.email", "lab@krn.local"]);
    execFileSync("git", ["-C", dir, "config", "user.name", "lab"]);
    execFileSync("git", ["-C", dir, "commit", "-q", "--allow-empty", "-m", "seed"]);
    mkdirSync(join(dir, ".krn", "tickets"), { recursive: true });
    const file = join(dir, ".krn", "tickets", "t-1.md");
    writeFileSync(file, ticket(baseFields));
    writeFileSync(join(dir, ".krn", "tickets", "legacy-only.md"), ticket({ ...baseFields, Id: "legacy-only", Title: "old queue only" }));
    const store = openTaskStore(dir);
    await store.add({
      id: "t-1",
      title: "Current task-store title",
      body: "task-store body",
      sourcePath: ".krn/tickets/t-1.md",
      type: "task",
      lane: true,
      laneRecipe: {
        base: "main",
        scope: "package.json, test/a.test.mjs",
        check: "node --test test/a.test.mjs",
        contract: "test/a.test.mjs:red->green",
        acceptance: "the new observer test/a.test.mjs verifies the task-store view",
      },
      executionHint: { agentHint: "opencode" },
    });
    await store.markReady("t-1");
    const claim = await store.claim("t-1", { worker: "maintainer", session: "show-test" });
    await store.comment("t-1", { worker: "maintainer", epoch: claim.epoch, body: "first comment" });
    activateTaskQueueFixture(dir);

    const next = spawnSync(process.execPath, [cli, "ticket", "next", "--root", dir], { encoding: "utf8" });
    assert.equal(next.status, 0, `${next.stdout}${next.stderr}`);
    assert.equal(next.stdout.trim(), "", "claimed tasks are omitted from the task-store ready frontier");

    const show = spawnSync(process.execPath, [cli, "ticket", "show", file, "--json"], { encoding: "utf8" });
    assert.equal(show.status, 0, `${show.stdout}${show.stderr}`);
    const shown = JSON.parse(show.stdout);
    assert.equal(shown.Title, "Current task-store title");
    assert.equal(shown.Status, "claimed", "the task-store record is the selected view");
    assert.equal(shown.task.body, "task-store body");
    assert.deepEqual(shown.task.comments, [{ author: "maintainer", body: "first comment" }]);
    assert.deepEqual(shown.task.history.map((entry) => entry.type), ["added", "ready", "claimed", "comment"]);

    const textShow = spawnSync(process.execPath, [cli, "ticket", "show", file], { encoding: "utf8" });
    assert.equal(textShow.status, 0, `${textShow.stdout}${textShow.stderr}`);
    assert.match(textShow.stdout, /^Body: task-store body$/m);
    assert.match(textShow.stdout, /^Comment \(maintainer\): first comment$/m);
    assert.match(textShow.stdout, /^History: \{"type":"added","title":"Current task-store title"\}$/m);

    const fields = spawnSync(process.execPath, [cli, "ticket", "fields", "--file", file, "--json"], { encoding: "utf8" });
    assert.equal(fields.status, 0, `${fields.stdout}${fields.stderr}`);
    assert.equal(JSON.parse(fields.stdout).Acceptance, "the new observer test/a.test.mjs verifies the task-store view");

    const fieldsById = spawnSync(process.execPath, [cli, "ticket", "fields", "--root", dir, "--id", "t-1", "--json"], { encoding: "utf8" });
    assert.equal(fieldsById.status, 0, `${fieldsById.stdout}${fieldsById.stderr}`);
    assert.equal(JSON.parse(fieldsById.stdout).Acceptance, "the new observer test/a.test.mjs verifies the task-store view");

    const env = spawnSync(process.execPath, [cli, "ticket", "env", "--file", file], { encoding: "utf8" });
    assert.equal(env.status, 0, `${env.stdout}${env.stderr}`);
    assert.match(env.stdout, /^TICKET_AGENT='opencode'$/m);
    assert.match(env.stdout, /^BASE_REF='main'$/m);

    const envById = spawnSync(process.execPath, [cli, "ticket", "env", "--root", dir, "--id", "t-1"], { encoding: "utf8" });
    assert.equal(envById.status, 0, `${envById.stdout}${envById.stderr}`);
    assert.match(envById.stdout, /^TICKET_AGENT='opencode'$/m);
    assert.match(envById.stdout, /^BASE_REF='main'$/m);
    assert.match(envById.stdout, /^TICKET_ID='t-1'$/m);

    writeFileSync(file, ticket({ ...baseFields, Id: "legacy-only", Title: "stale path content" }));
    const mismatch = spawnSync(process.execPath, [cli, "ticket", "show", file, "--json"], { encoding: "utf8" });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stderr, /ticket path\/ID mismatch/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ticket show prints Key: value lines without --json", () => {
  withFile(ticket(baseFields), (file) => {
    const result = spawnSync(process.execPath, [cli, "ticket", "show", file], { encoding: "utf8" });
    assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /^Id: t-1$/m);
    assert.match(result.stdout, /^Blocked by: none$/m);
  });
});

test("ticket show fails closed on a missing block", () => {
  withFile("no ticket here\n", (file) => {
    const result = spawnSync(process.execPath, [cli, "ticket", "show", file, "--json"], { encoding: "utf8" });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}${result.stderr}`, /no complete <krn-ticket> block/);
  });
});

test("ticket show fails closed on a missing required field", () => {
  const incomplete = { ...baseFields };
  delete incomplete.Title;
  withFile(ticket(incomplete), (file) => {
    const result = spawnSync(process.execPath, [cli, "ticket", "show", file], { encoding: "utf8" });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}${result.stderr}`, /missing field: Title/);
  });
});

test("ticket show fails closed when the file is unreadable", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-ticket-show-"));
  try {
    const result = spawnSync(process.execPath, [cli, "ticket", "show", join(dir, "absent.md")], { encoding: "utf8" });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}${result.stderr}`, /cannot read ticket file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
