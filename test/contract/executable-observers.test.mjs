import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runGit } from "../../scripts/lib/kernel/git.mjs";

// The builder is imported lazily so the base overlay reports a real assertion
// failure, not a module-load setup error, when it does not exist yet.
const loadBuilder = async () => {
  try {
    return await import("../../scripts/lib/ticket/merge-message.mjs");
  } catch {
    return null;
  }
};

const WORKER_BODY = [
  "feat(ticket): add the surface (sh-1)",
  "",
  "Ticket: sh-1",
  "Change-contract: test/contract/executable-observers.test.mjs:red->green",
  "Recall: test/contract/executable-observers.test.mjs => scripts/lib/ticket/merge-message.mjs",
  "At-risk: test/contract/executable-observers.test.mjs",
  "Applicability-change: A new falsifier must be shown failing first.",
].join("\n");

const git = (root, args) => {
  const result = runGit(root, args);
  assert.ok(result.ok, `git ${args.join(" ")}: ${result.stderr}`);
  return result.out;
};

const commit = (root, message, { allowEmpty = false } = {}) => {
  git(root, ["add", "-A"]);
  const args = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message];
  if (allowEmpty) args.splice(5, 0, "--allow-empty");
  return git(root, args);
};

const headBody = (root) => git(root, ["log", "-1", "--format=%B"]).trimEnd();

function withRepo(run) {
  const root = mkdtempSync(path.join(tmpdir(), "krn-merge-message-"));
  try {
    git(root, ["init", "-q"]);
    writeFileSync(path.join(root, "worker.mjs"), "export const worker = 1;\n");
    commit(root, WORKER_BODY);
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("a squash commit built from the worker body carries every trailer", async () => {
  const builder = await loadBuilder();
  assert.ok(builder, "scripts/lib/ticket/merge-message.mjs must exist");
  withRepo((root) => {
    const squash = builder.squashMessage({ subject: "feat(ticket): add the surface (sh-1)", workerBody: headBody(root) });
    commit(root, squash, { allowEmpty: true });
    const squashBody = headBody(root);
    assert.deepEqual(builder.squashTrailerErrors(WORKER_BODY, squashBody), []);
    for (const trailer of ["Ticket:", "Change-contract:", "Recall:", "At-risk:", "Applicability-change:"]) {
      assert.ok(builder.trailersFromCommitBody(squashBody).some((entry) => entry.key === trailer), `the squash body must carry ${trailer}`);
    }
  });
});

test("an integration merge keeps the worker commit and carries the template", async () => {
  const builder = await loadBuilder();
  assert.ok(builder, "scripts/lib/ticket/merge-message.mjs must exist");
  withRepo((root) => {
    const base = git(root, ["rev-parse", "HEAD"]);
    git(root, ["checkout", "-q", "-b", "lane/sh-1"]);
    writeFileSync(path.join(root, "lane.mjs"), "export const lane = 1;\n");
    commit(root, "feat(ticket): lane work (sh-1)");
    git(root, ["checkout", "-q", "-b", "integration", base]);
    writeFileSync(path.join(root, "integration.mjs"), "export const integration = 1;\n");
    commit(root, "chore: integration tip");
    const message = builder.integrationMergeMessage({
      branch: "lane/sh-1",
      ticket: "sh-1",
      contract: "test/contract/executable-observers.test.mjs:red->green",
    });
    git(root, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "merge", "--no-ff", "-q", "-m", message, "lane/sh-1"]);
    assert.equal(headBody(root), message);
    assert.match(git(root, ["rev-list", "--count", "HEAD"]), /^[2-9]/);
    assert.match(git(root, ["log", "--format=%s", "-1", "lane/sh-1"]), /feat\(ticket\)/);
  });
});

test("a dropped trailer is named, not tolerated", async () => {
  const builder = await loadBuilder();
  assert.ok(builder, "scripts/lib/ticket/merge-message.mjs must exist");
  const dropped = builder.squashMessage({ subject: "feat: x (sh-1)", workerBody: WORKER_BODY }).replace(/^Recall:.*$/m, "");
  assert.deepEqual(builder.squashTrailerErrors(WORKER_BODY, dropped), ["the squash body dropped Recall:"]);
});

test("the squash builder refuses a worker body without the required trailers", async () => {
  const builder = await loadBuilder();
  assert.ok(builder, "scripts/lib/ticket/merge-message.mjs must exist");
  assert.throws(() => builder.squashMessage({ subject: "feat: x", workerBody: "feat: x\n\nRecall: a => b" }), /missing Ticket:/);
});
