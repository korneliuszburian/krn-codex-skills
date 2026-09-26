import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { parseTicketText } from "../../scripts/lib/ticket/ticket.mjs";
import { ABI_LABELS, fieldLine } from "../../scripts/lib/state/capsule-abi.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const pkg = JSON.parse(read("package.json"));

// The literal regex source every copied ticket-envelope parser carries.
const TICKET_FIELD_REGEX = "^([A-Za-z][A-Za-z ()-]*):\\s*(.*)$";
// The value-extraction tail unique to a hand-rolled capsule field reader.
const CAPSULE_FIELD_READER = "slice(label.length + 1).trim()";

function trackedSources() {
  const listing = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return listing
    .split("\0")
    .filter(Boolean)
    .filter((relative) => /\.(mjs|js|py|sh)$/.test(relative))
    .filter((relative) => !relative.startsWith("test/"))
    .sort();
}

test("the ticket-envelope parser has exactly one in-repo owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes(TICKET_FIELD_REGEX));
  assert.deepEqual(owners, ["scripts/lib/ticket/ticket.mjs"], "the envelope regex must live only in its owner");
});

test("the capsule-field reader has exactly one in-repo owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes(CAPSULE_FIELD_READER));
  assert.deepEqual(owners, ["scripts/lib/state/capsule-abi.mjs"], "the field reader must live only in its owner");
});

test("the hook, plugin, and lane carry no fourth hand-rolled parser", () => {
  const consumer = {
    hook: read("scripts/hooks/krn_memory.py"),
    plugin: read("config/opencode/plugins/krn.js"),
    lane: read("scripts/lane/run-ticket.sh"),
  };
  for (const [name, source] of Object.entries(consumer)) {
    assert.ok(!source.includes(TICKET_FIELD_REGEX), `${name} must not copy the ticket-envelope parser`);
  }
  assert.ok(!/def field\(/.test(consumer.hook), "the hook must not hand-roll capsule field parsing");
  assert.ok(!/def ticket_fields\(/.test(consumer.hook), "the hook must not hand-roll ticket parsing");
  assert.match(consumer.hook, /state",\s*"fields"/, "the hook reads capsule fields through the CLI");
  assert.match(consumer.hook, /ticket",\s*"next"/, "the hook reads the frontier through the CLI");
  assert.ok(!/function field\(/.test(consumer.plugin), "the plugin must not hand-roll capsule field parsing");
  assert.ok(!/function ticketFields\(/.test(consumer.plugin), "the plugin must not hand-roll ticket parsing");
  assert.match(consumer.plugin, /capsule-abi\.mjs/, "the plugin re-uses the capsule-field owner");
  assert.match(consumer.plugin, /ticket\/ticket\.mjs/, "the plugin re-uses the ticket-envelope owner");
  assert.match(consumer.lane, /ticket env/, "the lane reads the envelope through the CLI");
});

test("the CLI exposes the ticket-envelope owner", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-abi-ticket-"));
  try {
    const text = ["<krn-ticket>", "Id: sh-99", "Status: ready", "Scope: scripts/x.mjs", "</krn-ticket>", ""].join("\n");
    const file = path.join(dir, "ticket.md");
    writeFileSync(file, text);
    const out = execFileSync(process.execPath, [path.join(root, "scripts", "krn.mjs"), "ticket", "fields", "--file", file, "--json"], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(out), Object.fromEntries(parseTicketText(text).fields));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the CLI exposes the capsule-field owner", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-abi-capsule-"));
  try {
    const text = ["Outcome state: ACTIVE", "Next bounded owner and action: ship the slice", ""].join("\n");
    const file = path.join(dir, "state.md");
    writeFileSync(file, text);
    const out = execFileSync(process.execPath, [path.join(root, "scripts", "krn.mjs"), "state", "fields", "--file", file, "--json"], { encoding: "utf8" });
    const values = JSON.parse(out);
    assert.deepEqual(Object.keys(values), ABI_LABELS);
    assert.equal(values["Outcome state"], fieldLine(text, "Outcome state"));
    assert.equal(values["Next bounded owner and action"], fieldLine(text, "Next bounded owner and action"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a local conformance:check gate runs the frozen base acceptance set inside the gate", () => {
  const check = pkg.scripts["conformance:check"];
  assert.equal(typeof check, "string", "package.json needs a conformance:check script");
  assert.match(check, /conformance check/, "conformance:check must run the conformance CLI");
  for (const gate of ["gate:fast", "gate"]) {
    assert.match(pkg.scripts[gate], /npm run conformance:check/, `${gate} must run conformance:check`);
  }
});
