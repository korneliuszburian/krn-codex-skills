import assert from "node:assert/strict";
import test from "node:test";

import { churnHot } from "../scripts/lib/churn.mjs";

test("churnHot marks files with enough commits inside the window", () => {
  const git = (_root, args) => {
    if (args[0] === "rev-list") return { ok: true, out: args[args.length - 1] === "scripts/hot.mjs" ? "3" : "1" };
    return { ok: false, out: "" };
  };
  assert.deepEqual(churnHot({ root: ".", git, sha: "abc", files: ["scripts/hot.mjs", "scripts/cold.mjs"] }), ["scripts/hot.mjs"]);
  const unavailable = () => ({ ok: false, out: "" });
  assert.deepEqual(churnHot({ root: ".", git: unavailable, sha: "abc", files: ["scripts/hot.mjs"] }), []);
});
