import assert from "node:assert/strict";
import { runGit } from "../../scripts/lib/kernel/git.mjs";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { reconcileTickets } from "../../scripts/lib/ticket/ticket.mjs";

const git = (root, args) => runGit(root, args).out;

const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-compose-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "lab@krn.local"]);
  git(root, ["config", "user.name", "lab"]);
  git(root, ["commit", "-q", "--allow-empty", "-m", "seed"]);
  mkdirSync(join(root, ".krn", "runs"), { recursive: true });
  writeFileSync(join(root, ".krn", "runs", ".gitignore"), "*\n!.gitignore\n");
  git(root, ["add", ".krn/runs/.gitignore"]);
  git(root, ["commit", "-q", "-m", "runs boundary"]);
  return root;
}

test("the CLI answers --help with usage on stdout and keeps no-args a usage error", () => {
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^Usage:/);
  const none = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(none.status, 64);
});

test("compile, check, and resume compose into one usable restart path", () => {
  const root = makeRepo();
  const compiled = spawnSync(process.execPath, [cli, "state", "compile", root], { encoding: "utf8" });
  assert.equal(compiled.status, 0, compiled.stderr);
  const dir = join(root, ".krn", "runs", "delivery-loop", "composed");
  mkdirSync(dir, { recursive: true });
  const head = git(root, ["rev-parse", "HEAD"]);
  writeFileSync(join(dir, "state.md"), compiled.stdout.replace(/<fill[^>]*>/g, "done").replace("base=done", `base=${head}`));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| Compose the restart path. | composition probe | this test |\n");

  const checked = spawnSync(process.execPath, [cli, "state", "check"], { cwd: root, encoding: "utf8" });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);

  const resumed = spawnSync(process.execPath, [cli, "state", "resume"], { cwd: root, encoding: "utf8" });
  assert.equal(resumed.status, 0, resumed.stderr);
  assert.match(resumed.stdout, /capsule composed/);
  assert.match(resumed.stdout, /Compose the restart path\./);
  rmSync(root, { recursive: true, force: true });
});

test("public state check observes an interrupted historical ticket without reconciling it", () => {
  const root = makeRepo();
  try {
    const file = join(root, ".krn", "tickets", "query-01.md");
    mkdirSync(join(root, ".krn", "tickets"), { recursive: true });
    writeFileSync(file, [
      "<krn-ticket>", "Id: query-01", "Title: Imported integration", "Status: claimed", "Type: task",
      "Repository-base: main", "Scope: work.txt", "Deciding check: node --test test/check.test.mjs",
      "Contract: test/check.test.mjs:red->green", "Acceptance: explicit recovery only", "Blocked by: none",
      "Claim: worker=lane; session=fixture; at=2020-01-01T00:00:00.000Z; epoch=1; renew=2020-01-01T00:00:00.000Z; duration=1",
      "</krn-ticket>", "",
    ].join("\n"));
    git(root, ["add", ".krn/tickets/query-01.md"]);
    git(root, ["commit", "-q", "-m", "seed historical claim"]);
    const base = git(root, ["rev-parse", "HEAD"]);
    git(root, ["switch", "-q", "-c", "ticket/lane"]);
    writeFileSync(join(root, "work.txt"), "integrated work\n");
    git(root, ["add", "work.txt"]);
    git(root, ["commit", "-q", "-m", "work", "-m", "Ticket: query-01"]);
    const lane = git(root, ["rev-parse", "HEAD"]);
    const diff = execFileSync("git", ["-C", root, "diff", `${base}..${lane}`], { encoding: "utf8" });
    const patch = execFileSync("git", ["-C", root, "patch-id", "--stable"], { input: diff, encoding: "utf8" }).trim().split(/\s+/)[0];
    git(root, ["switch", "-q", "main"]);
    git(root, ["merge", "-q", "--no-ff", "ticket/lane", "-m", "merge historical lane"]);
    const original = readFileSync(file, "utf8").replace("</krn-ticket>",
      `Integration: branch=ticket/lane; sha=${lane}; patch=${patch}\n</krn-ticket>`);
    writeFileSync(file, original);

    const observed = spawnSync(process.execPath, [cli, "state", "check", "--root", root, "--json"], { encoding: "utf8" });
    assert.equal(observed.status, 0, observed.stderr);
    assert.equal(readFileSync(file, "utf8"), original, "state check must not perform implicit Markdown repair");
    assert.deepEqual(reconcileTickets({ root, dirs: [".krn/tickets"] }), ["query-01"],
      "the negative control is a ticket that explicit legacy recovery would close");
    assert.match(readFileSync(file, "utf8"), /^Status: done$/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("doctor renders a human summary by default and JSON with --json", () => {
  const base = mkdtempSync(join(tmpdir(), "krn-doctor-"));
  const env = { ...process.env, CODEX_HOME: join(base, "codex"), KRN_SKILLS_DEST: join(base, "skills"), KRN_BIN_DEST: join(base, "bin"), KRN_OPENCODE_DEST: join(base, "opencode") };
  const text = spawnSync(process.execPath, [cli, "doctor"], { encoding: "utf8", env });
  assert.equal(text.status, 3, `doctor must fail closed on a missing release:\n${text.stdout}${text.stderr}`);
  assert.match(text.stdout, /^filesystem: missing/);
  assert.match(text.stdout, /^loaded: host_session_unobservable/m, "the loaded leg must be reported as host-unobservable, not a pseudo-status");
  const json = spawnSync(process.execPath, [cli, "doctor", "--json"], { encoding: "utf8", env });
  assert.equal(json.status, 3, `doctor --json must fail closed on a missing release:\n${json.stdout}${json.stderr}`);
  const report = JSON.parse(json.stdout);
  assert.equal(report.filesystem.status, "missing");
  assert.equal(report.loaded.status, "host_session_unobservable");
  assert.equal(report.session, undefined, "the hardcoded session pseudo-status must be gone");
  rmSync(base, { recursive: true, force: true });
});

test("state rejects a positional path given together with --root", () => {
  const root = makeRepo();
  const both = spawnSync(process.execPath, [cli, "state", "check", "--root", root, join(root, "nope")], { encoding: "utf8" });
  assert.equal(both.status, 64, both.stdout + both.stderr);
  rmSync(root, { recursive: true, force: true });
});

test("a foreign option names the flag the user typed", () => {
  const root = makeRepo();
  const result = spawnSync(process.execPath, [cli, "lessons", "check", "--root", root, "--strict-recall"], { encoding: "utf8" });
  assert.equal(result.status, 64);
  assert.match(result.stderr, /--strict-recall/);
  assert.ok(!/strictRecall/.test(result.stderr), result.stderr);
  rmSync(root, { recursive: true, force: true });
});
