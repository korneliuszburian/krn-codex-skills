# Claude Handoff

Use this only for a `researcher` or `rewrite-maker` background pass. Keep the
handoff in a durable operator-controlled directory outside the candidate
repository; shared `/tmp` paths are not resumable across parallel jobs or
restarts. Start from a clean disposable worktree.

For a source pass, require this complete disposition chain:

<source-decision>
Source and version -> mechanism -> conditions and traps -> local standard ->
workflow consumer -> example -> falsifier -> does-not-prove ->
adopted | rejected | omitted-with-reason
</source-decision>

## Launch

The runner uses the current `opus` alias unless `SECOND_OPINION_MODEL` names
another explicit alias or pinned identifier. Local provider configuration owns
the actual backend, so record what the session reports and never infer the
provider from the alias.

Research is read-only by default:

```bash
rtk bash ~/.agents/skills/second-opinion-review/scripts/run-handoff.sh \
  "TypeScript skill research" \
  /absolute/persistent/typescript-handoff.md
```

For an authorized rewrite, accept edits explicitly and expose only the smallest
additional source root. `--add-dir` grants tool access; it does not enforce a
read-only source boundary.

```bash
rtk env SECOND_OPINION_EFFORT=max \
  ~/.agents/skills/second-opinion-review/scripts/run-handoff.sh \
  --accept-edits \
  --add-dir /absolute/bounded/research-root \
  "TypeScript skill rewrite" \
  /absolute/persistent/handoff.md
```

The command returns immediately. Manage or resume the named job with
`rtk claude agents`, and inspect its work only after the pass finishes. The linked
worktree is an ownership boundary, not a filesystem or network sandbox.

<claude-handoff>

## Objective

{{one concrete outcome for this pass}}

## Role and completion

- Role: `researcher` | `rewrite-maker`
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

- Artifact and exact path:
- Coverage or decision ledger:
- Candidate patch or findings:
- Verification evidence:
- Handoff for the independent checker:

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
