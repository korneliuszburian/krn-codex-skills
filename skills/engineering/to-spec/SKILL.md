---
name: to-spec
description: Compress a settled conversation into one destination-first spec with explicit unknowns and publish it to the configured tracker. Use when the outcome is agreed but no spec exists; skip unresolved fog, slicing, and implementation.
---

# To Spec

Synthesize, never interview. This skill turns one already-settled conversation
plus codebase understanding into a single **destination-first** spec and
publishes it once. `$batch-grill-me` and `$domain-modeling` own sharpening and
vocabulary; `$slice-work` owns decomposition; `$implement` owns the build. This
skill only **compresses** what is already settled.

1. **Confirm the outcome is settled.** Re-read the thread and the resolved
   decisions. If any decision that gates the spec is still fog, stop and route
   to `$batch-grill-me` (interview) or `$domain-modeling` (terminology / ADR) —
   compressing fog into a spec freezes the wrong destination.

   <spec-input>
   Outcome and what reaching it looks like:
   Resolved decisions carried from the thread:
   Explicit non-goals:
   </spec-input>

   **Done when:** every gating decision is settled, or one unresolved decision
   is named and handed off before any spec is written.

2. **Orient to the destination and the seams.** Explore only the boundary the
   outcome touches. Use the repository's domain glossary vocabulary throughout
   and surface any ADR conflict explicitly instead of overriding it silently.
   Identify the **highest existing public seam** at which the outcome is
   observable; prefer an existing seam over a new one, and the fewest seams
   possible.

   **Done when:** the spec names one destination and the highest seam at which
   success is observable, and no ADR in the touched area is silently contradicted.

3. **Write one destination-first spec.** Copy
   [spec-template.md](references/spec-template.md) and fill it from synthesis
   alone — the problem and solution from the user's perspective, acceptance as
   an observable result at the named seam, the resolved implementation decisions
   (modules, interfaces, schema, API contracts — no file paths or code), and an
   explicit **Out of scope**. List every still-open question under explicit
   unknowns so `$slice-work` does not slice uncertainty.

   State testing as a **seam decision**, not a test-first mandate: where the
   outcome is observed and what existing observer already covers it. `$implement`
   chooses the `0/1/N` proof budget later from changed risk.

   **Done when:** the spec is destination-first, uses glossary vocabulary, carries
   the resolved decisions, declares the acceptance seam, and separates unknowns
   from settled decisions.

4. **Publish once to the configured tracker.** Read `docs/agents/issue-tracker.md`
   for where this repository holds specs and issues, and publish there exactly
   once. If no tracker doc exists, default to `.scratch/<feature>/spec.md`
   (local-markdown) and state that assumption; do not invent a second location or
   run `$setup-repository-workflow` unprompted. Link the spec from the tracker
   item that will drive implementation; the spec is the input `$slice-work` pins.

   **Done when:** the spec lives in exactly the tracker-configured place (or the
   stated default), is linked from its driving item, and nothing durable is
   duplicated elsewhere.

5. **Hand off, do not decompose.** Point the next owner at the published spec.

   <spec-result>
   Destination:
   Published spec (tracker location):
   Acceptance seam:
   Explicit unknowns handed off:
   Routed to: $slice-work (multi-slice) or $implement (single change) via $delivery-loop
   </spec-result>

   **Done when:** the spec is published once, the next owner and the open
   questions are named, and no slice list or implementation has been started.
