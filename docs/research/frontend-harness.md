# Frontend harness and canonical boilerplate

Status: `lab-test`. Consumer: `$slice-work`, `$delivery-loop`, LT-8, and the
maintainer. Owner: maintainer. Verified: 2026-09-21.

This page owns the engineering decisions for a KRN frontend harness and the
canonical HTML/CSS/CUBE/WordPress/ACF substrate it evaluates. It complements
[frontend-delivery.md](frontend-delivery.md), which continues to own the build
method itself. [The implementation plan](frontend-harness-implementation.md)
owns project creation, the migration units, dependency graph, and phase exits.
No behavioral uplift is claimed before the registered LT-8 run.
The first real target and its two distinct claims are fixed by
[ADR 0009](../adr/0009-bloom-fidelity-and-transfer-benchmarks.md) and the
[Complete CSS/Bloom decision](complete-css-bloom-benchmark.md).

## Accepted outcome

Build a sealed frontend evaluation path that can distinguish whether the KRN
frontend method improves a fresh candidate's work. The path must evaluate real
HTML/CSS/CUBE work first and the WordPress/ACF adapter separately, preserve the
exact canonical CUBE recipes, keep project art direction open in the
`design-transfer` track, and reserve exact source reconstruction claims for the
`source-fidelity` track.

The production project factory and reusable-core authority is
`Rekurencja/boilerplate-rekurencja`. Its stable frontend core is exported with
source revision and per-file digests into
the `frontend-library` skill. The skill is a generated consumer, never a second
writer. The generic runner, task/result contracts, deterministic frontend
checks, and LT-8 lane belong in this repository. Private course material and
large captures remain outside Git; the experimental corpus remains a lab
consumer rather than an authority over production code.

Bloom is the first source-backed task. Its fidelity lane will start from the
Complete CSS 0.1.3 starter candidate after BL-03 independently authenticates and
admits it, not from the Rekurencja starter, and compares a candidate with a
frozen public design contract plus sealed known-good reference.
A different lane later starts from a generated Rekurencja static profile to test
method transfer. The WordPress/ACF lane remains a third, separate adapter claim.

There is no production frontend project in `krn-codex-skills`. Project creation
is therefore an explicit boilerplate-owned capability: a documented, executable
path materializes a self-contained project outside this checkout and records
the source/core provenance. KRN task workspaces are evaluator fixtures, never a
substitute canonical project. This ownership boundary is recorded in
[ADR 0007](../adr/0007-canonical-frontend-source-and-project-creation.md); the
sealed v2 migration boundary is recorded in
[ADR 0008](../adr/0008-sealed-frontend-evaluation.md).

## Resolved scope and claims

- Maintain two explicit tracks. `design-transfer` asks for an appropriate,
  high-quality responsive implementation from public method, content, assets,
  and screenshots. `source-fidelity` additionally exposes an explicit source
  contract and may require geometry IoU `1` and raw pixel mismatch `0`.
- Never apply the pixel-perfect claim to `design-transfer`. Its hard pass is a
  conjunction of execution, content/semantics, behavior, accessibility,
  responsive behavior, and canonical architecture. Geometry and visual metrics
  remain separate reported dimensions plus calibrated human review.
- Scope the production stack to semantic HTML, CSS, CUBE CSS, WordPress, and
  ACF PRO Flexible Content. React and Astro are deferred indefinitely and do
  not enter the baseline.
- Keep one-shot generation and bounded repair as separate cohorts and metrics.
  One-shot measures candidate capability; repair measures the workflow. A
  repair gets at most one classified causal category and must improve the worst
  viewport first.
- Minimize code through reuse, deletion, and deep canonical modules. This is
  not a line, byte, token, or arbitrary budget contest. Size may break ties only
  after correctness; the real requirement is zero local knockoffs, duplicate
  ownership, unused variants, and needless declarations.
- A three-pair run is a feasibility pilot, not evidence of generalization.
  Promotion needs independent tasks, paired lanes with common task/model/seed/
  budget/environment, interleaved order, raw per-pair outputs, and a sample size
  justified from pilot variance.
- Require known-good green and named mutants red without a model before any
  Bloom candidate call. Fidelity, static-profile transfer, and CMS adapter
  results are never collapsed into one quality claim.

## Grilling decision ledger

This ledger makes the accepted conversation frontier auditable. Later sections
own the detailed rationale; this list prevents a fresh implementation context
from silently dropping a decision or reverting a correction.

1. Keep `design-transfer` and `source-fidelity` as separate claims and tracks.
2. Put the generic runner/evaluator contracts in KRN, the experimental corpus in
   the lab, and the physical production core in the boilerplate; placement is
   proven through the export seam rather than by promoting the whole sandcastle.
3. Use Complete CSS as private evidence and commit only original distilled
   mechanisms.
4. Baseline only HTML, CSS, CUBE, WordPress, and ACF; React/Astro stay deferred.
5. Enforce exact canonical recipes; less project code comes from reuse rather
   than approximate conventions.
6. Report one-shot and repaired candidates separately.
7. Pin an immutable site capture only for a reproducible fixture; public
   "archives" primarily mean article and course archives.
8. Maintain one canonical frontend library, refined below as a generated export
   rather than an independently edited skill copy.
9. Start projects from one thoroughly prepared boilerplate that actually carries
   the runtime, frontend core, tooling, and WordPress adapter.
10. In design transfer, constrain mechanics but leave composition choice,
    hierarchy, and art direction open; source fidelity may constrain more.
11. Evaluate rendered frontend and WordPress/ACF adapter correctness as separate
    result axes.
12. Keep ACF Flexible Content in scope, but derive its detailed model from real
    reusable components rather than prematurely freezing a universal schema.
13. Treat code minimization as architectural consolidation and deletion, never
    as arbitrary line, byte, token, or budget limits.
14. Do not manufacture a quota of historical website versions; collect the
    useful public archive and capture only benchmark fixed points.
15. Treat Set Studio pull request 15 as SugarCube/Vite/DTCG provenance and the
    Rekurencja boilerplate as the production integration.
16. Separate stable core, tooling, WordPress adapter, and project-specific
    material inside the otherwise complete boilerplate.
17. Use SugarCube instead of retaining the Tailwind generator.
18. Give each new project a physical core copy with provenance and digests;
    updates are explicit migrations, not surprise dependency upgrades.
19. Forbid project-local core edits. Configure custom properties, add a real
    exception/variant, or propose an upstream recipe change.
20. Consolidate repeated text combinations into one configurable Text module;
    expose meaningful design-system choices instead of ten near-duplicates.
21. Let Text compose the reusable Buttons/Button modules as its actions slot.
22. Clone one Text field group into parents and allow the parent context to
    narrow it without copying fields.
23. Generate presentation choices from design-token metadata in the normal case;
    semantic and structural choices need not pretend to be tokens.
24. Use a hybrid editor surface: expose safe real variability and lock choices
    that constitute a particular parent layout.
25. Keep every observed legal Text capability in the canonical group; profiles
    constrain the view rather than fork the schema.
26. Normalize intelligently: preserve a real design need, add a missing semantic
    token when justified, migrate known old values, and only then report/fallback.
27. Store context rules once in a plain code-owned map used by both ACF and
    render-time validation; "registry" is not a separate product concept.
28. Give standalone Text the broad set of design-proven options, while nested
    Hero/CTA/Media contexts may set defaults, hide, or lock selected axes.
29. Use the official Complete CSS starter byte-for-byte for Bloom fidelity;
    changing the starter defines a different experiment.
30. Keep the all-rounds Figma, completed site, pattern library, later rounds,
    and course solutions sealed; expose only an admitted design export and an
    original public designer-resolution log.
31. Create a new private `bloom-frontend-lab`; do not repurpose the dirty
    WordPress spike, Sandcastle, frontend vault, or a KRN fixture.
32. Treat the Rekurencja `static-html-cube` profile as a separate transfer task,
    not as the Bloom fidelity baseline.
33. Admit every evaluator first through the completed reference and independent
    mutants without a model.
34. Harvest old experiments by mechanism only; quarantine copied course data,
    hand-tuned winners, writable gates, manual leaderboards, and raw runs.

## Evidence and source ownership

The evidence set is deliberately layered:

1. The locally held Complete CSS course is a private source for distilled
   mechanisms. No course transcript, exercise, solution, copied passage, or raw
   corpus is committed.
2. The local `frontend-vault` is a duplicated private cache of earlier attempts,
   not a catalog authority. It may help locate a primary source, but it is not
   copied into another repository or promoted as evidence.
3. Piccalilli and Set Studio article/category archives supply public method and
   production examples. "Archive" means the content archive, not an arbitrary
   quota of historical website versions.
4. A live page becomes an immutable dated capture only when a benchmark fixture
   needs reproducibility. Candidate runs never evaluate against a mutable live
   network target.
5. `Set-Creative-Studio/cube-boilerplate` at `f8c626c` is the public recipe
   ancestor. Pull request 15 at `ad06ea6` is the pinned example of replacing
   Tailwind/PostCSS token plumbing with Vite, SugarCube, and DTCG. The PR states
   that it is an example and is not intended to merge; it is provenance, not a
   production dependency.
6. Current Piccalilli and Set Studio captures confirm the production pattern:
   stable compositions, context-set custom properties, shared `data-*`
   vocabulary, and block-prefixed exceptions. They inform a reviewed promotion;
   they are not copied wholesale into the library.

Research behind evaluator decisions includes Design2Code (NAACL 2025),
FrontendBench, 1D-Bench, DCGen, UIOrchestra/APPUI, VISTA, WAFFLE, UI2App,
IWR-Bench, Playwright's screenshot and ARIA guidance, WCAG 2.2, W3C ACT,
Patterson et al. on repeated measures, Demsar on paired comparisons, and Wainer
on practical equivalence. Retained implications are: multi-axis measurement,
DOM/geometry anchors rather than class identity, executable state paths,
environment pinning, paired trials, anti-contamination, and explicit manual
unknowns for accessibility.

## Canonical boilerplate and library

The desired ownership chain is:

```text
Set Studio public recipes + PR 15 tooling provenance
                         |
                         v
boilerplate-rekurencja stable frontend core (one writer)
                         |
              reproducible export manifest
                         |
                         v
frontend-library generated snapshot (read-only consumer)
```

The boilerplate keeps four internal concerns distinct even if they remain in one
repository:

- `core`: exact compositions, global CSS, utilities, stable generic blocks, and
  token schema;
- `tooling`: Vite, SugarCube, the DTCG resolver, generated variables/utilities,
  and build gates;
- `wordpress`: Bedrock/theme runtime, ACF JSON, static layout allowlist,
  templates, escaping, and diagnostics;
- `project`: brand tokens, fonts, content, art direction, and blocks that have a
  real starter consumer.

All stable core recipes are physically copied into a new project so it remains
self-contained. The copy carries the source commit, schema version, and per-file
digests. Updating it is an explicit migration. A project does not edit a core
recipe. It configures the recipe through custom properties, adds a named
`data-*` exception, or introduces a genuinely new block when semantic identity,
DOM structure, interaction, layout ownership, or accessibility behavior changes.
KRN tools that inspect a project resolve shared vocabulary from that project's
recorded core manifest. Installing tooling that carries a newer bundle does not
reinterpret an unchanged project; selecting a new core is an explicit migration
with a named browser/build/audit compatibility check.

SugarCube is the adopted generator. The Tailwind setup in the public 2024
boilerplate is historical implementation evidence, not a retained dependency.
Token and utility generation stays demand-driven where the build can know usage.

The KRN snapshot at the published FH-03 fixed point is an admitted generated
consumer, while the source-side FH-01/FH-02 branch remains local and unpublished.
BL-12 therefore re-observes the current boilerplate creator and classifies any
new drift before admitting a production profile; neither the old local branch nor
the installed snapshot silently becomes current source truth.

Generated core and workflow procedure have different writers. The boilerplate
export is the source of stable recipe bytes; KRN's frontend skills remain the
source of generic procedure. Importing a bundle may not rewrite those skills.
Before evaluator tasks are admitted, the procedures and evaluator must agree
that a line count is a review signal rather than a splitting mandate, that
semantic heading level is independent from visual token role, and that a
semantic or structural choice does not need to masquerade as a presentation
token. Thin blocks, reuse, and token-bypass checks remain enforceable.

## CUBE conformance model

Exact recipes are intentional. The candidate may not rewrite `.flow`, `.grid`,
`.sidebar`, or another core primitive. Product tasks receive the canonical
library and are evaluated on selection, composition, and configuration. Separate
maintenance tasks may ask the candidate to replace a local knockoff with the
canonical recipe.

The permitted extension ladder is:

```text
custom property     local configuration of the same recipe
data-* exception    named, repeated variant of behavior
new block           new semantic/component identity
core edit           upstream change only, never a project-local shortcut
```

`design-transfer` leaves hierarchy, choice among permitted compositions, and
art direction open. `source-fidelity` may additionally require a named
composition and explicit source contract. Neither track permits a local clone of
an existing primitive.

## Deep Text module and ACF

The reusable `Text` module owns the recurring editorial sequence: optional
eyebrow, heading, body, and actions. Heading semantic level is independent from
its visual token role. `Button` and `Buttons` retain their own rendering and
style identity; `Text` composes them.

A difference remains inside one `Text` module when it keeps the same
responsibility, essential DOM skeleton, renderer, CSS block, and can be expressed
with tokens, custom properties, or an existing exception. A new module is earned
when semantic responsibility, DOM/order, interaction, layout ownership, data
contract, or accessibility behavior changes.

The canonical ACF group exposes every legal, observed axis: eyebrow, heading,
semantic level, body, actions, heading/body/eyebrow token roles, alignment,
measure, stacked/split layout, and internal flow spacing. Hero, CTA, Media
Content, and standalone Text clone that one group; they never copy its fields or
renderer.

Context profiles provide defaults, allowed values, locked values, and hidden
controls for each clone context. This is one plain code-owned rule map consumed
by both the ACF editor and render-time normalization, not a new component or a
second field schema. Standalone Text receives the broad set of real,
design-proven options; parent layouts may lock decisions that constitute that
layout. Editors see meaningful named choices, never raw CSS, arbitrary class
names, pixel sizes, margins, widths, or padding.

Token metadata usually supplies ACF choices and labels. A non-token option is
allowed when it represents semantic or structural state rather than a visual
value. Smart normalization handles an invalid stored value in this order:

1. preserve it by expanding the profile when it represents a real design case;
2. add or normalize to a semantic token when a repeated system gap exists;
3. migrate a known old token to its replacement;
4. only then fall back to the profile default and report the stale value.

UI filtering is not authority: stale database values are validated again at
render time and surfaced by content diagnostics. WordPress/ACF acceptance has
two separately reported layers: rendered frontend behavior and adapter behavior
(field topology, clone ownership, allowlisted template reachability, escaping,
and normalization).

## Sealed evaluator architecture

The present generic lane runner copies the task workspace and executes the task's
`check` inside that copy. The `cube-block` check is therefore visible to the
candidate. It is useful as a smoke fixture but is not a valid held-out frontend
oracle.

The replacement keeps candidate inputs and evaluator assets separate:

```text
public task workspace             sealed evaluator workspace
- brief                           - held-out checks
- canonical core                 - source capture when allowed
- public tokens/assets           - target DOM/computed style
- public screenshots             - state graph and anchors
- public preflight               - screenshot/geometry comparison
- method and constraints         - result assembler
```

The runner copies only the public workspace, enforces a selected containment
boundary, blocks or records network access, runs the candidate, freezes its
output, terminates candidate descendants, and only then invokes the evaluator
under a separate authority. Active denial probes cover filesystem and symlink
escape, inherited host state, network, post-handoff mutation, answer-store reads,
and trusted-result writes. A sentinel can reveal a leak; its absence alone does
not prove unreachability. Hidden answers are allowed; hidden product requirements
are not.

The selected first backend is non-setuid `bubblewrap >= 0.12` with independent
namespaces and a cleared environment. Its admitted network profile is `denied`.
The public candidate copy is the only writable task mount. A runner-owned
observer sees only the frozen read-only artifact and emits a public observation
envelope; a separate evaluator sees only that envelope and the sealed read-only
workspace whose tree digest is bound by the task. Candidate-authored runtime is
therefore never launched where the answer store is mounted. The environment
digest comes from a runner-owned probe of the effective sandbox, browser build,
font inventory, and public local assets rather than evaluator self-attestation.
Hosted-model execution that requires Internet access remains
outside this admission until a constrained, recorded egress adapter exists.

Each task declares a track, public contract, stable public requirement identities,
environment, viewports, perturbations, state paths, required evidence, per-axis
applicability, and evaluator identity. Every sealed assertion links to a public
requirement; the answer can remain hidden, but deleting that requirement makes
admission fail. A missing measurement is not the same as an explicit, justified
`not-applicable` axis. State paths are declarative transitions such as initial ->
click -> visible/ARIA/focus/network expectation, not only one hard-coded click
script. The first matrix covers 320px, a breakpoint boundary, desktop, 200%
text/zoom, long Polish content, keyboard navigation, reduced motion, and relevant
color scheme.

The environment digest pins OS/container, browser build, fonts, locale,
timezone, device-pixel ratio, color scheme, reduced motion, headless mode,
local assets, animation policy, and capture readiness (`document.fonts.ready`).
Screenshots from different environment digests are not treated as paired.

## Result contract and authority

Hard pass is conjunctive and carries named failures. The result reports, without
collapsing them into one weighted score:

- execution: build, runtime errors, console, and requests;
- behavior: passed state transitions;
- accessibility: automated ACT/ARIA findings plus manual unknowns;
- responsive behavior: viewport/perturbation passes;
- geometry: anchor recall and component-aware overlap;
- visual: raw pixel mismatch and lab-tested perceptual metrics;
- architecture: canonical recipe, ownership, token, variant, and ACF rules;
- efficiency: tokens, cached tokens, latency, retries, wall time, and repair
  delta;
- provenance: task, lane, trial, seed, revisions, environment digest, and
  artifact hashes.

Pixel diff, CLIP-like similarity, a VLM judge, and a composite score are rejected
as sole authorities. Perceptual metrics remain `lab-test` until deliberately
corrupted pages are labeled by humans and metric thresholds correlate with
those labels. A VLM judge may provide anonymized pairwise diagnostics in both
orders; disagreement makes the result inconclusive. Automated checks never
claim full WCAG compliance.

A bounded repair is classified before the repair call. Its category selects one
named result axis, and that axis defines direction, viewport ordering, tie
handling, errors, and missing measurements. The recorded worst viewport is
therefore deterministic without inventing a cross-axis score. A failed or
worsening repair remains raw evidence and never rewrites the one-shot result.

## Treatment delivery

LT-8 does not infer treatment exposure from a global installation, a broad
capability profile, or KRN's generic `harness_skills` export. A disposable,
revision-pinned frontend treatment profile delivers `$frontend-stage` and its six
owners; the control omits exactly that method. A candidate-visible inventory and
delivery probe verify the difference while core, project facts, assets, hooks,
evaluator exclusion, and unrelated KRN surfaces remain equivalent. The sealed
protocol records that receipt before the first experimental candidate call.

## Post-Bloom expansion pack

After BL-11 proves the Bloom known-good/mutant gate and BL-16 records the bounded
fidelity pilot, a later pack may expand independent failure modes rather than
adding cosmetic variants of the same page:

1. responsive reflow at 320px, a boundary width, desktop, long Polish content,
   and 200% text, including focus-not-obscured and horizontal overflow;
2. an interactive dialog or menu with Tab order, Escape, focus return, visible
   and ARIA state, reduced motion, and native control semantics;
3. design transfer from public brief/screenshots/assets with semantic content,
   canonical CUBE architecture, geometry anchors, color/type roles, and a
   secondary image that exposes element-recall failure;
4. maintainability work that replaces duplicated/local CSS with the canonical
   core, maps raw values to tokens, and adds a real exception without regression;
5. a WordPress/ACF task that reuses the canonical Text group and renderer,
   applies a context profile, preserves allowlisted reachability and escaping,
   and handles stale presentation state intelligently.

Every task has a known-good solution that passes and at least one targeted
mutation that fails before it is admitted. Task diversity matters more than
repeating one screenshot many times.

## Rejected and deferred paths

- Reject a single composite quality score, pixel diff alone, CLIP alone, an
  automatic WCAG-compliance claim, unconditional second turns, live-site
  evaluation, candidate-visible checks, raw course publication, local core
  edits, duplicated ACF groups, arbitrary CSS fields, and React/Astro baseline
  adapters.
- Defer model fine-tuning, a perceptual metric hard gate, and a VLM acceptance
  gate until the deterministic pack and human calibration show a gap they can
  uniquely close.
- Defer a universal decision about which presentation controls every parent
  locks. Each context earns its own profile from real design combinations.

## Open implementation facts

The repository boundaries and experiment claims are settled. Implementation must
still admit the exact starter and design epoch, write the public resolution log,
freeze and validate the sealed reference, admit generic evaluator obligations,
make known-good/mutants discriminate without a model, align the optional skills,
create the production static profile as a separate transfer baseline, and only
then run the registered pilot. The source boilerplate and new lab require their
own isolated branches and writers; this repository's branch must not mutate dirty
historical checkouts.

Supersession: rewrite this page when the Bloom source epoch, canonical-core
classification, public resolution contract, experiment claim, or an adopted
mechanism changes; also rewrite it when LT-8 reports a result or a real project
falsifies a Text/context rule. Delete it only if the frontend owners, Bloom lab,
and LT-8 are all retired.
