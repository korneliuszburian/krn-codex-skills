---
name: unslop
description: Audit or rewrite explicitly requested prose to remove robotic AI patterns while preserving meaning, facts, citations, code, and the author's intended voice.
---

# Unslop

Use this skill only when the user explicitly asks to audit, humanize, de-robotize,
or rewrite prose. Do not run it as an automatic final pass on every response.
It owns prose quality, not factual research, product decisions, code changes, or
publication authority.

## Choose a mode

- `audit` identifies concrete robotic patterns without rewriting the source.
- `rewrite` applies the requested changes and returns the revised prose.

If the user does not specify a mode, ask whether they want an audit or a
rewrite. A rewrite request may include a target language, audience, purpose,
and tone. If those are absent, preserve the source language and intended tone
instead of inventing a persona.

## Protect the source

Before changing prose, separate editable text from protected material. Preserve
exactly:

- code, shell commands, JSON/YAML, tables, URLs, file paths, identifiers, and
  citations;
- direct quotations, legal or contractual wording, and numbers;
- claims, uncertainty, chronology, named entities, links, and the author's
  point of view.

Never invent a source, example, opinion, metric, or personal experience to make
the result sound human. Do not change a protected fact, claim, number, named
entity, link, citation, or qualifier inside this workflow. If the user asks for
one of those changes, stop and hand the request to the appropriate content,
research, or source-to-decision workflow instead. If a sentence is vague
because its evidence is vague, flag the gap instead of decorating it.

## Audit and rewrite

1. Read the whole passage once for purpose, audience, language, and voice.
2. Mark concrete tells in context: empty introductions, generic conclusions,
   vague attribution, filler transitions, promotional puffery, excessive
   hedging, forced three-part lists, synonym cycling, repetitive headings,
   abstract metaphors, meta-chatbot phrases, and sentences that say how a fact
   feels instead of what it does.
3. For `audit`, report each finding with a short excerpt, why it is a tell in
   this passage, and a minimal direction for repair. Do not silently rewrite.
4. For `rewrite`, cut filler, use concrete verbs and nouns, vary sentence
   rhythm where the source permits it, and keep the author's level of warmth or
   directness. Do not replace one stock style with another or force first
   person, jokes, messiness, or slang.
5. Keep the source structure unless the user explicitly requests a structural
   rewrite. Do not add headings, lists, examples, metaphors, or new sections to
   make a short passage look more complete. Edit only sentences with an
   identified tell; if no clear tell exists, leave the passage unchanged.
6. Self-audit the result against the source: every claim, qualifier, named
   entity, link, number, and requested action must survive unchanged. If any
   protected element would change, stop and hand off instead of returning a
   rewrite. Check that the result still sounds like the intended author, not
   like a generic "human" template.

## Language and boundary rules

The same phrase is not a tell in every language or audience. Judge Polish,
English, and mixed-language text in context; do not apply an English word ban to
Polish prose or technical vocabulary. Keep useful headings, lists, and concise
status formats when they improve scanning; do not invent new structure merely
to decorate a rewrite. Do not unslop source code, logs, schemas, raw evidence,
exact quotes, or text whose wording is itself the thing being tested.

The skill may suggest a separate fact-check, source-to-decision, or code-review
pass, but it must not perform that workflow implicitly. A polished sentence is
not evidence that its claim is true.

## Result contract

For `audit`, return the findings and state that the source was not rewritten.
For `rewrite`, return the revised passage and a compact change note. Report any
uncertain semantic change or protected fragment that prevented a rewrite.

The skill is successful only when the result is more specific and natural for
the stated audience without factual drift. If a blinded human prefers the
baseline, finds a meaning change, or cannot distinguish the result from a
generic template, retain the baseline and report the failure rather than
claiming that "human" style is universally better.
