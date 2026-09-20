import assert from "node:assert/strict";
import test from "node:test";

import { integrationMergeMessage, trailersFromCommitBody } from "../../scripts/lib/ticket/merge-message.mjs";

const message = () =>
  integrationMergeMessage({ branch: "consolidation/x", ticket: "sh-1", contract: "test/x.test.mjs:red->green" });

test("the lane-integration merge message carries the exact template", () => {
  assert.equal(message(), "merge: integrate consolidation/x\n\nTicket: sh-1\nChange-contract: test/x.test.mjs:red->green");
});

test("the lane-integration message needs only the two trailers", () => {
  assert.deepEqual(trailersFromCommitBody(message()).map((trailer) => trailer.key), ["Ticket:", "Change-contract:"]);
});

test("the builder refuses an incomplete template", () => {
  assert.throws(() => integrationMergeMessage({ branch: "b", ticket: "sh-1" }), /requires branch, ticket, and contract/);
});
