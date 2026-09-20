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
const loadCli = async () => {
  try {
    return await import("../../scripts/lib/kernel/cli.mjs");
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

test("the CLI argument grammar has exactly one kernel owner", () => {
  const sources = trackedSources();
  const owners = sources.filter((relative) => read(relative).includes("export function parseCliArgs"));
  assert.deepEqual(owners, ["scripts/lib/kernel/cli.mjs"], "the argument grammar must live only in the kernel");
  const vocabularies = sources.filter((relative) => read(relative).includes("unknown option: "));
  assert.deepEqual(vocabularies, ["scripts/lib/kernel/cli.mjs"], "the grammar's refusal vocabulary must live only in the kernel");
});

test("the kernel parser applies the shared grammar", async () => {
  const cli = await loadCli();
  assert.ok(cli, "scripts/lib/kernel/cli.mjs must exist");
  const { options, positional } = cli.parseCliArgs(
    ["skill", "--json", "--root", ".", "--changed", "a, b", "--changed", "c", "--symbol", "x,y"],
    {
      booleans: { "--json": "json" },
      values: { "--root": "root" },
      lists: { "--changed": "changed", "--symbol": "symbols" },
      defaults: { json: false, yes: false },
    },
  );
  assert.deepEqual(positional, ["skill"]);
  assert.equal(options.json, true);
  assert.equal(options.root, ".");
  assert.deepEqual(options.changed, ["a", "b", "c"]);
  assert.deepEqual(options.symbols, ["x", "y"]);
  assert.deepEqual(cli.parseCliArgs([], { defaults: { json: false } }).options, { json: false });
});

test("a duplicate, missing, or unknown flag is refused through the caller's failure", async () => {
  const cli = await loadCli();
  assert.ok(cli, "scripts/lib/kernel/cli.mjs must exist");
  const refusals = [];
  const fail = (message) => refusals.push(message);
  cli.parseCliArgs(["--root", "a", "--root", "b"], { values: { "--root": "root" }, fail });
  cli.parseCliArgs(["--root"], { values: { "--root": "root" }, fail });
  cli.parseCliArgs(["--nope"], { fail });
  assert.deepEqual(refusals, [
    "duplicate option: --root",
    "--root requires a value",
    "unknown option: --nope",
  ]);
});

test("the entrypoints parse through the owner", () => {
  for (const entry of ["scripts/krn.mjs", "scripts/catalog.mjs"]) {
    assert.ok(read(entry).includes('from "./lib/kernel/cli.mjs"'), `${entry} must import the kernel CLI owner`);
    assert.ok(read(entry).includes("parseCliArgs("), `${entry} must parse through the owner`);
  }
});
