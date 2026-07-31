# Logic prototype

A tiny interactive terminal app that lets the user drive a state model by hand. Use
when the question is about **business logic, state transitions, or data shape** —
the kind of thing that looks reasonable on paper but only feels wrong once pushed
through real cases. If the question is "what should this look like", use
[UI.md](UI.md) instead.

## Process

1. **State the question.** Before any code, write down the state model and the
   question in a README or top-of-file comment. A logic prototype that answers the
   wrong question is pure waste; make the question checkable later.

2. **Pick the language.** Use the host project's runtime and conventions. Do not add
   a new package manager or runtime for the prototype. If the project has no obvious
   runtime (a docs repo), ask.

3. **Isolate the logic in a portable module.** Put the bit answering the question
   behind a small, pure interface whose verdict can inform the production rewrite.
   The TUI and logic module remain prototype code. Pick the shape that fits the
   question, not the shape easiest to wire to a TUI:

   - a **pure reducer** `(state, action) => state` for discrete events over one value;
   - a **state machine** with explicit states and transitions when "which actions are
     legal now" is part of the question;
   - a **small set of pure functions** over a plain data type when there is no
     implicit current state;
   - a **class or module** with a clear method surface when the logic owns ongoing
     internal state.

   Keep it pure: no I/O, no terminal code, no `console.log` for control flow. The
   TUI imports and calls it; nothing flows back.

4. **Build the smallest TUI that exposes the state.** On every tick, clear the screen
   and re-render the whole frame — one stable view, not growing scrollback. Each
   frame: **current state** pretty-printed (one field per line or formatted JSON,
   bold for names, dim for derived context; native ANSI is fine), then **keyboard
   shortcuts** at the bottom (`[a] add  [d] delete  [q] quit`). Initialise one
   in-memory state, read one keystroke at a time, mutate, re-render, loop until quit.
   The whole frame fits one screen.

5. **Make it runnable in one command** through the project's existing task runner, or
   put the command at the top of the README if there is none.

6. **Hand it over.** Give the run command. The interesting moments are "that
   shouldn't be possible" or "I assumed X would be different" — bugs in the idea.
   Add actions as asked; prototypes evolve.

7. **Capture the answer, then clean up.** Promote the validated state model and
   decisive observations to the existing owner of the question. Remove the logic
   module, TUI shell, and runner entry after inspection. Return to that owner; it
   selects the next route under the global contract. If one clear production slice
   is eventually routed to `$implement`, that workflow rewrites the model rather
   than promoting prototype code. Retain a runnable branch only after the parent
   skill's complete promotion gate, including a named future consumer and owned
   cleanup or supersession trigger.

## Anti-patterns

- Adding tests — a prototype that needs tests is no longer a prototype.
- Wiring it to the real database — use an in-memory store unless the question is
  about persistence.
- Generalising ("what if we wanted X later") — answer one question.
- Blurring logic and TUI — if the module references `console.log`, prompts, or escape
  codes, it is no longer portable.
- Shipping the prototype module or TUI shell — the verdict is worth promoting;
  prototype code is not production code.
