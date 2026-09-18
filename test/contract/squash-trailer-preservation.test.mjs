import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PROTOCOL = fileURLToPath(new URL("../../docs/research/ticket-protocol.md", import.meta.url));

function readProtocol() {
  try {
    return readFileSync(PROTOCOL, "utf8");
  } catch {
    return "";
  }
}

function publicationPolicy() {
  const text = readProtocol();
  const start = text.indexOf("- Publication:");
  if (start === -1) return "";
  const rest = text.slice(start);
  const end = rest.indexOf("\n- ", 1);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

const TRAILERS = ["Ticket:", "Change-contract:", "Recall:", "At-risk:", "Applicability-change:"];

test("the publication policy names every trailer a squash body must preserve", () => {
  const policy = publicationPolicy();
  assert.ok(policy.length > 0, "ticket-protocol.md must carry a Publication policy");
  for (const trailer of TRAILERS) {
    assert.ok(policy.includes(trailer), `the squash-merge policy must name ${trailer}`);
  }
});

test("the publication policy distinguishes a squash body from a merge commit", () => {
  const policy = publicationPolicy();
  assert.ok(policy.length > 0, "ticket-protocol.md must carry a Publication policy");
  assert.match(policy, /squash[\s\S]*?every\s+trailer/i, "a squash body must be stated to carry every trailer");
  assert.match(
    policy,
    /merge commit[\s\S]*?only[\s\S]*?Ticket:[\s\S]*?Change-contract:/i,
    "a merge commit must need only Ticket and Change-contract",
  );
});

test("the publication policy records the sh-71 trailer drop as its witness", () => {
  const policy = publicationPolicy();
  assert.ok(policy.length > 0, "ticket-protocol.md must carry a Publication policy");
  assert.match(policy, /sh-71/, "the policy must name the sh-71 reddening");
  assert.match(policy, /applicability-withdrawn/, "the witness must name the reddened check");
});
