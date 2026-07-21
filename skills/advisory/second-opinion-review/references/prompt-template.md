# Second Opinion Checker

Challenge one fixed claim using only the supplied evidence. Complete the
entrypoint's artifact-directory step first; store the filled contract as
`/absolute/printed/pass-dir/checker.md` and validated output as
`/absolute/printed/pass-dir/checker.review.json`. Do not praise, approve,
block, redesign unrelated code, or invent requirements. Return only output
matching the supplied JSON schema.

## Launch

Fill the contract below, choose one mechanical evidence identity, then run the
tool-free structured reviewer. The runner binds output to
[review.schema.json](review.schema.json); change that transport contract
deliberately, never ad hoc in a prompt. It uses the current `opus` alias unless
`SECOND_OPINION_MODEL` names another explicit alias or pinned identifier. It
pins `medium` effort so interactive Claude settings cannot make a bounded
checker silently overrun; set `SECOND_OPINION_EFFORT` explicitly only when the
operator accepts the runtime tradeoff. Record the backend reported by the
session rather than inferring it from the alias.

For a repository review, fingerprint the exact checkout from its root. Preserve
the emitted full commit, tree, `clean` or `dirty` state, and `state_sha256` in
the checker contract:

```bash
python3 ~/.agents/skills/second-opinion-review/scripts/validate-review.py \
  fingerprint-git /absolute/evidence-repository
```

Pass all four values back to the runner; it enters that explicit root rather
than trusting the ambient directory:

```bash
bash ~/.agents/skills/second-opinion-review/scripts/run-review.sh \
  git /absolute/evidence-repository FULL_COMMIT_OID FULL_TREE_OID clean \
  WORKTREE_SHA256 \
  /absolute/printed/pass-dir/checker.md \
  /absolute/printed/pass-dir/checker.review.json
```

For one standalone artifact, bind its current content hash. The runner also
captures its mode and size, then enters the artifact parent before validation:

```bash
bash ~/.agents/skills/second-opinion-review/scripts/run-review.sh \
  artifact /absolute/evidence/artifact.md ARTIFACT_SHA256 \
  /absolute/printed/pass-dir/checker.md \
  /absolute/printed/pass-dir/checker.review.json
```

Keep the output outside the evidence root. The runner checks identity before
the Claude window or model invocation, fingerprints dirty Git content, and
captures the prompt hash. Its private preflight manifest binds every cited
regular file by mode, size, and full content hash; citations must be UTF-8 text
no larger than 5 MiB and cannot traverse symlinks. Filesystem-root evidence and
Git roots containing submodules are rejected rather than fingerprinted
partially. Temporary transport state and Claude's tool-free working directory
are placed under a private system temp root proven outside the evidence root.
It rechecks the prompt, manifest, and fixed point before accepting output. A
later validation also fails if the prompt, repository, or artifact has changed.
The output path must not exist before launch. Give every pass its own artifact
directory so a rejected attempt cannot be confused with an earlier valid
result; never rerun into the same output path.

Use an uncapped checker only with explicit operator authority by setting
`SECOND_OPINION_MAX_BUDGET_USD=unlimited`; otherwise keep the runner's bounded
default. Validate the result from the same evidence root before using any
finding:

```bash
python3 ~/.agents/skills/second-opinion-review/scripts/validate-review.py \
  check /absolute/printed/pass-dir/checker.review.json \
  /absolute/printed/pass-dir/checker.md
```

<checker-contract>

## Claim

{{one decision or done-claim to falsify}}

## Acceptance and scope

- Request or tracker:
- Fixed ref or artifact:
- Evidence root and identity: commit + tree + dirty state + state SHA-256 | artifact SHA-256
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
