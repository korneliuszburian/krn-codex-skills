import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const seam = fileURLToPath(new URL("../../scripts/lib/ticket/ticket-cli.mjs", import.meta.url));

test("the ticket subcommands live behind one exported seam", () => {
  assert.ok(fs.existsSync(seam), "scripts/lib/ticket/ticket-cli.mjs must exist");
  const source = fs.readFileSync(seam, "utf8");
  const exported = [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]);
  assert.deepEqual(exported, ["runTicketCommand"], "the seam module must export exactly the ticket command");
});
