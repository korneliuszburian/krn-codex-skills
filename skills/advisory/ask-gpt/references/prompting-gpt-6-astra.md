# Prompting GPT-6 Astra

One model, one page. This is the source of truth for the `ask-gpt` prompt: read
it before writing a prompt, and change it here first if the contract moves.

## What Astra is good at, and what it is not

Astra reads a large repository through the GitHub connector and reasons across
files in one pass. It is strongest at structural review: cross-file
inconsistency, interface and naming drift, missing coverage, and the pattern
"this rule is stated in three places and enforced in none". It is weak where the
truth lives outside the repository: the running host, a live gate result, an
uncommitted working tree, or a decision the operator has not written down. Say
which is which in the prompt, and ask for the second class as questions instead
of findings.

## Settings to choose before writing the prompt

- **Model.** Name the intended model explicitly. On a subscription the strongest
  chat model is often available only in the web chat, not the API; pick it in
  the model selector and say so, so a later reader knows which model answered.
- **Reasoning effort.** Raise it for architectural, cross-file, or adversarial
  review; keep it lower for a narrow, mechanical question. Higher effort buys
  depth at wall-clock cost, and the answer may take minutes: tell the operator
  to let the turn finish rather than judge a partial stream.
- **Tools and surfaces.** Turn on only the surface the question needs (see the
  capabilities reference). Extra tools dilute the evidence bar by inviting the
  model outside the repository.
- **Project.** Select one only when its shared sources help this question; name
  the project and check its attached snapshots against the current source.

## The prompt contract

Build every prompt from the same six blocks, in this order. The order is
deliberate: the read-only contract first so it cannot be missed, the ask last so
it is the most recent instruction.

1. **Role and contract.** One sentence naming a read-only principal reviewer
   with the selected source access, then the prohibitions: do not propose patches or
   diffs, do not edit, do not run or claim to run commands, do not restate the
   repository's own documentation as a finding.
2. **Fixed point.** For GitHub connector review, name the repository URL,
   branch, published commit SHA, base ref, and exact files in scope. For a
   public source or attached file, name its URL or version, date, and section.
   A finding outside that fixed scope is out of scope.
3. **The question.** One primary question, at most three secondary questions.
   State the decision it informs and the forbidden decisions (for example, "do
   not decide whether to merge").
4. **Evidence bar.** Require `path:line` for repository findings or a primary
   URL and section for public sources, a short quoted fragment, and an explicit
   split between observation and inference. A finding without a location is invalid.
5. **Output schema.** The exact headings and the severity vocabulary, so the
   answer is machine- and human-readable in the same shape every time.
6. **Questions back.** Ask Astra to end with what it would need to answer more
   sharply: missing files, a decision, or a live result. This turns an
   under-specified request into a usable follow-up instead of a vague answer.

## Output schema

Demand exactly these sections, in this order, and nothing else:

```
## Verdict
One paragraph: the answer to the primary question, with the strongest evidence.

## Findings
For each finding, in descending severity:
- severity: blocker | major | minor | nit
- source: path:line or primary URL and section
- observation: what the code shows, quoted
- inference: what it means for the question
- recommendation: the smallest correct change, described, never a patch

## Open questions
What the reviewer cannot decide from the selected sources, each with the missing input.

## Non-proofs
What this review did not verify (gates, live host, uncommitted state, tests).

## Next action
The single smallest next step, and who owns it.
```

## Multi-turn tactics

A single turn is the common case; these extend it when the question is worth the
extra turn. Every turn keeps the same contract and schema, and the read-only
rule is repeated in the closing ask.

- **Second turn with the gate output.** Paste the repository's own gate or test
  output back into the same conversation and ask Astra to reconcile its findings
  with it. The code interpreter can parse the log; the reconciliation is the
  value, not the summary.
- **Code interpreter for a cheap falsifier.** When a finding rests on a claim
  that a small snippet could check (a regex, a parser, a numeric bound), ask
  Astra to run that snippet in its sandbox. It runs there, never on the
  repository host, so the result is a hint for a local test, not proof.
- **Ask for the missing input.** When the verdict is hedged, the fastest repair
  is the closing "questions back" block: supply one missing file or decision and
  re-ask, rather than restating the whole prompt.
- **Keep the fixed point stable.** If the named commit or source version moved
  between turns, say so and name the new fixed point.

## Failure modes to design against

- **Verdict-first prose.** Without the schema, the answer becomes an essay with
  no locatable findings; the schema is what makes it usable.
- **Patch-shaped answers.** Asking for "the fix" produces diffs that bypass the
  owning workflow's proof; ask for a described change instead.
- **Stale refs.** A connector prompt that names a branch but not a commit
  invites analysis of later state; pin the published commit.
- **Documentation restatement.** Without the prohibition, the answer paraphrases
  the repository's own guidance; the value is what the code contradicts.
- **Confidence without evidence.** Require the observation/inference split so a
  guess is visible as a guess.
- **Silent scope drift.** The file list plus "out of scope" language keeps the
  answer inside the question.
- **Hallucinated locations.** Require a quoted fragment beside every
  `path:line` or source section so a fabricated location is visible on readback.
- **Tool dilution.** Naming every surface invites the model outside the
  repository; name only the ones the question needs.

## Length and placement

Keep the contract and schema short and exact; put the file list in the middle
and the ask and schema at the end. Long context is where the repository goes,
not the instructions: a long instruction block dilutes the contract, while a
long file list is the actual input. Repeat the single most important constraint
(read-only, cite locations) once in the closing ask.
