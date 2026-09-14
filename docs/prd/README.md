# PRDs

Status: `accepted`. Consumer: an external implementer (for example GPT-6 Astra in
ChatGPT with the GitHub connector) and the maintainer who verifies the pull
request. Owner: maintainer. Verified: 2026-09-14.

Agent-facing feature requests: one file per task batch, numbered. A PRD is a
complete brief — the artifact, its consumer, acceptance criteria, the cheapest
falsifier, and the exact commands that prove it. It exists so an external model
can implement a batch on a branch without spending Codex quota on exploration.

## Index

- [0001 blind-mutation evaluation](0001-blind-mutation-evaluation.md) — score the judge swarm with seeded faults.
- [0002 LT-5 power simulation](0002-lt5-power-simulation.md) — test the promotion statistic before buying runs.
- [0003 LT-5 fixture mechanism diversity](0003-lt5-fixture-mechanism-diversity.md) — mechanism-distinct fixtures.

## Lifecycle

A PRD is current work, not durable knowledge. Delete its file and its index row
once the artifact lands or the task is rejected; the landed code, its test, and
any ADR are then the owner. Never keep a landed PRD as a second description of
shipped behavior.

## Handoff contract

An external agent implements a PRD on a branch and opens a pull request. It must
not push to `main`.

1. Branch: `prd/<number>-<slug>`.
2. Run the local gate: `npm run gate`. A pull request is not done until it is
   green.
3. Commit with a falsifiable `Change-contract: <ref>:red->green` trailer. The
   trailer rule is owned by `config/AGENTS.md` and
   `docs/research/orchestration.md`; this page only says how to satisfy it here.
   `<ref>` is an npm script in `package.json` or an existing `test/**/*.mjs`
   path, unchanged in the range and not self-authored. A PRD that adds a test
   must also name it in a script, so the touched script and the new test are
   both self-authorized; declare a different unchanged check (for example
   `test:catalog`) instead, or run `changes check --before` with a frozen
   observer. The `red->green` is declared, not executed — the LT-3 residual
   recorded in `docs/research/lab-tests.md`.
4. Open a pull request; CI (`validate`) must pass on the head. The Codex Astra
   lane then verifies the diff and merges.

## Rules

- All paths are repository-relative. Never write a checkout or mount prefix.
- State the cheapest falsifier first and prove RED before the fix.
- Prefer the smallest change that uses existing files; add a file only when it
  owns a rule that nothing else owns.
- No secrets, no vendored private source, no raw corpora.
