# GPT-6 Astra prompt (ChatGPT surface)

When the second opinion comes from ChatGPT over the GitHub connector instead of
a local runner, shape the prompt here and hand it to the operator to run. The
brief rules in [`brief-standard.md`](brief-standard.md) still apply; the
connector reads the repository live, so the prompt carries the fixed point and
the question, not a pasted tree. The answer is advisory evidence and returns
here for local verification.

## Surfaces

Name only the surface the question needs, and state each one's limit beside it:

- **GitHub connector** — cross-file and cross-history reasoning on the live
  repository; it cannot see the working tree, ignored state, or uncommitted
  changes.
- **Deep research** — the public landscape; not this repository.
- **Code interpreter** — a cheap snippet or a small computation.
- **Web browsing** — a current external fact, cited with a date.

Pick the model and reasoning effort deliberately; raise effort for cross-file
or cross-history reasoning, not for a lookup.

## Prompt blocks

Assemble exactly these six blocks, in order:

1. **Role and contract** — read-only reviewer; advisory only; no patch, no
   diff, no approval; state each surface's limit.
2. **Fixed point** — repository, branch, commit, and the `path:line` set in
   scope; say what is out of scope.
3. **Evidence bar** — repository findings need a `path:line` plus a short
   quoted fragment; literature findings need a primary URL, section, and date;
   separate observation from inference in every finding.
4. **Output schema** — the five sections below, in order, and nothing else.
5. **Questions back** — what the reviewer would need to answer more sharply.
6. **Forbidden decisions** — what the analysis must not decide (merges,
   installs, publication, or any decision owned elsewhere).

## Output schema

```text
Verdict

Findings
- source: path:line or primary URL with section and date
- observation (quoted) / inference
- recommendation: the smallest correct change, described, never a patch
- falsifier: metric, threshold, and the result that would reject it

Open questions

Non-proofs

Next action
```

## Questions back

End by asking what would sharpen the answer: specific files, decisions, or live
results. If the question is under-specified, state the sharpest version you can
and ask for the rest — do not let the reviewer guess the scope.
