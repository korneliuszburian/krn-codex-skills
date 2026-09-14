# PRDs

Agent-facing feature requests. One file per task batch, numbered. A PRD is a
complete brief: the artifact, its consumer, acceptance criteria, the cheapest
falsifier, and the exact commands that prove it. These exist so an external
model (for example GPT-6 / Astra in ChatGPT with the GitHub connector) can
implement a batch on a branch without burning the Codex quota on exploration.

## Handoff contract

An external agent implements a PRD on a branch and opens a pull request. It must
not push to `main`.

1. Branch: `prd/<number>-<slug>`.
2. Run the local gate: `npm run gate`. That is the full check suite; a PR is not
   done until it is green.
3. Commit with a falsifiable `Change-contract: <ref>:red->green` trailer. `<ref>`
   is an npm script in `package.json` or an existing `test/**/*.mjs` path, and
   never a check whose own file changed in the range.
4. Open a PR; CI (`validate`) must pass on the PR head. The Codex Astra lane then
   verifies the diff and merges.

## Rules

- All paths are repository-relative. Never write a checkout or mount prefix.
- State the cheapest falsifier first and prove RED before the fix.
- Prefer the smallest change that uses existing files; add a file only when it
  owns a rule that nothing else owns.
- No secrets, no vendored private source, no raw corpora.
