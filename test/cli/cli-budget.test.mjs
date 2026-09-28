import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const taskSeam = fileURLToPath(new URL("../../scripts/lib/task/task-cli.mjs", import.meta.url));
const legacySeam = fileURLToPath(new URL("../../scripts/lib/ticket/ticket-cli.mjs", import.meta.url));
const entrypoint = fileURLToPath(new URL("../../scripts/krn.mjs", import.meta.url));
const laneRunner = fileURLToPath(new URL("../../scripts/lane/run-ticket.sh", import.meta.url));

const exportedFunctions = (source) => [...source.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)].map((match) => match[1]);

test("retired ticket subcommands have no executable CLI module", () => {
  assert.equal(fs.existsSync(legacySeam), false, "the historical parser is not a second public CLI");
});

test("public task alone owns selected CLI dispatch", () => {
  assert.ok(fs.existsSync(taskSeam), "scripts/lib/task/task-cli.mjs must exist");
  assert.equal(fs.existsSync(legacySeam), false);
  const task = fs.readFileSync(taskSeam, "utf8");
  const cli = fs.readFileSync(entrypoint, "utf8");
  assert.deepEqual(exportedFunctions(task), ["runTaskCommand"]);
  assert.doesNotMatch(task, /(?:import|require).*ticket-cli\.mjs|\brunTicketCommand\b|\brequireActiveStore\b/);
  assert.doesNotMatch(cli, /import \{ runTicketCommand \}|await runTicketCommand\(/);
  assert.match(cli, /import \{ runTaskCommand \} from "\.\/lib\/task\/task-cli\.mjs"/);
  assert.match(cli, /raw\[0\] === "task"\) \{\s*await runTaskCommand\(/);
  const runner = fs.readFileSync(laneRunner, "utf8");
  assert.match(runner, /node "\$KRN" task store copy --root "\$FIXTURE" --to "\$WT"/);
  assert.doesNotMatch(runner, /node "\$KRN" ticket store copy/);
});

test("public task diagnostics name task while archive restore still reaches its own validation", () => {
  const root = fs.mkdtempSync(join(tmpdir(), "krn-task-cli-"));
  try {
    const result = spawnSync(process.execPath, [entrypoint, "task", "store", "restore", "--root", root], { encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /task store restore requires --file/);
    assert.doesNotMatch(result.stderr, /ticket store restore/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
