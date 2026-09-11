import assert from "node:assert/strict";
import test from "node:test";

import { QuarantineViolationError, planCatalogConfig } from "../scripts/lib/catalog-plan.mjs";

const SOURCE = '[plugins."figma@openai-curated"]\nenabled = false\n';

test("planCatalogConfig toggles a managed plugin block", () => {
  const plan = planCatalogConfig({ source: SOURCE, desired: { plugins: { "figma@openai-curated": true } } });
  assert.equal(plan.changed, true);
  assert.match(plan.nextSource, /enabled = true/);
  assert.notEqual(plan.originalHash, plan.nextHash);
});

test("planCatalogConfig is a no-op when nothing changes", () => {
  const plan = planCatalogConfig({ source: SOURCE, desired: { plugins: { "figma@openai-curated": false } } });
  assert.equal(plan.changed, false);
  assert.equal(plan.nextSource, SOURCE);
});

test("planCatalogConfig refuses enabling a hard-quarantined target", () => {
  assert.throws(
    () => planCatalogConfig({ source: SOURCE, desired: { plugins: { "superpowers@openai-curated": true } } }),
    QuarantineViolationError,
  );
});
