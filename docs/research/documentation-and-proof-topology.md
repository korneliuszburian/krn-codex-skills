# Documentation and proof topology

Status: `accepted`, migration in progress. Consumer: the KRN maintainer and
the remaining cleanup slices. This page is the single execution record for
reducing document and test entropy on the core branch. Frontend skills and
frontend labs remain on `frontend-lab` and are outside this plan.

## Decision question

How can KRN have fewer, clearer documents and tests without deleting evidence
for installer, security, routing, experiment, or lifecycle contracts?

## Current inventory

The inventory was measured from the working tree on 2026-09-10:

| Surface | Count / shape | Interpretation |
|---|---:|---|
| `docs/**/*.md` | 12 files, 2,098 lines | one ADR, two operator references, nine research/index pages |
| `docs/research/*.md` | 9 files | one index plus topic syntheses, with two overlapping harness pages |
| `scripts` and skill-local Node tests | 15 `*.test.mjs` files | deterministic contract tests, not model-quality proof |
| Python tests | 1 unittest module | destructive-command hook contract |
| TypeScript test file | 1 benchmark subject fixture | input material, not a package suite |
| `evals` | bootstrap fixture, reviewer benchmark, one experiment, routing data | public-seam fixtures and immutable evidence, with different lifecycles |
| validator output | 10 installable skills, 70 trigger cases, 7 profiles, 1 experiment manifest | current generated facts, not durable prose to hand-count |

The apparent sprawl has three different causes that must not be solved with one
deletion rule:

1. durable knowledge is mixed with historical experiment narration;
2. two research pages both describe the harness map;
3. deterministic tests cover several real public seams, while routing cases
   and experiments are being counted as if they were the same kind of test.

## Upstream comparison

The current upstream `mattpocock/skills` tree at commit
[`3cca18b`](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015)
contains 37 `SKILL.md` files. Its package scripts cover Changesets and version
checks, and its tracked test-named path is the prose reference
`skills/engineering/tdd/tests.md`; it does not maintain a conventional
automated suite for routing or skill behavior. It does maintain README and
bucket catalogs, `AGENTS.md` topology rules, plugin metadata, and link/install
scripts. Its model is small composable procedures plus human/model invocation
boundaries, not a benchmarked proof harness.

That comparison is useful for prose and taxonomy, not for deleting KRN tests.
KRN owns an immutable release installer, collision-safe migration, global hooks,
capability reconciliation, advisory transport, experiment sealing, and an
installed-release bootstrap. Those are executable public contracts and need
deterministic falsifiers. Matt's absence of a suite is not evidence that these
contracts are unnecessary.

## Target topology

Every durable page must use this normalized shape:

1. title;
2. `Status`, named consumer, owner, and verification date;
3. decision question or operator purpose;
4. concise synthesis or contract;
5. canonical ownership table;
6. evidence and provenance (for research) or commands/invariants (for operator
   docs);
7. limitations and non-proofs;
8. falsifier or reopen rule;
9. links to the one next owner.

The destinations remain intentionally small:

| Destination | Sole purpose | Keep out |
|---|---|---|
| `README.md` | human entrypoint and skill catalog | procedure copies and research prose |
| `CONTEXT.md` | compact current vocabulary and map | progress logs, raw evidence, counts that drift |
| `docs/migration.md` | install, ownership, rollback, retirement contract | implementation history |
| `docs/capabilities.md` | capability profiles and evidence states | setup tutorials and source research |
| `docs/research/<topic>.md` | source-backed living synthesis for a named consumer | raw transcripts, duplicate ledgers, chronological logs |
| `docs/adr/<id>-slug.md` | rare consequential, hard-to-reverse accepted trade-off | routine cleanup and provisional ideas |
| `evals/` | immutable experiment and public-seam proof records | generic documentation and unsealed scratch work |
| `.krn/runs/` | ignored working state and transport | durable knowledge |

No new generic documentation manager, normalizer, memory database, or audit
tool is part of this plan.

## Proposed document disposition

### Keep as independent topics

- `docs/research/mattpocock-skills-deep-audit.md`: upstream refresh consumer;
  keep current pin, promoted/in-progress/misc map, and dispositions.
- `docs/research/skills-3arm-lab.md`: source-composition decision and its
  falsifier. Resolve its missing raw-manifest provenance before changing it.
- `docs/research/beads-task-system.md`: bounded task-graph adoption audit;
  keep separate because its decision is still `lab-test`.
- `docs/research/unlazy-codex-port.md`: explicit completion-ledger decision;
  keep with its own consumer and falsifier.
- `docs/research/unslop-codex-port.md`: explicit prose-quality decision;
  keep with protected-fragment and semantic-preservation limits.

These pages are not duplicate documents merely because they mention lifecycle,
evidence, or falsifiers. Their owners and dispositions differ.

### Merged harness synthesis

Use `docs/research/orchestration.md` as the survivor because
`README.md`, ADR 0001, and the existing validator fixture already refer to that
slug. Fold in the unique owner map, skill boundaries, context/evidence/authority
map, and Beads boundary from `harmonic-harness.md`. Before deleting the second
file, update all Markdown references and the hard-coded fixture path in
`scripts/validate.test.mjs`, reconcile status dates, and list every preserved
section in the diff. This migration is complete; `harmonic-harness.md` was
removed after its unique owner map, condensing rules, and Beads boundary were
folded into `orchestration.md`.

### Condense or retire after evidence review

`docs/research/agentic-engineering-approaches.md` is the only broad merge
candidate. Preserve its unique source comparisons and limitations, but remove
duplicated primary-source ledger entries and external run narration. Its
EvidenceSpine decision must first be resolved: either put `test:evidence-spine`
in CI and retain the lab, or retire the runner, test, package command, and
claims together.

`docs/research/README.md` must index every retained topic. It currently omits
`skills-3arm-lab.md` and `beads-task-system.md`; add those rows before any
deletion decision. Empty legacy directories and ignored `.remember` or
delivery-loop state are inventory items, not documentation candidates. Assign
their cleanup owner separately.

## Test and evaluation topology

Tests are grouped by the public seam they falsify, not by file count:

| Seam | Current proof | Default disposition |
|---|---|---|
| source validator and routing schema | `test:validate`, trigger cases | keep; prune only with positive/negative coverage matrix |
| release installer and migration | `test:install`, bootstrap fixture | keep; these protect filesystem and rollback invariants |
| global hook | `test:hooks` | keep; security boundary |
| capability catalog | `test:catalog` | keep; profile and privacy boundary |
| repository setup | `test:setup` | keep; target-repo write contract |
| advisory transport | `test:second-opinion` | keep; runner completion and citation boundary |
| experiment sealing and verification | `test:seal`, `test:experiments` | keep; artifact integrity boundary |
| reviewer benchmark | `test:benchmark` and the specialized scorer under `evals/reviewer-benchmark/` | keep; the standing benchmark has a named reviewer-lane consumer |
| completion ledger | `test:unlazy` | keep; explicit-only gate contract |
| EvidenceSpine lab | `test:evidence-spine` | decide CI integration or retire as one unit |

`evals/trigger-cases.json` is routing data, not a second executable suite. A
pruning change must preserve at least one positive and one hard negative for
each local skill, the explicit `$name` attachment rule, the global recovery
negative, and the exact cases required by validator tests. The benchmark's
TypeScript file is subject material, not test coverage.

Experiments remain immutable records under `evals/experiments/<id>/` with a
manifest, protocol, results, decision, and review. Deterministic regression
harnesses may remain beside `scripts/` when they are directly tied to a public
seam; they are not required to become full model experiments.

## Migration slices

### Slice 0: truthful inventory, no deletion — complete

Create one ownership matrix containing every research page, every referrer of
the two harness pages, every `test:*` command, its CI status, and its public
invariant. Correct the absolute host path in `unslop-codex-port.md`, reconcile
the unlazy source pin, remove stale 66/8 counts from orchestration prose, and
correct the local/upstream skill count. Add missing research-index rows. Decide
whether the reviewer scorecard has a live consumer. Run `npm run validate`,
`npm run test:validate`, and the affected seam tests.

### Slice 1: restore proof parity — complete

Resolve the EvidenceSpine CI decision. If retained, add its test to CI and
document the exact gate. If rejected, remove its runner, test, package command,
and durable claims together. No page merge occurs in this slice.

### Slice 2: one harness-page merge — complete

`harmonic-harness.md` was merged into `orchestration.md`; all live references
and the validator fixture remain on the survivor, and the superseded page was
deleted. The full relevant validation and test boundary is recorded below.

### Slice 3: research pruning — complete for the current core branch

The broad EvidenceSpine synthesis remains independent because it has a named
consumer, a distinct test seam, and source comparisons not present in the
surviving orchestration page. The five independent decision topics remain
separate for the same reason. No page was deleted without a consumer and
supersession decision.

### Slice 4: test pruning by measured redundancy — complete

Use the seam matrix to identify duplicate assertions or dead commands. Remove
only tests that prove the same observable contract through the same public seam,
or an orphan tool with no consumer. Preserve one focused falsifier for each
distinct acceptance requirement. The orphan `scripts/review-scorecard.mjs` and
its test were removed because the reviewer benchmark owns its own scorer and no
CI, skill, or document consumed the scorecard. No files were moved for
aesthetics alone.

### Slice 5: final normalization — in progress

Apply the normalized header and section shape to retained pages, update
`CONTEXT.md` and the research index, run `npm run validate`, the full relevant
suite, and `git diff --check`. Frontend material remains on `frontend-lab` until
a separate promotion decision supplies its own consumer and evaluation plan.

## Acceptance conditions

- every retained document has one owner, one consumer, one canonical path, and
  one lifecycle rule;
- no durable page contains a physical checkout or mount prefix;
- every research page is indexed or explicitly classified as transient;
- every `test:*` command is either CI-backed or explicitly marked local-only
  with a named consumer;
- every retained test maps to an observable invariant and a public seam;
- no experiment claim points to an absent manifest without an explicit
  unavailable-evidence disposition;
- the README remains the only human skill catalog;
- the core branch contains no frontend pack or frontend lab fixture;
- the final full suite and diff check pass at the chosen fixed point.

## Non-goals

- copying Matt's Claude-specific plugin layout or adding `CLAUDE.md`;
- introducing Beads, a memory database, a generic documentation normalizer, or
  a second lifecycle owner;
- deleting installer, hook, catalog, setup, advisory, sealing, or bootstrap
  tests merely because upstream lacks a test suite;
- rewriting frontend skills on the core branch;
- converting every research page into an ADR.

## Independent review

`opencode-second-opinion` reviewed this plan in a read-only DeepSeek V4.1 Flash
run. The completed opinion identified the same high-risk areas: name the
surviving harness slug before deletion, repair missing research-index rows,
resolve EvidenceSpine CI parity, remove the host path, reconcile stale counts
and pins, and preserve independent decision pages. Local verification is stored
in the ignored run disposition; the opinion is advisory and not an approval
gate.
