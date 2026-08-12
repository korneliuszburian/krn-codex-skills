# Three-arm skills lab (no-skill vs our fork vs Matt upstream)

Status: accepted experiment spec, 2026-08-12. Owner: one lab run in a sibling
repo (`krn/active/skills-lab-3arm/`), pattern of `mini-metalab-skills`. This
page is the durable spec; rewrite in place when a falsifier fires.

## Decision question

Does a hand-maintained fork of Matt Pocock's skills earn its maintenance cost,
and do the skills themselves beat no-skill on the same frozen task? The answer
decides three concrete actions per skill:

- retire the ported skill from `krn-codex-skills` and compose upstream
  (`npx skills add` or plugin subscription) instead of forking,
- adopt the upstream file as-is when it wins,
- keep and keep publishing the fork when it wins.

## Provenance and prior evidence

| Evidence | What it establishes | Limit |
|---|---|---|
| Drift measurement 2026-08-12 (this repo vs `matt-pocock/skills`) | every one of the 11 ported skills diverged heavily from upstream v1.2.0: `implement` 69 vs 15 lines, `wait-what` 35 vs 7, `prototype` 103 vs 26, `codebase-design` 122 vs 114 but ~228 diff lines, `wayfinder` 179 vs 128, `writing-for-agents` 159 vs 81; upstream moved only slightly between v1.2.0 and HEAD (e.g. `diagnosing-bugs` 134→140) | divergence is our edits, not upstream evolution; line count is not quality |
| Matt v1.0 changelog claim | "63% token reduction" for the compact skill rewrite | token claim, not a quality or outcome claim |
| mini-agi EXP-011 | solo codex iterates internally and is at ceiling on 7/7 generated task classes; loops/skills only pay where the worker is below the bar | generated toy tasks, not real product work |
| reviewer-quality-poc oracle | the only measured reviewer in the ecosystem scored 4.5/10 (heuristic 5.5) | one subject, one lane, one run |

## Arms (the only difference between arms is the skill instructions)

| Arm | Skill material attached to the identical task prompt |
|---|---|
| A baseline | none |
| B ours | `krn-codex-skills/skills/engineering/<name>/SKILL.md` at a pinned commit |
| C upstream | `matt-pocock-skills/skills/engineering/<name>/SKILL.md` at a pinned commit |

Everything else is identical per run: same task text, same model
(`deepseek-v4-flash` as the environment model), same starting checkout state,
same working directory layout, same runbook for capturing the transcript.

## Task classes (v1: one, fallback: second)

1. **Primary — `diagnosing-bugs`.** Behavior skill with a checkable outcome:
   root cause + regression test. Build 3 dev + 2 holdout frozen tasks by taking
   real resolved bugs from KRN product repositories, pinning the parent commit,
   and writing a task that states only the symptom. Pre-register the answer key
   (root-cause file/line, expected regression test location, minimum fix).
   Score: deterministic (regression test passes, root cause hit, unrelated-diff
   size) + blind judge (process: tight feedback loop before theorising; redacts
   secrets; evidence quality).
2. **Fallback — `codebase-design`.** Vocabulary/architecture skill; harder to
   score, so it only runs if v1 completes under budget. Score is judge-only.

Leak control (from `mini-metalab-skills`): task prompts must not contain skill
vocabulary (`feedback loop`, `regression test`, phase names); a validator
greps task text and fails the build on hits.

## Run protocol

- N = 3 runs per arm per task (9 runs per task), fresh session per run, clean
  context, same model. Each run writes `runs/<arm>/<task>/<run-id>/` with the
  raw transcript, git state, and produced diff.
- Scoring is applied by a separate blind judge step (different model family via
  env, per the reviewer-layer constraint) that receives the run artifacts
  without the arm label; deterministic scores are computed first.
- Verdict per skill: report mean score and delta per arm pair (A vs B, A vs C,
  B vs C). With N=3 the result is directional, not proof; a decision to
  retire/keep a skill requires the delta to exceed the judge noise floor
  (two independent judges scoring a shared subset, disagreement recorded).
- Terminal states per skill: `KEEP_FORK`, `ADOPT_UPSTREAM`, `RETIRE_TO_UPSTREAM`,
  `INCONCLUSIVE`. `INCONCLUSIVE` is a legal answer; it means the fork decision
  is made on maintenance cost, not quality.

## Consequence gates

- `RETIRE_TO_UPSTREAM` or `ADOPT_UPSTREAM` for a skill → delete or replace the
  ported `SKILL.md` in `krn-codex-skills`, update `manifest.json` routing, and
  re-run `npm run validate`.
- `KEEP_FORK` → the drift evidence (line count) is reviewed against measured
  outcome; a fork that wins while being 4× longer is evidence the prose adds
  outcome value, a fork that only ties is evidence of bloat.
- If every skill is `INCONCLUSIVE`, the default is `RETIRE_TO_UPSTREAM`:
  unmeasured forked prose is maintenance cost without demonstrated value, and
  upstream is actively maintained.

## Limits and falsifiers

1. **Judge leakage:** the judge must not receive the arm label or skill text;
   a judge that can name the arm invalidates that run's score.
2. **Task leakage:** any dev-task prompt that contains skill vocabulary is
   dropped from the corpus and replaced; the leak scanner runs in CI of the lab.
3. **Model ceiling:** on a task where solo runs already pass, arms B and C can
   only tie; such a task is diagnostic of the task class, not of the skills
   (EXP-011 boundary), and is recorded as `ceiling-hit` rather than a skill win.
4. **Sample size:** N=3 per arm is directional; no claim of statistical proof
   is made without non-overlapping intervals at higher N.
5. **Task-class scope:** a win on `diagnosing-bugs` does not transfer to
   `writing-for-agents`; each promoted skill earns its own task class.

## Verdict (2026-08-12, N=1 pilot + round 2)

The lab ran 15 real runs across 5 dev tasks (krn-search, krn-factory,
mini-agi), all suites re-verified green. `diagnosing-bugs` (both the 174-line
fork and the 140-line upstream) showed **no measured advantage** over no-skill:
baseline tied or won every task, including the hard protocol-level one where
all three arms failed. Result: `INCONCLUSIVE` → `RETIRE_TO_UPSTREAM`. The 11
hand-forked ports were culled from this repository on 2026-08-12; the shared
engineering set is composed from `mattpocock/skills`. Full run data:
`krn/active/skills-lab-3arm/results/`.
