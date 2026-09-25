---
name: test-audit
description: Audit or prune a test surface with a junk-pattern gate, a retention bar, and owner-boundary deletion evidence; use when reviewing or sweeping tests. Skip test-first authoring (tdd), single bug-regression falsifiers, and ordinary implementation.
---

# Test Audit

Use this skill only when the user explicitly asks to audit, sweep, prune, or
review a test surface, or when `$delivery-loop` commissions it at a review
fixed point. Three modes, one value bar. The **authoring gate** checks every new
or changed test before it lands. An **audit** sweeps an existing surface for
tests that re-assert source, duplicate stronger proof, couple behavior to
implementation, or keep test-only production seams alive. A **campaign** prunes
one subsystem's whole test surface and starts only on an explicit request; read
[references/campaign.md](references/campaign.md) for its order of work and
completion criteria.

This skill owns the junk-pattern checklist and the deletion evidence fields. It
does not own test-first authoring (the composed upstream `tdd`), the single
regression falsifier for a reproduced bug (`$diagnosing-bugs`), or the change
contract that proves a deletion batch is behavior-preserving
(`npm run changes:check`).

## Authoring gate

Before adding any test, answer four questions; a missing answer means do not add
it yet:

1. Which observable behavior, invariant, or independent contract does it
   protect, and at which public seam?
2. Which credible regression makes it fail? A bug-regression test must fail on
   the pre-fix code for the intended reason and pass after the owner-boundary
   repair.
3. Why does existing coverage not already catch that failure? Each contract has
   one primary test owner at the strongest boundary; another layer needs its own
   distinct risk, such as a transport or lifecycle failure the owner cannot
   reach. Prefer extending a table-driven case or a shared fixture over a
   near-duplicate test, and consolidate duplicated setup in the same change.
4. Does it need a production seam (export, flag, wrapper, injection hook) that
   no production caller needs? If yes, move the test to the real boundary.

Then check the test against every junk pattern; a match fails the gate unless
the retention bar names the contract it independently guards. A test that would
break under behavior-preserving refactoring asserts implementation, not
behavior; rewrite it at the owning boundary. The proof budget stays `0/1/N`.

## Junk patterns

- assertion-free coverage probes;
- self-comparisons and identity copiers;
- copied fixtures, inventories, manifests, or export lists;
- exact source, import, or prose-string greps;
- private predicate or call-shape tests duplicated at real boundaries;
- duplicate invocations of the same contract;
- adapter-local replays of shared helpers;
- tests whose only purpose is preserving test-only exports, globals, or
  wrappers;
- dead production code whose only callers are tests;
- expected values produced by the helper or renderer under test;
- mocks that implement the asserted behavior, or one identical mock standing in
  for different APIs;
- fixtures that supply the receipt, admission, or callback ordering the owner
  should produce, or persistence asserted against a store the path never writes;
- capability tests that restate declared flags instead of exercising the
  delivery the flag promises;
- negative controls that pass for an unrelated reason, such as a denial from a
  different guard or a rejection the production path never reaches;
- names or fixtures that promise more than the input exercises.

## Value bar and discovery

Read the root `AGENTS.md`, `CONTEXT.md`, and the owning skill or rule module
before judging a candidate. Keep discovery read-only and report evidence before
editing. Start with `npm run quality:audit` (test-only consumers, duplicate
blocks, oracle density, dead exports) and treat its `AUDIT-INFO` rows as
candidates, not verdicts. Then sweep the owning suites (`test:lib`, `test:state`,
`test:ticket`, `test:contract`, `test:install`, `test:hooks`, `test:lane`,
`test:lessons`, `test:conformance`, `test:rules`, `test:catalog`, `test:harness`)
and hunt the junk patterns. Prefer a few high-confidence candidates over a large
speculative inventory. Parallel read-only exploration is allowed; parallel
writers need isolated worktrees and one integrator.

## Retention bar

Keep a test when it independently enforces a public seam, the capsule or ticket
ABI, the contract trailer grammar, a conformance case, install or release
identity, hook policy, the skills export, lane behavior, lesson delivery, or an
architecture contract. Also keep:

- call ordering when order is observable behavior;
- regressions with a credible failure mode;
- source inspection when it is the cheapest independent guard: it fails when the
  contract changes (the user-facing key, byte, or path) and survives an
  identifier-only refactor;
- a retained test that fails on the baseline: treat it as a possible product
  bug, reproduce it, and repair the owner instead of deleting it.

Static or slow is not a deletion reason. Prove an implementation-looking test is
not the independent contract before removing it.

## Candidate evidence

Record every field below before editing; a missing field means the candidate is
not ready for deletion:

- exact test name and file, and the owning suite command;
- what failure it can actually detect;
- non-test callers of the covered production or support seam;
- the stronger remaining owner-boundary proof, or why no proof is needed;
- relevant history and the reason the test or seam exists;
- production or test-support deletion unlocked;
- risk and the focused validation command.

## Edit shape

Choose one coherent owner-boundary batch. Delete obsolete test-only exports,
globals, wrappers, and dead production paths instead of preserving aliases. Move
retained regressions to their canonical owner and consolidate repeated
assertions into one generic contract. Prefer net-negative production LOC. Do not
add replacement tests that restate the same implementation, and never convert an
uncertain candidate into cleanup to raise a deletion count.

## Validation

Never edit a checkout while a lane runs against it.

1. Run the owning suite with `node --test <changed test paths>` and its
   `package.json` script.
2. Run `npm run quality:audit`, `npm run validate`, and `npm run changes:check`
   with `Change-contract: <owner suite>:green->green`; a deletion batch is
   behavior-preserving, so the owning suite stays green before and after.
3. Run `git diff --check` and inspect `git diff --numstat`, reporting production
   and test LOC separately.
4. Route the fixed-point review through `$delivery-loop` when the batch changes
   an acceptance surface.

## Landing and continuation

Commit, push, open a pull request, or land only under explicit authority, one
coherent batch at a time. After landing, refresh from `main` and rerun read-only
discovery for the next high-confidence batch.

## Handoff

Report: the removed low-value categories and root cause; production owner
simplifications; retained false positives and why they remain valuable; the
focused and full proof actually run; production versus test LOC; publication
state; and named follow-ups.
