import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { digestTree, inspectInstall, verifyRelease } from "../../scripts/lib/install/install-inspect.mjs";

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));

const withBase = (body) => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-seal-")));
  const previous = {};
  for (const key of ["KRN_SKILLS_DEST", "KRN_BIN_DEST", "KRN_OPENCODE_DEST"]) {
    previous[key] = process.env[key];
    process.env[key] = join(base, key.toLowerCase());
  }
  try {
    body(base);
  } finally {
    for (const key of Object.keys(previous)) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    rmSync(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  }
};

const metadata = (commit, digest) =>
  `${JSON.stringify({ schemaVersion: 1, commit, digest, runtimePaths: [], source: "observer" }, null, 2)}\n`;

const makeRelease = (release, commit) => {
  mkdirSync(join(release, "payload"), { recursive: true });
  writeFileSync(join(release, "payload", "entry.txt"), "original\n");
  const digest = digestTree(release).digest;
  writeFileSync(join(release, ".krn-release.json"), metadata(commit, digest));
  return digest;
};

const seal = (release, commit, digest) => {
  mkdirSync(join(release, "config"), { recursive: true });
  writeFileSync(
    join(release, "config", "release-digests.json"),
    `${JSON.stringify({ schema_version: 1, digests: { [commit]: digest } }, null, 2)}\n`,
  );
};

test("verifyRelease refuses a release whose tree digest is not in the ledger", () => {
  withBase((base) => {
    const release = join(base, "unsealed");
    makeRelease(release, "unsealed-commit");
    assert.throws(() => verifyRelease(release, "unsealed-commit"), /digest-unsealed/);
  });
});

test("a sealed release passes verification", () => {
  withBase((base) => {
    const release = join(base, "sealed");
    const digest = makeRelease(release, "sealed-commit");
    seal(release, "sealed-commit", digest);
    assert.equal(verifyRelease(release, "sealed-commit").commit, "sealed-commit");
  });
});

test("rewriting a release file and its metadata digest still fails the seal", () => {
  withBase((base) => {
    const release = join(base, "tampered");
    const digest = makeRelease(release, "tamper-commit");
    seal(release, "tamper-commit", digest);
    writeFileSync(join(release, "payload", "entry.txt"), "rewritten\n");
    const rewritten = digestTree(release).digest;
    writeFileSync(join(release, ".krn-release.json"), metadata("tamper-commit", rewritten));
    assert.throws(() => verifyRelease(release, "tamper-commit"), /digest-unsealed/);
  });
});

test("doctor reports an unsealed current release", () => {
  withBase((base) => {
    const home = join(base, "codex");
    const release = join(home, "krn", "releases", "doctor-commit");
    makeRelease(release, "doctor-commit");
    symlinkSync(release, join(home, "krn", "current"));
    const report = inspectInstall({ codexHome: home });
    assert.equal(report.filesystem.status, "digest_unsealed");
    assert.equal(report.filesystem.rule, "digest-unsealed");
  });
});
