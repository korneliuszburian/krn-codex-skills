import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  capsuleAbiErrors,
  transitionErrors,
  transitionHandlersFrom,
} from "../scripts/lib/contract/delivery-loop-rules.mjs";

test("capsuleAbiErrors accepts matching labels and rejects gaps", () => {
  const content = "<outcome-capsule>\nOutcome: done\nResult: ok\n</outcome-capsule>";
  assert.deepEqual(capsuleAbiErrors(content, ["Outcome", "Result"]), []);
  assert.deepEqual(capsuleAbiErrors("no capsule", ["Outcome"]), [
    "delivery-loop SKILL.md is missing the outcome-capsule block",
  ]);
  assert.deepEqual(capsuleAbiErrors(content, ["Result", "Outcome"]), [
    "delivery-loop capsule ABI labels must match scripts/lib/state/capsule-abi.mjs ABI_LABELS",
  ]);
});

test("transitionHandlersFrom parses handler cells", () => {
  const content = [
    "| State | Handler | Notes |",
    "| start | `alpha` | first |",
    "| end | `beta` | last |",
    "not a row",
  ].join("\n");
  assert.deepEqual(transitionHandlersFrom(content), ["alpha", "beta"]);
});

test("transitionErrors checks known handlers, duplicates, and baseline coverage", () => {
  const row = (handler) => `| state | \`${handler}\` | notes |`;
  const known = new Set(["alpha", "beta"]);
  const baseline = new Set(["alpha", "beta"]);

  assert.deepEqual(
    transitionErrors([row("alpha"), row("beta")].join("\n"), { knownHandlers: known, baseline }),
    [],
  );
  assert.deepEqual(
    transitionErrors(row("ghost"), { knownHandlers: known, baseline: new Set(["ghost"]) }),
    ["transitions: unknown handler ghost"],
  );
  assert.deepEqual(
    transitionErrors([row("alpha"), row("alpha")].join("\n"), {
      knownHandlers: known,
      baseline: new Set(["alpha"]),
    }),
    ["transitions: duplicate handler alpha"],
  );
  assert.deepEqual(
    transitionErrors(row("alpha"), { knownHandlers: known, baseline: new Set(["alpha", "beta"]) }),
    ["transitions: baseline skill beta is not named by any transition"],
  );
  assert.deepEqual(
    transitionErrors(row("alpha"), { knownHandlers: known, baseline: new Set() }),
    ["transitions: handler alpha is not in the harness baseline"],
  );
});

test("delivery-loop names the composed-review handoff scope and tracker state", () => {
  const skillFile = fileURLToPath(new URL("../skills/engineering/delivery-loop/SKILL.md", import.meta.url));
  const text = readFileSync(skillFile, "utf8");
  for (const token of ["`<fixed-point>...HEAD`", "tracker=none", "working tree"]) {
    assert.ok(text.includes(token), `delivery-loop must name ${token} in the review handoff`);
  }
});
