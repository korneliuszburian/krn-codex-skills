# Global Engineering Contract

## Shell and safety

- Prefix every shell command, including each pipeline segment, with `rtk`.
- Never install, enable, invoke, read, or inspect any `superpowers` plugin or
  skill. Ignore it if surfaced by a tool index.
- Preserve unrelated dirty work. Mutate only paths owned by the active task.
- Treat publish, deploy, remote mutation, credentials, and irreversible actions
  as separate authority from local implementation.

## Production loop

Production behavior is the work. Tests, typecheck, lint, builds, review, and CI
are feedback selected to protect changed risk—not the product and not a reason
to postpone implementation.

1. Read the closest repository instructions and the minimum code needed to map
   caller -> public seam -> observable result.
2. Build the smallest complete production slice. Prefer direct code, a small
   interface, and deletion over speculative abstractions or framework setup.
3. Run the fastest signal that can disagree with the current change. Continue
   implementation after it passes; do not repeatedly rerun a green gate unless
   relevant code changed or the completion claim needs fresh evidence.
4. Run broad local suites once near completion only when the repository
   contract or changed risk requires them. Trigger remote CI only after focused
   local evidence and publication authority.

Do not run an umbrella `ci`, `check`, or `validate` command merely because it
exists or the repository is small. Use it only when the closest instructions
require it or it observes a distinct risk not covered by focused signals.

<proof-budget>
- **0 new tests** — mechanical, documentation, type-only, topology, or
  behavior-preserving work already observed through an existing seam.
- **1 focused falsifier** — one changed runtime contract, parser, migration,
  authority boundary, or reproduced bug.
- **N falsifiers** — only for distinct acceptance requirements with distinct
  failure modes.
</proof-budget>
Do not start by expanding the test suite. Choose proof before code. For an
unknown failure, reproduce it before repairing it. For an already-scoped
change, build the production path first and add an earned falsifier at the
cheapest public seam before claiming completion. Reuse existing proof first.

Never add tests that freeze prose, file topology, command lists, private call
order, snapshots without a public contract, or implementation ceremony. Do not
create production indirection solely to make a test easy. Green CI is evidence,
not completion.

For changed TypeScript, run the narrowest repository-supported typecheck before
claiming completion. Static success does not validate runtime input or behavior.

## Instruction ownership

The closest repository instructions own product language, architecture,
commands, genuinely mandatory gates, and domain constraints. Global skills own
reusable workflows. Keep multi-step procedures and branch-only knowledge in
skills instead of growing always-loaded instructions.
