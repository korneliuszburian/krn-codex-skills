# Matt Pocock Skills Coverage

This is a mechanism ledger, not a mirror of Matt Pocock's prose or video
transcripts. It records the complete inspected surface, the conditions behind
each useful pattern, and the KRN decision that follows.

## Fixed evidence

- Repository: [mattpocock/skills](https://github.com/mattpocock/skills), commit
  `9603c1cc8118d08bc1b3bf34cf714f62178dea3b`, inspected 2026-07-16.
- Main flow: [My New Coding Agent Skills Setup](https://www.youtube.com/watch?v=M6mYodf0dJM),
  17:17, published and inspected 2026-07-16. English auto-caption JSON3 SHA-256:
  `3b852d7e36a44d5855c1955b89053dbbc0a80b56f24f6bcd685df06f7a1e5bdd`.
- Wayfinder: [LIVE: The /wayfinder Demo](https://youtu.be/251hsWgoTPM),
  1:14:40, streamed 2026-07-13 and inspected end to end 2026-07-16. English
  auto-caption JSON3 SHA-256:
  `59670e24ade68f96fd838f90feb9956a56f01e326ad82533b9517ce20cdaf02a`.
- The caption files and cloned source tree were analysis inputs outside this
  repository. They are not copied into the active skill context.

The video and repository are related fixed points, not one timeless artifact.
The main-flow installer reports 38 skills; the pinned repository contains 41.
The video describes a smart-zone heuristic around 140k tokens, while the pinned
`ask-matt` entrypoint says roughly 120k. These differences are expected from
source movement around publication and are not silently normalized into a KRN
constant.

Two smaller source inconsistencies remain visible at the pinned commit. The
Claude plugin manifest reports version `1.2.0` while `package.json` reports
`1.1.0`. The root README names GitHub, Linear, and local files as tracker
choices, while `setup-matt-pocock-skills` implements GitHub and GitLab as the
first-class CLI-backed choices and treats Linear under free-form “Other”. These
are corpus facts to preserve, not conventions for KRN to imitate.

## Complete repository accounting

The pinned tree contains 41 `SKILL.md` entrypoints and 41 adjacent
`agents/openai.yaml` files. The promoted surface is all 17 `engineering` and all
5 `productivity` skills. The remaining 19 live in explicitly non-promoted
`in-progress`, `misc`, `personal`, or `deprecated` buckets. Twenty-four skills
are user-invoked and disable implicit model invocation; 17 are model-invoked.

“Shape” below describes the dominant information architecture, not quality or
runtime behavior.

| Bucket | Skill | Invocation | Dominant shape |
|---|---|---|---|
| engineering | `ask-matt` | user | thin router over user-reachable workflows |
| engineering | `code-review` | model | ordered review workflow with branch references |
| engineering | `codebase-design` | model | architecture workflow with disclosed references |
| engineering | `diagnosing-bugs` | model | evidence-first diagnostic workflow |
| engineering | `domain-modeling` | model | decision workflow with durable vocabulary output |
| engineering | `grill-with-docs` | user | thin composer of grilling plus document context |
| engineering | `implement` | user | thin composer that delegates execution standards |
| engineering | `improve-codebase-architecture` | user | scoped architecture-improvement workflow |
| engineering | `prototype` | model | conditional fidelity/prototype workflow |
| engineering | `research` | model | source investigation workflow |
| engineering | `resolving-merge-conflicts` | model | specialized resolution workflow |
| engineering | `setup-matt-pocock-skills` | user | installation and setup workflow |
| engineering | `tdd` | model | test-driven implementation workflow |
| engineering | `to-spec` | user | conversation-to-spec compression workflow |
| engineering | `to-tickets` | user | spec-to-implementation-ticket workflow |
| engineering | `triage` | user | issue-frontier maintenance workflow |
| engineering | `wayfinder` | user | long-running decision-map orchestrator |
| productivity | `grill-me` | user | very thin interview composer |
| productivity | `grilling` | model | reusable questioning/reference procedure |
| productivity | `handoff` | user | very thin context-transfer composer |
| productivity | `teach` | user | interactive teaching workflow |
| productivity | `writing-great-skills` | user | skill-authoring workflow and reference gateway |
| in-progress | `batch-grill-me` | user | experimental batch-interview workflow |
| in-progress | `claude-handoff` | user | experimental background handoff workflow |
| in-progress | `loop-me` | user | experimental autonomous loop |
| in-progress | `setup-ts-deep-modules` | user | experimental setup workflow |
| in-progress | `to-questionnaire` | user | experimental document transformation |
| in-progress | `wizard` | user | experimental interactive orchestrator |
| in-progress | `writing-beats` | user | experimental writing decomposition |
| in-progress | `writing-fragments` | user | experimental fragment workflow |
| in-progress | `writing-shape` | user | experimental structure workflow |
| misc | `git-guardrails-claude-code` | model | narrow setup procedure |
| misc | `migrate-to-shoehorn` | model | bounded migration procedure |
| misc | `scaffold-exercises` | model | specialized generation workflow |
| misc | `setup-pre-commit` | model | narrow setup procedure |
| personal | `edit-article` | user | personal editorial workflow |
| personal | `obsidian-vault` | model | personal repository conventions |
| deprecated | `design-an-interface` | model | superseded design workflow |
| deprecated | `qa` | model | superseded review workflow |
| deprecated | `request-refactor-plan` | model | superseded planning workflow |
| deprecated | `ubiquitous-language` | user | superseded terminology workflow |

This accounting prevents cherry-picking only the polished examples. The
non-promoted buckets show Matt's laboratory and retirement model; the promoted
set shows what he is willing to expose as the supported product.

## Repository mechanisms

### Promotion is a product boundary

Matt's governance requires promoted skills to agree across the top-level
README, bucket README, Claude plugin manifest, Codex metadata, and human-facing
documentation. Experimental, personal, miscellaneous, and deprecated work can
remain in the repository without entering the supported installation surface.

KRN already uses a stricter version of this idea: every discovered skill is
manifest-promoted and installation is manifest-owned. KRN does not need a lab
bucket until a real local experiment must coexist with the promoted source.

### Invocation has one primary axis

Matt separates user-invoked skills from model-invoked skills. User-invoked
entrypoints disable implicit invocation in both the Claude-facing frontmatter
and Codex policy. Model-invoked descriptions carry enough boundary detail to
route without opening the body. This reduces ambient context while accepting
human recall cost.

KRN retains the same single axis through `allow_implicit_invocation`, without
copying Claude-specific frontmatter into the Codex manifest. Our one explicit
skill, `second-opinion-review`, does not justify a router. Matt's `ask-matt`
does because it maps a much larger family of user-reachable workflows; the
human still explicitly invokes the selected user-only skill. An
explicit-only Codex skill remains available through the interactive `$` picker
even when a particular API session omits it from the injected model-visible
list; selecting the picker entry, not merely typing look-alike prose, is the
activation seam.

Matt omits the Codex `policy` block for model-invoked skills and relies on the
documented default. KRN's canonical metadata writes `true` or `false` for every
promoted skill so the manifest, validator, and picker policy can be compared
without interpreting absence. That extra explicitness is useful local
governance, not formatting drift to remove.

### Information shape follows the job

Matt does not use one visual template. `grill-me`, `grill-with-docs`,
`implement`, `research`, and `handoff` can be tiny composers. Stateful or risky
workflows retain ordered steps, branch references, examples, and completion
checks. Dependencies are named as skill composition; direct companion material
stays under the owner.

KRN adopts the semantic rule, not Matt's exact typography: sequence earns
numbering; peer rules stay flat; branch detail sits behind one direct
`references/...` pointer; deterministic failure-prone behavior earns a script.
The entrypoint validator remains stricter about direct references because that
buys predictable disclosure and catches orphaned material.

### Links and subpoints are behavioral, not decorative

The representative extremes are visible in
[`ask-matt`](https://github.com/mattpocock/skills/blob/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/skills/engineering/ask-matt/SKILL.md),
[`implement`](https://github.com/mattpocock/skills/blob/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/skills/engineering/implement/SKILL.md),
and
[`writing-great-skills`](https://github.com/mattpocock/skills/blob/9603c1cc8118d08bc1b3bf34cf714f62178dea3b/skills/productivity/writing-great-skills/SKILL.md).

- Cross-skill composition is written as `/skill-name` prose. A skill does not
  reach sideways through `../other-skill/...` and acquire another owner's
  procedure.
- A local link sits beside the choice that needs it. Matt uses several literal
  styles—`./file.md`, repository-root docs, and anchored ADR links—so the
  transferable mechanism is branch-local disclosure, not punctuation
  uniformity.
- Bullets are peers when order does not matter. Numbering appears when later
  work depends on earlier state. Bold labels identify a decision or action;
  they are not applied to every noun.
- `Done when` is common where early stopping is dangerous, but thin composers
  can finish through the completion contract of the workflow they invoke.
- Tables earn their space for exact routing or mapping, as in `ask-matt`; prose
  remains better for one linear decision.
- Examples, templates, and XML-like blocks sit next to the ambiguity they
  resolve. They are working shapes, not automatically persisted artifacts.

KRN deliberately normalizes its own local pointers to direct lowercase
`references/...` links. Copying Matt's mixed literal link spellings would make
the repository less predictable without changing agent behavior. The useful
visual grammar is semantic: peers look like peers, sequence looks like
sequence, routing looks like a mapping, and branch detail is one click away.

### Installation optimizes access but still needs ownership

Matt demonstrates project/global scope, harness selection, blessed versus
experimental sets, and symlink installation. His repository's linker removes a
colliding non-symlink target, which is acceptable only under stronger operator
assumptions than KRN makes.

KRN adopts canonical symlinks and fresh-session discovery, but rejects
destructive collision replacement. The manifest and installer remain the sole
global ownership boundary. A stale already-open skill picker is not evidence
that the symlink or manifest is broken.

## Main-flow video, end-to-end

| Time | Mechanism | Condition and trap | KRN disposition |
|---|---|---|---|
| 00:00–00:54 | one flow for brownfield and greenfield work | useful only when setup and planning converge on the same durable destination | adopt as a decision chain, not a universal orchestrator |
| 00:54–03:44 | `skills.sh` selects scope, harness, and blessed/experimental skills; symlinks are recommended | copying everything obscures support level; destructive collision handling assumes ownership | keep manifest promotion, safe symlinks, and collision refusal |
| 03:44–04:35 | user-invoked skills keep the reported context cost near 660 tokens | context savings trade against human recall | keep explicit invocation only where ambient routing is not worth its cost |
| 04:35–06:50 | setup chooses tracker and triage vocabulary, creates domain docs, and leaves thin pointers in `CLAUDE.md`/`AGENTS.md` | thick global instructions become stale and steal context | keep global workflow thin; repository owns domain state and durable tracker |
| 06:50–07:46 | `ask-matt` routes user intent and considers context-window state | a router without a large explicit family adds another name and owner collision | do not add a KRN router yet |
| 07:46–10:03 | `grill-with-docs`, optional prototype, and handoff raise shared understanding before implementation | prototypes answer high-fidelity questions but can become accidental production code | retain source-to-decision and disposable rewrite worktrees; prototype only for unresolved fidelity |
| 10:03–11:15 | a “smart zone” around 140k tokens decides same-session implementation versus durable compression | the exact threshold is model- and harness-specific, not a correctness boundary | native goal/tracker state owns continuity; compact before evidence disappears |
| 11:15–12:19 | `to-spec` compresses settled conversation without re-interviewing | a spec that invents unresolved decisions hides fog | adopt destination-first durable decisions and explicit unknowns |
| 12:19–13:55 | `to-tickets` creates work sized for one fresh context; the human adjusts granularity | ticket count is not proof that slices are independent or complete | Beads owns durable slices; implementation skill owns one vertical slice |
| 13:55–15:10 | clear context and implement tickets, usually one fresh session each | session reset can discard unpersisted rationale | ticket and source pointers must contain the decision evidence first |
| 15:10–16:20 | independent Standards and Spec reviewers inspect the fixed result | a reviewer cannot approve its own assumptions or substitute for local proof | retain independent read-only code-review and advisory second opinion |
| 16:20–17:17 | recap returns to setup → decision → spec/tickets → implementation → review | a memorable flow can be cargo-culted into unrelated tasks | compose only the owners the prompt actually needs |

## Wayfinder video, end-to-end

The demo is valuable because it exposes friction as well as the intended model.

| Mechanism | What the demonstration establishes | Boundary or observed friction | KRN disposition |
|---|---|---|---|
| decision-complete destination | planning ends in a spec with enough settled choices for later execution | execution is explicitly outside the map's scope | keep goal outcome separate from current production slice |
| low-resolution map plus child decision tickets | the map is an index; tickets and linked artifacts own detail | copying all detail into the map causes context growth and drift | Bead/goal points to bounded evidence; detail stays with its owner |
| frontier and fog | ready, unblocked, unclaimed work differs from future decisions that are not yet precise | pretending fog is an actionable ticket produces false granularity | only claim a locally executable slice; record unresolved decisions explicitly |
| claim before work | one agent takes ownership before investigating a ticket | parallel work without claims duplicates or conflicts | Beads claim remains the durable KRN ownership seam |
| research ticket | sources can be investigated in parallel and returned as a thick artifact behind a thin pointer | source text is not itself a decision; private corpus must not enter active context | use source-to-decision and retain an original mechanism ledger |
| decision ticket versus implementation ticket | planning resolves choices; later tickets build the settled result | mixing them lets implementation pressure prematurely decide product questions | retain separate decision and implementation ownership |
| prototype for fidelity | disposable code can answer UI or state questions that prose cannot | worktree dependencies, environment setup, symlinks, and cleanup add real cost | prototype only when the question cannot be resolved more cheaply; keep it disposable |
| grilling with a human | the agent finds facts and asks; the human makes product decisions | unattended questioning cannot supply human preferences | preserve human-only decisions in contracts and handoffs |
| dynamic map rewiring | decisions expose new tickets and dependencies | only genuinely independent frontier work can run in parallel | update dependencies instead of forcing the initial plan |
| orchestrator | one Wayfinder thread coordinates subskills and map state | the livestream required manual session orchestration, hit auto-approval friction, and did not finish the map on air | do not introduce a KRN-wide orchestrator until native goal plus Beads fails a measured workflow |
| leverage layers | model, harness, and environment are separate variables | changing the model alone does not repair workflow or environment constraints | diagnose the failing layer before changing capability setup |
| final conversion | completed map flows to spec, implementation tickets, fresh execution sessions, then full review | every conversion can lose rationale unless pointers remain live | require consumer, falsifier, and does-not-prove at each durable decision |

The final demo sequence is map → spec → close planning map → implementation
tickets → fresh implementation passes → full code review → human review. The
video explicitly distinguishes decision tickets from implementation tickets;
KRN should not flatten those owners into one generic task type.

## Source-to-decision matrix

| Source mechanism | KRN consumer | Decision | Falsifier | Does not prove |
|---|---|---|---|---|
| promoted versus experimental buckets | manifest and installer | adopt one explicit supported surface; add labs only for a named experiment | an unmanifested skill appears in the installed KRN index | that every promoted skill routes correctly |
| user/model invocation split | descriptions, `openai.yaml`, trigger cases | adopt; keep second opinion explicit | a fresh implicit prompt invokes second opinion, or explicit mention cannot discover it | low total context cost in every harness |
| `ask-matt` router | skill catalog UX | defer for KRN | users repeatedly fail to recall or choose among a measured family of explicit KRN skills | that routers are bad generally |
| semantic variation in skill shape | `writing-great-skills` | adopt | reviewers force sequence onto flat rules or inflate a thin composer | that short skills are automatically clear |
| direct companion references | validator and information ladder | adopt with stricter KRN pointer checks | a branch requires deep chasing or an orphaned reference escapes validation | reference content is behaviorally correct |
| symlink installation | installer | adopt collision-safe variant | a fresh isolated install cannot discover the canonical target | an already-open session refreshes its picker |
| destructive collision replacement | installer | reject | explicit migration authority and a recoverable archive make replacement safe | that silent `rm -rf` is acceptable |
| thin global instructions plus domain pointers | global and repository `AGENTS.md` | adopt | a repository cannot recover its current language or gates from direct pointers | that every repository instruction is current |
| smart-zone compaction | native goal plus tracker | adopt mechanism, not numeric threshold | a long session loses settled decisions before durable compression | that 140k is optimal for Codex |
| map/frontier/fog | Beads and goal planning | adopt vocabulary through existing owners, not a copied global skill | the tracker cannot represent blocked, unclaimed, or unresolved work | that Wayfinder's orchestration fits KRN unchanged |
| independent Standards and Spec review | `code-review` | adopt | one pass conflates both lenses or edits the reviewed fixed point | release readiness or runtime correctness |
| isolated advisory reviewer | `second-opinion-review` | adopt with explicit authority and artifact lifecycle | output mutates canonical work, lacks identity, or lands in an ownerless folder | approval, correctness, or provider identity from a model alias |

## Resulting KRN boundary

KRN should become easier to route and inspect, not more Matt-shaped. The
supported set remains small; model-facing descriptions remain boundary-rich;
all companion references stay directly reachable; the installer stays
collision-safe; native goal and Beads remain the long-running owners; and
`second-opinion-review` gains a deterministic artifact root and lifecycle.

A future router or Wayfinder-like orchestrator requires evidence that operators
cannot reliably select the current explicit skills or that native goal plus the
repository tracker loses a real decision frontier. The videos demonstrate
useful mechanisms and real costs, but they do not supply that KRN-specific
failure evidence.
