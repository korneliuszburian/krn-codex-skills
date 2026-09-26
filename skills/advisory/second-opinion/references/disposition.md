# Disposition

An opinion is a hypothesis set, not a verdict. Verify every claim against the
repository before it changes anything.

1. **Read the verdict and confidence first.** A low-confidence `PASS` and an
   `INSUFFICIENT_INFO` are information, not noise.
2. **Inspect each cited `path:line` locally.** A finding without a resolvable
   location is an `evidence_gap`; the reviewer's citation is a claim, not
   proof.
3. **Reproduce the falsifier.** If the finding names the smallest input or test
   that proves the claim wrong, run it. A finding whose falsifier cannot be run
   is advisory only.
4. **Label each finding** with exactly one disposition:
   - `accept_and_fix` — reproduced, and the fix is in scope;
   - `evidence_gap` — plausible but not reproducible from the artifact;
   - `reject_with_evidence` — the local evidence contradicts it;
   - `follow_up` — real but belongs to another owner or slice;
   - `human_decision` — the operator must choose.
5. **Record the non-proofs.** State what the pass did not establish — one
   artifact, one model family, one run, a path brief that is not a sandbox.
6. **Never let the opinion approve, gate, or merge.** The owning workflow's
   review, approval, and local verification remain the authority.

## Reviewer rotation

A second opinion counts for reviewer rotation only when a **different family**
authored the change. A Codex-family opinion is independent evidence against an
opencode-authored change and vice versa; a same-family answer is not
independent evidence. When the opinion authored no part of the change, record
the transport, model, and run directory beside the disposition.
