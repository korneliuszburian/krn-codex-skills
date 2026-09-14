# PRD 0006: retire the unwired evaluation instruments

## Problem

`scripts/lib/evaluation/*` has no runtime or dev-gate consumer: all six modules are
imported only by their tests (verified by the import graph from the installed
entrypoints). They are instruments for a lab that is not running, and the
`docs/research/lab-tests.md` prose describes their booleans as verified evidence.
Meanwhile the harness keeps its size and review churn without added value. This
brief is the disposal step requested after the architecture review; the
simplification is delegated to an external agent (Astra via the GitHub connector).

## Deliverable

On branch `prd/0006-retire-evaluation-instruments`, open a pull request that:

- Deletes `scripts/lib/evaluation/{blind-mutations,cost-paired,lt1-fixtures,lt5-admissibility,lt5-fixtures,lt5-power}.mjs`
  and their tests `test/evaluation/*.test.mjs`, and removes those tests from the
  `test:lib` script in `package.json`.
- Updates `docs/research/lab-tests.md`: replace the sections that name each module
  as an owner ("Judge sensitivity", "Cost-paired measurement", "LT-1 scale-up
  manifest", "LT-5 power simulation", "LT-5 fixture mechanism diversity", and the
  admissibility paragraph) with one "Deferred measurement tooling" note that points
  to `docs/prd/0001`–`0005` as the retained design. Delete no evidence, calibration
  limit, quarantine exclusion, or result.
- Leaves `docs/prd/0001`–`0005` in place as the design of record.

If instead the decision is to keep any instrument, it must stop being fail-open:
`fixtureManifestErrors` and `lt5FixtureManifestErrors` must reject an empty
`tasks` list and a duplicate id, and must not accept an unverified boolean as
evidence. Do not keep a fail-open validator.

## Acceptance criteria

- `npm run gate` (the 18 checks) is green on the PR head.
- The installed runtime closure is unchanged: `npm run validate` reports no
  missing or surplus runtime module.
- `rg -n "evaluation/" scripts test package.json` returns only what the deletion
  intentionally keeps (nothing, if fully retired).
- No `docs/research` claim still names a deleted module as an owner.

## Cheapest falsifier

Before the change, `node --test` on the evaluation tests passes and
`quality-audit` counts test imports as consumers. After the change, the gate is
green while the six modules and their tests are gone:
`test ! -d scripts/lib/evaluation && npm run gate`.

## Non-goals

- Do not touch the installed product (install/release, catalog, lessons, state,
  contract, rules) or any validator that protects it.
- Do not delete the `docs/prd` briefs; they are the retained design.
- Do not weaken the change-contract gate or the runtime-closure check.
