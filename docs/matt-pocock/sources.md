# Matt Pocock — Source Index

Working research index of Matt Pocock's material on the AI-coding pipeline.
This hub **collects** sources and mechanisms; the committed decision ledgers
([`../SOURCES.md`](../SOURCES.md), [`../matt-skills-coverage.md`](../matt-skills-coverage.md),
[`../matt-youtube-coverage.md`](../matt-youtube-coverage.md)) retain the
adopt/reject decisions. New mechanisms found here are candidates to feed those
ledgers through [`source-to-decision`](../SOURCES.md).

## Verification legend

- **verified** — URL confirmed by fetching the page / GitHub API / channel RSS.
- **rss** — confirmed present on his channel via the uploads RSS feed but not
  page-fetched for full metadata; treat duration as approximate.
- **short** — a YouTube Short; stable IDs verified individually are noted,
  otherwise the short is known on his `/shorts` feed without a resolved `watch?v=`.
- **unverified** — plausible URL, attribution not fully confirmed. Do not rely on
  it without re-checking.
- **third-party** — not Matt's upload; commentary/coverage of his work.

Star counts are intentionally omitted — GitHub's API returned implausible values
for these repos; rely on relative ordering, not absolute numbers.

## Pipeline stage map

The stages are Matt's end-to-end coding pipeline, used as the spine of this hub
and of [`pipeline-audit.md`](pipeline-audit.md).

```text
setup -> grill/align -> decision map (Wayfinder) -> [prototype] -> spec/PRD
      -> tickets -> [triage] -> implement -> TDD/proof -> review -> handoff
      -> research/AFK ; with diagnosing-bugs and codebase-design cross-cutting
```

## Stage 1 — Setup / AGENTS.md / skills installation

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Never Run claude `/init` | video (verified) | https://youtu.be/9tmsq-Gvx6g | Auto-generated giant instruction files flood context; write thin, pointer-driven rules. |
| mattpocock/skills end-to-end | video (verified) | https://www.youtube.com/watch?v=M6mYodf0dJM | Canonical install + walkthrough: grill-with-docs → spec → tickets → execution. |
| 5 Claude Code skills I use every single day | video (verified) | https://www.youtube.com/watch?v=EJyuu6zlQCg | The de-facto setup set: grill-me, to-prd/to-spec, prd-to-issues, tdd, improve-codebase-architecture. |
| Claude Code's system tools are SO BLOATED | short (rss) | https://www.youtube.com/watch?v=oLx4yCbeklQ | Trim built-in tool definitions; each one costs context and adds decision overhead. |
| A Complete Guide To AGENTS.md | post (verified) | https://www.aihero.dev/a-complete-guide-to-agents-md | Minimal file: one-sentence description + package manager + non-standard build commands; progressive disclosure; describe capabilities not file paths; subdirectory AGENTS.md files merge; symlink CLAUDE.md↔AGENTS.md. |
| My AGENTS.md file for building plans you actually read | post (verified) | https://www.aihero.dev/my-agents-md-file-for-building-plans-you-actually-read | Two plan-mode rules verbatim: make plans extremely concise (sacrifice grammar); end each plan with unresolved questions. |
| How To Use Claude Code Hooks To Enforce The Right CLI | post (verified) | https://www.aihero.dev/how-to-use-claude-code-hooks-to-enforce-the-right-cli | Don't put "use pnpm not npm" in CLAUDE.md — it wastes instruction budget and isn't deterministic; use a `PreToolUse` hook that exits 2 to block. |
| How To Kill The Bloat In Claude Code's System Prompt | post (verified) | https://www.aihero.dev/how-to-kill-the-bloat-in-claude-codes-system-prompt | 6-step context diet: `/context` → logging proxy → disable feature clusters → bare-name `permissions.deny` → `skillOverrides` → re-measure. |
| Do you even need [an] AGENTS.md? | short | https://www.youtube.com/@mattpocockuk/shorts | His own skills repo rule is "never create AGENTS.md" — prefer prompt-driven rules + CONTEXT.md/ADRs. |
| Step one: Create an agents.md file | short (unverified) | https://www.youtube.com/shorts/DrUX5vorA3U | Seed AGENTS.md with full project context as the first step. |

## Stage 2 — Grilling / shared understanding

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Grill Me viral | video (verified) | https://www.youtube.com/watch?v=rlM_fAKxB3Q | The 3-sentence stateless grill-me: interview relentlessly, walk the design tree branch by branch, explore instead of ask. |
| I stopped using /grill-me for coding (grill-with-docs) | video (verified) | https://youtu.be/6BB6exR8Zd8 | The "agent vocabulary" video: agents dropped into a project guess jargon on the fly and use 20 words where 1 will do. grill-with-docs = relentless interview + writes ADRs/glossary (ubiquitous language) so the agent uses the project's exact vocabulary. |
| This change makes /grill-me SO MUCH BETTER | short (rss) | https://www.youtube.com/watch?v=tLyfDIt9wHg | Iteration on grill-me mechanics. |
| Using /grill-me for interviews?! | short (rss) | https://www.youtube.com/watch?v=5hYsBUMmr-I | Repurposing grill-me for interviewing rather than planning. |
| I'm thinking about changing my most popular skill | short (rss) | https://www.youtube.com/watch?v=U832hShMVnc | Signals the grill-me → wayfinder evolution. |
| The /grilling Skill | post (verified) | https://www.aihero.dev/skills-grilling | The interview primitive: one question at a time, each with a recommended answer, in dependency order; codebase settles what it can. |
| The /grill-me Skill | post (verified) | https://www.aihero.dev/skills-grill-me | Three-sentence skill definition. |
| grill-with-docs: Align Before You Build | post (verified) | https://www.aihero.dev/grill-with-docs | Grill-me + ADR/glossary during interview (DDD ubiquitous language). |
| 9 Things People Get Wrong With /grill-me and /grill-with-docs | post (verified) | https://www.aihero.dev/things-people-get-wrong-with-grill-me-and-grill-with-docs | Common mistakes: scope, model selection, planning strategies. |
| My 'Grill Me' Skill Went Viral | post (verified) | https://www.aihero.dev/my-grill-me-skill-has-gone-viral | Origin and impact. |

## Stage 3 — Decision map / Wayfinder / planning

| Source | Type | URL | Mechanism |
|---|---|---|---|
| /wayfinder demo (livestream) | video (verified) | https://youtu.be/251hsWgoTPM | Decision map: low-res map → decision tickets → frontier/fog → claim before work → research tickets → dynamic rewiring. |
| Wayfinder v1.1 | video (verified) | https://youtu.be/A8mokin_YOs | Release of /wayfinder, /research, /implement, /to-spec, /to-tickets. |
| I was an AI skeptic. Then I tried plan mode | video (verified) | https://www.youtube.com/watch?v=WNx-s-RxVxk | Plan mode as the single most important feature; concise-plan rules. |
| The /wayfinder Skill | post (verified) | https://www.aihero.dev/skills-wayfinder | Planning/routing skill. |
| An Introduction To Plan Mode | post (verified) | https://www.aihero.dev/plan-mode-introduction | Real value = priming the context window before execution (don't clear between plan and execute). |

## Stage 4 — Prototype (optional)

| Source | Type | URL | Mechanism |
|---|---|---|---|
| The /prototype Skill | post (verified) | https://www.aihero.dev/skills-prototype | Throwaway prototypes to resolve UI/state/product fidelity questions before committing. |
| (skills release: prototype) | video (verified) | https://youtu.be/dtAJ2dOd3ko | Prototype release alongside handoff. |

## Stage 5 — Spec / PRD

| Source | Type | URL | Mechanism |
|---|---|---|---|
| The /to-spec Skill | post (verified) | https://www.aihero.dev/skills-to-spec | Compress a settled conversation + codebase into a spec/PRD; destination-first, explicit unknowns. (Formerly to-prd.) |

## Stage 6 — Tickets / slicing / tracer bullets

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Full Walkthrough: Workflow for AI Coding | workshop (verified) | https://www.youtube.com/watch?v=-QFHIoCo-Ko | Requirements → PRD → slice into vertical tracer-bullet issues → implement. |
| The AI Coding Workflow That Ships Features While You Sleep | workshop (verified) | https://www.youtube.com/watch?v=lbRggFJWhn4 | World's Fair version of the end-to-end pipeline. |
| The /to-tickets Skill | post (verified) | https://www.aihero.dev/skills-to-tickets | Spec → tracer-bullet implementation issues with blocking relationships. (Formerly to-issues.) |
| Tracer Bullets: Keeping AI Slop Under Control | post (verified) | https://www.aihero.dev/tracer-bullets | AI's sycophancy builds horizontal layers in isolation; force tiny end-to-end vertical slices that touch all layers, fresh context per slice. |

## Stage 7 — Triage (backlog)

| Source | Type | URL | Mechanism |
|---|---|---|---|
| The /triage Skill | post (verified) | https://www.aihero.dev/skills-triage | Organize GitHub issues; turn messy ideas into agent-ready tasks. |
| triage: Turn Backlog Mess Into Agent-Ready Work | post (verified) | https://www.aihero.dev/burn-through-your-backlog-with-my-triage-skill | Practical guide to triage. |

## Stage 8 — Implementation (fresh-context sessions)

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Building a real feature with Claude Code | video (verified) | https://youtu.be/hX7yG1KVYhI | End-to-end feature build through every workflow step. |
| Real engineering with Claude Code | video (verified) | https://youtu.be/kZ-zzHVUrO4 | A complicated multi-phase plan executed in Claude Code; checkpoint + resume durable phases. |
| Agent worktrees | video (verified) | https://youtu.be/yv8VZpov8bk | `claude --worktree` for parallel non-interfering sessions; needs remote refs + recovery for unpushed work. |
| The /implement Skill | post (verified) | https://www.aihero.dev/skills-implement | Drive spec/tickets through TDD, typecheck, full suite, then review + commit; operate on pre-agreed seams. |
| Most devs don't understand how context windows work | video (verified) | https://www.youtube.com/watch?v=-uW5-TaVXu4 | Lost-in-the-middle, clear vs compact, MCP bloat, lean context as the core skill. |
| What is the dumb zone? | short (rss) | https://www.youtube.com/watch?v=sOd7svdu_1I | The ~100k-token quality cliff; design around the finite smart zone. |
| When to use Claude Code vs Codex | short (verified) | https://www.youtube.com/shorts/asxkdlVdprU | Decision rule for picking Claude Code vs Codex (and Warp). |

## Stage 9 — TDD / proof / testing

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Red Green Refactor is OP With Claude Code | video (verified) | https://www.youtube.com/watch?v=hYZdIwFIy-c | Red-green-refactor loop with agents; the most consistent quality lever. |
| Ship working code while you sleep (Ralph technique) | video (verified) | https://youtu.be/_IK18goX4X8 | Ralph loop: a bash script re-runs a fresh-context agent until done; git as the feedback loop. |
| My Skill Makes Claude Code GREAT At TDD | post (verified) | https://www.aihero.dev/skill-test-driven-development-claude-code | LLMs default to horizontal slicing; force ONE test → ONE impl → repeat; design deep modules and testability. |
| The /tdd Skill | post (verified) | https://www.aihero.dev/skills-tdd | Implement one behavior at a time. |
| Essential AI Coding Feedback Loops For TypeScript Projects | post (verified) | https://www.aihero.dev/essential-ai-coding-feedback-loops-for-type-script-projects | Every change should trigger pre-commit hooks, CI, typecheck immediately. |
| 11 Tips For AI Coding With Ralph Wiggum | post (verified) | https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum | Ralph-loop tips and stop conditions. |

## Stage 10 — Code review

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Standards and Spec review | video (verified) | https://youtu.be/DNqsMXH6Eog | Release of review skills. |
| Hardcore review | video (verified) | https://youtu.be/mh5XZ-L5SFQ | Aggressive structural review finds deletions but raises false positives. |
| Do you even need human review? | short (rss) | https://www.youtube.com/watch?v=Yn8h5Ip-L9c | Questioning when human review is actually required. |
| The /code-review Skill | post (verified) | https://www.aihero.dev/skills-code-review | Two independent axes run as parallel sub-agents — Standards (repo rules + smell baseline) and Spec (matches originating issue); never merged. |
| The /diagnosing-bugs Skill | post (verified) | https://www.aihero.dev/skills-diagnosing-bugs | Bug diagnosis skill. |
| This Hook Stops Claude Code Running Dangerous Git Commands | post (verified) | https://www.aihero.dev/this-hook-stops-claude-code-running-dangerous-git-commands | Hook to block dangerous git commands. |

## Stage 11 — Handoffs / context compression

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Handoff | video (verified) | https://youtu.be/dtAJ2dOd3ko | Compress what matters, start a fresh agent, keep going; vs /compact. |
| The /handoff Skill | post (verified) | https://www.aihero.dev/skills-handoff | Compact conversation into a handoff doc; reference (never copy) artifacts by path/URL; carry only the live thread; strip secrets/PII; explicit-only. |

## Stage 12 — Research / AFK / autonomous loops

| Source | Type | URL | Mechanism |
|---|---|---|---|
| AFK software factory | video (verified) | https://youtu.be/E5-QK3CDVQM | Open-sources Sandcastle: isolated-sandbox agents that pick up issues and ship. |
| The /research Skill | post (verified) | https://www.aihero.dev/skills-research | Research/exploration phase skill. |
| The /ask-matt Skill | post (verified) | https://www.aihero.dev/skills-ask-matt | Router to the right skill when unsure which fits. |

## Stage 13 — Codebase design / deep modules (cross-cutting)

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Codebase ready for AI | video (verified) | https://youtu.be/uC44zFz7JSM | Prevention: keep a codebase navigable by agents. |
| How To De-Slop A Codebase Ruined By AI | video (verified) | https://www.youtube.com/watch?v=3MP8D-mdheA | The cure: improve-codebase-architecture — explore → grill → deepen shallow modules → emit issue. |
| Software Fundamentals Matter More Than Ever | talk (verified) | https://www.youtube.com/watch?v=v4F1gFy-hqg | Flagship talk: grill-me + ubiquitous language + TDD + deep modules + design-the-interface-delegate-implementation. |
| My #1 book recommendation for strategic programming | short (rss) | https://www.youtube.com/watch?v=t34UuBxB2YQ | Recommends *A Philosophy of Software Design* (Ousterhout) — source of "deep modules." |
| How To Make Codebases AI Agents Love | post (verified) | https://www.aihero.dev/how-to-make-codebases-ai-agents-love | Deep modules (Ousterhout) → grey-box modules: you own the interface, AI owns the impl, tests keep it honest. |
| The /codebase-design Skill | post (verified) | https://www.aihero.dev/skills-codebase-design | Deep modules + public interface design. |
| The /improve-codebase-architecture Skill | post (verified) | https://www.aihero.dev/skills-improve-codebase-architecture | Find refactors that deepen shallow modules; run weekly or after a surge. |
| The /domain-modeling Skill | post (verified) | https://www.aihero.dev/skills-domain-modeling | Ubiquitous language. |
| Delete (most of) your docs | short (rss) | https://www.youtube.com/watch?v=Fj8DKMbdIzU | Aggressive doc deletion; lean context over documentation bloat. |
| There is no such thing as greenfield | short (rss) | https://www.youtube.com/watch?v=0l7zOp260yc | Every codebase is legacy; architecture always matters. |

## Stage 14 — Skill authoring (meta)

| Source | Type | URL | Mechanism |
|---|---|---|---|
| Building Great Agent Skills: The Missing Manual | talk (verified) | https://www.youtube.com/watch?v=UNzCG3lw6O0 | Skill checklist: Trigger (user vs model), Structure (steps + reference, minimal skill.md), Steering (leading words, legwork per step), Pruning (sediment, no-ops). |
| Framework Hell, Tutorial Hell... now Skill Hell | short (rss) | https://www.youtube.com/watch?v=32LyZyFQhCQ | Defines "skill hell." |
| Learn anything with the /teach skill | video (verified) | https://www.youtube.com/watch?v=s5T5oQJcJ6U | Stateless (grill-me) vs stateful (grill-with-docs, teach) skill design. |
| My /teach skill is still insane | short (rss) | https://www.youtube.com/watch?v=glaIO6OYh74 | Reflection on the teach skill's stateful design. |
| The /writing-great-skills Skill | post (verified) | https://www.aihero.dev/skills-writing-great-skills | Meta-skill for authoring skills. |
| 5 Agent Skills I Use Every Day | post (verified) | https://www.aihero.dev/5-agent-skills-i-use-every-day | "Skills don't have to be long; choose the right words at the right time." Grill-me is 3 sentences. |
| The Agent Skills Matt Pocock Uses Every Day | short (verified) | https://www.youtube.com/shorts/HYQBYWY1pns | Tour of his `.claude` skills: small, composable, one skill per job. |
| Matt Pocock's 22 Claude Code Skills | short (verified) | https://www.youtube.com/shorts/fGO1iU9kO90 | The 22 skills map 1:1 to the 4 ways agents waste time. |
| This AI skill teaches you anything (/teach) | short (verified) | https://www.youtube.com/shorts/ahTAsGcuoKg | Stateful exercise-driven lesson skill. |
| How to Find Out What to Delegate to AI (/loop-me) | short (verified) | https://www.youtube.com/shorts/1vao46O61aA | Interviews you about your workday to surface delegation candidates. |

## Stage 15 — Overview / mindset / cross-cutting

| Source | Type | URL | Mechanism |
|---|---|---|---|
| My 7 Phases Of AI Development | post (verified) | https://www.aihero.dev/my-7-phases-of-ai-development | 7 phases: Idea → Research → Prototype → PRD → Kanban/tickets → Execution → QA. Enables AFK when research/prototype/kanban/PRD/tickets are in place. |
| Real-world feature build with Claude Code | post (verified) | https://www.aihero.dev/real-world-feature-build-with-claude-code | End-to-end: grill, PRDs, issues, AFK agents, QA loops. |
| 9 Ways AI Coding Has Rewired My Brain | post (verified) | https://www.aihero.dev/ways-ai-coding-has-rewired-my-brain | Raise test boundaries, immediate feedback, prototype brownfield UI, grey-box modules, automate grunt work, avoid doc rot, reduce cognitive load, skepticism of parallelization. |
| Kill your MEMORY.md | short (rss) | https://www.youtube.com/watch?v=A0scuiiGBC4 | Argues against long memory files; context-load cost. |
| AI Coding is exhausting | short (rss) | https://www.youtube.com/watch?v=e-pFrQ_Rh0s | The human cognitive cost of the pipeline. |
| AI Skills for Real Engineers (catalog) | post (verified) | https://www.aihero.dev/skills | Skills catalog. Install: `npx skills add mattpocock/skills`. |

## Skills changelog (evolution of his surface)

| Source | URL | Date | Highlight |
|---|---|---|---|
| v1.1 | https://www.aihero.dev/skills/skills-changelog-v1-1-wayfinder-to-spec-to-tickets-grilling-improvements | 2026-07-08 | /wayfinder, /to-spec, /to-tickets, grilling refinements, TDD refactor. |
| v1 (63% token reduction, /ask-matt, /writing-great-skills) | https://www.aihero.dev/skills/skills-changelog-v1-announcement | 2026-06-18 | Routing skills, domain-modeling + codebase-design. |
| /handoff, /prototype, /review, /writing | https://www.aihero.dev/skills/skills-changelog-handoff-prototype-review-and-writing | 2026-05-11 | Adds /handoff, /prototype. |
| Ubiquitous Language → /grill-with-docs | https://www.aihero.dev/skills/skills-changelog-ubiquitous-language-grill-with-docs | 2026-04-30 | /grill-with-docs, ADRs, multi-tracker support. |

## Repositories

| Repo | URL | Role in the pipeline |
|---|---|---|
| mattpocock/skills | https://github.com/mattpocock/skills | The skills repo itself. At current HEAD (`ed37663`, 2026-07-21) it is 41 SKILL.md files, 17 engineering + 5 productivity promoted — substantively unchanged since the KRN-pinned commit `9603c1cc` (one 2-line prose cleanup in `to-tickets`). |
| mattpocock/dictionary-of-ai-coding | https://github.com/mattpocock/dictionary-of-ai-coding | AI-coding vocabulary ("smart-zone", "grilling", etc.); `ask-matt` links into it. |
| mattpocock/sandcastle | https://github.com/mattpocock/sandcastle | Orchestrate sandboxed coding agents in TypeScript (`sandcastle.run()`); the AFK runtime. |
| mattpocock/agent-rules-books | https://github.com/mattpocock/agent-rules-books | AGENTS.md rules / skills book; source philosophy behind the skills repo. |
| mattpocock/evalite | https://github.com/mattpocock/evalite | Evaluate LLM-powered apps with TypeScript. |
| ai-hero-dev/ai-hero | https://github.com/ai-hero-dev/ai-hero | AI Hero open-source course material. |
| ai-hero-dev/poland-ai-ts-workshop | https://github.com/ai-hero-dev/poland-ai-ts-workshop | AI + TypeScript workshop exercises. |
| ai-hero-dev/ai-sdk-v6-crash-course | https://github.com/ai-hero-dev/ai-sdk-v6-crash-course | Vercel AI SDK crash course. |
| total-typescript/shoehorn | https://github.com/total-typescript/shoehorn | Partial mocks in TypeScript (a `migrate-to-shoehorn` misc skill references it). |

## Current mattpocock/skills inventory (HEAD, verified via GitHub API)

- **Engineering (17, promoted):** ask-matt, code-review, codebase-design,
  diagnosing-bugs, domain-modeling, grill-with-docs, implement,
  improve-codebase-architecture, prototype, research, resolving-merge-conflicts,
  setup-matt-pocock-skills, tdd, to-spec, to-tickets, triage, wayfinder.
- **Productivity (5, promoted):** grill-me, grilling, handoff, teach,
  writing-great-skills.
- **In-progress (9, not promoted):** batch-grill-me, claude-handoff, loop-me,
  setup-ts-deep-modules, to-questionnaire, wizard, writing-beats,
  writing-fragments, writing-shape.
- **Misc (4, not promoted):** git-guardrails-claude-code, migrate-to-shoehorn,
  scaffold-exercises, setup-pre-commit.
- **Personal (2):** edit-article, obsidian-vault.
- **Deprecated (4):** design-an-interface, qa, request-refactor-plan,
  ubiquitous-language.

Version skew (pre-existing, not a regression): `package.json` = 1.1.0 while
`.claude-plugin/plugin.json` = 1.2.0; the repo is mid-release.

## Newsletter / free courses

- Skills newsletter: https://www.aihero.dev/skills/subscribe (RSS:
  https://www.aihero.dev/skills/rss.xml) — "AI Skills for Real Engineers."
- 7-day email course: https://www.aihero.dev/skills/subscribe.
- AI Coding Dictionary: https://www.aihero.dev/ai-coding-dictionary.
- LLM Fundamentals (free): https://www.aihero.dev/llm-fundamentals.
- The AI Engineer Roadmap: https://www.aihero.dev/ai-engineer-roadmap.
