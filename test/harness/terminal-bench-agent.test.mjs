import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runProcess } from "../../scripts/lib/kernel/proc.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const AGENT = path.join(root, "scripts", "harness", "terminal_bench_agent.py");
const SETUP = path.join(root, "scripts", "harness", "terminal_bench_setup.sh");

test("the Terminal-Bench lane agent ships with a valid setup script", () => {
  assert.ok(existsSync(AGENT), "scripts/harness/terminal_bench_agent.py must exist");
  assert.ok(existsSync(SETUP), "scripts/harness/terminal_bench_setup.sh must exist");
  assert.equal(runProcess("sh", ["-n", SETUP]).ok, true, "the setup script must parse");
  const compiled = runProcess("python3", ["-c", `compile(open(${JSON.stringify(AGENT)}).read(), ${JSON.stringify(AGENT)}, "exec")`]);
  assert.equal(compiled.ok, true, `the agent must compile: ${compiled.err}`);
});
