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
`grill-with-docs`) plus `wayfinder`. KRN now owns one of them — `slice-work`
(the `to-tickets` equivalent, earned via lab) — and delegates spec compression,
triage, and the durable decision map to native goals and a repo-local tracker
(Beads). That is a defensible "not our layer" stance for the rest, but it means
the KRN catalog still does not *itself* carry spec compression or triage.

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
| 3 | Decision map / Wayfinder | wayfinder | native goals + repo tracker (Beads) | ⏸️ | ✅ | Deliberately deferred: no global Wayfinder; map/frontier/fog behavior adopted *through* Beads + native goal. Documented with the friction observed on the livestream (manual orchestration, approval interruptions, map not finished on air). |
| 4 | Prototype | prototype | — (disposable worktree when needed) | 🔴/⏸️ | ✅ | No dedicated prototype skill; KRN uses a disposable rewrite worktree via `second-opinion-review` only when fidelity is unresolved. Decision is recorded; the gap is intentional. |
| 5 | Spec / PRD compression | to-spec | — | 🔴/⏸️ | ✅ | **No owner, by design.** No skill compresses a settled conversation into a destination-first spec; it belongs to the repo tracker + native goal. Recorded as a scope boundary in [`../matt-skills-coverage.md`](../matt-skills-coverage.md). |
| 6 | Tickets / tracer-bullet slicing | to-tickets | `slice-work` (explicit) + repo tracker | ✅ | ✅ | Owned by `slice-work` since the slicing lab (blind-judge 15:4 vs ad-hoc decomposition; clean validate). It produces the blocking vertical-slice list for `implement`; the tracker holds the durable items. Spec compression and triage remain unowned (rows 5, 7). |
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

Stages 1, 6, 8, 10, 12, 13, 14, 15, 16, 17 — the runtime core plus a delivery
orchestrator KRN has and Matt does not, plus stage 6 (slicing), the one front-half
stage earned via the `slice-work` lab. This is the high-risk surface and it is
well-owned and well-described.

## Where the pipeline is deliberately divergent (⏸️)

- **TDD → proof budget.** Matt makes test-first mandatory; KRN replaces it with a
  `0/1/N` falsifier budget that spends proof only on changed risk. Both are
  coherent; KRN's is lighter for mechanical work.
- **Wayfinder orchestrator → native goals + tracker.** KRN refuses a global
  decision-map owner and routes durable state to the platform + a repo-local
  tracker.
- **ask-matt router → no router.** KRN's smaller family does not need a recall
  aid yet.

These are *decisions*, recorded as such. They are not failures to fulfill.

## Where the pipeline is genuinely gapped (🔴)

The front half — turning fog into agent-ready work — minus the one stage now owned:

1. **No spec/PRD compression owner** (to-spec equivalent). Nothing owns
   "compress this settled conversation into a destination-first spec with
   explicit unknowns."
2. **No triage owner.** Nothing converts a messy backlog into agent-ready work.
3. **No prototype skill** (intentional, but worth revisiting).

Tracer-bullet slicing left this list when the `slice-work` lab earned it a
promotion (blind-judge 15:4 over ad-hoc decomposition; clean validate; now wired
into `delivery-loop`). The remaining three are recorded as a deliberate scope
boundary in [`../matt-skills-coverage.md`](../matt-skills-coverage.md)
("Front-half scope boundary"): they belong to the repo tracker and native goal
state, not an under-specified frontier. Filling any of them requires a repeated
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
  integrated than Matt's, and tracer-bullet slicing is now owned by `slice-work`
  (wired into `delivery-loop`). Spec/PRD compression, triage, and prototyping
  remain delegated to the repo tracker and native goal state — a recorded scope
  boundary, not a gap.*
- The **described** answer is: *adopted and rejected mechanisms are recorded
  across the ledgers; this pass ledgered five high-signal sources (Missing
  Manual, AGENTS.md rules, De-Slop, Tracer Bullets, context-diet) and made the
  front-half scope boundary explicit.*
- The catalog is internally consistent with Matt's pipeline: every runtime stage
  has an owner, the one earned front-half stage (slicing) is owned, and the rest
  of the front half is a deliberate, falsifiable deferral — not an accident.
