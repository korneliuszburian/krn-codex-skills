import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

test("every action in the validation workflow is pinned to a 40-hex commit SHA", () => {
  const workflow = read(".github/workflows/validate.yml");
  const uses = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map((match) => match[1]);
  assert.ok(uses.length >= 2, `expected the workflow to reference actions, found ${uses.length}`);
  for (const ref of uses) {
    assert.match(ref, /^[^@\s]+@[0-9a-f]{40}$/, `${ref} must be pinned to a full 40-hex commit SHA`);
  }
});

test("the workflow reads Node from a committed exact .node-version file", () => {
  const workflow = read(".github/workflows/validate.yml");
  assert.match(workflow, /node-version-file:\s*\.\/?node-version(?:\s|$)/m, "setup-node must read .node-version");
  assert.doesNotMatch(workflow, /^\s*node-version:\s*\d+/m, "the Node version must not float as a bare major");
  const pinned = read(".node-version").trim();
  assert.match(pinned, /^\d+\.\d+\.\d+$/, `.node-version must name an exact version, found "${pinned}"`);
});

test("the .node-version line agrees with the package.json engine floor", () => {
  const pinned = read(".node-version").trim();
  const engines = JSON.parse(read("package.json")).engines?.node;
  const floor = /(\d+)/.exec(String(engines))?.[1];
  assert.equal(
    pinned.split(".")[0],
    floor,
    `.node-version major ${pinned} must match the engines.node floor ${engines}`,
  );
});

test("dependabot cools down fresh github-actions releases for at least seven days", () => {
  const config = read(".github/dependabot.yml");
  assert.match(config, /^version:\s*2\s*$/m, "dependabot config must declare version 2");
  const blocks = config.split(/\n(?=\s*-\s*package-ecosystem:)/);
  const actions = blocks.filter((block) => /package-ecosystem:\s*["']?github-actions["']?/.test(block));
  assert.equal(actions.length, 1, `expected one github-actions update entry, found ${actions.length}`);
  const days = Number(/default-days:\s*(\d+)/.exec(actions[0])?.[1]);
  assert.ok(Number.isFinite(days) && days >= 7, `github-actions cooldown must be at least 7 days, found ${days}`);
});
