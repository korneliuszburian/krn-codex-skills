# Project intake and the append-only index

The ChatGPT project surface accepts additions only: an instruction or memory
entry can be appended, never rewritten in place. Design every write here as an
append.

## Intake questions

On the first invocation for a repository (no entry in the index for it), ask the
operator these three questions and record the answers:

1. **Create a project or reuse one?** Name the ChatGPT project the analysis
   belongs to, and create it if it does not exist.
2. **Are the project instructions written?** Record `existing` with where they
   live, or `missing` so the first prompt asks for them.
3. **Which files and standards belong to the project?** The paths, documents,
   and standards the analysis should treat as project context, comma-separated.

## The index

`docs/research/ask-gpt-projects.md` is the append-only index. One row per
intake, oldest first:

```
| at | project | repository | instructions | paths | standards |
```

- **Append, never rewrite.** `node ~/.agents/skills/ask-gpt/scripts/project-index.mjs
  append --index docs/research/ask-gpt-projects.md --project <name> --repository
  <url> --instructions <existing|missing> --paths a,b --standards c` adds one
  row; `show` prints them.
- **Recall before rendering.** The renderer reads the latest row for the
  repository and puts the project name and instructions status in the prompt, so
  the model knows which project context the operator expects.
- **A change is a new row.** A new project, a changed instruction location, or a
  new standard is appended with a fresh date; the history stays readable.

## Why append-only

The operator cannot edit the ChatGPT project memory, so a rewritten local index
would describe a project state the chat does not have. An append-only index and
an append-only project memory stay in step: the newest row is the current
context, and every older row is the history the chat also keeps.
