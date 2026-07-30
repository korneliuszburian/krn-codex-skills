---
name: to-spec
description: Compress a settled conversation into one destination-first spec with explicit unknowns and truthful publication state. Use when the outcome is agreed but no spec exists; skip unresolved fog, slicing, and implementation.
---

# To Spec

Synthesize, never interview. This skill turns one already-settled conversation
plus codebase understanding into a single **destination-first** spec. It
publishes only when a destination and publication authority already exist.
`$domain-modeling` owns sharpening and vocabulary;
`$slice-work` owns decomposition; `$implement` owns the build. This
skill only **compresses** what is already settled.

1. **Confirm the outcome is settled.** Re-read the thread and the resolved
   decisions. If any decision that gates the spec is still fog, stop and route
   to `$domain-modeling` — compressing fog into a spec freezes the wrong
   destination.

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

4. **Choose the one- or multi-change route.** If the whole destination fits one
   fresh `$implement` context as one end-to-end change, route there. If it needs
   multiple independently demonstrable capabilities or explicit migration stages,
   route to `$slice-work`. Do not manufacture multiple slices to justify the latter.

   **Done when:** exactly one next owner is selected from the size and dependency
   shape of the settled work.

5. **Separate spec completion from publication.** Finish the exact spec and deliver
   it to the active outcome owner before mutating a tracker or repository. If a
   later context must continue before publication, that owner keeps the exact
   transient spec under its ignored `.krn/runs/<workflow>/<run-id>/` and updates
   the compact capsule with its identity and pointer; `$to-spec` does not invent
   another durable location. Publication requires a destination
   declared by the closest repository `AGENTS.md` or other closest instructions and
   authority to create or update it. Those instructions describe operations; they
   do not grant authority. When authorized, publish exactly once and link the
   driving item. Otherwise deliver the complete spec to the active outcome owner
   and state the missing authority or destination; do not invent `.scratch/` or
   another durable location.

   Use one truthful publication state:

   - `NOT_REQUESTED` — the active outcome owner accepted the exact spec without
     requesting durable publication;
   - `PUBLISH_PENDING` — publication was requested but its destination or authority
     is missing;
   - `PUBLISHED` — the configured destination was written and read back.

   **Done when:** the spec is complete independently of publication, any durable
   copy has one configured owner, and the state does not overclaim a pending write.

6. **Hand off, do not decompose.** Point the selected owner at the exact spec
   content or verified published identity.

   <spec-result>
   Destination:
   Spec state: COMPLETE
   Publication state: NOT_REQUESTED | PUBLISH_PENDING (<missing condition>) | PUBLISHED (<identity>)
   Acceptance seam:
   Explicit unknowns handed off:
   Routed to: $implement (one change) | $slice-work (multiple slices or migration stages)
   </spec-result>

   **Done when:** the spec, publication truth, next owner, and open questions are
   explicit, and no slice list or implementation has been started.
