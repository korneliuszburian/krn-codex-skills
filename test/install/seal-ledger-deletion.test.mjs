import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { EXIT_CODES } from "../../scripts/lib/support/diagnostics.mjs";

// Append-only protects the ledger against replacement; this observer pins the
// other half: rewriting the working copy to drop or bend an entry that the
// committed `HEAD:config/release-digests.json` still records must not launder a
// replacement. The writer is imported dynamically so a missing module fails an
// assertion inside a case, never the test loader.
const loadSeal = async () => {
  try {
    return await import("../../scripts/lib/install/install-seal.mjs");
  } catch {
    return null;
  }
};

const withDir = (body) => {
  const dir = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-seal-deletion-")));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
};

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const DIGEST_C = "c".repeat(64);

const ledgerText = (digests) => `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`;

const ledgerFile = (root) => join(root, "config", "release-digests.json");

const writeLedger = (root, digests) => {
  mkdirSync(join(root, "config"), { recursive: true });
  writeFileSync(ledgerFile(root), ledgerText(digests));
};

const makeRepoText = (base, text) => {
  const repo = join(base, "source");
  mkdirSync(join(repo, "config"), { recursive: true });
  writeFileSync(ledgerFile(repo), text);
  const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];
  execFileSync("git", ["-C", repo, "init", "-q"]);
  execFileSync("git", ["-C", repo, ...identity, "add", "-A"]);
  execFileSync("git", ["-C", repo, ...identity, "commit", "-q", "-m", "ledger"]);
  return fs.realpathSync(repo);
};

const makeRepo = (base, digests) => makeRepoText(base, ledgerText(digests));

test("deleting a committed entry before resealing is refused and the working ledger is untouched", async () => {
  const seal = await loadSeal();
  assert.ok(seal?.sealReleaseDigest, "install-seal.mjs must export sealReleaseDigest");
  withDir((base) => {
    const repo = makeRepo(base, { "commit-a": DIGEST_A });
    writeLedger(repo, {});
    const before = readFileSync(ledgerFile(repo), "utf8");
    assert.throws(
      () => seal.sealReleaseDigest({ root: repo, commit: "commit-a", digest: DIGEST_B }),
      (error) => error?.rule === "seal-ledger-deleted" && error?.exitCode === EXIT_CODES.CORRUPT,
      "a reseal after the committed entry is deleted must refuse as seal-ledger-deleted",
    );
    assert.equal(readFileSync(ledgerFile(repo), "utf8"), before, "the emptied working ledger survives the refused reseal");
  });
});

test("a changed digest for another committed key is refused", async () => {
  const seal = await loadSeal();
  assert.ok(seal?.sealReleaseDigest, "install-seal.mjs must export sealReleaseDigest");
  withDir((base) => {
    const repo = makeRepo(base, { "commit-a": DIGEST_A, "commit-b": DIGEST_B });
    writeLedger(repo, { "commit-a": DIGEST_A, "commit-b": DIGEST_C });
    const before = readFileSync(ledgerFile(repo), "utf8");
    assert.throws(
      () => seal.sealReleaseDigest({ root: repo, commit: "commit-new", digest: DIGEST_B }),
      (error) => error?.rule === "seal-ledger-deleted",
      "a bent digest for a committed key must refuse even when sealing an unrelated commit",
    );
    assert.equal(readFileSync(ledgerFile(repo), "utf8"), before, "the bent working ledger survives the refused seal");
  });
});

test("a working ledger that preserves the committed entries seals and appends a new key", async () => {
  const seal = await loadSeal();
  assert.ok(seal?.sealReleaseDigest, "install-seal.mjs must export sealReleaseDigest");
  withDir((base) => {
    const repo = makeRepo(base, { "commit-a": DIGEST_A });
    const result = seal.sealReleaseDigest({ root: repo, commit: "commit-b", digest: DIGEST_B });
    assert.equal(result.commit, "commit-b");
    assert.equal(result.digest, DIGEST_B);
    const digests = JSON.parse(readFileSync(ledgerFile(repo), "utf8")).digests;
    assert.equal(digests["commit-a"], DIGEST_A, "the committed entry survives the append");
    assert.equal(digests["commit-b"], DIGEST_B, "the new entry is appended");
    const committed = JSON.parse(execFileSync("git", ["-C", repo, "show", "HEAD:config/release-digests.json"], { encoding: "utf8" }));
    assert.deepEqual(committed.digests, { "commit-a": DIGEST_A }, "the append does not rewrite the committed anchor");
  });
});

test("a directory without a committed ledger seals as before", async () => {
  const seal = await loadSeal();
  assert.ok(seal?.sealReleaseDigest, "install-seal.mjs must export sealReleaseDigest");
  withDir((base) => {
    const dir = join(base, "plain");
    mkdirSync(dir, { recursive: true });
    const result = seal.sealReleaseDigest({ root: dir, commit: "commit-a", digest: DIGEST_A });
    assert.equal(result.commit, "commit-a");
    assert.equal(JSON.parse(readFileSync(ledgerFile(dir), "utf8")).digests["commit-a"], DIGEST_A);
  });
});
