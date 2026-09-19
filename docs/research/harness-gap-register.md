# Harness gap register: research to architecture

Status: `accepted`. Consumer: maintainer and `$delivery-loop` at pass and plan time. Owner: maintainer. Verified: 2026-09-19.

This is the living comparison between the researched state of the art and KRN's
current architecture, including KRN's own measured imperfections. Research
conclusions land here as a status per mechanism so a fresh session reads the
answer instead of repeating the research; the topic page holds the facts, this
page holds the verdict and the next action. Update it in the same change that
adds a mechanism or closes a gap; a row without a falsifier or next action is not
finished.

## Mechanism comparison

| Mechanism (source) | KRN status | Owner artifact | Falsifier or next action | Verified |
|---|---|---|---|---|
| AutoMode typed tool-risk gating; System One/Jev typed judgement (TypeSafe) | defer | deferred decision `sh-85`; facts in [typed-judgement-and-model-landscape.md](typed-judgement-and-model-landscape.md) | measure accuracy/latency/cost on our own guard cases against `krn_pretooluse.py`, and decide the hosted-key/local-first question; first consumer plus falsifier before any code | 2026-09-19 |
| Structured outputs as a boundary (TypeChat, BAML, Pydantic AI) | partial adopt | the ticket ABI, capsule ABI, and conformance fixtures are deterministic typed boundaries | reopen only where a prose boundary is measured failing; do not add a schema DSL without that witness | 2026-09-19 |
| AHE change manifest with predicted fixes and at-risk regressions, file-granularity rollback (2604.25850) | partial | `Change-contract:` trailers, LT rows, the fixed-point review gate | no predicted-regression manifest and no automatic rollback; a harness edit that regresses without a predicted-risk row is the witness to build it | 2026-09-19 |
| AHE finding: gains localize to tools, middleware, and long-term memory, not the system prompt | reflected | we tune tools/hooks/memory, not prompt strategy | measure per-component contribution before adding prose strategy | 2026-09-19 |
| Cue-anchored memory delivery with provenance and staleness; re-injection half-life ~one compaction (2607.20972) | partial | capsule, triggered lesson recall, session-start brief, `lessons:verify` | delivery hit-rate is unmeasured (ADR 0004 recorded 2.2% on one arc); run the cue-anchored delivery and half-life measurement before claiming memory effect | 2026-09-19 |
| Cheap diffusion/classifier context compression (Mercury 2.5; Augment Code 150s to 27s) | lack | lane/context economics | candidate only for long-context lane work; measure before adopting a second hosted dependency | 2026-09-19 |
| Harness-engineering study: AGENTS.md is the standard, skills/subagents rarely adopted, no OSS repo uses persistent agent memory (2602.14690) | lead | `config/AGENTS.md`, skills index, capsule/lessons | keep; do not over-invest in mechanisms the field does not use without our own measured gain | 2026-09-19 |
| LangChain harness engineering: prompt/tools/middleware tuning gave +13.7 points at fixed model | partial | gate tiers, hooks, skills, lane contract | our prompt is contract prose; the measurable lever is tools/middleware and verification; no controlled measurement yet | 2026-09-19 |
| Feedforward/feedback harness framing (Böckeler, martinfowler.com) | partial | guides (AGENTS, skills, ADRs) and sensors (gates, `state check`, `changes:check`) | use as vocabulary for a sensor-coverage review; not a new mechanism | 2026-09-19 |
| Frontier architectures: hybrid/recurrent attention, sparse attention, cheap context (DeepSeek-V4.1-Flash, GPT-6 Astra, Qwen3.8, MiniMax M3) | context | `sh-85` page; executor policy row in [orchestration.md](orchestration.md) | DeepSeek-V4.1-Flash already backs the opencode lanes; changing pins is an operator decision | 2026-09-19 |

## KRN's own imperfections (open)

| Imperfection | Status | Owner artifact | Falsifier or next action | Verified |
|---|---|---|---|---|
| Scope drift: workers edit a forced consumer outside the declared Scope; we reject and re-run (about four times in the sh-61..sh-84 arc) | open | ticket template constraints | pre-record likely consumers when a rule text or shared module changes, or adopt an explicit maintainer scope-expansion policy with a recorded attempt | 2026-09-19 |
| Integrator squash body dropped a worker trailer and reddened main (sh-71 at 77b6a96) | fixed | sh-79 policy + `integration-merge-trailers` observer | recurrence would show as `applicability-withdrawn` on a main push | 2026-09-19 |
| Ignored operational state lived only in `/tmp` and was wiped; capsule and queue lost | fixed but unexercised | sh-80 durable pause export in ADR 0005 | the export/restore procedure has not been run against a real wipe; a failed restore is the witness | 2026-09-19 |
| Different-family reviewer rotation was dark for the whole arc (Codex 401) | fixed | LT-100 review artifact; `reviewer-rotation` observer | per-change scheduling is still manual; the single arc review cost about 499,578 tokens against a 400k pass budget, so scope per change or calibrate the budget | 2026-09-19 |
| LT registry cap vs contiguity was self-inconsistent | fixed | sh-84 retention rule + `lt-retention` observer | reopen if retirement cannot keep active rows within the cap | 2026-09-19 |
| `ticket check` warning channel has no stored baseline, so real warnings hide in historical noise | open | none yet | store the historical warning set as an explicit baseline; a new warning then becomes signal | 2026-09-19 |
| No measured harness gain against vanilla Codex | open | none yet | controlled e2e comparison on the same task with and without skills+memory+hooks (pass rate, tokens, wall time); this is the biggest missing proof for "best harness" | 2026-09-19 |
| Memory delivery hit-rate over lane commits unmeasured | open | ADR 0004 rows; `memory recall` | measure recall delivery on committed `Recall` trailers and retire lessons that never deliver | 2026-09-19 |
| Docs drift and test mass accumulate (stale references, duplicated scaffolds) | partial | `stale-references` observer; research curation contract | a condense pass removes test-for-test and duplicated doc mirrors; ADR 0004 notes fifteen duplicated ticket-test scaffolds | 2026-09-19 |
| `ticket` naming and a risk-tiered `Review:` field; small internal changes still require lane/PR/CI | deferred | operator decision | awaiting the operator's default for small internal changes; then a `task` vocabulary plus `Review:` tier change | 2026-09-19 |

## Non-proofs

Statuses are maintainer judgements over research and the loop's own records, not
benchmarks. Vendor and press numbers are unverified. "Fixed" means the mechanism
and a falsifier exist in CI, not that the failure mode is gone.

Reopen when: a mechanism's status changes, a new research pass adds a mechanism,
or the loop records a failure this table does not name.
