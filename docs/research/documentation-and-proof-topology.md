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
| `docs/**/*.md` | 9 files | one ADR, two operator references, six research/index pages |
| `docs/research/*.md` | 6 files | one index plus compact topic syntheses |
| Node tests | 1 `*.test.mjs` file | installed-release bootstrap smoke only |
| Python tests | 1 unittest module | destructive-command hook contract |
| `evals` | bootstrap fixture and routing data | installed-release smoke and routing data |
| validator output | 10 installable skills, 70 trigger cases, 7 profiles | current generated facts, not durable prose to hand-count |

The apparent sprawl has three different causes that must not be solved with one
deletion rule:

1. durable knowledge was mixed with historical experiment narration;
2. two research pages both describe the harness map;
3. deterministic tests covered several real public seams, while routing cases
   were being counted as if they were the same kind of test.

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

That comparison is useful for prose and taxonomy. KRN keeps only one installed
release bootstrap smoke and one hook smoke; static validation covers the
remaining metadata and routing contract. Matt's absence of a suite supports
this deliberately small proof budget.

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
| `evals/` | installed-release bootstrap fixture and routing data | generic experiment machinery and raw scratch work |
| `.krn/runs/` | ignored working state and transport | durable knowledge |

No new generic documentation manager, normalizer, memory database, or audit
tool is part of this plan.

## Proposed document disposition

### Keep as independent topics

- `docs/research/mattpocock-skills-deep-audit.md`: upstream refresh consumer;
  keep current pin, promoted/in-progress/misc map, and dispositions.
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
file, update all Markdown references, reconcile status dates, and list every preserved
section in the diff. This migration is complete; `harmonic-harness.md` was
removed after its unique owner map, condensing rules, and Beads boundary were
folded into `orchestration.md`.

### Condense or retire after evidence review

`docs/research/README.md` must index every retained topic. It currently omits
the retained topics. Empty legacy directories and ignored `.remember` or
delivery-loop state are inventory items, not documentation candidates. Assign
their cleanup owner separately.

## Test and evaluation topology

Tests are grouped by the public seam they falsify, not by file count:

| Seam | Current proof | Default disposition |
|---|---|---|
| source validator and routing schema | `npm run validate`, trigger cases | keep the executable validator; no duplicate assertion suite |
| release installer and migration | bootstrap fixture | keep one public end-to-end smoke |
| global hook | `test:hooks` | keep; security boundary |
| capability catalog, setup, advisory, and completion ledger | manual CLI paths | keep implementation, remove dedicated test suites until a regression is observed |

`evals/trigger-cases.json` is routing data, not a second executable suite. A
pruning keeps the validator's schema and routing checks as one executable
command. No separate benchmark or experiment suite remains on the core branch.

## Migration slices

### Slice 0: truthful inventory, no deletion — complete

Create one ownership matrix containing every research page and every retained
smoke command. Correct the absolute host path, reconcile the unlazy source pin,
remove stale counts, and correct the local/upstream skill count. Run
`npm run validate` and the two retained smoke commands.

### Slice 1: remove unowned proof machinery — complete

Removed the EvidenceSpine lab, experiment sealing/verification, reviewer
benchmark, and dedicated meta-skill test suites. The validator no longer loads
experiment manifests. Their durable research pages and eval records were
removed with them.

### Slice 2: one harness-page merge — complete

`harmonic-harness.md` was merged into `orchestration.md`; all live references
and the validator fixture remain on the survivor, and the superseded page was
deleted. The full relevant validation and test boundary is recorded below.

### Slice 3: research pruning — complete for the current core branch

The EvidenceSpine, Beads, and three-arm lab pages were removed with their
unowned lab machinery. The upstream audit, orchestration synthesis, and
explicit skill decision pages remain as the only durable research topics.

### Slice 4: test pruning by measured redundancy — complete

Use the seam matrix to identify duplicate assertions or dead commands. Remove
only tests that prove the same observable contract through the same public seam,
or an orphan tool with no consumer. Preserve one focused falsifier for each
distinct acceptance requirement. Fourteen Node test files and their CI/package
entries were removed; the remaining bootstrap and hook tests are the only
runtime smoke surfaces. No files were moved for aesthetics alone.

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
- every retained test maps to one observable invariant and public seam;
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

`opencode-second-opinion` reviewed the original consolidation plan in a
read-only DeepSeek V4.1 Flash run. Its findings were verified, then the
unowned lab and test machinery was removed rather than preserved as ceremony.
