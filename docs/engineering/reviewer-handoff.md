# Reviewer Handoff

## Purpose

Compile a portable, bounded fixed-point packet for a reviewer who does not
have repository access. The packet carries the exact base, head, allowlisted
diff, acceptance contract, proof already run, review questions, and explicit
unknowns.

## Invocation

Explicit as `$reviewer-handoff`, or implicitly only when implementation is
finished and the user asks to package the change for review.

## Boundary

This skill compiles evidence; it does not implement, review, approve, publish,
run a second-opinion checker, or mutate runtime state. `$code-review` owns
Standards/Spec judgment. `$second-opinion-review` owns advisory checker
execution, pass directories, fingerprints, and its result schema.

## Output

A Markdown packet written outside the repository, plus a concise handoff
prompt. The packet is complete only when the fixed point, exact path allowlist,
diff check, proof results, proof gaps, and requested decision are explicit.
