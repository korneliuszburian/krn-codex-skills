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
   Consumer:
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
   Durable authority surface: none | <path-or-store>
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

6. **Deliver the decision to its owner.** For `adopt`, hand the
   `<source-decision>` to `$implement` only when production writes are already
   authorized; that workflow owns the consumer change and its proof. For
   `reject`, `lab-test`, or `defer`, persist the disposition only when a future
   consumer needs it and the repository names an authority surface. Keep each
   citation beside the claim it supports.

   For a private course or book, retain only original mechanisms and
   provenance. Never commit copied passages, exercises, solutions, or raw
   extraction.

   **Done when:** the owner receives a bounded implementation handoff or an
   explicit non-adoption result, every retained claim has nearby provenance,
   and this workflow makes no unverified implementation claim.
