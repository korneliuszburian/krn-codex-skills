# Deep audit of the current Matt Pocock skills repository

Status: source-backed audit, verified 2026-09-10. This report answers a
different question from a release diff: what is in the current upstream tree,
what is promoted versus experimental, and what (if anything) KRN should
consume.

## Decision question and scope

**Question:** does the current official `mattpocock/skills` tree contain a new
skill, routing contract, or transferable mechanism that KRN should add to its
Codex-only global set or its future frontend work?

**Active consumer:** KRN's repository owner for upstream refresh and skill
topology. **Disposition for this audit:** do not change the upstream pin or
install any additional upstream path yet. The promoted tree is already the
configured composition; the remaining candidates need local collision and
consumer decisions rather than blind adoption.

**Boundary:** this is an inventory and mechanism audit, not a claim that any
skill is effective, superior, or suitable for KRN's frontend authoring. It
does not copy course material, private text, exercises, or solutions.

## Fixed points and primary evidence

| Item | Evidence |
|---|---|
| KRN pin | [`config/upstream-sources.json`](../../config/upstream-sources.json) pins `mattpocock/skills` to `6654f6b60cd9d5be8b54c6fafe44346dabeb3b76`. |
| Current upstream | Official `main` resolved to [`3cca18b`](https://github.com/mattpocock/skills/tree/3cca18b368ae95cdbdebbff572ccafa662551015) on 2026-09-10; the checkout commit date is 2026-09-04. |
| Pin-to-head comparison | The official [GitHub comparison](https://github.com/mattpocock/skills/compare/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76...3cca18b368ae95cdbdebbff572ccafa662551015) contains only `CLAUDE.md` and `scripts/link-skills.sh`; no `skills/**` file changes. |
| Current upstream history | [`CHANGELOG.md`](https://github.com/mattpocock/skills/blob/3cca18b368ae95cdbdebbff572ccafa662551015/CHANGELOG.md) and the current repository tree were inspected directly. |

The important correction is that “no new skill after the pin” is true but
insufficient. The pin already contains the promoted 1.2.x set and also carries
experimental `in-progress` and `misc` directories that are not part of KRN's
configured required paths.

## Complete current inventory

The current tree contains 37 `SKILL.md` entries. The promoted entries are the
25 paths KRN already composes; the other 12 are explicitly experimental or
repository-specific.

### Promoted engineering (18)

`ask-matt`, `code-review`, `codebase-design`, `diagnosing-bugs`,
`domain-modeling`, `grill-with-docs`, `implement`,
`improve-codebase-architecture`, `prototype`, `research`,
`resolving-merge-conflicts`, `setup-matt-pocock-skills`, `tdd`, `to-spec`,
`to-tickets`, `triage`, `wayfinder`, `wizard`.

### Promoted productivity (7)

`grill-me`, `grilling`, `handoff`, `teach`, `to-questionnaire`, `wait-what`,
`writing-for-agents`.

### `in-progress` (8)

`claude-handoff`, `implement-spec`, `loop-me`, `retro`,
`setup-ts-deep-modules`, `writing-beats`, `writing-fragments`,
`writing-shape`.

### `misc` (4)

`git-guardrails-claude-code`, `migrate-to-shoehorn`, `scaffold-exercises`,
`setup-pre-commit`.

The category is meaningful evidence. An `in-progress` entry is not a promise
that its trigger, owner, test surface, or packaging contract is settled. A
`misc` entry is not a general workflow owner. KRN should not promote either
category merely because its directory exists.

## What the upstream release history actually changed

The current `CHANGELOG.md` records several substantial mechanisms, but the
tree comparison proves they are already at or before KRN's pin, not additions
that arrived after it:

- `to-questionnaire` is a user-invoked route for extracting knowledge from a
  person who can answer the missing questions; it is not a second grilling
  owner.
- `wizard` is a model-invoked handoff for steps only a human can perform, with
  a fixed interactive shell template and confirmation boundaries.
- `prototype` treats a single shareable HTML file as a primary source and
  captures the validated decision separately from throwaway code.
- `writing-for-agents` generalises skill/document writing and uses positive
  pointers, progressive disclosure, and a dedicated mechanics reference.
- `wayfinder` is a situational multi-session on-ramp with decision tickets;
  it is not a mandatory main pipeline.
- `improve-codebase-architecture` scopes exploration toward recently active
  code, applying a YAGNI filter before proposing a deepening opportunity.
- `diagnosing-bugs` redacts captured output before it becomes evidence.
- `ask-matt` contains explicit phase-boundary, wayfinder, grilling, and merge
  conflict routes.

These are valuable mechanisms, but KRN already imports the corresponding
promoted names from the fixed upstream checkout. Re-copying them into KRN
would create a second owner and would violate the repository's composed-upstream
contract.

## Candidate dispositions for KRN

| Candidate | Disposition | Local implication and falsifier |
|---|---|---|---|
| `implement-spec` | **reject for now** | It is a second implementation owner beside upstream `implement` plus KRN's lifecycle and slice owners. Reopen only if a concrete spec-to-code seam cannot be served by that composition and a collision experiment shows a unique stopping condition. |
| `loop-me` | **defer** | It appears to grill a workflow author about workflows, but KRN already has `grilling`, `grill-with-docs`, and delivery-loop. A named consumer and non-duplicating stop condition are missing. Reopen with a routing case that current owners cannot answer. |
| `retro` | **defer** | A retrospective may improve a completed KRN run, but no current global owner consumes it. Reopen only with a preregistered post-run comparison naming a real run, baseline, grader, and stop rule; do not install it as a default phase. |
| `setup-ts-deep-modules` | **defer** | It could be a project-local dependency-cruiser adapter, not a universal TypeScript workflow. Reopen only with a preregistered target repository, package boundary, baseline, and acceptance signal. |
| `writing-fragments` / `writing-shape` / `writing-beats` | **defer** | These are staged writing modes, not engineering or frontend owners. They become relevant only with a named authoring consumer and a routing case that does not duplicate `teach`, `writing-for-agents`, or `grilling`. |
| `claude-handoff` | **reject** | It is tied to another harness's handoff contract and conflicts with KRN's Codex-only installation boundary. Reopen only for a separately owned adapter, never by copying the upstream procedure into the global set. |
| `git-guardrails-claude-code` | **reject** | It is a host-specific guardrail package, while KRN owns its own deterministic hook and global safety contract. A second hook would create policy collision. |
| `migrate-to-shoehorn` | **reject** | It assumes a particular TypeScript dependency and migration policy that KRN does not own globally. A product repository may choose it locally. |
| `scaffold-exercises` | **reject** | It is course-repository tooling, not a reusable engineering workflow for KRN consumers. |
| `setup-pre-commit` | **defer** | It mutates a target repository's toolchain. It needs an explicit target-repository authority and adapter, not global installation. |

No candidate currently earns `adopt`. The falsifiers above are deliberately
concrete: a future adoption must first prove a missing consumer and a distinct
stopping condition through a concrete routing failure, then pass the install and ownership
boundaries.

## Open upstream proposals worth tracking

The current default branch is not the whole upstream signal. Open issues and
contributor branches are useful candidate evidence, but they are not promoted
interfaces and must not be installed from a fork. The following proposals have
the strongest possible KRN relevance and were checked against their official
issue text on 2026-09-10:

| Proposal | Observed state (2026-09-10) | Evidence and mechanism | KRN disposition |
|---|---|---|
| [`to-pr` + `resolving-review-comments`](https://github.com/mattpocock/skills/issues/938) | Open issue with a contributor branch; not present in `main`. | Proposed bridge from a committed branch to a reviewable PR, then a loop for fetching, sorting, fixing, replying to, and resolving review threads. | **defer** until a preregistered publication-boundary experiment names a real PR authority. KRN's `delivery-loop` and `code-review` stop before PR/merge authority. |
| [`skeptic`](https://github.com/mattpocock/skills/issues/566) | Open proposal branch; not promoted. | Proposed blind refutation pass for review findings, followed by a bounded attack on the fix. | **defer**. KRN already has independent second-opinion transport and fixed-point review. |
| [`to-spec` current-state boundary](https://github.com/mattpocock/skills/issues/843) | Open issue; no merged `skills/**` change at current head. | Proposed separation of retained existing behaviour, modified behaviour, new behaviour, and invariants that must remain unchanged. | **adopt as a local evaluation invariant**, not as a forked upstream skill. Falsifier: a spec silently redesigns an existing surface. |
| [`to-spec` executable cross-boundary contracts](https://github.com/mattpocock/skills/issues/660) | Open issue; no merged `skills/**` change at current head. | Proposed executable contracts for frontend/backend field names, nullability, enums, errors, pagination, and versions. | **defer** until a preregistered target-repo experiment names a real cross-boundary seam. It is not a global KRN contract format. |
| [`implement-spec` run findings](https://github.com/mattpocock/skills/issues/1010) and [serialised shared surfaces](https://github.com/mattpocock/skills/issues/991) | Open run reports against the existing `in-progress` file. | Reports propose tip merges, serialising shared surfaces, named branches, and clearer text. | **defer**. Use the reports as falsifiers for `implement`/`to-tickets`, not permission for another implementation owner. |
| [`setup-ts-deep-modules`](https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/in-progress/setup-ts-deep-modules/SKILL.md) | `in-progress` file exists at the pinned tree; not promoted. | Target-repository adapter that installs dependency-cruiser rules so package internals stay behind entry points. | **defer** until a preregistered target-repo experiment names a package boundary and acceptance signal. It may not become global TypeScript policy. |
| [`loop-me`](https://github.com/mattpocock/skills/blob/6654f6b60cd9d5be8b54c6fafe44346dabeb3b76/skills/in-progress/loop-me/SKILL.md) | `in-progress` file exists at the pinned tree; not promoted. | User-invoked loop that grills a workflow author into a multi-session workflow specification; it is closer to `to-spec`/`wayfinder` than ordinary `grilling`. | **defer** until a routing case proves current owners cannot finish. |
| [`skill-router`](https://github.com/mattpocock/skills/issues/252) | Open community request; no merged skill. | Request for another router over the skill set. | **reject** for KRN: `ask-matt` and the local owner/companion boundary already provide the router seam. |
| [`review-docs`](https://github.com/mattpocock/skills/issues/307) | Open community request; no merged skill. | Proposed repository-wide documentation/code alignment reviewer. | **defer**. KRN has `writing-for-agents`, domain modeling, validation, and fixed code review. |
| [`write-commit`](https://github.com/mattpocock/skills/issues/235) | Open community request; no merged skill. | Proposed dedicated commit-authoring workflow. | **reject** as a global owner: repository convention and delivery-loop publication state already own this. |
| [`codehealth-mcp`](https://github.com/mattpocock/skills/issues/260) | Open community request; no merged skill. | Proposed external CodeScene MCP integration. | **reject** for the global set: no KRN-wide consumer or trust contract. |

These proposals explain why a simple main-branch inventory is not enough for
roadmap planning. They do **not** establish that the proposals are accepted by
Matt, merged, safe, or better than KRN's current owners. Their state must be
rechecked before any upstream refresh or local implementation.

## Consequence for KRN's next work

1. Keep the upstream pin at `6654f6b` until a refresh changes a `skills/**`,
   routing, invocation, or ownership contract. The current head does not; open
   proposals are not a valid reason to move the pin.
2. Treat the 25 promoted upstream skills as the source of truth; audit KRN's
   local composition and references for drift instead of forking their text.
3. Keep all 12 experimental/misc paths out of the release. Evaluate one only
   when a real KRN consumer, a collision case, and a falsifier exist.
4. Treat the strongest transferable mechanisms as evaluation invariants: an
   explicit existing-versus-new spec boundary, a single publication owner,
   blind falsification only when a real review failure exists, and target-local
   dependency boundaries. Do not turn them into aliases or mandatory phases.

## Limits and reopen rules

This is a point-in-time public-tree and issue audit. It does not inspect unpublished
branches, private material, runtime quality, or skill advantage. Re-run it when
the upstream default branch changes, when KRN considers moving its pin, or when
a concrete local task exposes a routing gap. Any resulting change must record
the exact upstream revision, named consumer, collision outcome, falsifier, and
whether the right action is adopt, reject, lab-test, or defer.
