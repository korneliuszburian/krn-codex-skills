# Bloom frontend harness implementation plan

Status: `lab-test`. Consumer: `$delivery-loop`, unit implementers, the Bloom lab,
LT-8, and the maintainer. Owner: maintainer. Verified: 2026-09-21.

This is the durable execution contract for the optional frontend branch of the
existing KRN harness. It supersedes the earlier generic FH-06–FH-17 sequence,
which had no real canonical task and incorrectly allowed an unrelated product to
stand in for frontend evidence. KRN's FH-03–FH-05 snapshot import, versioned v2
contracts, and isolated generation/evaluation are published at `92092a7`.
Boilerplate FH-01/FH-02 export and project-creation work remains local,
unpublished evidence: Bloom fidelity does not depend on it, and BL-12 must
re-observe and admit the current source-side creator/profile behavior. Everything
after the KRN fixed point is re-cut around the real Complete CSS Bloom target.

This page is not a progress log or permission to publish, merge, install, mutate
a remote, or clean an existing dirty repository. Delete it after BL-18 when code,
ADRs, the lab protocol, and the registered result own every surviving contract.
Supersede it in place if the source epoch, repository boundary, or benchmark
claim changes; re-cut all affected downstream units.

## Accepted outcome

Create one sealed and discriminative frontend evaluation route that can answer:

1. Does the frontend treatment improve reconstruction of Bloom from the exact
   admitted Complete CSS starter and an honest public design contract?
2. Do the same method and evaluator mechanisms transfer to a project generated
   by Rekurencja's static HTML/CSS/CUBE profile?
3. Later and separately, can a WordPress/ACF adapter render an already admitted
   frontend contract without corrupting it?

Success requires a no-model known-good/mutant gate before any candidate call,
identical public inputs between control and treatment, a sealed answer boundary,
independent result axes, raw one-shot evidence, and claim language that never
turns Bloom fidelity into general frontend uplift.

## Correction and cleanup boundary

- The clean planning base is KRN `92092a7`, the published FH-05 fixed point.
- The unpublished `feat/frontend-harness` FH-06 attempt using `bop-2026` is not
  part of this plan and must not be published or merged as evidence.
- `bloom-barista-www` is an active dirty WordPress spike with a boilerplate
  remote; preserve it unchanged and exclude it from candidate/reference roles.
- `krn-sandcastle` and other historical labs remain observation-only until their
  current writers freeze them. Harvest contracts manually; never copy their
  generated corpus, answer-bearing workspaces, or duplicated skills.
- No destructive cleanup occurs before BL-18 passes and every retained mechanism
  has a named new owner and falsifier. Retirement then means archive/quarantine
  or readerless deletion by the original repository owner.

The retirement inventory is explicit by logical identity: the active
`krn-sandcastle` frontend experiment; `research-lab`; `mini-metalab-skills`;
`prototype-krn`; the `frontend-vault` cache; the deprecated
`deprecated/krn-skills-lab` repository; the standalone `lab/frontend` inventory
scripts; the `bloom-barista-www` WordPress spike; and KRN's abandoned
`feat/frontend-harness` worktree/branch. The local boilerplate FH-01/FH-02
worktree is retained source-side evidence, not a cleanup target. BL-18 first
resolves each logical identity to a current checkout under the target-repo-work
boundary, then records original owner, retained mechanism and new owner,
disposition, reader-zero proof, and cleanup authority. Until that receipt exists,
every item stays preserved; no reusable contract stores a host mount prefix.

## Authority map

| Surface | Sole writer | Consumers |
|---|---|---|
| Generic frontend procedures and optional frontend-stage routing | `krn-codex-skills` skill owners | product agents and treatment profile |
| Generic v2 admission, containment, evaluator axes, and reporting | `krn-codex-skills` harness owners | Bloom lab and future frontend tasks |
| Canonical Rekurencja core, project creator, static/WordPress profiles | `boilerplate-rekurencja` | created product projects and transfer fixtures |
| Bloom public contract, source epochs, sealed answers, mutants, raw runs | new private `bloom-frontend-lab` | this benchmark only |
| Complete CSS private lessons and solutions | operator private source store | source curator and sealed reference preparation only |
| Official starter and public Figma artifacts | pinned upstream identities admitted by the lab | fidelity candidate and evaluator |
| Product-specific WordPress implementation | its product repository | product runtime only; never the benchmark oracle |

KRN never owns a frontend application, Bloom-specific selector, course solution,
or private corpus. The lab never authors generic skills, core recipes, project
creation, or harness protocol. The boilerplate never authors experimental
results or hidden answers.

## Physical lab zones

The new lab repository must expose four physically and logically distinct zones:

```text
public/       admitted starter, design export, content/assets, requirements
workspaces/   disposable candidate copies only; ignored after raw retention
sealed/       final reference, later rounds, anchors, expected states, mutants
results/      evaluator-owned immutable receipts and raw trial envelopes
```

The task contract, preflight executable, manifest, and expected public-input
digests remain in a runner-owned read-only projection. Only a declared project
output write-set is copied writable for the candidate. The runner seals the
immutable projection before and after generation and rejects any changed task or
gate. `sealed/` and trusted result paths are absent from the candidate namespace.
The evaluator receives only the frozen candidate observation and sealed inputs.
Large captures, raw private course data, credentials, caches, and dependency
trees are never committed merely because the repo is private. Each third-party
artifact receives a provenance/rights class, approved private storage location,
retention/deletion trigger, and publication boundary. A manifest or digest may
be committed while the underlying course, Figma, font, or site bytes remain
local-only; remote publication needs separate authority.

## Fixed source epoch

One epoch binds the starter archive digest, license, selected Figma page/node
exports and digests, designer-resolution log digest, public content/assets,
final-site HTML/CSS/capture identities, browser/font/locale/viewport environment,
known-good identity, evaluator identity, and mutant identities. A mutable URL,
folder name, screenshot alone, or prose claim is not an epoch.

The candidate-visible Figma scope begins with the intended course round. Later
rounds are sealed. Every final requirement learned through feedback is disclosed
through the public resolution log; private conversation is never a hidden
requirement. Changing the public contract creates a new epoch and invalidates
old cross-epoch comparisons.

## Work units

### BL-00 — Freeze the corrected architecture

- **Repository:** KRN.
- **Entry → exit:** generic plan with an arbitrary product consumer → ADR 0009,
  Bloom source decision, authority map, corrected dependency graph, and an
  unpublished old branch explicitly excluded.
- **Falsifier:** any durable page still makes `bop-2026`, `bloom-barista-www`,
  Sandcastle winners, or a KRN fixture the Bloom authority.
- **Proof budget:** documentation readback and link/index checks; no runtime test.
- **Rollback:** revert this planning fixed point; published KRN FH-03–FH-05
  remain intact and local source-side work remains unpublished evidence.

### BL-01 — Complete the source-to-decision matrix

- **Repository:** KRN research and owning frontend skills only.
- **Entry → exit:** course mechanisms are partially and multiply summarized →
  every adopted/rejected/lab-tested mechanism has one named skill/evaluator
  consumer, counterexample, falsifier, and provenance; no copied private prose.
- **Required cases:** design feedback/resolution, sketch-up, disposable
  prototype, HTML-first/source order, fluid scales, layout compositions, core vs
  flair, progressive enhancement, page composition without new block CSS,
  documentation/Icebox, and minimum-code semantics.
- **Falsifier:** a rule exists in a skill but has no source decision or testable
  behavioral consequence, or the same procedure has two writers.
- **Dependencies:** BL-00. Blocks BL-06 and BL-14.

### BL-02 — Create the private Bloom lab repository

- **Repository:** new `bloom-frontend-lab`, initialized locally on an owned
  branch; remote creation/publication requires separate authority.
- **Entry → exit:** no canonical Bloom lab → instructions, ownership boundaries,
  ignored raw-run storage, four physical zones, source manifest schema, commands,
  per-artifact rights/retention/publication fields, and a zero-answer public
  projection exist.
- **Falsifier:** a clean public projection contains a sealed path, course file,
  later-round asset, live URL, solution fragment, credential, or result.
- **Dependencies:** BL-00. Blocks BL-03–BL-05.
- **Rollback:** remove only the newly created unpopulated repo or archive its
  initial fixed point; do not touch historical labs.

### BL-03 — Authenticate and admit the exact starter

- **Repository:** Bloom lab.
- **Entry → exit:** the locally held 0.1.3 zip is only a starter candidate linked
  by the official course page → a newly acquired or otherwise independently
  authenticated upstream artifact is compared with the observed SHA-256 and
  extracted tree identity; source URL, version, license ambiguity, Node/build
  contract, file classes, and reproducible materialization are recorded. A byte
  mismatch creates a new source epoch instead of being explained away.
- **Falsifier:** one changed byte, omitted license, undeclared file, completed
  solution byte, or non-empty destination fails admission.
- **Decision:** fidelity uses this exact artifact. Rekurencja's new profile is not
  substituted here.
- **Dependencies:** BL-02. Blocks BL-06 and BL-09.

### BL-04 — Compile the honest public design contract

- **Repository:** Bloom lab.
- **Entry → exit:** all-rounds Figma URL and private course conversation can leak
  answers/requirements → one public manifest identifies admitted round nodes,
  captures, content/assets, section inventory, supported environment, requirement
  IDs, and an original designer-resolution log.
- **Falsifier:** removing any public requirement leaves a sealed assertion; adding
  a later-round or solution-derived artifact changes no manifest; either is a
  failure.
- **Dependencies:** BL-02. Blocks BL-06, BL-09, and BL-14.

### BL-05 — Freeze the sealed final reference epoch

- **Repository:** Bloom lab sealed zone/private artifact storage.
- **Entry → exit:** moving live site and unversioned course answers → immutable
  final HTML/CSS/capture, fonts/assets, later-round identities, semantic anchors,
  state paths, environment receipt, and one provenance-bound known-good identity.
  BL-05 must establish whether that identity is an admitted upstream completed
  source artifact or a lab-owned private reconstruction validated against the
  frozen public output and requirement map; the deployment alone is not source
  provenance. Rights class, storage, retention, and publication boundary are
  recorded for every sealed byte.
- **Falsifier:** a recapture, font/browser/locale change, moving URL, or changed
  reference byte can reuse the old epoch identity.
- **Dependencies:** BL-02 and BL-04. Blocks BL-08A/B/C and BL-09–BL-11.

### BL-06 — Align optional frontend skills with the real task

- **Repository:** KRN.
- **Entry → exit:** WordPress assumptions and KRN-core authority can leak into a
  static task → `$frontend-stage` selects static fidelity, static transfer, or
  WordPress adapter; architecture makes ACF conditional; components/library
  honor the task-pinned starter/core; line-count splitting is absent; feedback
  produces the public resolution artifact.
- **Falsifier:** the static Bloom fixture is instructed to create ACF, replace an
  admitted course composition from KRN, split solely by line count, or infer a
  private requirement.
- **Dependencies:** BL-01, BL-03, BL-04. Blocks BL-14.

### BL-07 — Admit generic evaluator obligations

- **Repository:** KRN.
- **Entry → exit:** v2 has isolation and structural admission → every declared
  axis/requirement obligation has an evaluator assertion and explicit result
  evidence or justified non-applicability; evaluator identity follows the task
  through result admission.
- **Falsifier:** duplicated cross-axis requirement with one assertion, empty-pass
  evidence, stale evaluator substitution, or omitted applicable axis is admitted.
- **Dependencies:** published FH-04/FH-05. Blocks BL-08A/B/C and BL-11.

### BL-08A — Implement structural evaluator axes

- **Repositories:** KRN owns the generic engine; Bloom lab owns configuration.
- **Entry → exit:** broad audit only → independent build/completeness, semantic
  structure, CUBE architecture, implementation-economy, and documentation
  observations behind the BL-07 axis interface.
- **Falsifier:** targeted generic fixtures independently break source order,
  token use, layout ownership, local primitive reuse, required content, and one
  unnecessary mechanism.
- **Dependencies:** BL-05, BL-07. Blocks BL-09.

### BL-08B — Implement responsive, state, and accessibility axes

- **Repositories:** KRN owns the state-path engine; Bloom lab owns task states.
- **Entry → exit:** basic browser evidence → viewport/perturbation observations,
  keyboard and focus transitions, reduced-motion/no-JS behavior, contrast, long
  content, zoom, and text enlargement behind the same interface.
- **Falsifier:** targeted generic fixtures independently break overflow, focus,
  Escape/focus return, reduced motion, no-JS content, and enlarged text.
- **Dependencies:** BL-05, BL-07. Blocks BL-09.

### BL-08C — Implement geometry and visual axes

- **Repositories:** KRN owns generic observation/comparison; Bloom lab owns named
  anchors and reference captures. Bloom selectors never enter KRN.
- **Entry → exit:** screenshot evidence only → anchor geometry, typography,
  color, media crop, and raw pixel evidence with explicit environment identity.
- **Falsifier:** targeted generic fixtures independently move an anchor, corrupt
  typography/color, and replace a secondary image.
- **Authority:** raw pixel mismatch is evidence; hard acceptance uses calibrated
  named anchors/tolerances. Perceptual metrics never override deterministic
  failures, and no weighted composite exists.
- **Dependencies:** BL-05, BL-07. Blocks BL-09.

### BL-09 — Bind and pass the known-good reference

- **Repository:** Bloom lab.
- **Entry → exit:** an upstream answer is assumed correct → the BL-05 admitted
  known-good is built in the frozen environment and every public
  requirement/assertion is reconciled. Reference defects reject or narrow rules
  rather than receiving automatic authority.
- **Falsifier:** any applicable axis fails, evidence is missing, public/hidden
  requirement mapping is incomplete, or result identity differs from the epoch.
- **Dependencies:** BL-03–BL-05 and the applicable BL-08A/B/C axes. Blocks BL-10.

### BL-10 — Admit the discriminative mutant suite

- **Repository:** Bloom lab.
- **Entry → exit:** green known-good only → named independent mutants cover fixed
  one-viewport layout, source order, fluid scale, layout ownership, duplicated
  primitives, token bypass, focus/contrast, long content/text enlargement,
  no-JS, missing content, leakage, coverage, evaluator identity, and the rejected
  complex heading treatment.
- **Falsifier:** a mutant passes, the control reference fails, or unrelated axes
  fail without a documented causal coupling.
- **Dependencies:** BL-09. Blocks BL-11.

### BL-11 — Seal the no-model fidelity gate

- **Repositories:** KRN runner plus Bloom lab.
- **Entry → exit:** mechanisms exist independently → the exact public projection
  crosses isolated generation/frozen handoff/evaluation without invoking a model;
  known-good passes, every mutant fails, answer reads/writes are denied, and raw
  receipts bind task, epoch, evaluator, environment, and artifact.
- **Falsifier:** candidate-writable gate/evaluator, mutated public inputs after
  sealing, live Bloom access, surviving descendant, or result/artifact mismatch.
- **Required receipt:** containment backend/version and namespace identity plus
  positive denial probes for parent/sibling absolute reads, symlink traversal,
  inherited environment/state, live Bloom DNS/network, sealed/result writes,
  surviving descendants, frozen-artifact mutation, and evaluator/result-writer
  access. A sentinel remains only a leak detector.
- **Dependencies:** BL-07, BL-10. Blocks BL-14–BL-16.

### BL-12 — Create the production static HTML/CSS/CUBE profile

- **Repository:** isolated `boilerplate-rekurencja` worktree.
- **Entry → exit:** creator only emits the WordPress/Bedrock baseline → a named
  `static-html-cube` profile creates an empty-destination, self-contained project
  with canonical core, tokens, build/serve/lint/a11y/browser smoke, pattern
  library, and provenance, without PHP, database, Bedrock, WordPress, or ACF.
- **Falsifier:** re-observe the current creator rather than inheriting the local
  FH-01/FH-02 claim; run the literal create command plus smoke for both the
  existing default profile and `static-html-cube`. The emitted disposable
  project is the initial browser/build/audit compatibility consumer. Preserve a
  pinned project-A fixture so every later A→B core promotion proves unchanged
  interpretation until explicit migration. Non-empty destination, default-
  profile regression, profile contamination, core-byte drift, behavior-regressing
  digest-consistent B, and missing provenance fail.
- **Dependencies:** BL-01. Blocks BL-13. It does not block Bloom fidelity.

### BL-13 — Admit a separate static transfer task

- **Repositories:** the boilerplate supplies the artifact; `bloom-frontend-lab`
  owns this distinct transfer track and epoch. It does not reuse the Bloom target
  or source-fidelity claim.
- **Entry → exit:** only in-domain Bloom fidelity exists → the same generic axes
  evaluate a project generated by `static-html-cube` against a distinct public
  design contract and sealed answer.
- **Falsifier:** changing starter alone is reported as skill uplift, Bloom answer
  material leaks, or fidelity and transfer results share one claim.
- **Holdout:** freeze immutable dev/validation/holdout membership before the
  treatment, evaluator thresholds, and skill decision are frozen. The transfer
  holdout is first read only afterward; its output cannot tune those inputs and
  carries a forward-test receipt.
- **Dependencies:** BL-08A/B/C, BL-11, BL-12. Blocks generalization claims only.

### BL-14 — Admit the frontend treatment profile

- **Repository:** KRN profile/protocol; lab consumes its receipt.
- **Entry → exit:** installed/global skills do not prove treatment delivery →
  treatment receives exactly `$frontend-stage` and the admitted frontend owners;
  control omits them; starter, public facts/assets, model, seed/budget, hooks,
  unrelated skills, network, evaluator exclusion, and runtime remain equivalent.
- **Falsifier:** candidate-visible inventories or a delivery probe find a missing
  treatment owner, a frontend owner in control, an oracle, or any other lane
  difference.
- **Dependencies:** BL-06, BL-11. Blocks BL-16.

### BL-15 — Preserve raw one-shot and bounded repair

- **Repositories:** KRN owns result schemas, causal classification, and
  coordinator code; the Bloom lab is the sole writer of Bloom run envelopes,
  raw results, and retained candidate artifacts.
- **Entry → exit:** generic aggregate → immutable one-shot result plus optional
  one-repair cohort classified externally by one causal category, with per-axis,
  per-viewport raw evidence, tokens, latency, retries, and artifact identities.
- **Falsifier:** rejected repair leaves modified code/results inconsistent,
  average hides a worse category-selected viewport, missing/errors disappear,
  or one-shot and repair are aggregated.
- **Dependencies:** BL-08A/B/C, BL-11. Blocks BL-16.

### BL-16 — Run the preregistered Bloom feasibility comparison

- **Repositories:** KRN fixes protocol/treatment identities; Bloom lab executes
  and owns private raw results. Sequential handoff, never concurrent writers.
- **Entry → exit:** no behavioral evidence → matched control/treatment runs use
  identical public epoch/model/seed/budget/environment and report independent
  axes, one-shot and repair separately. Ordering, retention, exclusions, and
  analysis are frozen before the first candidate call.
- **Human evidence:** the first feasibility gate has no manual score authority.
  If later calibration needs judgment, it uses immutable blinded packets, named
  reviewer role/identity, both presentation orders, append-only trusted receipts,
  and no editable aggregate; it never changes deterministic pass/fail.
- **Falsifier:** incomplete pair, treatment mismatch, leaked answer, task mutation,
  post-observation threshold change, or missing raw receipt invalidates the run.
- **Claim:** feasibility and in-domain Bloom fidelity only. A null/negative result
  changes the skill decision. Larger N and a transfer run require a new decision.
- **Dependencies:** BL-11, BL-14, BL-15.

### BL-17 — Add the WordPress/ACF adapter track

- **Repositories:** `boilerplate-rekurencja` profile/adapter plus lab fixture and
  KRN generic evaluator.
- **Entry → exit:** static frontend contract is admitted → a disposable created
  project separately reports frontend fidelity and adapter correctness for clone
  ownership, Text profiles, static layout allowlist, reachability, escaping,
  token mapping, and stale-state normalization.
- **Falsifier:** duplicate group, database-derived template, invalid state,
  unreachable layout, unescaped output, or frontend/adapter score conflation.
- **Dependencies:** BL-11 and an accepted source-side adapter/profile plan. It is
  not required for BL-16.

### BL-18 — Contract and retire obsolete authority

- **Repositories:** each original owner retires its own readerless surfaces;
  KRN removes only migrated frontend fixtures/procedures.
- **Entry → exit:** multiple old labs and visible toy oracle coexist → retained
  mechanisms have one owner, live readers are enumerated, obsolete duplicates are
  archived/quarantined or removed, and generic v1 readers remain intact.
- **Required ledger:** for every item named in the correction boundary, record
  original owner, retained mechanism, new owner, disposition, reader-zero proof,
  cleanup authority, and rollback/archive pointer. No blanket directory cleanup.
- **Falsifier:** repository search plus behavioral gates reveal a live reader,
  copied private course content, duplicated skill owner, or lost historical
  evidence needed by a named consumer.
- **Dependencies:** BL-11 for fidelity infrastructure, BL-12 for transfer
  infrastructure, BL-16 for experiment-only surfaces, and every optional track
  actually executed (especially BL-13/BL-17). Product and Sandcastle cleanup
  needs their owners' authority.

## Dependency graph

```text
published KRN FH-03..FH-05 -> BL-07 -> {BL-08A, BL-08B, BL-08C}
BL-00 -> BL-01 -> BL-06
   |        +------> BL-12
   +-> BL-02 -> BL-03
             -> BL-04 -> BL-05
{BL-03, BL-04, BL-05, applicable BL-08A/B/C} -> BL-09 -> BL-10 -> BL-11
{BL-06, BL-11} -> BL-14
{BL-08A/B/C, BL-11} -> BL-15
{BL-11, BL-14, BL-15} -> BL-16
{BL-08A/B/C, BL-11, BL-12} -> BL-13
BL-11 + adapter decision -> BL-17
BL-12/BL-16 + executed optional tracks + reader inventory -> BL-18
```

BL-03 and BL-12 deliberately do not share an entry edge: exact-starter fidelity
and production-profile transfer are different experiments. BL-17 is optional and
cannot delay the first static Bloom result.

## Unit execution and proof contract

For every unit:

1. Name repository, branch/worktree, sole writer, write authority, candidate-
   visible surface, sealed surface, and cheapest falsifier before mutation.
2. Preserve unrelated dirty work. Cross-repository observation never grants
   repair, cleanup, publication, or migration authority.
3. Demonstrate each new runtime falsifier red at the entry fixed point and green
   at the exit. Documentation/topology uses readback rather than manufactured
   tests.
4. A KRN harness-surface commit carries `Change-contract: <check>:red->green` or
   the justified unchanged `green->green` form and passes `changes:check` against
   its real base.
5. Record immutable source/base/head, environment, artifact and evaluator
   identities, public-input digest, denied probes, raw evidence location,
   rollback, and non-proofs.
6. Run focused checks first and each repository's required full gate once at
   handoff. Same-model review is advisory; deterministic mutation proof wins.
7. Commit, push, create remote/PR, merge, install, deploy, archive, or delete only
   under separately recorded authority.

## Ask-GPT review gate

After BL-00 documentation is committed, fully gated, and pushed, perform exactly
one GPT-6 Astra high-reasoning GitHub-connector review of that fixed point. Its
question is whether the repository boundaries, two-experiment design, leakage
model, dependency graph, and no-model admission gate are sufficient to begin
BL-01/BL-02 without recreating Sandcastle's second authority. It must not decide
merge, validate private course contents, claim gates ran, or recommend copying
old lab code. Every finding requires `path:line`, quotation, observation vs
inference, and the fixed output schema owned by `$ask-gpt`.

The single Astra response returns to `$delivery-loop`; every accepted finding is
verified locally and incorporated before implementation. No second Astra run is
planned for this planning fixed point.
