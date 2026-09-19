import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const exists = (relative) => fs.existsSync(path.join(root, relative));

const DEAD = [
  "docs/research/harness-gap-register.md",
  "docs/research/typed-judgement-and-model-landscape.md",
  "docs/research/mattpocock-skills-deep-audit.md",
  "docs/research/unlazy-codex-port.md",
  "docs/research/unslop-codex-port.md",
];

test("research pages with no reader are deleted", () => {
  for (const relative of DEAD) {
    assert.ok(!exists(relative), `${relative} must be deleted`);
  }
});

test("the research index no longer lists a deleted page", () => {
  const index = fs.readFileSync(path.join(root, "docs/research/README.md"), "utf8");
  for (const relative of DEAD) {
    assert.ok(!index.includes(relative), `the index must not cite ${relative}`);
  }
});
