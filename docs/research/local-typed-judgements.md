# Local typed judgements

Status: `reject` as a default KRN guard or routing layer. Consumer: sh-160 operator and a future task-type evaluator. Owner: KRN maintainer. Verified: 2026-09-29.

## Decision

Keep the deterministic destructive-command guard and human-selected task types. Do not install Laya or another classifier in a live KRN decision path. A model's probability is neither authorization nor permission to drop a check. A **separate, offline task-type suggestion trial** is the only currently plausible way to reopen this rejection; it is not approval to run a model on every task or to automate a decision. No KRN task-type accuracy or end-to-end cost gain has been measured.

The selected Git-ref task `sh-160` records the local 2026-09-22 Laya 0.3.5 guard comparison: 26 commands, including 14 destructive and 12 benign; the incumbent caught 14/14 destructive with 1/12 benign false positives, while Laya's best wording caught 13/14 with 7/12 false positives. Laya took a measured median 0.66 s per CPU decision, loaded 808 MB of weights and took 69.8 s to load. That local observation rejects **that guard substitution**, not every future model or KRN task-type use. The task record also names a held-out task-type trial against the keyword baseline and current triage, including corrections and operation cost, as its falsifier; it is not a recorded result of such a trial.

## What changed since that measurement

[Laya v0.3.21](https://github.com/NandhaKishorM/laya/releases/tag/v0.3.21) was published 2026-09-27, replacing the evaluated 0.3.5 *software* version. Its [version-pinned README](https://github.com/NandhaKishorM/laya/blob/v0.3.21/README.md#whats-new-in-0321) describes ONNX batch parity, optional INT8 CPU export, an evaluation CLI and opt-in abstention with `min_confidence`. These are candidate operational improvements, **not** evidence that KRN's missed destructive command, false positives, CPU latency or cold load were fixed. Its claimed 33 ms single-question latency is measured on a T4, not this CPU.

The same README's [honest limits](https://github.com/NandhaKishorM/laya/blob/v0.3.21/README.md#honest-limits) report a base checkpoint at 0.362 zero-shot accuracy on the authors' typed-decisions benchmark versus a 0.461 majority-class baseline; 0.766 comes from a checkpoint fine-tuned on that benchmark's training split. It reports wrong high-confidence cancellation choices on narrow negation examples. Its [calibration discussion](https://github.com/NandhaKishorM/laya/blob/v0.3.21/README.md#calibration) says shipped checkpoints are overconfident and need domain temperature fitting. None of these benchmark numbers transfer to KRN without a local, blind evaluation; `min_confidence` is not a calibrated safety gate by itself.

## Alternative mechanisms, not unearned winners

| Candidate and primary source | Mechanism and release evidence | Limitation for KRN |
|---|---|---|
| [fastText supervised classifier at v0.9.2](https://github.com/facebookresearch/fastText/blob/v0.9.2/README.md#text-classification), [release](https://github.com/facebookresearch/fastText/releases/tag/v0.9.2) | Trains a label classifier from examples; MIT; latest published release 2020-04-28. Lightweight non-generative baseline to measure, **not** a newly released model. | Needs adjudicated local labels and evaluation; cannot decide a previously unseen task type without training or a policy fallback. No KRN latency or accuracy measurement. |
| [SetFit at v1.2.0](https://github.com/huggingface/setfit/blob/v1.2.0/README.md), [release](https://github.com/huggingface/setfit/releases/tag/v1.2.0) | Few-shot sentence-embedding fine-tuning plus a classification head; project Apache-2.0; v1.2.0 published 2026-09-04. | A checkpoint and its separate license, labels, calibration and operating cost must be selected; the framework's published results are not KRN type accuracy. |
| [ModernBERT-base model card, revision `8949b909`](https://huggingface.co/answerdotai/ModernBERT-base/blob/8949b909ec900327062f0ebf497f51aef5e6f0c8/README.md) | Apache-2.0 encoder, about 150M parameters; the model card publishes it for fill-mask/representation use, not a trained KRN type head. | Fine-tuning/classifier, labeled split and CPU runtime are additional obligations. It is not a drop-in typed-judgement API. |
| [EmbeddingGemma 300M model card, revision `57c266a7`](https://huggingface.co/google/embeddinggemma-300m/blob/57c266a740f537b4dc058e1b0cda161fd15afa75/README.md) | About 303M parameters; sentence similarity/embeddings, under the distinct Gemma license. | Needs a separate classifier and license review; no verified KRN advantage over a smaller classifier or the incumbent. Not the first experiment. |

The alternatives have different training and operating surfaces. The official release/card pages establish their availability, architecture or license—not a comparative result. No current primary source establishes a ready-made replacement that beats KRN's guard or task-type workflow.

## Narrow reopen rule

If the operator needs task-type suggestions, first freeze the six current KRN type labels, operator-adjudicated examples, a leakage-resistant train/validation/untouched-test split and a **candidate-independent** error/cost bar. Compare the current manual/default behavior and a simple keyword baseline with one pinned low-overhead classifier (fastText or SetFit) and optionally Laya 0.3.21. Report per-type confusion, abstentions, corrections, cold load, resident memory and CPU median/p95 *end-to-end* latency; tune thresholds only outside the untouched test. If examples or a real consumer are insufficient, defer the trial. A small improvement warrants at most another bounded trial; promotion needs a user-valued gain at full cost without weakening the deterministic guard or operator authority. New upstream releases alone do not reopen the rejection.

Supersession: replace the local result only after a preregistered KRN task-type trial or a new guard counterexample changes this consumer's measured decision; update this page and its index row together.
