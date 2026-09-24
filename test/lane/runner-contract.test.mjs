import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { openTaskStore } from "../../scripts/lib/ticket/task-store.mjs";
import { activateTaskQueueFixture } from "../ticket/task-queue-fixture.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const lane = (name) => join(root, "scripts", "lane", name);
const BASH_SCRIPTS = ["run-ticket.sh", "run-frontier.sh", "integrate.sh", "publish.sh"];
const ADMITTED = [...BASH_SCRIPTS, "capsule-writeback.py", "README.md"];

const readIf = (name) => (existsSync(lane(name)) ? readFileSync(lane(name), "utf8") : "");

const run = (file, args, options = {}) =>
  spawnSync("bash", [lane(file), ...args], { encoding: "utf8", cwd: root, ...options });

const hasBind = (tokens, kind, path) => {
  for (let index = 0; index + 2 < tokens.length; index += 1) {
    if (tokens[index] === kind && tokens[index + 1] === path && tokens[index + 2] === path) return true;
  }
  return false;
};

test("the lane family is admitted into the repository", () => {
  for (const name of ADMITTED) {
    assert.ok(existsSync(lane(name)), `scripts/lane/${name} must be admitted`);
  }
});

test("every admitted shell script parses and the writeback compiles", () => {
  for (const name of BASH_SCRIPTS) {
    const result = spawnSync("bash", ["-n", lane(name)], { encoding: "utf8" });
    assert.equal(result.status, 0, `bash -n scripts/lane/${name}: ${result.stderr}`);
  }
  const compiled = spawnSync("python3", ["-m", "py_compile", lane("capsule-writeback.py")], { encoding: "utf8" });
  assert.equal(compiled.status, 0, `capsule-writeback.py must compile: ${compiled.stderr}`);
});

test("bash code carries no checkout or home mount literal", () => {
  for (const name of BASH_SCRIPTS) {
    const code = readIf(name);
    assert.ok(code.length > 0, `scripts/lane/${name} must be present`);
    assert.doesNotMatch(code, /\/mnt\/storage\/coding\/krn/, `${name} must not embed a lab mount path`);
    assert.doesNotMatch(code, /\/home\/krn/, `${name} must not embed a lab home path`);
  }
});

test("the classifier reads a real TAP failure as red and a load error as refused setup", () => {
  const runner = "run-ticket.sh";
  assert.ok(existsSync(lane(runner)), "run-ticket.sh must be admitted");
  const dir = mkdtempSync(join(tmpdir(), "lane-classify-"));
  try {
    const failing = join(dir, "failing.test.mjs");
    writeFileSync(
      failing,
      'import test from "node:test";\nimport assert from "node:assert/strict";\ntest("synthetic", () => { assert.fail("synthetic failure"); });\n',
    );
    const red = run(runner, ["classify", failing]);
    assert.equal(red.status, 1, `a TAP failure must classify red: ${red.stdout}${red.stderr}`);
    assert.match(red.stdout, /classification=red/, "a TAP failure must be classified red");

    const passing = join(dir, "passing.test.mjs");
    writeFileSync(passing, 'import test from "node:test";\ntest("synthetic", () => {});\n');
    const green = run(runner, ["classify", passing]);
    assert.equal(green.status, 0, `a passing check must classify green: ${green.stdout}${green.stderr}`);
    assert.match(green.stdout, /classification=green/, "a passing check must be classified green");

    const absent = join(dir, "absent.test.mjs");
    const missing = run(runner, ["classify", absent]);
    assert.equal(missing.status, 2, `a missing check must be refused: ${missing.stdout}${missing.stderr}`);
    assert.match(missing.stdout, /refused-setup/, "a missing check must be a setup refusal");

    const asNode = run(runner, ["classify", `node --test ${absent}`]);
    assert.equal(asNode.status, 2, "a non-file operand must not be treated as red");
    assert.match(asNode.stdout, /refused-setup/, "a non-file operand must be a setup refusal");

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "lane-classify-fixture", private: true, scripts: { boom: "node -e \"process.exit(1)\"", ok: "node -e \"process.exit(0)\"" } }),
    );
    const npmEnv = { ...process.env, FIXTURE: dir, WORK_ROOT: dir, npm_config_update_notifier: "false", npm_config_audit: "false", npm_config_fund: "false" };
    const npmRed = run(runner, ["classify", "npm run boom"], { env: npmEnv });
    assert.equal(npmRed.status, 1, `an npm run failure must classify red: ${npmRed.stdout}${npmRed.stderr}`);
    assert.match(npmRed.stdout, /classification=red/, "an npm run failure must be classified red");
    const npmGreen = run(runner, ["classify", "npm run ok"], { env: npmEnv });
    assert.equal(npmGreen.status, 0, `an npm run pass must classify green: ${npmGreen.stdout}${npmGreen.stderr}`);
    assert.match(npmGreen.stdout, /classification=green/, "an npm run pass must be classified green");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the sandbox composition pins the fixture and shared git dir read-only and the clone writable", () => {
  const runner = "run-ticket.sh";
  assert.ok(existsSync(lane(runner)), "run-ticket.sh must be admitted");
  const fixture = "/srv/fixture";
  const runDir = "/srv/lane/runs-live/1";
  const wt = `${runDir}/wt`;
  const env = {
    ...process.env,
    BASE: "/srv/lane",
    FIXTURE: fixture,
    GIT_COMMON: `${fixture}/.git`,
    RUN_DIR: runDir,
    WT: wt,
    WORKER: "opencode",
    OPENCODE_HOME: "/opt/opencode",
  };
  const result = run(runner, ["bwrap-args"], { env });
  assert.equal(result.status, 0, `bwrap-args must print the composition: ${result.stderr}`);
  const tokens = result.stdout.split("\n").filter(Boolean);
  assert.ok(hasBind(tokens, "--ro-bind", fixture), "the fixture must be bound read-only");
  assert.ok(hasBind(tokens, "--ro-bind", `${fixture}/.git`), "the shared git common dir must be bound read-only");
  assert.ok(hasBind(tokens, "--bind", wt), "the worker clone must be writable");
  assert.ok(!hasBind(tokens, "--bind", fixture), "the fixture must never be writable");
  assert.ok(!hasBind(tokens, "--bind", `${fixture}/.git`), "the shared git common dir must never be writable");
});

test("the probe verdict fails a fixture write or ref update and passes a clean probe", () => {
  const runner = "run-ticket.sh";
  assert.ok(existsSync(lane(runner)), "run-ticket.sh must be admitted");
  const verdict = (text) => run(runner, ["probe-verdict"], { input: text });
  const clean = verdict("hosthome=hidden\ncanary=denied\nfixture_write=denied\nref_update=denied\n");
  assert.equal(clean.status, 0, `a clean probe must pass: ${clean.stdout}${clean.stderr}`);
  assert.match(clean.stdout, /isolation=ok/, "a clean probe must report ok");

  const wrote = verdict("hosthome=hidden\ncanary=denied\nfixture_write=WROTE\nref_update=denied\n");
  assert.notEqual(wrote.status, 0, "a fixture write must fail the probe");
  assert.match(wrote.stdout, /isolation=FAILED/, "a fixture write must report a failed isolation");

  const updated = verdict("hosthome=hidden\ncanary=denied\nfixture_write=denied\nref_update=UPDATED\n");
  assert.notEqual(updated.status, 0, "a ref update must fail the probe");
  assert.match(updated.stdout, /isolation=FAILED/, "a ref update must report a failed isolation");

  const canary = verdict("hosthome=hidden\ncanary=WROTE\nfixture_write=denied\nref_update=denied\n");
  assert.notEqual(canary.status, 0, "the canary write probe must still fail the verdict");

  const home = verdict("hosthome=VISIBLE\ncanary=denied\nfixture_write=denied\nref_update=denied\n");
  assert.notEqual(home.status, 0, "the host-home probe must still fail the verdict");
});

test("the frontier, integrator, publication, and capsule tools still expose their entrypoints", () => {
  for (const name of ["run-frontier.sh", "integrate.sh", "publish.sh", "capsule-writeback.py"]) {
    assert.ok(existsSync(lane(name)), `scripts/lane/${name} must be admitted`);
  }
  assert.match(readIf("run-frontier.sh"), /ROOT:?\?/, "run-frontier must require its repository root");
  const runner = readIf("run-ticket.sh");
  assert.match(runner, /ticket store copy --root "\$FIXTURE" --to "\$WT"/, "the isolated task clone receives its own snapshot of the active queue refs");
  assert.ok(runner.indexOf("ticket store copy --root") < runner.indexOf("changes check --root \"$WT\""), "the cloned queue exists before host checks read task state");
  assert.match(readIf("integrate.sh"), /merge --no-ff/, "integrate must merge the worker branch");
  assert.match(readIf("publish.sh"), /PUBLISH_AUTHORITY/, "publish must gate on explicit authority");
  assert.match(readIf("capsule-writeback.py"), /def main/, "the capsule tool must expose a main entrypoint");

  const publish = run("publish.sh", []);
  assert.notEqual(publish.status, 0, "publish without authority must refuse");
  const capsule = spawnSync("python3", [lane("capsule-writeback.py")], { encoding: "utf8" });
  assert.equal(capsule.status, 64, "the capsule tool without arguments must report usage");
});

test("run-ticket resolves a claimed Git-ref task by ID and honors its executor hint", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lane-task-adapter-"));
  try {
    const seed = (args) => {
      const result = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
      assert.equal(result.status, 0, `${args.join(" ")}: ${result.stdout}${result.stderr}`);
    };
    seed(["init", "-q", "-b", "main"]);
    seed(["config", "user.email", "lane@krn.local"]);
    seed(["config", "user.name", "lane"]);
    seed(["commit", "-q", "--allow-empty", "-m", "seed"]);

    const store = openTaskStore(dir);
    await store.add({
      id: "lane-id",
      title: "Read the task from the Git-ref store",
      body: "The lane input comes from the task record.",
      lane: true,
      laneRecipe: {
        base: "main",
        scope: "scripts/a.mjs",
        check: "test/a.test.mjs",
        contract: "test/a.test.mjs:red->green",
        acceptance: "task-by-ID is consumed by the lane",
      },
      executionHint: { agentHint: "opencode" },
    });
    await store.markReady("lane-id");
    await store.claim("lane-id", { worker: "lane-worker", session: "adapter-test" });
    activateTaskQueueFixture(dir);

    const env = {
      ...process.env,
      BASE: dir,
      FIXTURE: dir,
      KRN: join(root, "scripts", "krn.mjs"),
      KRN_TASK_ID: "lane-id",
      OPENCODE_HOME: join(dir, "no-opencode-install"),
    };
    delete env.TICKET;
    delete env.WORKER;
    delete env.WORKER_ENV;

    const result = run("run-ticket.sh", ["run"], { cwd: root, env });
    assert.equal(result.status, 65, `${result.stdout}${result.stderr}`);
    assert.match(result.stderr, /opencode binary missing/, "the executor hint must come from the active task view");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
