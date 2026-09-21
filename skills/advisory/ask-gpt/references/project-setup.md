# Setting up a ChatGPT project for a repository

A ChatGPT project is the durable half of `ask-gpt`: it holds what is stable
(instructions, knowledge, connector scope, model defaults) so the prompt only
carries what changes (the fixed point and the question). This page is guidance,
not a procedure the skill runs; there is no local script and no local index.

## Why a project

- **Stable context stays in the project.** Instructions and attached knowledge
  live once in the project instead of being restated in every prompt.
- **The prompt stays small.** A short prompt plus a warm project context beats a
  long prompt that re-explains the same background each time.
- **The connector is scoped once.** Repository authorization is a project-level
  setup, so the prompt can name the project rather than re-list repositories.

## Intake, once per repository

On the first invocation for a repository, settle three questions with the
operator and record the answers in the project:

1. **Create a project or reuse one?** Name the ChatGPT project the analysis
   belongs to, and create it if it does not exist.
2. **Are the project instructions written?** Record `existing` with where they
   live, or `missing` so the first prompt asks for them.
3. **Which files and standards belong to the project?** The paths, documents,
   and standards the analysis should treat as project context.

## What to put in the project

- **Instructions.** The repository's decision rules and vocabulary in the
  operator's own words, short enough to stay readable: what the project is, what
  a good answer includes, and what it must never do (edit code, decide merges).
- **Knowledge files.** The documents that are stable and worth attaching: the
  glossary, the architecture decisions, the research synthesis. Remember an
  attached file is a snapshot, not a live source, so prefer stable documents and
  let the connector read the moving code.
- **Connector scope.** Install the GitHub app and select the repositories the
  project may read; access is per repository and can be changed in GitHub.
- **Model defaults.** The model and reasoning effort the project should usually
  run; a prompt can still override them for one question.

## Project memory is append-only

The ChatGPT project surface accepts additions only: an instruction or memory
entry can be appended, never rewritten in place. Design every change as an
append, and keep the newest statement the current one. A rewritten local copy
would describe a project state the chat does not have, so there is no local
mirror to maintain; the project itself is the record.
