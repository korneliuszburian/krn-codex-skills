# Evaluation lifecycle

Git is the system of record for skill and reviewer experiments. `$delivery-loop`
owns the experiment lifecycle and fixed-point handoffs; the selected workflow
(for example `$source-to-decision`) owns the experimental decision. The
experiment owner is the sole manifest writer, an independent grader owns only
grade outputs, the coordinator owns reveal/join, and a maintainer with separate
authority owns merge. An experiment
is not complete while its only evidence lives in `/tmp`, a local state
directory, a chat transcript, or an unreferenced branch.

## Choose the smallest evaluation

| Change | Default evidence | Time budget |
|---|---|---:|
| Trigger wording or mechanical skill edit | `npm run validate`, 2–3 positive prompts, 2 hard negatives | 30 minutes |
| Material instruction or routing change | 4–6 paired baseline/treatment prompts with one frozen grader | 90 minutes |
| Global, expensive, or hard-to-reverse behavior | preregistered isolated experiment | explicitly approved |

Escalate only when the cheaper level cannot distinguish live hypotheses. Time
budgets limit operator effort; they are not statistical stopping rules. Every
paired or full experiment freezes its exact sample and early-stop rule before
the first result. A negative early stop is valid only when preregistered and the
observed regression already makes adoption impossible. A positive result always
requires the complete planned sample.

## Git-owned experiment directory

Every durable experiment lives at:

```text
evals/experiments/<yyyy-mm-dd-slug-vN>/
├── manifest.json
├── protocol.md
├── ... inputs and raw admissible outputs ...
├── summary.json
├── decision.md
└── review.md
```

`manifest.json` lists every other file with its role, visibility, byte count,
and SHA-256. Unlisted or untracked files, broken hashes, symlinks, hardlinks,
runtime homes, credentials, secret-shaped paths, and high-confidence secret
content fail validation. `visibility` documents intended consumers; it is not
an ACL and never replaces an isolated grader namespace.

Commit admissible evidence, including prompts, final responses, scanned JSONL events,
grading records, telemetry, and comparison outputs. Do not commit `HOME`,
`CODEX_HOME`, caches, databases, auth state, package stores, or secrets. A
runtime manifest and hashes are evidence; a copied runtime directory is not.
Redact a detected secret before seal and record that redaction; never suppress a
real credential finding. A reviewed false-positive exception is bound to the
artifact SHA, scan rule, reason, and reviewer.

The default retention is `full`. `capsule-only` is terminal and allowed only for
a historical backfill or reviewer-approved external evidence. Its manifest must
use an exploratory epistemic status and name each omitted role, count, reason
code, source pointer, and retained aggregate hash. It is weaker evidence and
must never be reported as a full archive.

## Branch and commit checkpoints

Create one ordinary branch `experiment/<id>` from the exact target fixed point.
Use four reviewable checkpoints:

1. `experiment(<id>): preregister` — protocol, prompts, allocation algorithm,
   model/runtime, grader, rubric, repetition rule, acceptance rule.
2. `experiment(<id>): record primary results` — immutable inputs, raw outputs,
   telemetry, technical seals; no grading changes.
3. `experiment(<id>): freeze grading` — individual grades and ambiguity state;
   allocation remains hidden from graders.
4. `experiment(<id>): decide` — private join, pair comparison, disposition,
   limitations, falsifier, reviewer verdict.

Open a draft PR at checkpoint 1. The reviewer checks the protocol before model
execution, then reviews each later checkpoint as a diff. Merge the complete
experiment directory after the final verdict. Do not keep the only durable copy
on a branch: branches can be deleted and are poor indexes.

Each review gate records its base commit, reviewed commit, reviewer identity,
verdict, and timestamp in `review.md`/manifest phase history. A new commit after
requested changes invalidates the earlier approval. GitHub approval is the live
merge gate; the committed record is the durable audit trail.

The reviewed commit for the execution and grading gates must be the completed
boundary checkpoint: `executed` and `graded`, with that phase's required outputs
present. The decision record is the one deliberate exception: because its audit
record is written inside the resulting `decided` manifest and cannot name its
own not-yet-known commit SHA, its `reviewed_commit` may point to the completed
`graded` predecessor or to a later decided checkpoint. A lower transitional
snapshot such as `running` or `executed` before grading is not a valid review
fixed point.

Before grading, commit only a cryptographic allocation commitment and its
algorithm. Keep the mapping outside every grader-visible repository or
namespace. Commit the allocation reveal and deterministic join only after all
planned grades are sealed.

The machine phase between execution and grading is `executed`: it requires
`primary-results` and `telemetry`, permits a preregistered amendment, and
forbids `grades` and `allocation-reveal`. Moving to `graded` freezes those
execution outputs; moving to `decided` is the first phase that permits reveal.

For an intentionally abandoned experiment, commit the failure evidence and an
`abandoned` decision rather than deleting the branch or rewriting history.

## Reviewer gates

The reviewer records one result at each boundary:

- preregistration: acceptance conditions are discriminating and frozen;
- execution: inputs match the approved commit and writes stayed in bounds;
- results-recorded: primary results and telemetry are sealed, grading has not started;
- grading: the declared grader and schema were used without post-result tuning;
- decision: the disposition follows the frozen rule and reports non-proofs.

The experiment owner is the sole manifest writer. The reviewer comments on the
PR and records the final verdict in `review.md`; they do not rewrite raw outputs
or silently repair failed trials.

After approval, protocol, schedule, prompt, model/runtime configuration, grader,
rubric, allocation commitment, sample, retry policy, and stopping rule are
immutable. An infrastructure amendment before reveal requires a new reviewed
fixed point and explicit amendment artifact. In a full manifest, every
`role: amendment` artifact has one matching append-only `amendments[]` record
with its path, base and reviewed Git commits, reviewer identity, and review
timestamp; the base must be an ancestor of the reviewed commit, and the
reviewed commit must contain the exact amendment artifact bytes recorded by the
manifest. A failure that compromises
independence, completeness, or blinding abandons the run instead of being
silently repaired.

## Commands

```bash
npm run verify:experiments
npm run seal:experiment -- <experiment-id>
npm run test:experiments
npm run validate
```

`verify:experiments` verifies every manifest under `evals/experiments/`.
It requires manifests and artifacts to be tracked or staged in Git. `seal` is
the only supported hash/byte-count writer: it sorts artifacts, scans content,
reads staged artifact blobs, refuses backward phases or changes to already
frozen evidence, writes the manifest, and stages only that manifest. The normal
sequence is: stage planned artifacts, run `seal`, then run `verify`.
`npm run validate` includes the same check, so a stale or partial experiment
cannot merge as apparently valid repository state.

When a full experiment already has a committed predecessor, `verify` also
compares the current manifest with that prior revision and rejects rewritten
frozen roles, phase history, targets, or scan exceptions even when the edited
manifest supplies new hashes. Each phase-history `reviewed_commit` must be an
ancestor of its declared base relationship, contain the experiment manifest,
and change that manifest at the checkpoint; the checkpoint snapshot and its
frozen artifact blobs must match the current record.

The 5 MiB per-file and 50 MiB per-experiment limits are conservative v1 merge
limits, not a repository growth guarantee. Larger or sensitive raw evidence
belongs in a separate private Git evidence repository; `main` retains a reviewed
capsule and content-addressed pointer. Add LFS only after measured need.

## Completion contract

An experiment is complete only when Git contains its protocol, admissible
results, grading evidence, decision, review verdict, hashes, and explicit
omissions. The final report names the exact treatment, owner, consumer,
disposition, cost, limitations, falsifier, and next action.

`evals/reviewer-benchmark/` remains a specialized deterministic standing
benchmark with its existing scorer and `results/`. It is not duplicated by this
generic lifecycle. A future redesign may wrap benchmark releases in an
experiment manifest only after a real consumer needs unified indexing.
