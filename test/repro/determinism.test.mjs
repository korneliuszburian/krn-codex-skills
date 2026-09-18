import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
const scripts = () => JSON.parse(read("package.json")).scripts;
const workflow = () => read(path.join(".github", "workflows", "validate.yml"));

test("package.json declares the reproducibility observer", () => {
  const command = scripts()["test:repro"];
  assert.ok(command, "package.json must declare the test:repro check");
  assert.match(command, /test\/repro\/determinism\.test\.mjs/, "test:repro must run the determinism observer");
});

test("the gate runs the reproducibility observer before the change-contract check", () => {
  const commands = scripts();
  for (const gate of ["gate:fast", "gate"]) {
    const command = commands[gate];
    assert.ok(command, `${gate} must exist`);
    const repro = command.indexOf("npm run test:repro");
    const changes = command.indexOf("npm run changes:check");
    assert.ok(repro !== -1, `${gate} must run test:repro`);
    assert.ok(changes !== -1, `${gate} must run changes:check`);
    assert.ok(repro < changes, `${gate} must run test:repro before changes:check`);
  }
});

test("the CI fast job runs the reproducibility observer before the changes-check step", () => {
  const text = workflow();
  const repro = text.indexOf("npm run test:repro");
  const changes = text.indexOf("node scripts/krn.mjs changes check");
  assert.ok(repro !== -1, "the workflow must run npm run test:repro");
  assert.ok(changes !== -1, "the workflow must run the changes check");
  assert.ok(repro < changes, "the workflow must run test:repro before the changes check");
});

test("exporting one commit twice yields byte-identical archives", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "krn-repro-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "repro@example.invalid"]);
  git(["config", "user.name", "repro"]);
  git(["config", "commit.gpgsign", "false"]);

  const skill = "---\nname: alpha\ndescription: Reproducible skill\n---\n";
  fs.mkdirSync(path.join(dir, "skills", "eng", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(dir, "skills", "eng", "alpha", "SKILL.md"), skill);
  fs.mkdirSync(path.join(dir, ".agents", "skills", "alpha"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".agents", "skills", "alpha", "SKILL.md"), skill);
  git(["add", "-A"]);
  git(["commit", "-q", "-m", "base"]);

  const archive = () =>
    execFileSync("git", ["archive", "--format=tar", "HEAD", "--", "skills", ".agents/skills"], { cwd: dir });
  const first = archive();
  const second = archive();
  assert.ok(first.length > 0, "the exported archive must not be empty");
  assert.deepEqual(first, second, "two exports of one commit must be byte-for-byte identical");
});
