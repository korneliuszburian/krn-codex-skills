import assert from "node:assert/strict";
import test from "node:test";

import { squashMessage, squashTrailerErrors } from "../../scripts/lib/ticket/merge-message.mjs";

const WORKER = [
  "feat(ticket): add the surface (sh-1)",
  "",
  "Ticket: sh-1",
  "Change-contract: test/contract/executable-observers.test.mjs:red->green",
  "Recall: test/contract/executable-observers.test.mjs => scripts/lib/ticket/merge-message.mjs",
  "At-risk: test/contract/executable-observers.test.mjs",
  "Applicability-change: A new falsifier must be shown failing first.",
].join("\n");

test("a squash body carries every trailer the worker commit carried", () => {
  const squash = squashMessage({ subject: "feat(ticket): add the surface (sh-1)", workerBody: WORKER });
  assert.deepEqual(squashTrailerErrors(WORKER, squash), []);
});

test("a squash body that drops a harness-read trailer is named", () => {
  const dropped = squashMessage({ subject: "feat(ticket): add the surface (sh-1)", workerBody: WORKER }).replace(/^At-risk:.*$/m, "");
  assert.deepEqual(squashTrailerErrors(WORKER, dropped), ["the squash body dropped At-risk:"]);
});

test("the builder refuses a worker commit without the required trailers", () => {
  assert.throws(() => squashMessage({ subject: "feat: x", workerBody: "feat: x" }), /missing Ticket:/);
});
