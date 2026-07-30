---
name: source-to-decision
description: Turn external documentation, papers, practitioner material, or user-provided sources into an owned engineering decision. Use when a source must justify adoption, rejection, a bounded experiment, or deferral; skip fact lookup and local code inspection.
---

# Source To Decision

**Do not collect notes.** Drive one chain from source to mechanism to local
implication to adoption, rejection, bounded experiment, or deferral. A source
matters only when a named consumer can use the result and a falsifier can break
it.

1. **Pin the decision question.** Start from the consumer's uncertainty, not
   from an interesting source.

   <decision-question>
   Question:
   Active consumer: owning workflow | native goal | tracker item
   Named future consumer, if durable research may be needed:
   Owner:
   Current local behavior:
   Uncertainty:
   Evidence needed:
   Non-proof boundary:
   </decision-question>

   **Done when:** one answer could change a named consumer and the evidence
   threshold is explicit.

2. **Load the smallest credible source branch.** Prefer current primary
   sources for product mechanics, specifications, APIs, and platform behavior.
   Use papers for reported research mechanisms, practitioner material for
   operational hypotheses, and competitor documentation only for mechanics it
   actually owns. Treat user-provided private material as authorized input for
   the task, not as a corpus to copy into the repository.

   Read the source version, the current local code or runtime seam, and the
   repository authority that could own the result. Load broader literature,
   historical versions, or a source ledger only when the live question depends
   on them.

   **Done when:** each loaded source has a version or date, an authority scope,
   and a direct reason to affect the decision question.

3. **Extract the mechanism.** Separate what the source states from what you
   infer. Keep conditions, limitations, and counterexamples beside the claim;
   compare them with current local evidence.

   <source-mechanism>
   Source and version:
   Stated claim:
   Transferable mechanism:
   Conditions and limitations:
   Counterexample:
   Local evidence:
   Inference, if any:
   </source-mechanism>

   Popularity, citation count, and reviewer confidence do not establish a
   mechanism. A citation supports only the nearby claim it actually entails.

   **Done when:** the mechanism remains useful without the source's branding,
   and a concrete condition can make it inapplicable.

4. **Translate the mechanism into a disposition.** Trace the full chain before
   choosing exactly one result: `adopt`, `reject`, `lab-test`, or `defer`.
   Reject when local evidence or product boundaries contradict the mechanism.
   Lab-test only when a bounded experiment can resolve the uncertainty. Defer
   when no required consumer, owner, or falsifier exists.

   <source-decision>
   Source:
   Mechanism:
   Project implication:
   Decision: adopt | reject | lab-test | defer
   Decision or rejection rationale:
   Owner: named owner | missing with reason
   Consumer: named consumer | missing with reason
   Falsifier or bounded experiment: named signal | missing with reason
   Does not prove:
   Decision destination: active consumer | docs/research/<topic>.md
   Supersession rule, if durable:
   Topic-index change: none | docs/research/README.md
   Shared-system-map pointer: none | CONTEXT.md
   </source-decision>

   **Done when:** the disposition follows from the mechanism and local
   evidence, rejected or deferred paths are explicit, and consumer and
   falsifier are named or their absence is the stated reason to defer.

5. **Try to break the disposition.** Use the narrowest current observation,
   counterexample, or authorized disposable experiment that can contradict the
   local implication. A `lab-test` remains an experiment; its setup is not
   adoption. Green CI and external review do not turn a source claim into a
   product decision.

   **Done when:** the disposition survives evidence designed to falsify it, or
   changes to the result that evidence supports.

6. **Deliver the decision to its named consumer.** Put the complete
   `<source-decision>` into the active owning workflow, native goal, or tracker
   item named in step 1. For `adopt`, hand it to `$implement` only when
   production writes are already authorized; that workflow owns the consumer
   change and proof.

   When this investigation must cross a context boundary, update the active
   workflow's ignored `.krn/runs/<workflow>/<run-id>/state.md` capsule with the
   decision question, source identities, current mechanism or disposition,
   owner, and next action. Keep raw corpora, copied source text, and credentials
   out of it. The creating workflow removes the capsule when the decision is
   accepted, superseded, or abandoned.

   Promotion into repository knowledge is a separate, narrow branch. Create or
   update exactly `docs/research/<topic>.md` only when a named future consumer,
   one canonical topic, an explicit rule for superseding older evidence or
   dispositions, and repository write authority all exist. Preserve the topic's
   structure and keep the mechanism, disposition, falsifier, supersession state,
   and provenance together. Creating, removing, or superseding a topic updates
   the topic entry in `docs/research/README.md` in the same authorized change.
   Link the topic from `CONTEXT.md` only when the decision changes the shared
   system map; ordinary topic promotion does not earn that pointer. Otherwise
   the active consumer remains the decision owner; do not choose a generic
   durable path.

   For a private course or book, retain only original mechanisms and
   provenance. Never commit copied passages, exercises, solutions, or raw
   extraction.

   **Done when:** the named consumer receives a bounded adoption or non-adoption
   result, every promoted claim has nearby provenance, any repository update is
   confined to the canonical topic plus its earned index or context pointers,
   and this workflow makes no unverified implementation claim.
