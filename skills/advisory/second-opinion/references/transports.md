# Transports

Two independent model families are reachable from the runner. Pick the family
that did **not** author the change. The runner owns the run directory, the
artifact set, the timeout, and the exit contract; only the transport command
differs.

## `codex` — the Codex subscription models

Runs `codex exec` read-only, non-interactive, ephemeral. Model and reasoning
effort are config values, not flags.

- Models: `gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna` (the configured default).
  Prefer `gpt-6-astra` or `gpt-6-sol` for depth; avoid `ultra` effort, which
  auto-delegates and widens the pass.
- Default effort: `xhigh`. Raise to `max` only for a hard, bounded question.
- Knobs: `SECOND_OPINION_MODEL` (default `gpt-6-luna`),
  `SECOND_OPINION_EFFORT` (default `xhigh`), `SECOND_OPINION_TIMEOUT_SECONDS`
  (default `600`).

The exact command the runner issues:

```bash
timeout -k 5 "$SECOND_OPINION_TIMEOUT_SECONDS" codex exec \
  --ignore-user-config --ephemeral --skip-git-repo-check --color never \
  -s read-only -c approval_policy="never" \
  -m "$SECOND_OPINION_MODEL" -c model_reasoning_effort="$SECOND_OPINION_EFFORT" \
  -C "$TARGET_DIR" --json -o "$RUN_DIR/opinion.md" - < "$RUN_DIR/prompt.md" \
  > "$RUN_DIR/raw.jsonl"
```

- `-s read-only` protects the workspace; Codex still writes `~/.codex`
  (auth refresh, logs). Read-only is a convention, not a sandbox.
- `--ignore-user-config` drops the user's MCP servers and hooks so the pass has
  narrow authority; pass `-m` explicitly because it also drops the default
  model.
- `--ephemeral` avoids persisted rollouts.

Failure modes: auth-refresh failure (non-zero exit); plan/rate limits on a
`max`/`ultra` run; disk pressure (Codex state DBs are large); a non-git target
(handled by `--skip-git-repo-check`); an empty final message (the runner fails
closed).

## `opencode` — DeepSeek

Runs the `review` agent, non-interactive, JSON stream. Knobs:
`SECOND_OPINION_MODEL` (default `opencode-go/deepseek-v4.1-flash`),
`SECOND_OPINION_VARIANT` (default `max`), `SECOND_OPINION_TIMEOUT_SECONDS`.

```bash
timeout -k 5 "$SECOND_OPINION_TIMEOUT_SECONDS" opencode run \
  --agent review --model "$SECOND_OPINION_MODEL" --variant "$SECOND_OPINION_VARIANT" \
  --format json --dir "$TARGET_DIR" "$PROMPT" > "$RUN_DIR/raw.jsonl"
```

The runner extracts the terminal message with `extract-opinion.mjs`, which
fails closed on prose, malformed JSON, arrays, multiple candidates, or a
citation that resolves outside the target.

## Run directory and exit contract

- Run directory: `<target>/.krn/runs/second-opinion/<run-id>/`.
- Completion artifacts: `opinion.md`, `raw.jsonl`, `meta.json` (all non-empty).
- Failure artifacts: `failure.txt`, plus `raw.failed.jsonl` when a partial
  stream exists.
- `run-opinion.sh`: `64` bad args/env, `65` output exists / wrong location /
  transport failure, `66` bad target or prompt, `127` missing CLI.
- `check-opinion.sh`: `0` completed, `1` failed, `2` pending, `64` malformed.
