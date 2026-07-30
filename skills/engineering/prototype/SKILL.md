---
name: prototype
description: Build an ephemeral throwaway prototype to answer one design question. Use to sanity-check whether a state model or logic feels right (tiny terminal app) or what a UI should look like (several variants on a route); skip production builds and diagnosis.
---

# Prototype

A prototype is **ephemeral throwaway code that answers one question**. The question decides
the shape, and getting the branch wrong wastes the whole prototype. It is not a
production build (`$implement`), not a diagnosis (`$diagnosing-bugs`), and not
real review — it is the cheapest runnable artifact that settles a design question
that resists paper.

1. **Pick the branch from the question.** Identify the one question, from the
   prompt, the surrounding code, or by asking.

   - **"Does this logic or state model feel right?"** → terminal app. Read
     [LOGIC.md](references/LOGIC.md): a tiny interactive TUI over a pure module,
     driven by hand through the cases that look fine on paper but feel wrong run.
   - **"What should this look like?"** → UI variants. Read
     [UI.md](references/UI.md): several radically different variants on one route,
     switched from a floating bar.

   If the question is genuinely ambiguous and the user is unreachable, default to
   whichever branch matches the surrounding code (a backend module → logic; a page
   or component → UI) and state the assumption at the top of the prototype.

   **Done when:** one branch is chosen and the single question it must answer is
   written down (in the prototype's README or a top-of-file comment).

2. **Build it throwaway from day one, and marked as such.** Locate the prototype
   close to where it will be used so the context is obvious, but name it so a casual
   reader sees it is a prototype. Obey the project's existing routing and task-runner
   conventions; do not invent a new top-level structure or pull in a new runtime.

   **Done when:** the prototype is discoverable next to its target and clearly
   labelled throwaway.

3. **One command to run.** Wire it through the project's existing task runner
   (`package.json` scripts, `Makefile`, `justfile`, `pyproject.toml`) so the user
   runs `pnpm run <name>` or equivalent without remembering a path. If there is no
   task runner, put the command at the top of the prototype's README.

   **Done when:** a single documented command starts the prototype.

4. **Skip the polish.** No tests, no error handling beyond what makes it runnable,
   no abstractions, no generalisation ("what if we wanted X later"). The point is to
   learn fast. Keep the logic branch pure (no I/O, no terminal code in the module
   being tested) so it can lift into real code later; the TUI or switcher around it
   is the throwaway shell.

   **Done when:** the prototype does only what the one question needs and nothing
   speculative.

5. **Surface the state.** After every action (logic) or on every variant switch
   (UI), print or render the full relevant state so the user sees what changed. One
   stable view, not an ever-growing scrollback.

   **Done when:** the user can observe the effect of each input immediately.

6. **Hand it over and let it evolve.** Give the user the run command or URL. The
   interesting moments are "wait, that shouldn't be possible" or "I assumed X would
   be different" — those are bugs in the *idea*, which is the whole point. Add
   actions or variants as the user asks; prototypes evolve.

   **Done when:** the user has driven the prototype and the question is answered or
   sharpened.

7. **Promote the verdict, then dispose of the prototype.** Record the question,
   answer, and decisive observation in the existing surface that already owns the
   decision: for example the active Wayfinder ticket, tracker item, settled spec, or
   domain decision thread. If no durable owner exists, return the verdict to the
   requester; do not invent another durable artifact. Production work, when requested,
   starts as a fresh `$implement` task and rewrites the validated idea under
   production constraints.

   The prototype is ephemeral by default. After the user has inspected it and the
   verdict is captured, remove its shell, losing variants, runner entry, and other
   throwaway files from the production branch. Retain the runnable prototype on a
   separate branch only when the user explicitly requests retention and separately
   authorizes the branch and commit. Put any pointer to that branch in the existing
   decision owner, not in a new artifact.

   <prototype-result>
   Question answered:
   Verdict:
   Existing decision owner updated:
   Prototype disposition: removed | explicitly retained on <branch>
   Next owner: none | $implement
   </prototype-result>

   **Done when:** the verdict is available to its existing owner, the production
   branch contains no throwaway residue, and any retained branch has explicit user
   request plus branch and commit authority.
