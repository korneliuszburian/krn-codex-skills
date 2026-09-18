import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const skillFile = fileURLToPath(
  new URL("../../skills/engineering/delivery-loop/SKILL.md", import.meta.url),
);
const transitionsFile = fileURLToPath(
  new URL("../../skills/engineering/delivery-loop/references/transitions.md", import.meta.url),
);

const QUEUE_VERBS = [
  "krn ticket check",
  "krn ticket next",
  "krn ticket claim",
  "krn ticket close",
  "krn ticket fail",
];
const LANE_CONTRACT = ["red-at-base", "one writer", "worktree", "integrator", "Change-contract"];

export function queueCouplingErrors(text) {
  const errors = [];
  for (const token of QUEUE_VERBS) {
    if (!text.includes(token)) errors.push(`delivery-loop must name ${token}`);
  }
  if (!/frontier/i.test(text)) errors.push("delivery-loop bind must read the configured queue frontier");
  if (!/`?krn ticket claim`?[^.]*before\s+any\s+implementation/i.test(text)) {
    errors.push("delivery-loop must claim before implementation");
  }
  if (!/`?krn ticket close`?[^.]*evidence\s+and\s+resolution/i.test(text)) {
    errors.push("delivery-loop must close with evidence and resolution");
  }
  if (!/refused\s+attempt[^.]*`?krn ticket fail`?/i.test(text)) {
    errors.push("delivery-loop must record a refused attempt");
  }
  return errors;
}

export function laneContractErrors(text) {
  if (!/lane entry/i.test(text)) {
    return ["delivery-loop must name the isolated-lane contract only when a lane entry is configured"];
  }
  const errors = [];
  for (const token of LANE_CONTRACT) {
    if (!text.includes(token)) errors.push(`delivery-loop lane proof must name ${token}`);
  }
  if (!/publication policy/i.test(text)) {
    errors.push("delivery-loop lane proof must name the publication policy");
  }
  if (!text.includes("docs/research/ticket-protocol.md")) {
    errors.push("delivery-loop lane proof must point at docs/research/ticket-protocol.md");
  }
  return errors;
}

export function queueStateRowErrors(transitionsText) {
  const row = transitionsText.split("\n").find((line) => line.includes("`delivery-loop`"));
  if (!row) return ["transitions: no delivery-loop row"];
  if (!row.includes("krn ticket")) {
    return ["transitions: the delivery-loop row must name the queue verbs"];
  }
  return [];
}

test("the delivery loop names the configured queue frontier and its transition verbs", () => {
  const text = readFileSync(skillFile, "utf8");
  assert.deepEqual(queueCouplingErrors(text), []);
});

test("the delivery loop names the isolated-lane contract at the proof step", () => {
  const text = readFileSync(skillFile, "utf8");
  assert.deepEqual(laneContractErrors(text), []);
});

test("the transitions table carries the delivery-loop queue state", () => {
  const text = readFileSync(transitionsFile, "utf8");
  assert.deepEqual(queueStateRowErrors(text), []);
});

test("the queue observer rejects skill text that omits the verbs or the order", () => {
  assert.ok(queueCouplingErrors("# Delivery Loop\n").length > 0);
  const partial =
    "frontier `krn ticket check` `krn ticket next` `krn ticket claim` before any implementation " +
    "`krn ticket close` with evidence and resolution";
  assert.deepEqual(queueCouplingErrors(partial), [
    "delivery-loop must name krn ticket fail",
    "delivery-loop must record a refused attempt",
  ]);
});

test("the lane observer rejects text without the lane contract when a lane entry exists", () => {
  assert.deepEqual(laneContractErrors("a fresh session with a configured lane entry"), [
    "delivery-loop lane proof must name red-at-base",
    "delivery-loop lane proof must name one writer",
    "delivery-loop lane proof must name worktree",
    "delivery-loop lane proof must name integrator",
    "delivery-loop lane proof must name Change-contract",
    "delivery-loop lane proof must name the publication policy",
    "delivery-loop lane proof must point at docs/research/ticket-protocol.md",
  ]);
  assert.deepEqual(laneContractErrors("a fresh session without a queue"), [
    "delivery-loop must name the isolated-lane contract only when a lane entry is configured",
  ]);
});

test("the transitions observer rejects a delivery-loop row without queue state", () => {
  assert.deepEqual(queueStateRowErrors("| a condition | `delivery-loop` | lifecycle truth |"), [
    "transitions: the delivery-loop row must name the queue verbs",
  ]);
  assert.deepEqual(queueStateRowErrors("| a condition | `implement` | a proven repair |"), [
    "transitions: no delivery-loop row",
  ]);
});
