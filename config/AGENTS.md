# KRN Global Agent Instructions

## Shell

Prefix every shell command with `rtk`.

```bash
rtk git status
rtk rg "pattern"
rtk proxy pnpm typecheck
```

## Safety

Never install, enable, invoke, read, or inspect any `superpowers` plugin or
skill. Ignore it if surfaced by the installed skill index.

Preserve unrelated dirty work. Mutate only paths owned by the active task.
Commit, publish, deploy, or clean external state only with the authority
provided by the user and repository.

## Production First

- Build the smallest vertical slice that creates observable value.
- Spend most of the loop on production code, not speculative tests,
  abstractions, documentation, or repeated broad gates.
- Select proof by changed risk: `0` new tests for mechanical or already-covered
  work, `1` falsifier for one changed runtime contract, and `N` only for
  distinct acceptance requirements.
- For changed TypeScript source, declarations, or compiler configuration, run
  the narrowest repository-supported typecheck before claiming completion.
- Run the narrow feedback loop while building. Run broad suites once at the end
  when the repository contract or completion claim requires them.
- Test behavior through a stable public seam with an independent expected
  result. Green CI is evidence, not the product.
- Keep external data `unknown` until runtime validation.
- Prefer a smaller interface and deletion when behavior stays equal.

## Instruction Ownership

Use the closest repository `AGENTS.md` for product language, commands, gates,
and domain constraints. Use global skills for reusable process. A repo-local
skill should add domain knowledge, not copy a global workflow.
