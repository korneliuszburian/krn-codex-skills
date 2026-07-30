# Claude Handoff

Use this only for a `rewrite` background pass. A source investigation
uses [research-template.md](research-template.md) instead. Complete the
entrypoint's artifact-directory step first and write this brief to
`/absolute/printed/pass-dir/handoff.md`. Shared `/tmp` paths are not resumable
across parallel jobs or restarts. The runner verifies the brief's parent against
`pass-context.json`. Start from a clean disposable worktree; when that worktree
differs from the artifact-owning checkout, keep
`SECOND_OPINION_CONTEXT_ROOT` pointed at the owner used during preparation.

## Launch

The runner uses the current `opus` alias unless `SECOND_OPINION_MODEL` names
another explicit alias or pinned identifier. Local provider configuration owns
the actual backend, so record what the session reports and never infer the
provider from the alias.

Add the required `--accept-edits` flag and retain only the smallest required
source roots. Every `--add-dir` joins Claude's editable workspace in this mode;
point it only at a disposable input copy, never an authoritative source corpus:

```bash
env SECOND_OPINION_EFFORT=max \
  ~/.agents/skills/second-opinion-review/scripts/run-handoff.sh \
  --accept-edits \
  --add-dir /absolute/bounded/research-root \
  "TypeScript skill rewrite" \
  /absolute/printed/pass-dir/handoff.md
```

The command returns immediately. Manage or resume the named job with
`claude agents`, and inspect its work only after the pass finishes. The linked
worktree is an ownership boundary, not a filesystem or network sandbox.

<claude-handoff>

## Objective

{{one concrete outcome for this pass}}

## Role and completion

- Role: `rewrite`
- Done when:
- Do not decide:

## Continue from

- Repository and isolated worktree:
- Branch and commit:
- Dirty state owned by this pass:
- Issue, plan, or decision record:
- Current implementation or artifact:

## Sources

List only allowed paths or URLs. Pin mutable sources with a commit, version, or
hash. For private material, describe the authorized use and copyright boundary;
do not paste the corpus into this file.

## Work

1. **{{first action}}.** {{what to inspect or produce}}

   **Done when:** {{observable criterion}}.

2. **{{next action}}.** {{what to inspect or produce}}

   **Done when:** {{observable criterion}}.

## Deliverables

- Candidate artifact and exact worktree path:
- Candidate patch or findings:
- Verification evidence:
- Handoff for the independent checker, if earned:

## Proof boundaries

- Proves:
- Does not prove:
- Falsifiers:
- Human-only decisions:

## Safety and ownership

- Never read or emit secrets, credentials, environment files, private user
  data, or unrelated home-directory state.
- Never reproduce private course passages, exercises, or solutions; retain
  original mechanism summaries and provenance only.
- Work only in the named disposable worktree or output paths.
- Do not publish, merge, deploy, close issues, or mutate the canonical branch.

## Suggested skills

- {{skill and why it applies}}

</claude-handoff>
