# Complete CSS and Bloom benchmark decision

Status: `lab-test`. Consumer: frontend skills, the Bloom lab protocol,
`boilerplate-rekurencja` profile design, and the frontend evaluator.
Owner: maintainer. Verified: 2026-09-21.

This page distils mechanisms and benchmark boundaries from the locally available
Complete CSS materials and public Bloom surfaces. It contains no copied lesson,
exercise, solution, or raw course corpus. The private sources remain authorized
input for this decision only.

## Decision question

Can Bloom provide a real, reproducible test of whether KRN frontend skills help
an agent reconstruct a production-quality CUBE site, without exposing the answer
or confusing skill effects with a different starter, runtime, or CMS adapter?

The decision is `lab-test`: use Bloom first for source fidelity, then use the
same evaluator mechanisms on a separate static-profile transfer task. The
fidelity known-good/mutant gate must work without a model before any behavioral
comparison is admitted. The result does not decide general frontend uplift,
WordPress correctness, or whether a skill should be promoted globally.

## Source identities and authority

| Source | Identity observed | Authority and limit |
|---|---|---|
| Complete CSS 0.1.3 starter candidate | locally held `css-course-starter-files-0.1.3.zip`, linked by the official course page but not yet independently reacquired from upstream; observed SHA-256 `a8895470ef380616e430b23ab9c59ac3c57ad268432d373ece52e2979c53a84f`; extracted `src/` tree `82162b4892549798b6943b726600e79288d8285f771a02f37745950207654ecf` | Candidate primary fidelity input pending BL-03 authentication. `src/LICENCE` is MIT, Andy Bell 2024; `package.json` says ISC without an included ISC text, so preserve the MIT notice and record the ambiguity. |
| Private Complete CSS archive | 51 saved lessons in eight modules under the operator's course store; saved pages dated 2025-01-28 | Mechanism source only. Its redistribution provenance is not established; never commit prose, video, exercises, or solutions. |
| Public Figma community file | `1440671766024567005`, “Complete CSS — Bloom Barista Academy — All Rounds” | Design provenance. The all-rounds file leaks later decisions; candidate admission requires a frozen manifest of only the intended page/nodes. |
| Bloom homepage | `https://bloom-barista.academy/`; HTML SHA-256 observed 2026-09-21: `47e546a1cfe0019f4e1c1c36018e59aebc50ae38f7245eb50f112fb4432639e5` | Mutable final behavior reference. Freeze captures; never use the moving URL as the run-time oracle. |
| Bloom CSS and pattern library | `global.css` SHA-256 `6eea40be0dcc2c5851e6daf501e1f217b5fef212831767972b9b5b26751644d2`; `pattern-library.css` SHA-256 `30e6915e63be0d0f1e1bba4489234602ac085250e71c9c3ebde9f09d133fd6bf` | Sealed answer and architecture calibration only. The public pattern library reveals tokens, compositions, utilities, and named blocks, so it is not candidate input. |
| Set Studio/Piccalilli public material | pinned URLs and source captures already indexed by the frontend synthesis | Mechanism and production counterexample source. It cannot replace the Bloom task's exact experiment epoch. |

The locally held starter candidate supplies completed compositions, reset, fonts, basic global
CSS/utilities, token JSON, assets, data/markup shells, and pattern-library
machinery. Production block styles, the project variables/global decisions, the
indent utility, and the finished homepage remain work. Therefore it is a real
starter rather than the completed answer.

## Mechanisms adopted into the method

1. Treat the design as an initial hypothesis. Before coding, inspect contrast,
   logical source/tab order, absent interaction states, awkward viewport
   relationships, and expensive decorative treatments.
2. Produce a sketch-up organized by layouts, shared layouts, content regions,
   reusable patterns, global-style candidates, and questions for the designer.
3. Slice the smallest reusable semantic pieces before naming blocks. Different
   size, arrangement, optional content, or art direction normally produces a
   variant or composition configuration rather than another component.
4. Prototype only uncertain relationships. Use semantic HTML and deliberately
   low-fidelity disposable CSS, answer the question, then discard the prototype.
5. Build HTML first in logical reading order. Establish tokens and global styles,
   then compositions/utilities, then thin blocks and explicit exceptions.
6. Split delivery into a core build and a flair pass. The core carries readable,
   responsive, accessible content; decorative/sticky/animated or complex text
   treatments arrive through progressive enhancement and may be rejected after
   browser feedback.
7. Prefer intrinsic layout, wrapping, and bounded fluid type/space over device
   taxonomies and breakpoint accumulation. Verify zoom, text enlargement, long
   content, reduced motion, and no-JavaScript behavior.
8. Compose the page from admitted patterns without page-specific block CSS.
   Record non-obvious reasons and configurable composition knobs in the pattern
   library; put unfunded ideas in an Icebox rather than half-implementing them.
9. Minimum code means fewer duplicated responsibilities and mechanisms, not a
   line, byte, or token budget. A simpler accepted browser solution outranks a
   clever but fragile treatment.

These are original mechanism statements. Their implementation remains falsified
by the benchmark cases below; source popularity or course authorship is not
proof.

## Mechanism disposition matrix

This matrix is the BL-01 decision boundary. `Procedure owner` is the sole writer
of the repeatable instruction; an evaluator is only the named behavioral
consumer and must not restate that procedure. Private lesson identifiers provide
provenance without copying course prose. Public sources are the dated captures
already cited by the owning skill references.

| Mechanism and provenance | Transferable rule | Procedure owner → behavioral consumer | Decision and counterexample | Falsifier |
|---|---|---|---|---|
| Design feedback and public resolution — Complete CSS 006, 012–013, 015–023; Piccalilli design-process series (2024) | Treat the design as evidence, identify inaccessible or brittle relationships, and disclose every accepted correction as a public requirement rather than a hidden expectation. | `$frontend-architecture` → Bloom public-contract admission and requirement-linked evaluator assertions. | **Adopt.** Do not manufacture redesign work for a complete, internally consistent input; record that no resolution was needed. | A sealed assertion has no public requirement, or the procedure silently changes source order, state, treatment, or viewport behavior without a resolution entry. |
| Sketch-up — Complete CSS 015–023 | Mark layouts, shared layouts, content regions, global candidates, and questions before choosing blocks. The artifact is disposable reasoning, not polished design. | `$frontend-process` → architecture-plan readback before a new-page build. | **Adopt for design-led page work.** Skip it for a truly isolated existing-block correction whose layout and public contract do not change. | Production page CSS begins while a novel layout or unresolved design relationship has no sketch-up owner or decision. |
| Disposable prototype — Complete CSS 024; Piccalilli design-process series (2024) | Prototype only an uncertain relationship with semantic HTML and deliberately rough styling; answer the question, then discard the code. | `$frontend-process` → prototype-exit receipt; prototype bytes are excluded from production and candidate baseline. | **Adopt conditionally.** A known composition with existing acceptance evidence does not earn a prototype merely to satisfy process. | Prototype code is imported, copied, token-polished into production, or the named uncertainty remains unresolved when the production build starts. |
| HTML-first and logical source order — Piccalilli build-process series (2024); Complete CSS core-build sequence 023 | Establish readable semantic HTML and keyboard/source order before visual rearrangement; CSS may alter presentation but not create the only usable order. | `$frontend-process` → semantic-structure and keyboard-path axes. | **Adopt.** A local style-only correction need not recreate the whole page, but it may not weaken existing semantics or order. | Removing CSS or using keyboard navigation loses content, purpose, focus order, or the publicly required reading sequence. |
| Bounded fluid type and space — Complete CSS 008 and 022; Utopia type/space calculators | Derive one admitted min/max scale and consume its tokens; do not accumulate device-taxonomy breakpoints or bespoke `clamp()` formulas in components. | `$frontend-tokens` → responsive/long-content/text-enlargement axes. | **Adopt for scalable type and spacing.** Reject fluidization of genuinely fixed constraints such as a one-pixel stroke or an asset-intrinsic dimension. | A breakpoint-only or component-local replacement breaks an intermediate viewport, zoom/text enlargement, or the admitted scale identity. |
| Layout compositions — CUBE CSS; Complete CSS 019 and core-build material; Set Studio/Piccalilli production captures | Reusable spatial relationships belong to compositions; blocks configure them and retain only cohesive internal semantics. | `$frontend-components` → CUBE architecture axis. | **Adopt.** A block may own its internal component structure when no reusable spatial relationship exists; it may not own its external placement. | A block controls its own outer layout, duplicates an admitted grid/cluster/flow, or extraction creates an abstraction with no second consumer. |
| Core build before flair — Complete CSS 023 and 028 | Ship readable, responsive foundations and simple interaction states first; decorative, sticky, animated, or unusually complex treatments require a working fallback and a later decision. | `$frontend-process` → build/completeness, responsive, and interaction axes. | **Adopt.** Required focus, hover, content, and navigation are core behavior, never optional flair. | Disabling JavaScript, animation, sticky behavior, or the decorative treatment makes content or required interaction unusable. |
| Progressive enhancement — Complete CSS 028; Piccalilli build-process series (2024) | Add advanced behavior only after the semantic core works, respecting reduced motion, keyboard use, unavailable APIs, and no-JavaScript execution. | `$frontend-process` → interaction/accessibility state paths. | **Adopt.** When a platform feature is the product requirement, the fallback may be simpler rather than equivalent, but it must preserve the disclosed core outcome. | The evaluator can reach a supported state in which content disappears, navigation fails, focus is trapped, or motion cannot be reduced. |
| Markup-only page composition — Complete CSS 051–054 | Assemble admitted patterns with composition, utility, block, and exception vocabulary; page assembly does not itself justify a new page-specific block stylesheet. | `$frontend-process` → CUBE architecture and implementation-economy axes. | **Adopt.** A genuinely new reusable semantic pattern may earn a block through architecture admission; novelty of a page is insufficient. | A page stylesheet reimplements an admitted responsibility, or removing it reveals only arrangement already expressible by existing patterns. |
| Documentation and Icebox — Complete CSS 056–057; GOV.UK component-consolidation case | Document non-obvious reasons and public configuration knobs; defer unfunded ideas instead of merging half-implemented mechanisms. | `$frontend-library` → documentation axis and pattern-inventory audit. | **Adopt narrowly.** Obvious declarations need no essay, and the Icebox is not a promise or hidden acceptance backlog. | A reusable pattern or knob has no discoverable owner, duplicate implementations appear, or an out-of-scope idea changes production behavior without admission. |
| Minimum-code semantics — Complete CSS 019 and 057; CUBE CSS; local block-ownership counterexamples | Minimize duplicated responsibility and distinct mechanisms, not bytes, lines, tokens, or arbitrary component count. Consolidate repeated content shapes as variants/options when one semantic block can own them. | `$frontend-components` → implementation-economy and CUBE architecture axes. | **Adopt.** Reject numeric split budgets: a cohesive block may exceed 100 lines, while a tiny duplicate still fails. | A proposed simplification lowers line count but duplicates ownership, weakens semantics/behavior, or creates another component for an already configurable content shape. |

The matrix does not promote every course preference into a universal gate. A
rule applies only through its named owner and applicability condition. The Bloom
evaluator observes consequences; it never becomes a second workflow writer.

## Three tracks, three claims

| Track | Candidate baseline | What it can establish | What it cannot establish |
|---|---|---|---|
| Bloom fidelity | exact admitted Complete CSS 0.1.3 starter | whether treatment improves reconstruction of this real source-backed target | transfer to another design or starter; independent evidence of the method |
| Static transfer | generated `boilerplate-rekurencja` `static-html-cube` project | whether the method survives a different, production-owned starter | WordPress/ACF correctness; exact course comparability |
| WordPress/ACF adapter | later disposable WordPress profile and the same public frontend contract | whether CMS topology renders an already admitted frontend faithfully | improvement in static frontend ability; permission to combine adapter/frontend scores |

The primary fidelity experiment must not silently substitute the static profile.
The static profile is approved for implementation as a separate production
capability and transfer test; it is admitted only after BL-12's creator and smoke
checks. A creator may materialize the exact admitted course starter only if it
preserves its byte identity and provenance; an “equivalent” recreation is a
different task.

## Candidate-visible public contract

- the exact starter artifact, license, source URL, and digest;
- a frozen export of only the admitted Figma round/pages/nodes with per-file and
  source identities;
- public content, assets, section inventory, viewports, supported browser, and
  build/runtime instructions;
- an independently written designer-resolution log containing every accepted
  simplification, required source order, small-viewport behavior, interaction
  state, and final treatment decision learned through the course feedback loop;
- named evaluation axes and public requirement IDs, but no expected answer.

The resolution log is mandatory: hidden answers are allowed; hidden requirements
are not. If the candidate is asked to infer a private designer conversation from
an earlier Figma round, the task is invalid rather than difficult.

## Sealed reference boundary

The lab may read private lessons, later design rounds, frozen final-site and
pattern-library captures, reference screenshots, DOM/computed-style
measurements, an admitted upstream completed source artifact or a lab-owned
private reconstruction, semantic anchors, state paths, known-good fixtures,
mutants, and calibration decisions. BL-05 must establish that known-good's
provenance; the live deployment is not completed-source provenance. The
candidate may read none of these. Generation denies the private course store,
later-round store, live Bloom domains, evaluator tree, trusted result writer,
and sibling/parent host paths. The candidate output is frozen before a
separately authorized observer and evaluator run.

A sentinel detects a leak but cannot prove unreachability. Positive denial probes,
artifact identity before/after evaluation, evaluator identity, environment
identity, descendant termination, and network denial remain required.

## Independent result axes

1. **Build/completeness:** reproducible install/build, required content/assets,
   no failed requests or console errors.
2. **Semantic structure:** landmarks/headings, source/tab order, alternatives,
   skip navigation, and link/button purpose.
3. **Responsive behavior:** viewport matrix, wrapping boundaries, horizontal
   overflow, long content, zoom, and text enlargement.
4. **Interaction/accessibility:** keyboard focus, target size, contrast, reduced
   motion, and a usable no-JavaScript core.
5. **Visual/geometry fidelity:** named semantic anchors, section placement,
   typography, color, media crop, raw pixel mismatch, and calibrated perceptual
   diagnostics.
6. **CUBE architecture:** layout ownership in compositions, block configuration
   rather than reimplementation, one-job utilities, explicit exceptions, tokens,
   contextual inheritance, and real reuse.
7. **Implementation economy:** duplicated responsibility, unnecessary mechanisms,
   and avoidable bespoke code; never raw line count.
8. **Documentation:** non-obvious reasons and public knobs, without essay or
   duplicate-document requirements.

No weighted composite becomes authority. Source fidelity retains exact pixel
mismatch as raw evidence, but hard visual acceptance uses named anchors and
tolerances calibrated against the admitted known-good and mutants. Exact
screenshot equality never overrides semantics, responsiveness, or the public
resolution log. Design transfer keeps perceptual metrics diagnostic until
calibrated. A reference failure invalidates the corresponding rule instead of
receiving automatic upstream authority.

## Required deterministic mutants

Before any model run, the completed reference must pass and each independent
mutation must fail its named requirement (or an explicitly documented coupled
set): one-viewport fixed positioning; wrong DOM/source order; breakpoint-only
type instead of the accepted bounded scale; component-owned outer layout;
duplicate grid/cluster/button; raw token bypass; missing focus or skip-link
label; contrast failure; long-content or enlarged-text overflow; JavaScript-only
content; missing section/content; live/later-round access; incomplete axis-to-
requirement coverage; stale evaluator identity; and retention of a complex
treatment where the public resolution selected the simpler responsive heading.

## Prior-attempt disposition

- `krn-sandcastle`: harvest source-epoch manifests, public-contract compilation,
  failure vectors, geometry/pixel mechanics, worst-viewport selection, and
  one-shot/repair separation. Quarantine its 1.2 GB runs, writable candidate
  gates, manual leaderboards, hand-tuned winners, prompt variants, and copied
  frontend skill owner.
- `research-lab`, `mini-metalab-skills`, `prototype-krn`, `frontend-vault`, and
  deprecated skills lab: private failure archaeology only. Their copied course
  material, synthetic Bloom-inspired tasks, answer-bearing projects, zero-run
  reports, and missing fixed points are not admissible evidence.
- `bloom-barista-www`: retain as an active WordPress integration spike owned by
  its current writer. Its boilerplate remote, local commits, and dirty state make
  it neither candidate nor reference.
- `bop-2026`: unrelated product compatibility observation; remove it from the
  frontend-harness acceptance chain.

## Falsifier and supersession

The disposition fails if the exact starter cannot be reproduced, the admitted
design export or resolution log omits a requirement used by the evaluator, the
known-good reference fails, a named mutant passes, the candidate can reach any
answer surface, treatment/control inputs differ beyond frontend skills, or the
static/WordPress tracks are combined into the Bloom fidelity claim.

Supersede this page in place when the reference freeze or experiment epoch changes, the public
resolution changes, a reference rule is rejected, or a completed fidelity pilot
changes the benchmark decision. Delete it when neither the frontend skills,
lab protocol, boilerplate profiles, nor evaluator consumes Bloom.
