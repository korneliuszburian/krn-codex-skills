import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(new URL("./integration-memory.test.mjs", import.meta.url));

test("the memory integration test stays green under the change-contract guard", () => {
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", target], { encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
});

test("a skipped change-contract is reported instead of silently passing", () => {
  const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));
  const env = { ...process.env, KRN_CHANGE_CONTRACT: "0" };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [cli, "changes", "check", "--root", process.cwd(), "--base", "HEAD"], { encoding: "utf8", env });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(`${result.stdout}${result.stderr}`, /change-contract-skipped/);
});
