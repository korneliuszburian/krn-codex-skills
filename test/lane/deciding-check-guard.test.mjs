import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const runner = join(root, "scripts", "lane", "run-ticket.sh");
const source = existsSync(runner) ? readFileSync(runner, "utf8") : "";

const guard = (target, check) =>
  spawnSync("bash", [runner, "deciding-check-guard", target, check], { encoding: "utf8", cwd: root });

const withRoot = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), "lane-deciding-check-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("the runner admits a deciding check that exists in the worker tree", () => {
  withRoot((dir) => {
    writeFileSync(join(dir, "observer.test.mjs"), 'import test from "node:test";\ntest("synthetic", () => {});\n');
    const result = guard(dir, "observer.test.mjs");
    assert.equal(result.status, 0, `an existing deciding check must admit the lane: ${result.stdout}${result.stderr}`);
    assert.match(result.stdout, /rule=none/, "an existing deciding check names no refusal rule");
    assert.match(result.stdout, /path=observer\.test\.mjs/, "the verdict names the check path");
  });
});

test("the runner refuses a missing deciding check with the named rule and path", () => {
  withRoot((dir) => {
    const result = guard(dir, "test/lane/absent-observer.test.mjs");
    assert.notEqual(result.status, 0, "a missing deciding check must refuse the lane");
    assert.match(result.stdout, /rule=deciding-check-missing/, "the refusal names the deciding-check-missing rule");
    assert.match(result.stdout, /path=test\/lane\/absent-observer\.test\.mjs/, "the refusal names the missing path");
  });
});

test("the guard normalizes a node --test operand and exempts a package script", () => {
  withRoot((dir) => {
    writeFileSync(join(dir, "observer.test.mjs"), 'import test from "node:test";\ntest("synthetic", () => {});\n');
    const prefixed = guard(dir, "node --test observer.test.mjs");
    assert.equal(prefixed.status, 0, `a node --test operand must normalize: ${prefixed.stdout}${prefixed.stderr}`);
    assert.match(prefixed.stdout, /rule=none/, "a normalized existing check admits the lane");

    const script = guard(dir, "npm run test:lib");
    assert.equal(script.status, 0, `a package script carries no file obligation: ${script.stdout}${script.stderr}`);
    assert.match(script.stdout, /rule=none/, "a package script admits without a file assertion");
  });
});

test("the repository's own deciding check resolves in this worker tree", () => {
  const result = guard(root, "node --test test/lane/deciding-check-guard.test.mjs");
  assert.equal(result.status, 0, `the admitted observer must exist: ${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /path=test\/lane\/deciding-check-guard\.test\.mjs/, "the verdict names the observer path");
});

test("the lane invokes the guard after the worker session and before the host gate", () => {
  assert.ok(source.length > 0, "scripts/lane/run-ticket.sh must be admitted");
  const workerAt = source.indexOf('invoke_worker "$RUN_DIR/PROMPT.txt"');
  const guardAt = source.indexOf('deciding_check_guard "$WT"');
  const gateAt = source.indexOf('node "$KRN" changes check');
  assert.ok(workerAt >= 0, "the lane must invoke the worker session");
  assert.ok(guardAt >= 0, "the lane must invoke the deciding check guard");
  assert.ok(gateAt >= 0, "the lane must run the host gate");
  assert.ok(workerAt < guardAt, "the guard must run after the worker session");
  assert.ok(guardAt < gateAt, "the guard must run before the host gate");
});
