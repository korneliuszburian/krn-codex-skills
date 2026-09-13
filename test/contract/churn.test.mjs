import assert from "node:assert/strict";
import test from "node:test";

import { churnHot } from "../../scripts/lib/contract/churn.mjs";

test("churnHot counts matches in a single git pass", () => {
  const git = (_root, args) => {
    if (args[0] !== "log") return { ok: false, out: "" };
    return { ok: true, out: "scripts/hot.mjs\0scripts/cold.mjs\0scripts/hot.mjs\0" };
  };
  assert.deepEqual(churnHot({ root: ".", git, sha: "abc", files: ["scripts/hot.mjs", "scripts/cold.mjs"] }), ["scripts/hot.mjs"]);
});

test("churnHot anchors the window to the evaluated commit, not wall time", () => {
  let seen = "";
  const git = (_root, args) => {
    if (args[0] === "show") return { ok: true, out: "1000000000\n" };
    if (args[0] === "log") {
      seen = args[1];
      return { ok: true, out: "scripts/hot.mjs\0scripts/hot.mjs\0" };
    }
    return { ok: false, out: "" };
  };
  assert.deepEqual(churnHot({ root: ".", git, sha: "abc", files: ["scripts/hot.mjs"] }), ["scripts/hot.mjs"]);
  assert.equal(seen, `--since=@${1000000000 - 90 * 86400}`, "the window starts at the commit time, so an old commit is judged by its own history");
});

test("churnHot is empty without files, unavailable, or falls back for a root commit", () => {
  assert.deepEqual(churnHot({ root: ".", git: () => ({ ok: false, out: "" }), sha: "abc", files: [] }), []);
  assert.deepEqual(churnHot({ root: ".", git: () => ({ ok: false, out: "" }), sha: "abc", files: ["scripts/hot.mjs"] }), []);
  const rootCommit = (_root, args) => {
    if (args[0] !== "log") return { ok: false, out: "" };
    return args.includes("abc^") ? { ok: false, out: "" } : { ok: true, out: "scripts/hot.mjs\0scripts/hot.mjs\0" };
  };
  assert.deepEqual(churnHot({ root: ".", git: rootCommit, sha: "abc", files: ["scripts/hot.mjs"] }), ["scripts/hot.mjs"], "a root commit falls back to the commit itself");
});
