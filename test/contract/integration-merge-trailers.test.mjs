import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const PROTOCOL = fileURLToPath(new URL("../../docs/research/ticket-protocol.md", import.meta.url));
const DELIVERY_LOOP = fileURLToPath(new URL("../../skills/engineering/delivery-loop/SKILL.md", import.meta.url));

const TEMPLATE_MARKER = /lane-integration merge template/i;
const TEMPLATE_TRAILERS = ["Ticket: <id>", "Change-contract: <ref>:<direction>"];

function readGuarded(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function publicationPolicy() {
  const text = readGuarded(PROTOCOL);
  const start = text.indexOf("- Publication:");
  if (start === -1) return "";
  const rest = text.slice(start);
  const end = rest.indexOf("\n- ", 1);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

function deliveryLoopPublicationStep() {
  const text = readGuarded(DELIVERY_LOOP);
  const start = text.indexOf("5. **Advance only authorized lifecycle transitions.**");
  if (start === -1) return "";
  return text.slice(start).trim();
}

test("the protocol publication policy states the exact lane-integration merge template", () => {
  const policy = publicationPolicy();
  assert.ok(policy.length > 0, "ticket-protocol.md must carry a Publication policy");
  assert.match(policy, TEMPLATE_MARKER, "the publication policy must name the lane-integration merge template");
  for (const trailer of TEMPLATE_TRAILERS) {
    assert.ok(policy.includes(trailer), `the lane-integration merge template must carry ${trailer}`);
  }
});

test("the delivery-loop publication step states the exact lane-integration merge template", () => {
  const step = deliveryLoopPublicationStep();
  assert.ok(step.length > 0, "delivery-loop must carry the authorized-transitions publication step");
  assert.match(step, TEMPLATE_MARKER, "the publication step must name the lane-integration merge template");
  for (const trailer of TEMPLATE_TRAILERS) {
    assert.ok(step.includes(trailer), `the lane-integration merge template must carry ${trailer}`);
  }
});

test("the lane-integration template is distinguished from the squash body", () => {
  const policy = publicationPolicy();
  assert.ok(policy.length > 0, "ticket-protocol.md must carry a Publication policy");
  assert.match(
    policy,
    /merge commit[\s\S]*?only[\s\S]*?Ticket: <id>[\s\S]*?Change-contract: <ref>:<direction>/i,
    "a merge commit body needs only the two lane-integration trailers",
  );
  assert.match(policy, /squash[\s\S]*?every\s+trailer/i, "a squash body must carry every trailer");
});

test("the template marker rejects text that omits it", () => {
  assert.doesNotMatch("a merge commit with an empty body", TEMPLATE_MARKER);
  assert.doesNotMatch("the squash body carries every trailer", TEMPLATE_MARKER);
});
