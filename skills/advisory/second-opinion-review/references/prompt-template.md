# Second Opinion Checker

Challenge one fixed claim using only the supplied evidence. Do not praise,
approve, block, redesign unrelated code, or invent requirements. Return only
output matching the supplied JSON schema.

## Launch

Fill the contract below, then run the tool-free structured reviewer. The runner
binds output to [review.schema.json](review.schema.json); change that transport
contract deliberately, never ad hoc in a prompt. It uses the current `opus`
alias unless `SECOND_OPINION_MODEL` names another explicit alias or pinned
identifier. Record the backend reported by the session rather than inferring it
from the alias.

```bash
rtk env SECOND_OPINION_MAX_BUDGET_USD=unlimited \
  ~/.agents/skills/second-opinion-review/scripts/run-review.sh \
  /absolute/persistent/topic.md \
  /absolute/persistent/topic.review.json
```

Use an uncapped checker only with explicit operator authority; otherwise keep
the runner's bounded default. Validate the result before using any finding:

```bash
rtk python3 ~/.agents/skills/second-opinion-review/scripts/validate-review.py \
  check /absolute/persistent/topic.review.json \
  /absolute/persistent/topic.md
```

<checker-contract>

## Claim

{{one decision or done-claim to falsify}}

## Acceptance and scope

- Request or tracker:
- Fixed ref or artifact:
- In-scope paths:
- Explicitly out of scope:

## Local verification

{{exact commands and observed results}}

## Proof boundaries

- Proves:
- Does not prove:
- Human-only decisions:

## Current evidence

{{bounded diff or numbered excerpts; no secrets or raw proprietary corpus}}

</checker-contract>

Every finding must cite one current repository-relative path and at most 20
lines. Put unsupported factual claims in `evidence_gaps`; reserve
`human_decisions` for product, budget, or irreversible trade-offs.
