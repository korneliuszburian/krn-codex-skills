import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

test("the validation workflow runs on every main push as well as pull requests", () => {
  const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "validate.yml"), "utf8");
  assert.match(workflow, /^\s{2}pull_request:\s*$/m, "must run on pull_request");
  assert.match(workflow, /^\s{2}push:\s*$/m, "must run on push");
  assert.match(workflow, /^\s{4}branches:\s*\[main\]\s*$/m, "the push trigger must target main");
  assert.match(workflow, /group:\s*validate-\$\{\{\s*github\.ref\s*\}\}/, "concurrency must key on the ref so pushes and PRs do not collide");
});
