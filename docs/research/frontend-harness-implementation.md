# Frontend harness implementation plan

Status: `lab-test`. Consumer: `$delivery-loop`, `$slice-work`, the unit
implementer, LT-8, and the maintainer. Owner: maintainer. Verified: 2026-09-21.

This page is the durable execution contract for
[the frontend harness architecture](frontend-harness.md),
[ADR 0007](../adr/0007-canonical-frontend-source-and-project-creation.md), and
[ADR 0008](../adr/0008-sealed-frontend-evaluation.md). It exists because the
outcome crosses repositories and fresh implementation contexts. It is not a
progress log, ticket queue, or permission to publish, install, merge, or mutate
a remote. Rewrite unit state in the active outcome capsule or configured tracker;
rewrite this page only when the dependency graph or acceptance contract changes.

The plan's sole durable consumer is the frontend-harness outcome through its
implementation and LT-8 release decision. Delete this page after FH-17 completes
and its surviving contracts are owned by code, ADRs, and the LT-8 result. If the
architecture changes first, the maintainer supersedes this page in place and
re-cuts every affected downstream unit.

## Outcome and authority

Deliver a sealed, discriminative frontend evaluation path for semantic HTML,
CSS, CUBE CSS, WordPress, and ACF Flexible Content, backed by one canonical
production starter and a generated skill snapshot. The implementation succeeds
only when it can create a real disposable project, keep candidate and evaluator
workspaces separate, report independent result axes, run known-good/mutant
fixtures, and execute an honest paired LT-8 pilot without claiming uplift from
the mechanism alone.

Authority is deliberately split:

| Surface | Sole writer | Consumer |
|---|---|---|
| Stable frontend core, tooling integration, WordPress/ACF adapter, project creation | `Rekurencja/boilerplate-rekurencja` | created projects and the export artifact |
| Generated CUBE snapshot | KRN importer, from one admitted boilerplate export | project agents, project audit, and evaluator tasks |
| Generic frontend procedures | the owning KRN frontend skills | project agents and the frontend treatment profile |
| Generic v1/v2 task/result contracts, isolation, evaluator axes, LT lane | `krn-codex-skills` | harness tasks and LT-8 |
| Experimental tasks, private Complete CSS evidence, large captures | the lab checkout/storage | registered LT-8 only |
| Project brand, content, art direction, and earned project blocks | the created product project | that product only |

No unit may make KRN the canonical frontend application or make a task fixture
the production starter. The current branch owns only KRN-side documentation and,
later, KRN-side units. Boilerplate changes require a separate isolated worktree,
branch, writer, and proof. The lab corpus likewise stays outside this checkout.

## Project creation is a required capability

There is intentionally no frontend project under `krn-codex-skills`. Therefore
"start the frontend harness" cannot mean "edit the current repository until a
site appears." Before any product-like task is admitted, the boilerplate must
own and prove the following new-project contract:

1. Its main entrypoint links one canonical project-creation instruction page.
2. The page names a literal executable command already supported by that
   checkout; the implementation unit inspects the real scripts before choosing
   the command and does not invent an aspirational CLI.
3. The command refuses a non-empty destination unless an explicit future
   migration mode owns that case. The normal path writes outside both source
   repositories into a disposable or user-selected project directory.
4. The result is a self-contained complete starter, not a thin sample. It carries
   stable core, build tooling, WordPress/ACF integration, and project scaffolding
   while keeping those classes manifest-distinguishable.
5. The result records boilerplate revision, export schema, per-file core digests,
   and the creation command or equivalent reproducible parameters.
6. The instructions include dependency setup, local start/build, the cheapest
   smoke check, where project design facts live, how core updates are migrated,
   and which files are project-owned. Credentials and production data are never
   seeded.
7. The unit executes the documented path against an empty temporary destination,
   runs the emitted smoke check, verifies the recorded core, and removes the
   disposable project. A prose-only walkthrough is not acceptance.

HTML/CSS/CUBE tasks may use a reduced public workspace generated from the same
manifest, but that projection is not a second starter. WordPress/ACF tasks use a
disposable project created through this path or a hermetic fixture derived from
and verified against its recorded artifact. CI must not require access to the
private remote after the artifact has been admitted.

## Operational preflight: repair the compaction boundary separately

Long execution spans fresh contexts, so the current memory-hook defect must be
fixed before the multi-unit run relies on automatic continuation. This is a KRN
runtime preflight, not a frontend architecture dependency and not part of LT-8's
treatment.

Observed on 2026-09-21 with Codex CLI `0.154.0` and installed KRN release
`05be389adaf13af9b8d22d085e312d8d94093366`:

- invoking the installed hook for an active capsule and
  `hook_event_name=PreCompact` exits `0` and prints syntactically valid JSON with
  top-level `hookSpecificOutput`, `hookEventName: PreCompact`, and
  `additionalContext` (3607 bytes in the reproduced case);
- Codex reports `hook returned invalid PreCompact hook JSON output`;
- the current script says PreCompact "never signals" but appends every active
  capsule to `notes` and emits the same event-specific context shape used by
  `SessionStart`;
- commit `206c0a9` introduced PreCompact context injection, while `cc06653`
  added the correct SessionStart channel without removing the old output;
- the official hook contract allows only common output fields for PreCompact,
  while `hookSpecificOutput.additionalContext` is explicitly supported for
  SessionStart. After compaction, SessionStart with source `compact` is the
  model-context delivery point.

The repair unit is `KRN-HOOK-01`: make PreCompact persist `boundary.md` and exit
silently on success; keep capsule context delivery in SessionStart, including
source `compact`; split the test helper by event and prove the current
PreCompact-specific output red before changing code. Its focused falsifier must
assert both sides: PreCompact writes the boundary and emits no stdout, while
SessionStart emits valid `additionalContext` and does not write the boundary.
Also remove the old test assertion that PreCompact injects context. Run this in
a separate commit with `Change-contract: test/hooks-guard.test.mjs:red->green`.

The local `test/hooks-guard.test.mjs` fixture can be masked when `/tmp/.git`
exists, because `worktree_root()` then treats `/tmp` as a repository root and
does not discover the nested temporary capsule. That fixture-environment defect
is distinct from the host schema mismatch; the repair must place the fixture in
a root whose repository identity is explicit or otherwise prevent the ambient
`/tmp/.git` from changing discovery. A green host-schema test may not be claimed
until both failure modes are separated.

Primary contract: [OpenAI Hooks documentation](https://developers.openai.com/codex/hooks).

## Decomposition choice

Use expand–migrate–contract. The current manually copied `frontend-library`, v1
task/result shape, and candidate-visible `cube-block` check are live compatibility
surfaces. The new source export, project creation, v2 contracts, and evaluator
must coexist with them until all admitted v2 tasks and project consumers are
green. Only then may the obsolete authority and visible oracle be removed.

## Work units

### FH-01 — Expand: classify and export the canonical core at its source

- **Repository:** an isolated `boilerplate-rekurencja` worktree.
- **Entry → exit:** the starter behaves unchanged but core/project ownership is
  implicit → every stable file is classified as `core`, `tooling`, `wordpress`,
  or `project`, and one deterministic export emits schema version, source commit,
  upstream provenance, path set, and per-file digests while excluding project
  material.
- **Fastest falsifier:** mutate one exported byte or admit one project-only file;
  the source reproducibility check fails while the unchanged tree passes.
- **Decision carried:** the boilerplate is the physical one-writer source; Set
  Studio PR 15 is provenance; stable recipes are exact.
- **Dependencies:** none. Blocks FH-02 and FH-03.
- **Rollback:** additive exporter and manifest; runtime and current projects stay
  unchanged.

### FH-02 — Expand: executable project creation and operator instructions

- **Repository:** the same isolated boilerplate line after FH-01.
- **Entry → exit:** project creation is implicit/chat-dependent → the repository
  entrypoint links one instruction page whose literal command creates a
  self-contained project in an empty external destination, records FH-01
  provenance/digests, and passes the emitted starter smoke check.
- **Fastest falsifier:** execute the documented command in a disposable empty
  directory, then alter the command, source revision, destination state, or one
  copied core byte; stale instructions, unsafe overwrite, and provenance drift
  must fail by name.
- **Decision carried:** there is no project in KRN; one complete boilerplate owns
  setup, and a fresh session must be able to follow the repository alone.
- **Dependencies:** blocked by FH-01's manifest contract. Blocks FH-06, FH-12,
  and FH-13.
- **Rollback:** creation is additive and targets a new directory; no existing
  project or database is rewritten.

### FH-03 — Expand: reproducible `frontend-library` import

- **Repository:** KRN.
- **Entry → exit:** the skill keeps its current bytes → KRN imports a source
  bundle only when revision, schema, paths, provenance, and digests agree, and
  verifies the checked-in snapshot without the private remote.
- **Fastest falsifier:** digest mismatch, undeclared file, missing source
  identity, or hand edit to the generated snapshot is rejected.
- **Decision carried:** generated consumer, never a second writer.
- **Dependencies:** blocked by FH-01. Blocks FH-06.
- **Rollback:** the current snapshot remains accepted until the first valid
  manifest is explicitly migrated.

### FH-04 — Expand: versioned sealed task and result contracts

- **Repository:** KRN.
- **Entry → exit:** v1 tasks continue to load → v2 declares track, public
  workspace, sealed evaluator, environment, viewports, perturbations, state
  paths, evidence, public requirement identities, per-axis applicability, and a
  multi-axis result without changing v1 behavior. Every sealed assertion names
  the public requirement it verifies; an omitted measurement differs from an
  explicit, justified `not-applicable` result.
- **Fastest falsifier:** malformed track, evaluator inside public workspace,
  assertion without a public requirement, missing or false axis applicability,
  missing environment identity, unknown version, lost CLI-to-runner-to-result
  field, or weighted aggregate is refused; retaining a public requirement while
  hiding its answer is valid and existing v1 checks remain green.
- **Decision carried:** hidden answer but no hidden requirement; two tracks; no
  magic score.
- **Dependencies:** none. Blocks FH-05, FH-08, FH-09, FH-10, FH-13, and FH-14.
- **Rollback:** versioned loader dispatch preserves v1.

### FH-05 — Expand: isolated runner and environment digest

- **Repository:** KRN.
- **Entry → exit:** the runner copies one visible workspace → v2 uses a selected
  containment backend, copies only public input, denies candidate access to the
  oracle and trusted result writer, records network behavior, freezes output and
  terminates candidate descendants before external evaluation, then evaluates
  the frozen artifact under a separate authority and attaches a measured
  environment digest. The sentinel is one leak detector, not proof of
  unreachability.
- **Fastest falsifier:** an adversarial fixture attempts forbidden filesystem,
  symlink, inherited-state, network, post-handoff mutation, answer-store read,
  and trusted-result write paths; every attempt is denied and recorded. A real
  browser/font/locale change must invalidate the measured environment identity.
- **Decision carried:** evaluator is outside the candidate sandbox; captures are
  immutable and paired only under the same environment.
- **Dependencies:** blocked by FH-04. Blocks FH-08, FH-09, FH-10, FH-12, and
  FH-13.
- **Rollback:** v1 lane runner remains callable until contract.

### FH-06 — Migrate: classify drift and promote the generated core

- **Repositories:** boilerplate classification fixed point plus KRN importer;
  one writer per repository and one integrator per branch.
- **Entry → exit:** source and skill copies disagree → every file has an
  adopt/reject/defer disposition, the boilerplate export is sole admitted source,
  the skill snapshot is regenerated, and manifest-selected consumers resolve an
  unchanged project's recorded core rather than silently interpreting it through
  the newest KRN bundle. Browser, build, and existing project-audit behavior is
  preserved for a named legacy consumer until an explicit core migration.
- **Fastest falsifier:** source export plus KRN import checks catch deliberate
  drift in `flow`, `grid`, `wrapper`, `text`, tokens, or a stable block; a
  digest-consistent export that changes the named legacy consumer fails its
  browser/build/audit check, while a project pinned to core A retains A under
  tooling carrying B and an explicit A→B migration selects B.
- **Decision carried:** public recipes plus accepted production evolution become
  core; project art direction and experiments do not.
- **Dependencies:** blocked by FH-01, FH-02, and FH-03. Blocks FH-08 and FH-11.
- **Rollback:** file-level dispositions and one manifest allow whole promotion
  revert; no mixed manual/generated authority survives.

### FH-07 — Migrate: align KRN frontend procedures with the method

- **Repository:** KRN; `skills/frontend/frontend-components/SKILL.md` owns the
  block-size procedure and `skills/frontend/frontend-architecture/SKILL.md` owns
  design consolidation and ACF intake. The importer is not their writer.
- **Entry → exit:** live workflow instructions can require a split solely at
  ~80–100 lines and can conflate heading semantics with visual size → the owning
  frontend skills define minimum code as reuse/deletion, treat size as a review
  smell rather than a source-code budget, separate semantic heading level from
  visual token role, and allow reviewed semantic/structural choices that are not
  presentation tokens.
- **Fastest falsifier:** procedure acceptance cases exercise those exact skills
  with a valid block over 100 lines that has no better composition boundary,
  independent semantic/visual heading combinations, and a justified non-token
  structural choice; the workflow, synthesis, and evaluator contract agree on
  all three without weakening the thin-block or token-bypass rules.
- **Decision carried:** KRN owns generic procedures; generated resources never
  rewrite them, and candidate instructions must describe the method the evaluator
  measures.
- **Dependencies:** none; it may run beside FH-01/FH-04/FH-06 and joins only at
  task/treatment admission. Blocks FH-12, FH-13, and FH-15.
- **Compatibility:** existing project work and the current project audit retain
  their pre-migration semantics; no v2 task or LT-8 treatment is admitted until
  both live procedure owners pass the named cases.
- **Rollback:** revert the one bounded procedure commit and keep v2 tasks and the
  treatment profile unadmitted; the generated snapshot, importer, existing
  projects, and current project audit remain unchanged.

### FH-08 — Migrate: canonical architecture evaluator axis

- **Repository:** KRN.
- **Entry → exit:** project audit emits a broad policy summary → a sealed task
  evaluator emits named failures for core digest, local knockoff, ownership,
  token bypass, exception naming, and duplicate module/ACF identity.
- **Fastest falsifier:** one targeted mutation per independent rule is red and
  the canonical known-good project is green.
- **Decision carried:** custom property → named exception → new block → upstream
  core edit; minimum code means reuse and deletion, not numeric limits.
- **Dependencies:** blocked by FH-05 and FH-06. Blocks FH-12 and FH-13.
- **Rollback:** the new axis is additive; current project audit remains the gate
  until FH-17.

### FH-09 — Migrate: responsive, interaction, and accessibility state paths

- **Repository:** KRN.
- **Entry → exit:** browser evidence supports viewport and a simple click path →
  v2 executes declarative state transitions and perturbations with named runtime,
  focus, ARIA/ACT, overflow, target-size, contrast, long-content, zoom,
  reduced-motion, and manual-unknown results.
- **Fastest falsifier:** broken Escape/focus return, hidden focus, 320px overflow,
  long Polish copy, 200% text, and reduced motion each fail their own requirement;
  a known-good path passes.
- **Decision carried:** state graph, not one hard-coded click; automated a11y is
  partial evidence only.
- **Dependencies:** blocked by FH-04 and FH-05. Blocks FH-12 and FH-13.
- **Rollback:** existing signed browser evidence remains valid; v2 uses a
  versioned schema.

### FH-10 — Migrate: geometry and visual evidence axis

- **Repository:** KRN.
- **Entry → exit:** only project screenshots/measurements exist → sealed
  evaluation supports semantic anchors, component matching, geometry, raw pixel
  mismatch, and diagnostic perceptual metrics with track-specific authority.
- **Fastest falsifier:** independently corrupt presence, placement, typography,
  color, and a secondary image; the appropriate anchor/geometry/raw metric must
  catch each intended corruption. No perceptual hard gate exists before blinded
  human calibration.
- **Decision carried:** exact pixels only in source-fidelity; class/DOM identity
  is not the target; VLM diagnostics never override deterministic evidence.
- **Dependencies:** blocked by FH-04 and FH-05. Blocks FH-12 and FH-14.
- **Rollback:** design-transfer reports visual evidence without granting it sole
  pass authority.

### FH-11 — Migrate: deep Text profiles and smart ACF normalization

- **Repository:** an isolated boilerplate worktree based on the promoted core.
- **Entry → exit:** Text clones expose an unconstrained or duplicated surface →
  one field group and renderer serve standalone/Hero/CTA/Media Content profiles
  with defaults, allowed, locked, and hidden values in one code-owned map used by
  both editor and render-time validation.
- **Fastest falsifier:** duplicate fields/renderers, raw CSS choice, profile-
  invalid value, known legacy token, a newly admitted real design role, lock/
  default precedence, and independent semantic/visual heading choices take
  distinct paths; stale fallback is reported rather than silently discarded.
- **Decision carried:** Text owns eyebrow/heading/body/actions composition;
  semantic heading level differs from visual role; token metadata usually
  supplies presentation choices; normalization may expand a justified system.
- **Dependencies:** blocked by FH-06. Before FH-13 consumes its output, a changed
  core is re-exported/imported and affected fixtures are re-admitted; an
  adapter-only change records the source/adapter identity and proves core
  unchanged. Blocks FH-13.
- **Rollback:** stored rows remain readable; old values are supported before any
  explicit data migration rewrites them.

### FH-12 — Migrate: HTML/CSS/CUBE discriminative task pack

- **Repositories:** KRN task contracts plus lab-owned corpus/captures; admitted
  fixtures only are committed to KRN.
- **Entry → exit:** `cube-block` is the sole frontend smoke → sealed tasks cover
  project creation, responsive reflow, interaction, design transfer, and
  canonical consolidation, each with known-good green and targeted red mutants.
- **Fastest falsifier:** run the deterministic evaluator against known-good and
  mutant fixtures without a model; every admitted mutation fails only its named
  requirement or documented coupled requirements.
- **Decision carried:** task diversity over screenshot repetition; product tasks
  receive canonical core; maintenance tasks test replacement of local knockoffs.
- **Dependencies:** blocked by FH-02, FH-05, FH-07, FH-08, FH-09, and FH-10,
  plus immutable lab-input receipts. Blocks FH-14, FH-15, and FH-16.
- **Rollback:** tasks coexist with `cube-block` until FH-17 proves no reader.

### FH-13 — Migrate: WordPress/ACF adapter task pack

- **Repositories:** boilerplate-derived disposable fixture plus KRN evaluator.
- **Entry → exit:** browser output and ACF topology are not jointly exercised →
  one sealed task separately reports rendered frontend and adapter correctness
  for clone ownership, Text profiles, static layout allowlist, reachability,
  escaping, token mapping, and stale-state normalization.
- **Fastest falsifier:** duplicate group, database-derived template path,
  unescaped output, invalid presentation state, and unreachable layout fail;
  the canonical created project passes.
- **Decision carried:** frontend and CMS adapter are separate axes; Flexible
  Content is the page composer; no Gutenberg, ACF Blocks, or page builder enters
  the baseline.
- **Dependencies:** blocked by FH-02, FH-04, FH-05, FH-07, FH-08, FH-09, and
  FH-11's source-artifact re-admission. FH-10 is additionally required when the
  admitted task claims geometry or visual evidence; otherwise FH-04 must record
  those axes as explicitly not applicable. Blocks FH-14, FH-15, and FH-16.
- **Rollback:** only disposable WordPress state is touched; no developer or
  production database is mutated.

### FH-14 — Migrate: bounded repair and paired raw reporting

- **Repository:** KRN.
- **Entry → exit:** the harness aggregates pass/tokens/wall → v2 retains raw
  per-trial output, separates one-shot from repair, permits at most one repair
  for one external causal category, and reports worst-viewport delta, cached/
  input/output/reasoning tokens, latency, retries, and artifact identities. The
  task contract defines category → axis → viewport ordering, direction, ties,
  errors, and missing data before repair; no cross-axis composite is introduced.
- **Fastest falsifier:** unconditional repair, mixed cohort aggregate, repair
  without a stable category, missing raw pair, or average improvement with a
  worse category-selected viewport is rejected; two viewports with conflicting
  axes, a tie, an error, and a missing measurement select deterministically.
- **Decision carried:** external verification beats self-critique; efficiency is
  evidence, never a source-code budget.
- **Dependencies:** blocked by FH-10, FH-12, and FH-13. Blocks FH-15 and FH-16.
- **Rollback:** generic v1 summaries stay available during migration.

### FH-15 — Migrate: admit the frontend treatment profile

- **Repository:** KRN protocol/profile; the lab only consumes its immutable
  receipt. Do not change the global default `harness_skills` export to satisfy
  this experiment.
- **Entry → exit:** broad lane flags and capability profiles do not establish the
  intended method → a disposable treatment profile names and delivers
  `$frontend-stage` plus its six frontend owners, while the control omits exactly
  that method and both lanes retain equivalent core, project facts, assets,
  hooks, evaluator exclusion, and unrelated KRN surfaces.
- **Fastest falsifier:** candidate-visible inventory and a delivery probe fail if
  any named frontend owner is missing from treatment, present in control, the
  oracle is visible, or any non-treatment surface differs. The receipt pins the
  profile, KRN revision, artifact hashes, and transport actually used.
- **Decision carried:** an installed or globally available skill is not proof
  that an experimental candidate received it; treatment delivery is measured.
- **Dependencies:** blocked by FH-07, FH-12, FH-13, and FH-14. Blocks FH-16.
- **Rollback:** the experiment-specific profile is additive and removable without
  altering default installation or global skill export.

### FH-16 — Migrate: LT-8 feasibility pilot and powered-run decision

- **Repositories:** KRN owns the sealed protocol/profile fixed point and result;
  the lab owns execution and private raw outputs. These are sequential handoffs,
  never one concurrent writer context.
- **Entry → exit:** LT-8 has architecture and anecdotes only → alternating paired
  control/treatment runs hold task/model/seed/budget/environment constant,
  preserve raw outputs, report one-shot and repair separately, and decide whether
  pilot variance and discrimination justify a larger run and required N.
- **Fastest falsifier:** before the first experimental candidate call, the sealed
  protocol revision, FH-15 treatment receipt, candidate-visible inventories,
  pairing/order, seeds/budgets, task mutation, project creation, raw retention,
  blinded qualitative decisions, repair cohorts, and pair completeness must pass.
  The revision must supersede the LT-8 row in `docs/research/lab-tests.md`, and
  the fixed-point readback must agree with the lab handoff. No uplift statistic
  is read before that admission.
- **Decision carried:** three pairs are feasibility only; a null or negative
  result changes adoption; maintainer-authored reference is acceptance, not
  independent evidence.
- **Dependencies:** blocked by FH-12, FH-13, FH-14, and FH-15. Blocks FH-17.
- **Rollback:** holdout tasks are never tuned after result inspection; a failed
  pilot leaves mechanisms available but unpromoted.

### FH-17 — Contract: remove obsolete frontend authority

- **Repository:** KRN, after every live consumer is enumerated.
- **Entry → exit:** admitted v2 tasks and project consumers use generated core
  and sealed evaluation → candidate-visible `cube-block` oracle, manual snapshot
  authority, and superseded frontend-only v1 paths are deleted while generic
  comparison and signed project verification with readers remain.
- **Fastest falsifier:** repository search and contract tests prove zero old
  consumer; full gate plus known-good/mutant suite stays green after deletion.
- **Decision carried:** one writer per artifact; delete only readerless surfaces.
- **Dependencies:** blocked by FH-16 and any migrate unit that still names an old
  consumer.
- **Rollback:** one contract commit names every deletion and is revertible as a
  fixed point.

## Dependency graph

```text
KRN-HOOK-01 (operational preflight; separate from frontend semantics)

FH-01 -> FH-02 -------------------------------------> FH-12/FH-13
   |
   +-----> FH-03 -> FH-06 -> FH-08 -> FH-12
                         |       |        |
                         |       +------> FH-13
                         +----> FH-11 --receipt-> FH-13

FH-07 ---------------------------------------------> FH-12/FH-13/FH-15

FH-04 -> FH-05 -> FH-08
   |        |       ^
   |        +----> FH-09 -> FH-12/FH-13
   |        +----> FH-10 -> FH-12/FH-14
   +-------------> FH-09/FH-10/FH-13

FH-12/FH-13 -> FH-14 -> FH-15 -> FH-16 -> FH-17
```

Only load-bearing edges apply. FH-01 and FH-04 may begin independently because
they have different repositories and seams. FH-09 and FH-10 may proceed
independently after runner isolation. FH-11 has a distinct boilerplate writer.
Parallel writers never share a worktree; one integrator per repository owns the
merged fixed point.

## Unit execution contract

For every unit:

1. Start one fresh implementation context with only that unit, its ADR/research
   pointers, dependency evidence, and repository instructions.
2. State repository, branch/worktree, sole writer, write authority, public seam,
   and cheapest proof before mutation.
3. For a new or changed runtime observer, demonstrate the named falsifier red at
   the entry fixed point, then make that same signal green. Documentation and
   behavior-preserving topology changes use the contract's zero-test or observed
   `green->green` budget instead of manufacturing a test.
4. Every harness-surface commit carries an exact `Change-contract` trailer and
   `npm run changes:check -- --before <entry-sha>` (or the repository-equivalent)
   must accept it before publication.
5. Record source/base/head revisions, dirty-state ownership, environment digest,
   raw evidence pointer, compatibility state, rollback, and net surface added or
   deleted. A model self-review is advisory, never completion proof.
6. Run the focused check first and the repository's full required gate once at
   handoff. Do not use a broad suite as the debugging loop.
7. Commit, push, open a PR, merge, install, publish tickets, deploy, or touch a
   remote only under the separately recorded authority for that operation.

## Phase exits

- **Readiness exit:** KRN-HOOK-01 is green when the outcome will depend on
  compaction; both repositories have owned clean worktrees; the project-creation
  destination and lab storage are explicit.
- **Expand exit:** FH-01 through FH-05 are green; a disposable project can be
  created; v1 behavior is unchanged; v2 refuses leaked evaluators.
- **Migrate exit:** FH-06 through FH-16 are green; every task has known-good and
  targeted-mutant evidence; LT-8 reports results and non-proofs.
- **Contract exit:** FH-17 proves no old reader, deletes obsolete authority, and
  the merged fixed point passes the full KRN gate and source-side required gates.

Ticket publication state: `NOT_REQUESTED`. The plan defines work units but does
not create, claim, or sequence tracker items. `$delivery-loop` may select exactly
one ready unit when lifecycle ownership is explicitly requested.

Supersession: rewrite this plan when an ADR changes, a source-side inspection
invalidates the project-creation/export assumptions, a unit cannot preserve its
entry invariant, or LT-8 changes the contract destination. Delete it under the
rule in the opening paragraph after FH-17 and the release decision are complete.
