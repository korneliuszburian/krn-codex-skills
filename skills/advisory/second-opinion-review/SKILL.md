---
name: second-opinion-review
description: Run a read-only Claude challenge of a scoped diff, skill, or architecture claim and validate its citations locally. Invoke explicitly after local evidence exists; the result is advisory and never approval.
---

# Second Opinion Review

Use this explicitly when a consequential slice benefits from an independent
falsifier after local proof exists. Claude adds adversarial evidence; it does
not replace typecheck, tests, runtime smokes, repository review, or human
product decisions.

## Process

1. Record one question, acceptance criteria, fixed point or artifact, changed
   paths, verification already run, known non-goals, and proof/non-proof.

2. Create a compact prompt outside the repository from
   [prompt-template.md](references/prompt-template.md). Include only the diff or
   numbered excerpts needed for the question. Exclude secrets, environment
   files, credentials, private data, database dumps, and raw proprietary
   material.

3. Run the tool-free reviewer from the repository being reviewed:

   ```bash
   rtk env SECOND_OPINION_MAX_BUDGET_USD=2 \
     ~/.agents/skills/second-opinion-review/scripts/run-review.sh \
     /tmp/second-opinion/topic.md \
     /tmp/second-opinion/topic.review.json
   ```

   The default is budget-bounded. Set
   `SECOND_OPINION_MAX_BUDGET_USD=unlimited` only when the operator explicitly
   authorizes an uncapped pass.

4. Revalidate the retained prompt and current citations before triage:

   ```bash
   rtk python3 ~/.agents/skills/second-opinion-review/scripts/validate-review.py \
     check /tmp/second-opinion/topic.review.json /tmp/second-opinion/topic.md
   ```

   Then read every cited line locally and classify each item:

   - `accept_and_fix` — correct and in scope;
   - `evidence_gap` — run the smallest requested proof;
   - `reject_with_evidence` — current code or command output contradicts it;
   - `follow_up` — concrete but outside the owned slice;
   - `human_decision` — product, budget, or irreversible trade-off.

5. Re-run at most once, and only with the disputed finding plus new evidence.
   Open-ended reviewer debate is not product progress.

## Output

- validated advisory JSON with findings, evidence gaps, human decisions,
  non-proof, and prompt/evidence hashes;
- local triage for every item;
- focused proof for accepted findings;
- an explicit statement of what the review did not prove.

## Stop Condition

Stop when every factual claim survives current file and line inspection or is
rejected, every accepted item has focused proof, and no reviewer language is
presented as a merge, release, or product-readiness gate.

## Hard Boundaries

- Claude receives only prompt stdin: no tools, slash commands, default dynamic
  system prompt, repository working directory, plugins, or MCP.
- The validator proves citation presence and freshness, not semantic truth.
- The schema has no approve, block, merge, close, or readiness verdict.
- Keep proprietary corpora and operator secrets outside the prompt.
