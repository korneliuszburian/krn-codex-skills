# ADR 0007: Canonical frontend source and project creation

- Status: accepted
- Date: 2026-09-21
- Decision owner: KRN skill-system maintainer
- Evidence: [frontend harness synthesis](../research/frontend-harness.md)

## Context

`krn-codex-skills` owns reusable workflows, gates, and evaluator machinery. It
does not contain a production frontend project and must not quietly become one.
The current `frontend-library` skill contains a useful checked-in CSS snapshot,
but editing that snapshot and a production boilerplate independently would
create two authorities. A package dependency would avoid copying bytes but
would make new projects dependent on availability and surprise upgrades. A
sample application committed to KRN would confuse an evaluator fixture with the
production starter.

The selected production integration is `Rekurencja/boilerplate-rekurencja`.
The public Set Studio boilerplate and pull request 15 remain upstream recipe and
tooling provenance, not a second production source.

## Decision

The Rekurencja boilerplate is the sole writer of the stable production frontend
core and the sole owner of the new-project procedure. KRN owns the generic
frontend workflow, import verification, task contracts, sealed evaluator, and
lab-test. The `frontend-library` skill is a generated, checked-in consumer of a
boilerplate export carrying source revision, schema version, path set, upstream
provenance, and per-file digests; it is never edited as an independent library.

Project creation is an explicit product operation in the boilerplate, not an
implicit step in KRN. The source repository must expose one discoverable
instruction page linked from its entrypoint and one executable creation path.
That path takes an empty destination outside the KRN checkout, creates a
self-contained project, records the exact boilerplate revision and exported-core
manifest, and runs the starter's own cheapest build/smoke proof. The instruction
is incomplete until its literal command has been executed against a disposable
destination and the resulting project can be opened by a fresh session without
chat-only knowledge.

The complete starter may contain stable core, tooling, WordPress/ACF adapter,
and project scaffolding, but those concerns remain classified in its manifest.
An HTML/CSS/CUBE evaluator workspace may project the same core without creating
a second starter. WordPress/ACF tasks materialize a disposable project through
the recorded creation path. Files under KRN's task fixtures are evaluator inputs
or known-good/mutant fixtures, never the canonical production project.

The core is independent of a particular WordPress filesystem, editor, or theme
adapter. The first executable profile is `bedrock-acf`, decomposed as runtime
`bedrock-frankenphp`, content model `acf-flexible-content`, and theme adapter
`custom-php`. Future classic-WordPress, Block Editor, or Roots/Sage profiles
must project the same provenance-carrying core through their own adapters; they
must not fork or become additional writers of CSS and tokens. This decision
reserves those seams but does not claim those future profiles are implemented.

A created project receives a physical copy of the stable core so it remains
self-contained. It configures core recipes through tokens and custom properties,
adds a named exception or a genuinely new block when earned, and never edits the
copied core locally. Core updates are explicit migrations verified against the
recorded manifest; they are not floating dependency upgrades.

KRN's generated snapshot and KRN's frontend procedures are separate artifacts.
The importer may materialize and verify the snapshot but never becomes the writer
of procedure. Project-aware audits resolve canonical vocabulary from the
project's recorded core manifest, so tooling carrying core B cannot silently
reinterpret a project pinned to core A. Promotion requires a named existing
browser/build/audit consumer that rejects a behavior-regressing but internally
digest-consistent bundle; rollback restores the complete admitted identity.

## Consequences

- Creating a project becomes a tested deliverable rather than an undocumented
  assumption between the skills repository and a private checkout.
- CI can verify the checked-in skill snapshot without network or private-remote
  access, while an authorized source-side job can prove the export came from the
  boilerplate.
- KRN does not gain a demo application, production database, theme, or duplicate
  component library.
- A new runtime/editor combination is a named project profile and adapter, not a
  new frontend-core authority.
- The first implementation unit must inspect the boilerplate's real scripts and
  document the command they actually provide; this ADR does not invent a command
  that the source repository cannot execute.

## Rejected alternatives

- Make `frontend-library` the source and copy it back into the boilerplate: this
  reverses production ownership and leaves WordPress/tooling integration split.
- Keep both copies curated by hand: drift is already observable and no reviewer
  can tell which copy should win.
- Commit a full frontend project under `krn-codex-skills`: that conflates a
  product starter with the generic harness and gives fixtures production
  authority.
- Depend on a moving package or remote checkout at project runtime: projects
  stop being self-contained and upgrades cease to be explicit migrations.

## Supersession rule

Replace this ADR only when a measured production consumer cannot be served by a
physical, provenance-carrying copy, or when the boilerplate is retired and a
named successor assumes both stable-core and project-creation ownership. The
successor must migrate the generated skill snapshot and all live projects.
