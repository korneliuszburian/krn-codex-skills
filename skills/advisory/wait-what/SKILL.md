---
name: wait-what
description: Re-pitch a message that did not land. Use when the user says "wait what", "what just happened", "re-explain", or "I'm lost" - refocus the topic in the user's domain language and simplified technical English, with the ubiquitous language from CONTEXT.md.
---

Stop. That last message did not land — re-pitch it. Give a little context, then
talk in **ASD-STE100 Simplified Technical English** and use the **ubiquitous
language** from `CONTEXT.md` (when present). No new analysis — the goal is
understanding, not progress.

## Rules

- **One idea per sentence.** Short sentences, active voice, common words.
  Define every technical term the first time it appears.
- **Context first.** One-two sentences saying where the conversation got to,
  before the re-pitch. Never start mid-topic.
- **Domain language, not model language.** Use the repository's own terms
  (from `CONTEXT.md` or the codebase) for concepts that have names there.
- **STE100 levers.** Replace: passives ("the file was modified" -> "the edit
  changed the file"), pronouns left dangling, negation stacking, and
  multi-word synonyms ("utilize" -> "use", "facilitate" -> "help").
- **No new content.** The re-pitch restates what was said; if the previous
  message was genuinely wrong or incomplete, say so plainly and then re-pitch.
- **Concrete over abstract.** If the original said "the pipeline will
  consolidate state", say what runs, what it reads, and what changes on disk.

## Completion criteria

- [ ] The re-pitch restates the prior message's substance with no new
      analysis (checkable: no step, claim, or command appears that the
      prior message did not carry).
- [ ] Every sentence carries one idea in active voice with the project's
      own vocabulary (checkable against the output text).
- [ ] The response opens with context and does not depend on the original
      message being re-read.
