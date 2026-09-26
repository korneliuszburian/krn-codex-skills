import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const BUDGETS = [
  { module: "scripts/krn.mjs", budget: 450 },
  { module: "scripts/catalog.mjs", budget: 500 },
  { module: "scripts/lib/catalog/catalog-inventory.mjs", budget: 450 },
  { module: "scripts/lib/catalog/catalog-usage-normalize.mjs", budget: 600 },
  { module: "scripts/lib/contract/change-contract.mjs", budget: 500 },
  { module: "scripts/lib/install/install-release.mjs", budget: 650 },
  { module: "scripts/lib/lessons/lessons.mjs", budget: 400 },
];

const LEGACY_OBSERVERS = [
  "test/catalog/catalog-budget.test.mjs",
  "test/catalog/catalog-inventory-budget-450.test.mjs",
  "test/catalog/catalog-usage-normalize-budget.test.mjs",
  "test/contract/change-contract-budget-500.test.mjs",
  "test/install/install-release-budget.test.mjs",
  "test/lessons/lessons-budget.test.mjs",
];

const fromRepoRoot = (relative) => new URL(`../../${relative}`, import.meta.url);
const countLines = (content) => content.replace(/\n$/, "").split("\n").length;
const overBudget = (lineCount, budget) => lineCount > budget;

test("the six legacy single-budget observers are gone", () => {
  const present = LEGACY_OBSERVERS.filter((file) => fs.existsSync(fromRepoRoot(file)));
  assert.deepEqual(present, [], `legacy budget observers must be removed: ${present.join(", ")}`);
});

for (const { module, budget } of BUDGETS) {
  test(`${module} stays within the ${budget}-line budget`, () => {
    const lineCount = countLines(fs.readFileSync(fromRepoRoot(module), "utf8"));
    assert.ok(
      !overBudget(lineCount, budget),
      `${module} has ${lineCount} lines; the budget is ${budget}`,
    );
  });
}

test("every budget rejects a module one line over its ceiling", () => {
  for (const { module, budget } of BUDGETS) {
    const atCeiling = countLines("x\n".repeat(budget));
    const overCeiling = countLines("x\n".repeat(budget + 1));
    assert.equal(atCeiling, budget, `${module} ceiling fixture must hold ${budget} lines`);
    assert.ok(!overBudget(atCeiling, budget), `${module} must pass at exactly ${budget} lines`);
    assert.ok(overBudget(overCeiling, budget), `${module} must fail at ${budget + 1} lines`);
  }
});
