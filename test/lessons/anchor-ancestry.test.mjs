import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const lessons = readFileSync(join(root, "docs/research/workflow-lessons.md"), "utf8");

const rows = lessons.split("\n").filter((line) => line.startsWith("| ") && !line.startsWith("| Statement"));
const anchors = rows.flatMap((row) => {
  const cells = row.split("|").map((cell) => cell.trim());
  const candidates = [cells[5] ?? "", cells[7] ?? ""];
  return candidates.flatMap((cell) => [...cell.matchAll(/@([0-9a-f]{7})/g)].map((match) => match[1]));
});

const isAncestor = (sha) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "HEAD"], { cwd: root, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

test("every lesson anchor resolves to an ancestor of HEAD", () => {
  assert.ok(anchors.length >= 1, "the lessons file must carry at least one anchor");
  const missing = anchors.filter((sha) => !isAncestor(sha));
  assert.deepEqual(missing, [], `anchors not reachable from HEAD: ${missing.join(", ")}`);
});

test("the check flags an anchor that is not an ancestor", () => {
  assert.equal(isAncestor("0".repeat(40).slice(0, 7)), false);
});
