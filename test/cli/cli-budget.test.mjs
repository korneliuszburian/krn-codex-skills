import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));
const seam = fileURLToPath(new URL("../../scripts/lib/ticket/ticket-cli.mjs", import.meta.url));
const LINE_BUDGET = 450;

const lineCount = (file) => fs.readFileSync(file, "utf8").replace(/\n$/, "").split("\n").length;

test("krn-codex.mjs stays within the line budget", () => {
  const count = lineCount(cli);
  assert.ok(count <= LINE_BUDGET, `scripts/krn-codex.mjs has ${count} lines; the budget is ${LINE_BUDGET}`);
});

test("the ticket subcommands live behind one exported seam", () => {
  assert.ok(fs.existsSync(seam), "scripts/lib/ticket/ticket-cli.mjs must exist");
  const source = fs.readFileSync(seam, "utf8");
  const exported = [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]);
  assert.deepEqual(exported, ["runTicketCommand"], "the seam module must export exactly the ticket command");
});

test("the CLI dispatcher delegates the ticket surface to the seam", () => {
  const source = fs.readFileSync(cli, "utf8");
  assert.match(source, /runTicketCommand\(/);
});
