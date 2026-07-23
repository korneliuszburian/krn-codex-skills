# Reviewer Brief

Fill this brief before running the packet compiler. It is input to a portable
review packet, not a review result. Keep it bounded: cite paths, commits,
commands, and sanitized facts; do not paste secrets or private source data.

<reviewer-brief>

## Requested decision

- Outcome:
- Reviewer role: `code-review` | `second-opinion-review/checker` | external reviewer
- Requested output: Standards/Spec findings, advisory challenge, or another named result

## Fixed point and authority

- Repository:
- Base ref and full SHA:
- Head ref and full SHA:
- Spec authority: user request, issue, ADR, or explicit none
- Standards authority: repository instructions and named skill references
- Publication authority: local only | push allowed | PR allowed | merge forbidden

## Scope ledger

- In-scope paths:
- Generated paths included:
- Explicitly out of scope:
- Pre-existing dirty paths and owners:

## Acceptance contract

- Caller -> public seam -> observable result:
- Required behavior:
- Required negative behavior:
- Deterministic error/status contract:

## Proof already run

| Command | Exit/result | What it proves |
| --- | --- | --- |
|  |  |  |

## Review questions

1.
2.

## Proof boundaries

- Proves:
- Does not prove:
- Human-only decisions:
- Known evidence gaps:

## Safety boundary

- Do not edit the reviewed source.
- Do not publish, merge, deploy, or mutate runtime unless separately authorized.
- Do not read or reproduce secrets, credentials, private customer data, or raw proprietary corpus.

</reviewer-brief>
