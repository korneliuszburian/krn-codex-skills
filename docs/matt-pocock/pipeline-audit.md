# Pipeline Audit — Matt Pocock's coding pipeline vs KRN

This audit answers one question directly: **is Matt Pocock's end-to-end coding
pipeline actually *fulfilled* and *described* in this repository?** It compares
each stage of Matt's pipeline against the real KRN skill surface and against the
repo's decision ledgers.

Two dimensions are scored per stage:

- **Fulfilled** — does a KRN skill/owner actually implement the mechanism today?
- **Described** — is the mechanism + decision recorded in a committed ledger?

Legend: ✅ adopted/strong · 🟡 partial / deliberate split · 🔴 gap (no owner) ·
⏸️ deliberately deferred by design.

See [`sources.md`](sources.md) for the evidence behind each stage and
[`../matt-skills-coverage.md`](../matt-skills-coverage.md) /
[`../matt-youtube-coverage.md`](../matt-youtube-coverage.md) for the committed
decisions.

## Summary verdict

KRN covers the **runtime core** of Matt's pipeline almost completely —
implementation, review, diagnosis, codebase design, and a delivery-lifecycle
owner that Matt does not have. The coverage is *strongest exactly where
production risk lives*. KRN deliberately diverges on two philosophical axes
(test-first → proof budget; global orchestrator → native goals + repo tracker).

The **real gaps are upstream of implementation**: the planning/compression stages
that turn a foggy conversation into agent-ready vertical slices. Matt has four
owner-skills here (`to-spec`, `to-tickets`, `triage`, and a stateful
`grill-with-docs`) plus `wayfinder`. KRN now owns three of them — `slice-work`
(the `to-tickets` equivalent, earned via lab), `to-spec` (spec compression), and
`wayfinder` (the decision map), the last two promoted after reading Matt's
`ask-matt` flow — and delegates only triage to native goals and a repo-local
tracker (Beads). That is a defensible "not our layer" stance for the rest, but it
means the KRN catalog still does not *itself* carry triage.

**Descriptive coverage is good but stale**: the three existing ledgers document
most decisions, but ~25 sources found in [`sources.md`](sources.md) (the Missing
Manual talk, Software Fundamentals talk, De-Slop, the AGENTS.md-rules and
context-diet posts, tracer-bullets, the 7-phases overview) are not yet reflected
in them.

## Stage-by-stage matrix

| # | Matt stage | Matt owner(s) | KRN owner | Fulfilled | Described | Notes |
|---|---|---|---|---|---|---|
| 1 | Setup / AGENTS.md / install | setup-matt-pocock-skills | `setup-repository-workflow` (explicit) | ✅ | ✅ | KRN adapted: bounded init, collision refusal, in-repo path containment, idempotence. KRN keeps AGENTS.md/CLAUDE.md as one semantic core via symlinks. |
| 2 | Grilling / shared understanding | grill-me (stateless), grilling (primitive), grill-with-docs (stateful: ADR + glossary) | `batch-grill-me` (explicit) + `domain-modeling` | 🟡 | 🟡 | KRN split the concept: frontier-round *interview* → batch-grill-me; *vocabulary + earned ADR* → domain-modeling. No single stateful grill-with-docs; the ADR-is-earned rule is adopted. Matt's "one question at a time" vs KRN's "whole frontier in one round" is a genuine shape difference (documented). |
| 3 | Decision map / Wayfinder | wayfinder | `wayfinder` | ✅ | ✅ | Owned by explicit-only `wayfinder`: charts a foggy multi-session effort as one `wayfinder:map` index plus child decision tickets on the configured tracker, worked frontier-first one ticket per session until the route clears. Plan-don't-do; hands off to `to-spec`/`slice-work`/`implement`. Map/frontier/fog now have a global owner instead of living only in Beads + native goal. Comparative falsifier pending one real-consumer run. |
| 4 | Prototype | prototype | `prototype` | ✅ | ✅ | Owned by `prototype`: throwaway code answering one design question — a tiny terminal app over a pure module for logic/state, or several radically different UI variants on one route. Captures the verdict and commits the prototype to a throwaway branch as a primary source; the validated decision folds into real code via `implement`. Replaces the earlier ad-hoc disposable worktree. |
| 5 | Spec / PRD compression | to-spec | `to-spec` | ✅ | ✅ | Owned by `to-spec`: compresses a settled conversation into one destination-first spec with explicit unknowns and publishes it to the configured tracker. Synthesizes without interviewing; does not duplicate `slice-work` (slicing) or `domain-modeling` (vocabulary). Comparative falsifier pending one real-consumer run. |
| 6 | Tickets / tracer-bullet slicing | to-tickets | `slice-work` (explicit) + repo tracker | ✅ | ✅ | Owned by `slice-work` since the slicing lab (blind-judge 15:4 vs ad-hoc decomposition; clean validate). It produces the blocking vertical-slice list for `implement` and now also publishes each slice as a tracker ticket with native blocking edges when a tracker is configured (the to-tickets publish step), with the wide-refactor expand–contract exception adopted. `slice-work` creates tickets; `delivery-loop` claims and sequences. Triage remains unowned (row 7). |
| 7 | Triage / backlog | triage | — | 🔴/⏸️ | ✅ | **No owner, by design.** Backlog triage belongs to the repo tracker, not a global KRN skill. Recorded as a scope boundary. |
| 8 | Implementation (fresh context) | implement | `implement` | ✅ | ✅ | Strongest 1:1 match. KRN adds a production-first vertical-slice contract and the `0/1/N` proof budget. |
| 9 | TDD / proof | tdd | proof budget (0/1/N) inside `implement` | ⏸️ (divergence) | ✅ | Deliberate philosophical divergence: KRN rejects mandatory test-first and uses a falsifier budget instead. The divergence is documented as a decision, not a gap. |
| 10 | Code review (Standards + Spec) | code-review | `code-review` | ✅ | ✅ | Near-identical: two independent read-only axes, fixed point, kill-your-findings. KRN is if anything stricter (reviewer never edits; explicit degraded-fallback labeling). |
| 11 | Handoff | handoff | handoff-template inside `second-opinion-review` | 🟡 | ✅ | KRN folds handoff into the advisory second-opinion artifact lifecycle rather than a standalone explicit skill. Schema + pointer discipline adopted. |
| 12 | Research / AFK | research, sandcastle | `second-opinion-review` research campaigns | ✅ | ✅ | Bounded campaigns, validated mechanism ledgers, central synthesis, local adoption authority retained. |
| 13 | Diagnosing bugs | diagnosing-bugs | `diagnosing-bugs` | ✅ | ✅ | Evidence-first; reproduce before repair. |
| 14 | Codebase design / deep modules | codebase-design, improve-codebase-architecture | `codebase-design` + `domain-modeling` | ✅ | ✅ | Deep modules, public seams, grey-box. (No separate "improve-codebase-architecture" skill — folded into codebase-design.) |
| 15 | Skill authoring | writing-great-skills | `writing-great-skills` | ✅ | ✅ | KRN's is stricter on direct-reference pointers and trigger routing. |
| 16 | Delivery lifecycle (orchestration) | *(no single owner — assembled per run)* | `delivery-loop` | ✅ (KRN-only) | ✅ | **KRN advantage.** Matt has no single state-transition orchestrator; he composes skills ad hoc or via `ask-matt` + wayfinder. KRN has an explicit lifecycle owner with WIP=1, honest publication states, and (since `slice-work`) routes multi-slice outcomes through decomposition before claiming one slice. |
| 17 | Router / recall | ask-matt | — | ⏸️ | ✅ | Deliberately no router: KRN's skill family is small enough that explicit selection suffices. Recorded as a defer-until-evidence decision. |

## Where the pipeline is fulfilled (✅)

Stages 1, 3, 4, 5, 6, 8, 10, 12, 13, 14, 15, 16, 17 — the runtime core plus a delivery
orchestrator KRN has and Matt does not, plus the front-half stages earned so far:
stage 3 (decision map) via `wayfinder`, stage 4 (prototype) via `prototype`, stage 5
(spec compression) via `to-spec`, and stage 6 (slicing) via the `slice-work` lab. This
is the high-risk surface and it is well-owned and well-described.

## Where the pipeline is deliberately divergent (⏸️)

- **TDD → proof budget.** Matt makes test-first mandatory; KRN replaces it with a
  `0/1/N` falsifier budget that spends proof only on changed risk. Both are
  coherent; KRN's is lighter for mechanical work.
- **ask-matt router → no router.** KRN's family does not need a recall aid yet;
  the `wayfinder` map and tracker carry durable route state instead.

These are *decisions*, recorded as such. They are not failures to fulfill.

## Where the pipeline is genuinely gapped (🔴)

The front half — turning fog into agent-ready work — minus the stages now owned:

1. **No triage owner.** Nothing converts a messy backlog into agent-ready work.

Prototyping, spec/PRD compression, and the decision map left this list when
`prototype`, `to-spec`, and `wayfinder` were promoted to close the front-half gaps
surfaced by reading Matt's `ask-matt` flow; tracer-bullet slicing left it earlier
when the `slice-work` lab earned a promotion (blind-judge 15:4 over ad-hoc
decomposition; clean validate; now wired into `delivery-loop`). The remaining one
is recorded as a deliberate scope boundary in
[`../matt-skills-coverage.md`](../matt-skills-coverage.md)
("Front-half scope boundary"): it belongs to the repo tracker and native goal
state, not an under-specified frontier. Filling it requires a repeated
cross-repository consumer and a falsifier; see [`rozkminy.md`](rozkminy.md).

## Descriptive gaps (not yet in the ledgers)

The committed ledgers cover the pinned repo + the videos known at pin time. This
pass recorded the skill-authoring rubric (Missing Manual), the AGENTS.md rules,
the De-Slop deepen-shallow-modules signals, the Tracer Bullets slicing doctrine,
and the context-diet / smart-zone provenance. Software Fundamentals was reviewed
and skipped as a synthesis whose components are already individually ledgered.
The remaining high-signal sources from [`sources.md`](sources.md) not yet
reflected:

- **My 7 Phases Of AI Development** — the full phase model; deferred because
  KRN's `delivery-loop` already owns lifecycle at a different granularity.
- **dictionary-of-ai-coding** repo — Matt's vocabulary layer; relevant to how
  `domain-modeling` and any future spec/triage skills describe themselves.

## What this means for the repo

- The **fulfilled** answer is: *the runtime core is fully there and better
  integrated than Matt's; tracer-bullet slicing is owned by `slice-work` (wired into
  `delivery-loop`, now publishing tickets); prototyping, spec compression, and the
  decision map are owned by `prototype`, `to-spec`, and `wayfinder`. Only triage
  remains delegated to the repo tracker and native goal state — a recorded scope
  boundary, not a gap.*
- The **described** answer is: *adopted and rejected mechanisms are recorded
  across the ledgers; this pass ledgered five high-signal sources (Missing
  Manual, AGENTS.md rules, De-Slop, Tracer Bullets, context-diet) and made the
  front-half scope boundary explicit.*
- The catalog is internally consistent with Matt's pipeline: every runtime stage
  has an owner, the one earned front-half stage (slicing) is owned, and the rest
  of the front half is a deliberate, falsifiable deferral — not an accident.
