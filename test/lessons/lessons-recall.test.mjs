import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkLessons, parseLessons } from "../../scripts/lib/lessons/lessons.mjs";
import { recallUsage } from "../../scripts/lib/lessons/lessons-recall.mjs";
import { runGit } from "../../scripts/lib/support/git-cli.mjs";

const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));

const HEADER = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n";
const ROW = "| Guards | probe | `test:state` | | | path:scripts/x.mjs |\n";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "krn-recall-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), HEADER + ROW);
  return root;
}

function git(root, args) {
  return runGit(root, ["-c", "user.email=lab@krn.local", "-c", "user.name=lab", ...args]);
}

function commit(root, message) {
  assert.equal(git(root, ["add", "-A"]).ok, true);
  assert.equal(git(root, ["commit", "-q", "-m", message]).ok, true, `commit failed: ${message}`);
}

function usageFor(root) {
  const { rows } = parseLessons(join(root, "docs", "research", "workflow-lessons.md"));
  return recallUsage(root, runGit, rows);
}

const withRepo = (body) => {
  const root = makeRoot();
  try {
    git(root, ["init", "-q"]);
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("recallUsage counts an unbound trigger match as a hit with zero binds", () => {
  withRepo((root) => {
    commit(root, "seed");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
    commit(root, "feat: add x");
    assert.deepEqual(usageFor(root).get("Guards"), { hits: 1, binds: 0 });
  });
});

test("recallUsage counts a reconstructed trailer as both a hit and a bind", () => {
  withRepo((root) => {
    commit(root, "seed");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
    commit(root, "feat: add x\n\nRecall: test:state => scripts/x.mjs");
    assert.deepEqual(usageFor(root).get("Guards"), { hits: 1, binds: 1 });
  });
});

test("recallUsage reports hits and binds for a row with a mix of bound and unbound hits", () => {
  withRepo((root) => {
    commit(root, "seed");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
    commit(root, "feat: add x");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x2\n");
    commit(root, "fix: touch x\n\nRecall: test:state => scripts/x.mjs");
    assert.deepEqual(usageFor(root).get("Guards"), { hits: 2, binds: 1 });
  });
});

test("checkLessons warns dead-trigger only once a row fires three times without binding", () => {
  withRepo((root) => {
    commit(root, "seed");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
    commit(root, "feat: add x");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x2\n");
    commit(root, "fix: touch x");
    assert.ok(
      !checkLessons({ root }).warnings.some((warning) => warning.includes("dead-trigger")),
      "two unbound hits are not yet dead",
    );
    writeFileSync(join(root, "scripts", "x.mjs"), "// x3\n");
    commit(root, "fix: touch x again");
    assert.ok(
      checkLessons({ root }).warnings.some((warning) => warning.includes("dead-trigger")),
      JSON.stringify(checkLessons({ root }).warnings),
    );
  });
});

test("memory usage prints both the bind and hit counts for a row", () => {
  withRepo((root) => {
    commit(root, "seed");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
    commit(root, "feat: add x");
    writeFileSync(join(root, "scripts", "x.mjs"), "// x2\n");
    commit(root, "fix: touch x\n\nRecall: test:state => scripts/x.mjs");
    const result = spawnSync(process.execPath, [cli, "memory", "usage", "--root", root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /1\tGuards\t2 hits/);
  });
});
