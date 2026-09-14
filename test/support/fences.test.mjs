import assert from "node:assert/strict";
import test from "node:test";

import { fenceLines, unbalancedFence, unfencedLines } from "../../scripts/lib/support/fences.mjs";

test("CRLF fences open and close", () => {
  assert.deepEqual(fenceLines("```\r\nx\r\n```\r\n").map((entry) => entry.fenced), [true, true, true, false]);
  assert.deepEqual(unfencedLines("```\r\nx\r\n```\r\n").map((entry) => entry.line), [""]);
  assert.equal(unbalancedFence("```\r\nx\r\n"), true);
  assert.equal(unbalancedFence("```\r\nx\r\n```\r\n"), false);
});

test("tilde and backtick fences do not mix", () => {
  assert.deepEqual(unfencedLines("~~~\n```\n[x](y)\n~~~\n").map((entry) => entry.line).filter(Boolean), []);
});
