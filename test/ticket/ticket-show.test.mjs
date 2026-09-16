import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

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
