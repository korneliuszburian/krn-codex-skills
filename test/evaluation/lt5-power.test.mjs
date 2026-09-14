import assert from "node:assert/strict";
import test from "node:test";

import { clustersFor, simulatePower } from "../../scripts/lib/evaluation/lt5-power.mjs";

test("a design too small to estimate variance is rejected, not scored 0%", () => {
  assert.throws(() => simulatePower({ tasksPerStratum: 1 }), RangeError);
  assert.throws(() => simulatePower({ sims: 0 }), RangeError);
  assert.throws(() => simulatePower({ q: 2 }), RangeError);
});

test("repeats add no independent cluster", () => {
  assert.equal(clustersFor({ tasksPerStratum: 5 }), 10);
  const short = simulatePower({ tasksPerStratum: 5, reps: 3, theta: 0.4, sims: 300, seed: 7 });
  const long = simulatePower({ tasksPerStratum: 5, reps: 9, theta: 0.4, sims: 300, seed: 7 });
  assert.equal(short.clusters, long.clusters);
  assert.equal(short.clusters, 10);
});

test("the null rejection rate stays near alpha", () => {
  const result = simulatePower({ tasksPerStratum: 12, reps: 3, theta: 0, sims: 2000, seed: 3 });
  assert.ok(result.nullRejection <= 0.06, String(result.nullRejection));
});

test("more independent tasks raise power under a real effect", () => {
  const few = simulatePower({ tasksPerStratum: 6, reps: 3, theta: 0.4, sims: 800, seed: 11 });
  const many = simulatePower({ tasksPerStratum: 40, reps: 3, theta: 0.4, sims: 800, seed: 11 });
  assert.ok(many.power > few.power, `${many.power} vs ${few.power}`);
  assert.ok(many.power >= 0.8, String(many.power));
  assert.equal(few.nullRejection, null);
});
