import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

// The owner is imported lazily so the base overlay reports a real assertion
// failure, not a module-load setup error, when the owner does not exist yet.
const loadDigest = async () => {
  try {
    return await import("../../scripts/lib/kernel/digest.mjs");
  } catch {
    return null;
  }
};

function trackedSources() {
  const listing = execFileSync("git", ["-C", root, "ls-files", "-z"], { encoding: "utf8" });
  return listing
    .split("\0")
    .filter(Boolean)
    .filter((relative) => /\.(mjs|js)$/.test(relative))
    .filter((relative) => relative.startsWith("scripts/"))
    .sort();
}

// A sha256 or blob-sha1 hash may be created only by the kernel digest owner.
// The observer is exported so the check itself is falsifiable against a fixture
// that re-introduces a hand-rolled hash.
export function digestDuplicateOwners(entries) {
  return entries
    .filter(([relative, text]) => relative !== "scripts/lib/kernel/digest.mjs" && /createHash\(\s*["']sha(?:256|1)["']\s*\)/.test(text))
    .map(([relative]) => relative)
    .sort();
}

test("content digests have exactly one kernel owner", () => {
  const owners = trackedSources().filter((relative) => read(relative).includes("export function sha256Hex"));
  assert.deepEqual(owners, ["scripts/lib/kernel/digest.mjs"], "sha256 must live only in the kernel");
  const entries = trackedSources().map((relative) => [relative, read(relative)]);
  assert.deepEqual(digestDuplicateOwners(entries), [], "the git blob sha1 must live only in the kernel digest owner");
});

test("the kernel digest owner matches the sha256 and git blob fixtures", async () => {
  const digest = await loadDigest();
  assert.ok(digest, "scripts/lib/kernel/digest.mjs must exist");
  assert.equal(digest.sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(digest.sha256Hex("a", "b", "c"), digest.sha256Hex("abc"), "concatenated parts are one digest");
  assert.equal(digest.gitBlobHash(Buffer.from("abc")), "f2ba8f84ab5c1bce84a7b441cb1959cfc7093b7f");
});

test("the observer rejects a source that re-introduces a hand-rolled hash", () => {
  assert.deepEqual(
    digestDuplicateOwners([
      ["scripts/lib/kernel/digest.mjs", 'createHash("sha256")'],
      ["scripts/lib/other.mjs", 'createHash("sha256")'],
      ["scripts/lib/third.mjs", "export const x = 1;"],
    ]),
    ["scripts/lib/other.mjs"],
  );
});

test("the retired local digest helpers are gone", () => {
  assert.ok(!read("scripts/lib/install/skills-export.mjs").includes("blobHash ="), "the export blob helper must be retired");
  assert.ok(!read("scripts/lib/install/install-inspect.mjs").includes("crypto"), "the release tree digest must not reach for crypto directly");
});
