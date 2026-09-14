import assert from "node:assert/strict";
import test from "node:test";

import { costPaired } from "../../scripts/lib/evaluation/cost-paired.mjs";

const run = (task, arm, tokens_in, tokens_out, held_out_pass) => ({ task, arm, tokens_in, tokens_out, held_out_pass });

test("a run without captured tokens is unmeasured, never zero cost", () => {
  const result = costPaired([run("t1", "A", 10, 5, false), { task: "t1", arm: "B", held_out_pass: true }]);
  assert.deepEqual(result.unmeasured, [{ task: "t1", arm: "B", reason: "missing captured tokens" }]);
  assert.deepEqual(result.per_arm.map((entry) => entry.arm), ["A"]);
  assert.equal(result.per_arm[0].tokens, 15);
});

test("cost per success is grouped cost over held-out passes", () => {
  const result = costPaired([run("t1", "B", 10, 0, true), run("t2", "B", 20, 0, false)]);
  assert.deepEqual(result.per_arm, [{ arm: "B", tasks: 2, tokens: 30, successes: 1, cost_per_success: 30 }]);
  assert.equal(costPaired([run("t1", "B", 10, 0, false)]).per_arm[0].cost_per_success, null);
});

test("the delta is paired within task, not an arm-mean difference", () => {
  const result = costPaired([run("t1", "A", 100, 0, false), run("t1", "B", 40, 0, true), run("t2", "A", 10, 0, true), run("t2", "B", 30, 0, true)]);
  assert.deepEqual(result.paired, [
    { task: "t1", from: "A", to: "B", token_delta: -60, pass_delta: 1 },
    { task: "t2", from: "A", to: "B", token_delta: 20, pass_delta: 0 },
  ]);
});
