import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The committed ledger is the release trust anchor, so its writer is held to
// the same bar as the rest of the harness: append-only, crash-safe, and honest
// about which corruption rule fired. The two subjects are imported dynamically
// so a missing module fails an assertion inside a case, never the test loader.
const loadSeal = async () => {
  try {
    return await import("../../scripts/lib/install/install-seal.mjs");
  } catch {
    return null;
  }
};

const loadInspect = async () => {
  try {
    return await import("../../scripts/lib/install/install-inspect.mjs");
  } catch {
    return null;
  }
};

const withDir = (body) => {
  const dir = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-seal-ledger-")));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
};

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

test("a second seal for the same commit with a different digest is refused", async () => {
  const seal = await loadSeal();
  assert.ok(seal?.sealReleaseDigest, "install-seal.mjs must export sealReleaseDigest");
  withDir((dir) => {
    seal.sealReleaseDigest({ root: dir, commit: "commit-a", digest: DIGEST_A });
    const file = join(dir, "config", "release-digests.json");
    const first = readFileSync(file, "utf8");
    assert.throws(
      () => seal.sealReleaseDigest({ root: dir, commit: "commit-a", digest: DIGEST_B }),
      /seal-mismatched/,
      "a mismatched reseal must refuse instead of silently replacing the entry",
    );
    assert.equal(readFileSync(file, "utf8"), first, "the first entry survives the refused reseal");
    const idempotent = seal.sealReleaseDigest({ root: dir, commit: "commit-a", digest: DIGEST_A });
    assert.equal(idempotent.digest, DIGEST_A);
    assert.equal(readFileSync(file, "utf8"), first, "resealing the same digest leaves the ledger unchanged");
  });
});

test("a crash during the ledger write leaves the previous ledger bytes intact", async () => {
  const seal = await loadSeal();
  assert.ok(seal?.sealReleaseDigest, "install-seal.mjs must export sealReleaseDigest");
  withDir((dir) => {
    const config = join(dir, "config");
    mkdirSync(config, { recursive: true });
    const file = join(config, "release-digests.json");
    const original = `${JSON.stringify({ schema_version: 1, digests: { "seen-commit": "f".repeat(64) } }, null, 2)}\n`;
    writeFileSync(file, original);
    const failure = new Error("crash after a half write");
    assert.throws(
      () => seal.sealReleaseDigest({
        root: dir,
        commit: "new-commit",
        digest: DIGEST_A,
        ops: {
          write: (handle, text) => {
            writeSync(handle, text.slice(0, Math.floor(text.length / 2)));
            throw failure;
          },
        },
      }),
      (error) => error === failure,
      "the injected crash must propagate",
    );
    assert.equal(readFileSync(file, "utf8"), original, "the untouched ledger survives the torn temp");
    assert.deepEqual(readdirSync(config), ["release-digests.json"], "the partial temp is removed");
  });
});

const makeRepo = (base, ledgerText) => {
  const repo = join(base, "source");
  mkdirSync(join(repo, "config"), { recursive: true });
  writeFileSync(join(repo, "config", "release-digests.json"), ledgerText);
  const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];
  execFileSync("git", ["-C", repo, "init", "-q"]);
  execFileSync("git", ["-C", repo, ...identity, "add", "-A"]);
  execFileSync("git", ["-C", repo, ...identity, "commit", "-q", "-m", "ledger"]);
  return fs.realpathSync(repo);
};

const makeRelease = (inspect, release, commit) => {
  mkdirSync(join(release, "payload"), { recursive: true });
  writeFileSync(join(release, "payload", "entry.txt"), "original\n");
  const digest = inspect.digestTree(release).digest;
  writeFileSync(
    join(release, ".krn-release.json"),
    `${JSON.stringify({ schemaVersion: 1, commit, digest, runtimePaths: [], source: "observer" }, null, 2)}\n`,
  );
  return digest;
};

test("a malformed committed ledger carries ledger-malformed and is not thrown at the caller", async () => {
  const inspect = await loadInspect();
  assert.ok(inspect?.inspectInstall, "install-inspect.mjs must export inspectInstall");
  const seal = await loadSeal();
  assert.ok(seal?.sealReleaseDigest, "install-seal.mjs must export sealReleaseDigest");
  withDir((base) => {
    const home = join(base, "codex");
    mkdirSync(home, { recursive: true });
    const repo = makeRepo(base, JSON.stringify({ schema_version: 1, digests: ["not", "a", "map"] }));
    let report;
    assert.doesNotThrow(() => {
      report = inspect.inspectInstall({ codexHome: home, source: repo });
    }, "inspectInstall must not throw out on a malformed ledger");
    assert.equal(report.filesystem.rule, "ledger-malformed");
    assert.equal(report.filesystem.status, "ledger_malformed");
    assert.notEqual(report.filesystem.status, "broken_link");
    writeFileSync(join(repo, "config", "release-digests.json"), `${JSON.stringify({ schema_version: 1, digests: {} }, null, 2)}\n`);
    assert.doesNotThrow(
      () => seal.sealReleaseDigest({ root: repo, commit: "commit-a", digest: DIGEST_A }),
      "a malformed committed anchor must not crash the writer",
    );
    assert.equal(
      JSON.parse(readFileSync(join(repo, "config", "release-digests.json"), "utf8")).digests["commit-a"],
      DIGEST_A,
      "the writer falls back and appends over a malformed committed anchor",
    );
  });
});

test("an unreadable committed ledger carries ledger-unreadable", async () => {
  const inspect = await loadInspect();
  assert.ok(inspect?.inspectInstall, "install-inspect.mjs must export inspectInstall");
  withDir((base) => {
    const home = join(base, "codex");
    mkdirSync(home, { recursive: true });
    const repo = makeRepo(base, "{ this is not json\n");
    let report;
    assert.doesNotThrow(() => {
      report = inspect.inspectInstall({ codexHome: home, source: repo });
    }, "inspectInstall must not throw out on an unreadable ledger");
    assert.equal(report.filesystem.rule, "ledger-unreadable");
    assert.equal(report.filesystem.status, "ledger_unreadable");
  });
});

test("a malformed release-local ledger is surfaced as a distinct status, not broken_link", async () => {
  const inspect = await loadInspect();
  assert.ok(inspect?.inspectInstall, "install-inspect.mjs must export inspectInstall");
  withDir((base) => {
    const home = join(base, "codex");
    const release = join(home, "krn", "releases", "bad-ledger");
    makeRelease(inspect, release, "bad-ledger");
    mkdirSync(join(release, "config"), { recursive: true });
    writeFileSync(join(release, "config", "release-digests.json"), JSON.stringify({ schema_version: 1, digests: 42 }));
    mkdirSync(join(home, "krn"), { recursive: true });
    symlinkSync(release, join(home, "krn", "current"));
    // The source checkout has no committed ledger, so the release-local copy decides.
    const repo = makeRepo(base, JSON.stringify({ schema_version: 1, digests: {} }));
    const report = inspect.inspectInstall({ codexHome: home, source: repo });
    assert.equal(report.filesystem.rule, "ledger-malformed");
    assert.equal(report.filesystem.status, "ledger_malformed");
    assert.notEqual(report.filesystem.status, "broken_link");
  });
});
