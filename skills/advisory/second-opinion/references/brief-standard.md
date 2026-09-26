# Brief standard

The evidence-backed rules for a single bounded second-opinion request. One
question, one artifact, no edit. This is the owner of the brief shape; the
transports in [`transports.md`](transports.md) carry it.

## Why the shape matters

LLM reviewers are biased in ways that a well-formed brief suppresses:

- **Self-preference is causal, not coincidental** — a model recognizes and
  favours its own generations, so a same-family review is structurally
  contaminated ([arXiv:2404.13076](https://arxiv.org/abs/2404.13076), 2024-04).
- **Position and verbosity biases are systematic** — swapping two candidates
  flips verdicts; free-form comparison is dominated by order and length
  ([arXiv:2305.17926](https://arxiv.org/abs/2305.17926), 2023-05;
  [arXiv:2406.07791](https://arxiv.org/abs/2406.07791), 2024-06).
- **Sycophancy and anchoring are pervasive** — models shift toward the
  requester's stated belief or a biased hint, so showing your plan measures
  agreement, not review ([arXiv:2310.13548](https://arxiv.org/abs/2310.13548),
  2023-10; [arXiv:2412.06593](https://arxiv.org/abs/2412.06593), 2024-12;
  [arXiv:2502.08177](https://arxiv.org/abs/2502.08177), 2025-02).
- **Intrinsic self-correction fails on reasoning** — without external feedback,
  self-critique can degrade the answer; a **sound external verifier** is what
  helps ([arXiv:2310.01798](https://arxiv.org/abs/2310.01798), 2023-10;
  [arXiv:2402.08115](https://arxiv.org/abs/2402.08115), 2024-02).
- **A judge is not a gate** — optimizing against an imperfect judge degrades
  true quality ([arXiv:2210.10760](https://arxiv.org/abs/2210.10760), 2022-10),
  and judge-assessed satisfaction is decorrelated from task success
  ([arXiv:2609.12191](https://arxiv.org/abs/2609.12191), 2026-09).

The rule of thumb: a stronger reviewer helps in proportion to how much it
**verifies** and how little it **opines**.

## The brief

1. **One question.** Exactly one decision or claim. Split anything else.
2. **One artifact.** The exact path, commit, or excerpt, and nothing the
   reviewer does not need. Never hand it a whole repository and say "review".
3. **Rubric first, artifact second.** State the allowed labels and what each
   means — e.g. `PASS | FAIL | INSUFFICIENT_INFO` — before the artifact.
4. **Withhold your plan.** Give constraints and the artifact, not "here is my
   approach, is it good?". Anchoring turns the pass into a rubber stamp.
5. **Require one falsifier.** "Name the smallest input, test, or case that
   makes this wrong." Reject any finding that cannot cite a specific line,
   token, or input.
6. **Allow abstention.** Ask for a verdict, a confidence, and an explicit
   `INSUFFICIENT_INFO`; calibrated abstention beats a forced opinion.
7. **Reason before the verdict; keep only the verdict and evidence.** The
   rationale is not the deliverable.
8. **Ask for the decisive check, not a general critique.** This suppresses
   verbosity bias and rubber-stamping.
9. **Bound the budget.** One shot, fixed time. Multi-round debate only with an
   explicit justification and a real information asymmetry; otherwise
   self-consistency/ensembling is the cheaper win
   ([arXiv:2311.17371](https://arxiv.org/abs/2311.17371), 2023-11).

## Template

```text
Role: independent reviewer. You did not write this. Advisory prose only; do
not edit files, propose a patch, emit a diff, or treat the result as approval.

Decision under review: <one claim>
Allowed verdicts: PASS | FAIL | INSUFFICIENT_INFO, each with a confidence 0-1.
Scope: <absolute target dir or commit>; cite path:line for every finding.

Artifact:
<the exact excerpt, or the path the runner exposes>

Return, in order: (1) verdict + confidence; (2) the single strongest
counter-case; (3) the smallest falsifier that would prove the claim wrong;
(4) anything that is INSUFFICIENT_INFO. Do not restate the artifact.
```

## Anti-patterns

- Same model or same family as the author.
- Showing the requester's plan, conclusion, or rationale.
- "Improve this" / "review everything" — unbounded scope.
- Iterative self-critique with no new external signal.
- Treating the opinion as proof, approval, or a gate.
- Forced verdicts with no abstention.
