# Context

## System

**Global system** — the universal KRN engineering workflows versioned here and
projected into the installed skill index.

**Source repository** — this versioned checkout. It owns KRN skill source,
installation metadata, validation, and migration history.

**Installed skill index** — the discoverable entries under
`~/.agents/skills`. It may contain KRN symlinks, vendor skills, and other
independently owned entries; discovery does not imply ownership.

**Global instruction core** — the one semantic contract in
`config/AGENTS.md`. Codex loads its installed symlink directly; Claude loads it
through a `CLAUDE.md` symlink. Tool-specific entrypoints do not copy the rules.

**Domain extension** — repo-local knowledge or procedure that only makes sense
inside one product. It may compose a global workflow but does not copy it.

**Vendor skill** — an independently installed third-party skill. This
repository neither vendors nor silently replaces it.

**Workflow owner** — the single skill responsible for one repeated process.
Two skills may compose; they may not both own the same sequence.

**Trigger collision** — two active descriptions claim the same task without a
clear process/reference relationship. Different names do not make a collision
safe.

**Artifact-role resolver** — the repository-owned
`docs/agents/artifact-paths.json` mapping from semantic roles such as
`working_runs` and `retained_reports` to repository-relative paths. A workflow
names the role and its own child layout; the current mount point is not
semantic state.

## Engineering

**Vertical slice** — the smallest path from a real caller through a public seam
to an observable result.

**Public seam** — the interface where callers and proof observe behavior. It is
chosen for the product, not created only to make a test easy.

**Proof budget** — `0/1/N`, the number of new falsifiers justified by changed
risk: none for mechanical or already-covered work, one for one runtime contract,
and more only for distinct acceptance requirements.

**Tight loop** — the fastest repeatable signal that can disagree with the
current change or reproduce the reported fault.

**Proof theater** — verification that looks substantial but cannot falsify the
claim: implementation-coupled tests, prose snapshots, file counts, tautological
expected values, or CI treated as the delivered feature.

**Publication** — commit, push, PR, deployment, or skill installation.
Publication state is reported separately from semantic completion.

## Sources

**Mechanism** — a transferable causal rule distilled from a source.

**Decision** — adopt, reject, lab-test, or defer a mechanism for a named
consumer and falsifier.

Source material supports a decision; it does not replace current code, runtime
evidence, or product authority.
