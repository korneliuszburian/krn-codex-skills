# Typed judgement primitives and the 2026 model landscape

Status: `defer`. Consumer: maintainer and `$delivery-loop` at harness-decision and model-routing points. Owner: maintainer. Verified: 2026-09-19.

This page captures the 2026-09-19 research pass on typed-judgement models and
the current model-architecture landscape, so the facts are reused instead of
re-researched. It records no adoption: the judgement primitive is deferred and
the model notes are context for existing pins.

## Typed judgement as a primitive: TypeSafe System One and Jev

Stated claims (vendor and press, not independently reproduced by KRN):

- TypeSafe AI ships **System One models**; `jev-latest` is the current one. A
  System One model does **not generate text**. It takes a `state` (the context)
  plus typed `questions` and returns typed answers with probabilities and
  confidence; the provider reports up to **200x faster inference and 400x lower
  cost** than comparable LLMs on classification tasks.
- Three question types: **Choice** (pick one option; returns `choice`,
  `probabilities`, `confidence`), **Score** (position on ordered levels; returns
  `score`, `legend`, `probabilities`, `confidence`), **Noul** (is it true;
  returns the probability 0..1). Every answer is constrained to the supplied
  options or levels, so no value is recovered from generated prose.
- Many questions per request, evaluated in parallel; adding questions costs only
  their tokens and barely changes latency (request budget ~32k tokens shared with
  the state). Patterns: speculative fan-out, confidence-gated routing, composite
  scoring, intent routing, model routing, and AutoMode tool-risk gating.
- The documented review surface is **the questions and the threshold constants,
  kept in one file**, and the skill warns coding agents against one-question-per-call.
- Sources: [docs.typesafe.ai](https://docs.typesafe.ai/agent-skill),
  [primitives](https://docs.typesafe.ai/primitives),
  [patterns](https://docs.typesafe.ai/patterns), and LangChain's
  [Building a Harness with Jev](https://www.langchain.com/blog/building-a-harness-with-jev)
  (2026-09-17).

KRN inference (not vendor fact): the harness decision points that are typed
judgements today — the destructive tool-risk guard (`krn_pretooluse.py`), task
triage and review-tier assignment, lesson matching at decision time, and friction
classification — are the candidate consumers, and AutoMode-style risk gating is
the most directly comparable to existing code. This row stays **deferred**: the
open questions are whether a `TYPESAFE_API_KEY` and a hosted dependency are
acceptable against the local-first posture, whether the deterministic guard is
already good enough that the gain is marginal, and what the measured
accuracy/latency/cost on our own guard cases would be. First consumer and
falsifier must be named before any implementation; the deferred decision lives in
the local queue as `sh-85`.

## 2026-09 model architecture notes (context for pins, not adoption)

- **DeepSeek-V4.1-Flash** (the model KRN's opencode lanes run): causal
  encoder-decoder, MoE, KV-cache compression, CSA2, cheaper prefill and decoding,
  built for long-running agents and agent state; reported agent-benchmark leads
  (DeepSWE 74.2, Terminal-Bench 2.1 90.6, CyberGym 88.1). Sources:
  [KDnuggets](https://www.kdnuggets.com/why-deepseek-v4-1-flash-is-such-an-exciting-open-model-release),
  Hugging Face deepseek-ai/DeepSeek-V4.1-Flash.
- **GPT-6 Astra** (OpenAI, 2026-09-03): reporting describes a **recurrent
  architecture**; first OpenAI model at the Preparedness Critical cyber tier;
  KRN's own docs already name `gpt-6-astra` as a creative escalator. Source:
  [Felo model card](https://felo.ai/tools/gpt-6-astra) (third-party).
- **Qwen3.8** (Alibaba): hybrid full-plus-linear attention, up to 1M context,
  reported ~4k tok/s/GPU on GB300 NVL72. Source:
  [NVIDIA technical blog](https://developer.nvidia.com/blog/serve-qwen3-8-2-4t-a95b-a-2-4t-parameter-model-with-configurable-reasoning-on-nvidia-gb300-nvl72).
- **MiniMax M3**: MiniMax Sparse Attention (MSA), reported 15.6x faster decode
  and 9.7x faster prefill at million-token context. Source:
  [AIMadeTools guide](https://www.aimadetools.com/blog/minimax-m3-complete-guide).
- **Mercury 2.5** (Inception): diffusion text generation, reported ~1107 tok/s;
  Augment Code reports using it for **context compression** (150 s to 27 s, -90%
  cost). Source: [GIGAZINE](https://gigazine.net/gsc_news/en/20260909-mercury-2-5).
- Also noted: Fujitsu **PHOTON** (semantic-hierarchy transformer alternative),
  Google **Titans** (neural memory), Gemma4 **E2B**, Agnes-3.0-Flash (gated
  delta-rule recurrent hybrid). All vendor/press reported and unverified.

KRN inference: subquadratic/hybrid attention, recurrent state, and cheap context
compression are the 2026 direction; they are relevant to lane cost and context
economics, not a reason to change the executor policy (Codex canonical, opencode
supported) without an operator decision.

## Non-proofs

Vendor and press numbers are not independent reproductions; no KRN benchmark ran.
The judgement primitive's fit is argued, not measured; its cost model, hosted
dependency, and benefit over the deterministic guard are unverified. The model
architecture notes are secondhand summaries of vendor cards and press.

Reopen when: the operator decides the `TYPESAFE_API_KEY`/hosted-dependency
question and a first consumer with a falsifier is named, or a lane/context-cost
measurement makes a model-architecture choice decision-relevant.
