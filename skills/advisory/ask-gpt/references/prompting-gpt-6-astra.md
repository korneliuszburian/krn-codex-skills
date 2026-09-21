# Prompting GPT-6 Astra for read-only repository analysis

One model, one page. This is the reference the `ask-gpt` renderer encodes; read
it before changing the renderer's template.

## What Astra is good at, and what it is not

Astra reads a large repository through the GitHub connector and reasons across
files in one pass. It is strongest at structural review: cross-file
inconsistency, interface and naming drift, missing coverage, and "this rule is
stated in three places and enforced in none". It is weak where the truth lives
outside the repository: the running host, a live gate result, an uncommitted
working tree, or a decision the operator has not written down. Say which is
which in the prompt, and ask for the second class as questions instead of
findings.

## The prompt contract

Build every prompt from the same six blocks, in this order. The order is
deliberate: the read-only contract first so it cannot be missed, the ask last so
it is the most recent instruction.

1. **Role and contract.** One sentence naming a read-only principal reviewer
   with repository access, then the prohibitions: do not propose patches or
   diffs, do not edit, do not run or claim to run commands, do not restate the
   repository's own documentation as a finding.
2. **Fixed point.** Repository URL, branch, commit SHA, base ref, and the exact
   file list in scope. Astra must analyze the named commit, not `main` at some
   later time; a finding about a file outside the list is out of scope.
3. **The question.** One primary question, at most three secondary questions.
   State the decision it informs and the forbidden decisions (for example, "do
   not decide whether to merge").
4. **Evidence bar.** Require `path:line` for every finding, a quoted fragment,
   and an explicit split between observation (what the code shows) and inference
   (what the reviewer concludes). A finding without a location is invalid.
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
- path:line
- observation: what the code shows, quoted
- inference: what it means for the question
- recommendation: the smallest correct change, described, never a patch

## Open questions
What the reviewer cannot decide from the repository, each with the missing input.

## Non-proofs
What this review did not verify (gates, live host, uncommitted state, tests).

## Next action
The single smallest next step, and who owns it.
```

## Failure modes to design against

- **Verdict-first prose.** Without the schema, the answer becomes an essay with
  no locatable findings; the schema is what makes it usable.
- **Patch-shaped answers.** Asking for "the fix" produces diffs that bypass the
  owning workflow's proof; ask for a described change instead.
- **Stale refs.** A prompt that names a branch but not a commit invites analysis
  of whatever the connector sees later; pin the commit.
- **Documentation restatement.** Without the prohibition, the answer paraphrases
  `AGENTS.md` and the ADRs; the value is what the code contradicts.
- **Confidence without evidence.** Require the observation/inference split so a
  guess is visible as a guess.
- **Silent scope drift.** The file list plus "out of scope" language keeps the
  answer inside the question.

## Length and placement

Keep the contract and schema short and exact; put the file list in the middle
and the ask and schema at the end. Long context is where the repository goes,
not the instructions: a long instruction block dilutes the contract, while a
long file list is the actual input. Repeat the single most important constraint
(read-only, cite locations) once in the closing ask.
