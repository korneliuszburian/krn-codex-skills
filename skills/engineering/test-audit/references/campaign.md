# Test-pruning campaign

Campaign mode prunes one subsystem's whole test surface in one coherent,
authorized batch: the ticket store, the state spine, the install/release path,
the hooks, the lane, the lessons surface, or the conformance gate. The value
bar, retention bar, candidate evidence, and validation in
[SKILL.md](../SKILL.md) apply to every lane. This file adds the order of work and
the completion criterion of each step; do not start the next step early.

## 1. Baseline

Record the subsystem's test and support line counts and every in-scope test
file's pass/fail state at a pinned `main` SHA, using its `package.json` suite
script. Keep baseline failures in their own list: a baseline failure that
survives into a keeper is a product bug, not a stale test.

Done when every in-scope test file has a recorded baseline result.

## 2. Lanes and inventory

Split the surface into **lanes** along production owner boundaries, not file
prefixes. For the ticket store these were store semantics, claim and lease,
import/export, the CLI facade, reconcile, and the queue lock. Include the
subsystem's cases at shared boundaries (`test/contract`, `test/kernel`,
`test/support`) and its harness or live-proof tests.

Done when every test file and scenario the subsystem owns belongs to exactly one
lane.

## 3. Read-only ledger per lane

Give each lane to its own read-only agent (an explore subagent, or a bounded
`$second-opinion` pass when the operator asks for one). The agent reads
every assigned test in full, including parameter tables, plus the production
owners and their entry points, callers, history, and gate routing. Each test
declaration goes into a written **ledger** with one mark. A table-driven
subtest is one declaration unless its rows need different marks; then mark each
row.

- `R`: retain, naming the contract and the bug it catches; a retained test that
  only moves to a better-named file stays `R` with the move noted;
- `F`: retain the contract but repair the assertion, such as a vacuous negative
  that passes when only one of several items is missing;
- `C`: consolidate, naming the owner that absorbs the assertion first: a sibling
  table case, a stronger boundary suite, or the shared kernel owner;
- `D`: delete, naming the proof that remains, or why no contract exists.

Judge a test by its assertions, not its name. The frozen-observer rows in
`test/hooks-guard.test.mjs` are an example of a name that promises less than the
assertion enforces; a name that promises more is the candidate.

Done when every declaration in the lane has a mark and an evidence line.

## 4. Layer plan per lane

Treat the per-test ledger as input, not as the edit list. A second read-only
pass, starting from the ledger, looks for the redundant **layer**. In KRN,
several suites can replay the same contract: a CLI test, a library test, and a
conformance case for one behavior. Name the **keeper** suite for each contract
and prefer the strongest real boundary. Correct any ledger errors this pass
finds.

Done when each lane plan names its retired files, its keeper per contract, the
assertions to carry into keepers, and the test-only production seams unlocked.

## 5. Cutover

Edit lane by lane. Serialize changes to shared harnesses and support files
through one owner; parallel writers use isolated worktrees and one integrator.
With each lane, remove the test-only production seams it unlocks: injection
parameters, getters, reset exports, and indirection layers. Register moved
suites in the `package.json` suite scripts and in the CI tiers of
`.github/workflows/validate.yml`. Update shrink-only caps the change touches
(the capsule budget, the skill discovery budget, the 24-row lessons cap, the
24-row lab-test registry). Put durable test-ownership rules in the repository
`AGENTS.md`, drawn from mistakes this campaign actually found.

Each cutover batch is behavior-preserving: declare
`Change-contract: <owner suite>:green->green` and keep the suite green before and
after.

Done when every lane plan is applied and each lane's keepers pass.

## 6. Preservation review

Before claiming completion, have an independent reviewer (`$code-review` at the
fixed point, or `$delivery-loop`'s review step) compare deleted coverage against
the keepers, one reviewer per boundary group. They look for contracts that lost
their only proof and for new assertions that cannot fail, such as a rejection
row the production code never reaches.

For each restored contract, make one deliberate **mutation** of the production
owner — the `scripts/lib/audit/mutation-probe.mjs` pattern, or a manual
revert-control — and confirm the keeper goes red; then restore the source byte
for byte.

Done when every reported gap is restored or rejected with source evidence, and
every restored contract has a caught mutation.

## 7. Product defects

A baseline failure that survives into a keeper is a bug report. Route it through
`$diagnosing-bugs`; fix it at its owner as a separate commit and prove it
through the real user flow, with a **control** run that reverts the fix and
shows the old behavior. Record unrelated product discrepancies as follow-ups
instead of fixing them in the campaign.

Done when each repaired defect has a failing control and a passing candidate on
the same harness.

## 8. Reconcile and hand off

Campaigns outlive many `main` commits. Merge `main` rather than rebasing a long,
many-commit campaign; a merge that resolves a harness-surface conflict is itself
a surface commit and carries the unchanged-check trailer. When `main` modified a
file the campaign deleted, keep the deletion and port the new contract into the
keeper instead, confirming every new regression `main` added still has a home.
Rerun the whole subsystem suite and any live proof on the merged head.

Expect review tooling to see a truncated file list on a diff this large. Record
maintainer decisions in the batch evidence rather than editing gates.

Hand off with the [SKILL.md](../SKILL.md) report, plus:

- baseline and final test/support line counts, with production counted
  separately;
- lanes, retired layers, and keepers;
- preservation gaps found and their mutations;
- product defects with control and candidate proof.
