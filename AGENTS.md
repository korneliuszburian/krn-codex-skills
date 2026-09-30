# KRN Agent Skills

This private repository owns KRN's universal Codex skills and reusable process.
Product repositories own their language, commands, and gates. The installed
contract is `config/AGENTS.md`; this file adds only facts true for this checkout.

## Repository map

- `config/AGENTS.md`: installed global contract; keep local facts out of it.
- `skills/<group>/<name>/`: one promoted workflow with its direct resources.
- `skills/manifest.json`: install names, paths, invocation, and retirement.
- `scripts/`: CLI, hooks, and runtime modules under `lib/<owner>/`.
- `test/`: owner-scoped suites and top-level integration checks.
- `.agents/skills/`: generated skill export; regenerate with `krn skills export`, gated by `skills:check`.
- `.github/`: CI workflow; `npm run gate` is the local equivalent of the gate sequence.
- `test/bootstrap-fixture/`: retained installed-release smoke.
- `CONTEXT.md`: current shared vocabulary and knowledge index.
- `docs/research/`: source-backed synthesis curated by its README.
- `docs/adr/`: earned, hard-to-reverse decisions.
- `docs/capabilities.md`: global capability profiles and evidence states.
- `docs/migration.md`: installation ownership, retirement, and rollback.
- `.krn/runs/`: ignored working state; durable artifacts never live there.
- `README.md`: operator entrypoint and human skill catalog.

## Working rules

1. Run `git status --short --branch` before editing; preserve unrelated work.
2. Read the affected `SKILL.md` and direct references. Before external-source
   lookup or reviewing a source-backed decision, read `docs/research/README.md`,
   search its index for the source or question, and follow the matching topic.
   Its reuse and refresh rules decide whether new research is needed. Consult
   `CONTEXT.md` when vocabulary or ownership may move.
3. Do not add per-skill mirrors; durable
   knowledge keeps one owner per artifact, defined by `CONTEXT.md` and the
   research curation contract.
4. Cross into another checkout through `$target-repo-work`; manage the installed
   index through `$managing-codex-capabilities` under its authority.
5. Never vendor private source material, raw corpora, or copied passages.
6. Reusable contracts never carry a physical checkout or mount prefix.
7. A merge commit that resolves a harness-surface conflict is itself a surface
   commit: it carries a `Change-contract: <unchanged check>:green->green`
   trailer, and the integrator runs the full gate on the merged fixed point.
8. A conflicted merge or rebase is continued, aborted, or committed only under
   the operator's authority; the composed upstream `resolving-merge-conflicts`
   procedure is guidance, not a mandate.
9. Retire an owned merged branch locally and remotely, and remove its worktree,
   in the same close-out under recorded deletion authority. Report any blocked
   cleanup; a merged branch does not itself grant authority over another owner's
   branch or worktree.

## Local gates

The global contract owns proof budgeting; `package.json` owns gate composition.
`gate:fast` contains cheap rejectors, including `quality:audit`; `gate:deep`
covers install, bootstrap, and seal checks. Before the integrator hands off a
changed fixed point, run `npm run gate` once on that fixed point. Read-only
findings do not require the full gate. Use the Node version pinned in
`.node-version`; running gates does not authorize host toolchain changes.

Work on a branch you own; reuse the current outcome's recorded publication authority without per-step prompts. Stop outside its scope.
Installation, retirement, and rollback follow
`scripts/lib/install/install-release.mjs` and `docs/migration.md`.
