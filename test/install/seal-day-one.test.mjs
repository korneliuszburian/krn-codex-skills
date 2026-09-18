import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The observer is deliberately host-independent: it builds its own temporary
// CODEX_HOME and its own source copy, so nothing reads or writes the host's
// `~/.codex/krn/current`. Its red is the day-one assumption: apply used to
// consult the currently linked release before installing a sealed target.
const { verifyRelease } = await import("../../scripts/lib/install/install-inspect.mjs");
const { applyInstall, createInstallPlan, sealCurrentRelease } = await import("../../scripts/lib/install/install-release.mjs");
const { hostCapabilities } = await import("../../scripts/lib/install/host-capabilities.mjs");

const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const skip = hostCapabilities().gitChild ? false : "git is unavailable";
const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];

const git = (repo, args) => execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();

const cleanSource = (base) => {
  const copy = join(base, "source");
  mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  execFileSync("git", ["-C", copy, ...identity, "add", "-A"]);
  execFileSync("git", ["-C", copy, ...identity, "commit", "-q", "-m", "seed"]);
  return fs.realpathSync(copy);
};

const withBase = (body) => {
  const base = fs.realpathSync(mkdtempSync(join(tmpdir(), "krn-seal-day-one-")));
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

const sourceLedger = (source) => {
  const file = join(source, "config", "release-digests.json");
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
};

const overridePath = (home, commit) => join(home, "krn", "install-overrides", `${commit}.json`);

test("apply installs a sealed target despite a corrupt linked release and never writes the source ledger", { skip }, () => {
  withBase((base) => {
    const source = cleanSource(base);
    const home = join(base, "codex");

    // Day one with an empty committed ledger: apply must leave the source
    // bytes exactly as they were, and the unsealed target is recorded as an
    // explicit override outside the release.
    const dayOneLedgerBefore = sourceLedger(source);
    assert.ok(dayOneLedgerBefore, "the day-one source carries the committed ledger");
    assert.deepEqual(JSON.parse(dayOneLedgerBefore).digests, {}, "the day-one ledger has no entries");
    const dayOne = createInstallPlan({ source, cwd: source, codexHome: home });
    applyInstall(dayOne, { allowUnsealed: true });
    assert.ok(sourceLedger(source).equals(dayOneLedgerBefore), "apply must not write the empty source ledger");
    assert.ok(fs.existsSync(overridePath(home, dayOne.commit)), "an unsealed target records the override");

    // The linked release is now unverifiable. Nothing about installing a
    // sealed target may depend on the host's currently linked release.
    fs.rmSync(join(dayOne.release, ".krn-release.json"), { force: true });
    assert.throws(
      () => verifyRelease(dayOne.release, dayOne.commit, { requireSealed: false }),
      (error) => error.rule === "release-corrupt",
    );

    // Advance the source and commit a ledger entry that seals the new target's
    // bytes (sealed by value, since committing the ledger moves HEAD).
    fs.appendFileSync(join(source, "scripts", "krn.mjs"), "\n");
    git(source, [...identity, "commit", "-q", "-am", "advance"]);
    sealCurrentRelease({ root: source, source, cwd: source, codexHome: home });
    git(source, [...identity, "add", "config/release-digests.json"]);
    git(source, [...identity, "commit", "-q", "-m", "seal"]);

    const ledgerBefore = sourceLedger(source);
    assert.ok(ledgerBefore, "the committed target ledger is non-empty");
    const plan = createInstallPlan({ source, cwd: source, codexHome: home });

    // Base refuses here in preflightCurrent with release-corrupt because the
    // linked release is unverifiable; a sealed target must install anyway.
    applyInstall(plan, { allowUnsealed: true });

    assert.ok(sourceLedger(source).equals(ledgerBefore), "apply must not modify the source ledger");
    assert.equal(fs.realpathSync(plan.current), fs.realpathSync(plan.release), "apply switches current to the target");
    assert.equal(
      fs.existsSync(overridePath(home, plan.commit)),
      false,
      "a target sealed in the committed ledger records no override",
    );
  });
});
