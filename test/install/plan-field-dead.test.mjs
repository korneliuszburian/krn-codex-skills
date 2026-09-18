import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

// The plan field under test has no reader, so the observer is the only consumer
// that can justify it. This file excludes itself from the reader scan because it
// has to spell the field to look for it.
const sourceRoot = fileURLToPath(new URL("../../", import.meta.url));
const observer = fileURLToPath(new URL("./plan-field-dead.test.mjs", import.meta.url));
const releaseModule = "scripts/lib/install/install-release.mjs";

// A throwaway checkout in the shape the install suites use: archive the resolved
// commit, init, commit. The validator is a no-op because this tree is a fixture,
// not the repository whose own validate gate runs before an install.
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "krn-plan-field-"));
  const copy = path.join(base, "source");
  fs.mkdirSync(copy);
  const archive = execFileSync("git", ["-C", sourceRoot, "archive", "HEAD"], { maxBuffer: 64 * 1024 * 1024 });
  execFileSync("tar", ["-x", "-C", copy], { input: archive });
  execFileSync("git", ["-C", copy, "init", "-q"]);
  fs.writeFileSync(path.join(copy, "scripts", "validate.mjs"), "process.exit(0);\n");
  const identity = ["-c", "user.email=lab@krn.local", "-c", "user.name=lab"];
  execFileSync("git", ["-C", copy, ...identity, "add", "-A"]);
  execFileSync("git", ["-C", copy, ...identity, "commit", "-q", "-m", "seed"]);
  return { base, copy: fs.realpathSync(copy) };
}

function walk(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(full));
    else if (entry.isFile()) found.push(full);
  }
  return found;
}

test("the install plan publishes no capabilities field without a reader", async () => {
  const { base, copy } = fixture();
  try {
    const { createInstallPlan } = await import("../../scripts/lib/install/install-release.mjs");
    const plan = createInstallPlan({ source: copy, cwd: copy, codexHome: path.join(base, "codex") });
    assert.ok(!("capabilities" in plan), "createInstallPlan must not publish a capabilities field with zero readers");
  } finally {
    fs.rmSync(base, { recursive: true, force: true, maxRetries: 50, retryDelay: 100 });
  }
});

test("no install path reads a capabilities field", () => {
  const reader = /\.capabilities\b/;
  const offenders = [];
  for (const dir of ["scripts", "test"]) {
    for (const file of walk(path.join(sourceRoot, dir))) {
      if (file === observer) continue;
      if (reader.test(fs.readFileSync(file, "utf8"))) offenders.push(path.relative(sourceRoot, file));
    }
  }
  assert.deepEqual(offenders, [], `the capabilities field has no reader, but these files read it: ${offenders.join(", ")}`);
});

test("install-release no longer names the capability probe", () => {
  const source = fs.readFileSync(path.join(sourceRoot, releaseModule), "utf8");
  assert.doesNotMatch(source, /hostCapabilities/, "install-release must not import or call hostCapabilities");
});
