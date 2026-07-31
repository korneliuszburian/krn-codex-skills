---
name: to-spec
description: Compress a settled conversation into one destination-first spec with no implementation-gating unknowns and truthful spec-publication state. Use when the outcome is agreed but no spec exists; skip unresolved fog, slicing, and implementation.
---

# To Spec

Synthesize, never interview. This skill turns one already-settled conversation
plus codebase understanding into a single **destination-first** spec. It
publishes only when a destination and publication authority already exist.
The matching decision owner owns any remaining uncertainty;
`$slice-work` owns decomposition; `$implement` owns the build. This
skill only **compresses** what is already settled.

1. **Confirm the outcome is settled.** Re-read the thread and the resolved
   decisions. If any decision that gates the spec is still fog, stop and route
   it to the smallest typed owner in the global routing contract — compressing
   fog into a spec freezes the wrong destination.

   <spec-input>
   Outcome and what reaching it looks like:
   Resolved decisions carried from the thread:
   Resolved decision source identities:
   Explicit non-goals:
   </spec-input>

   If this branch fires, report the destination, implementation-gating unknown,
   and exact typed or human owner, then stop. No spec exists yet.

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
   explicit **Out of scope**. List only non-gating unknowns that may remain while
   implementation starts, with their owners. If an unknown gates the production
   route, return to its exact owner instead of completing the spec.

   State testing as a **seam decision**, not a test-first mandate: where the
   outcome is observed and what existing observer already covers it. `$implement`
   chooses the `0/1/N` proof budget later from changed risk.

   **Done when:** the spec is destination-first, uses glossary vocabulary, carries
   the resolved decisions and their source links, declares the acceptance seam,
   and contains no implementation-gating unknown.

4. **Choose the one- or multi-change route.** If the whole destination fits one
   fresh `$implement` context as one end-to-end change, route there. If it needs
   multiple independently demonstrable capabilities or explicit migration stages,
   route to `$slice-work`. Do not manufacture multiple slices to justify the latter.

   **Done when:** exactly one next owner is selected from the size and dependency
   shape of the settled work.

5. **Separate spec completion from publication.** Finish the exact spec and deliver
   it to the active outcome owner before mutating a tracker or repository. A spec
   is an active implementation destination, not permanent repository knowledge.
   If a later context must continue before the outcome finishes, `$to-spec` owns
   the exact transient spec under `.krn/runs/to-spec/<run-id>/` only with write
   authority and after verifying that `.krn/runs/` is ignored; otherwise it stays
   in the active Goal or thread. Give the active outcome owner only its semantic pointer.
   Name that active outcome owner as the sole in-goal consumer. `$to-spec`
   removes an existing run only when that named consumer finishes its accepted
   outcome, or when the owning Goal closes, whichever comes first. Reading the
   spec or handing it to `$implement` or `$slice-work` does not trigger cleanup.

   When `$delivery-loop` owns an active outcome capsule, `$to-spec` returns the
   spec identity and pointer to its named sole writer; it never mutates or creates
   the capsule. That writer records the identity, pointer, and scoped
   `Spec publication state` under `Evidence observed`, any `PUBLISH_PENDING`
   condition under `Open unknowns and blockers with owners`, and the selected
   implementation or slicing procedure under `Next bounded owner and action`.
   When a transient run exists, it also records `$to-spec`, the semantic
   pointer, named sole in-goal consumer, trigger, and current state under
   `Outstanding workflow-run cleanup`, upserting the entry by pointer without
   replacing sibling obligations; `$to-spec` remains the cleanup owner.
   Otherwise continuation stays in the native Goal or configured tracker.
   `$to-spec` does not invent another durable location. Publication requires a
   destination declared by the closest repository `AGENTS.md` or other closest
   instructions and authority to create or update it. Those instructions
   describe operations; they do not grant authority. When authorized, publish exactly once and link the
   driving item. A tracker-published spec closes or is superseded with the
   accepted outcome under tracker policy; publication does not promote it into
   `CONTEXT.md`, an ADR, or research memory. Otherwise deliver the complete spec
   to the active outcome owner and state the missing authority or destination;
   do not invent `.scratch/` or another durable location.

   Use one truthful **spec-publication state**. This is scoped to the spec
   artifact and never replaces the outcome capsule's lifecycle-level
   `Publication state`:

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
   Spec publication state: NOT_REQUESTED | PUBLISH_PENDING (<missing condition>) | PUBLISHED (<identity>)
   Transient spec: absent | <semantic pointer>
   Sole in-goal consumer: <active outcome owner>
   Cleanup owner and trigger: none | $to-spec when <named sole consumer finishes its accepted outcome | owning Goal closes>, whichever comes first
   Acceptance seam:
   Implementation-gating unknowns: none
   Non-gating unknowns with owners:
   Routed to: $implement (one change) | $slice-work (multiple slices or migration stages)
   </spec-result>

   **Done when:** the spec, publication truth, next owner, and non-gating unknowns
   are explicit, and no slice list or implementation has been started.
