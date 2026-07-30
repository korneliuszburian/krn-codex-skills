# Skill Design Glossary

## Predictability

The agent follows the same useful process across runs. Output may vary when the
task should vary.

## Invocation

**Description** — the always-visible routing surface. Its wording decides when
implicit invocation occurs and consumes context every turn.

**Trigger collision** — two descriptions claim the same task without a clear
process/reference relationship.

**Context load** — model attention and tokens spent by installed descriptions.

**Cognitive load** — skill names and routing choices the human must remember.

**Router** — one explicit front door that maps a family of user-invoked skills
or composes reachable model-invoked owners. It is justified by observed recall
friction, not by the mere existence of several skills. It cannot bypass the
harness rule that keeps another explicit-only skill under direct human
invocation.

**Granularity** — how finely workflows are split. More model-invoked skills
spend context load; more explicit skills spend cognitive load.

## Information Hierarchy

**Step** — an ordered action with a checkable completion criterion.

**Reference** — definitions, rules, examples, schemas, or conditional detail
consulted on demand.

**Progressive disclosure** — moving branch-only reference behind a direct
pointer so the entrypoint remains legible.

**Co-location** — keeping one concept's rules and caveats together once they
are on the same hierarchy level.

**Working run** — ignored, private, resumable state owned by one active workflow
and deleted when its consumer closes.

**Promotion gate** — working state becomes durable only when a named future
consumer, one semantic destination, and a cleanup or supersession rule exist.

**Artifact contract** — the semantic owner, creation path, retained set,
consumer, cleanup trigger, and deletion authority for promoted output.

## Steering

**Leading word** — a compact familiar concept such as vertical slice, tight
loop, or proof budget that recruits useful prior behavior.

**Completion criterion** — the observable condition that prevents a step from
ending early.

**Premature completion** — attention moves to later steps before the current
criterion is met. Sharpen the criterion before splitting the sequence.

**Negation** — a prohibition that makes the unwanted behavior more salient.
State the positive target; keep bans for hard safety only.

## Pruning

**Single source of truth** — one authoritative owner for each meaning.

**Duplication** — the same meaning in multiple places.

**Sediment** — stale layers retained because adding feels safer than deleting.

**Sprawl** — too much live material in one entrypoint; disclose branch detail.

**No-op** — an instruction that does not change behavior from the capable-model
default.

Settle disputed no-ops and trigger boundaries with forward tests, not prose
debate.
