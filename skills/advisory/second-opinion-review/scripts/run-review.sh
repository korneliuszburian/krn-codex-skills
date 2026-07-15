#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: run-review.sh <prompt.md> <output.review.json>" >&2
  exit 64
fi

prompt_file=$1
output_file=$2
script_dir=$(cd "${BASH_SOURCE[0]%/*}" && pwd)
skill_dir=$(cd "$script_dir/.." && pwd)
schema_file="$skill_dir/references/review.schema.json"

rtk node "$script_dir/check-claude-window.mjs" check

if [[ ! -f "$prompt_file" ]]; then
  echo "prompt file not found: $prompt_file" >&2
  exit 66
fi
prompt_file=$(rtk readlink -f "$prompt_file")

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH" >&2
  exit 127
fi

prompt_max_bytes=${SECOND_OPINION_PROMPT_MAX_BYTES:-150000}
prompt_bytes=$(rtk wc -c < "$prompt_file")
if (( prompt_bytes > prompt_max_bytes )); then
  echo "prompt exceeds SECOND_OPINION_PROMPT_MAX_BYTES=$prompt_max_bytes" >&2
  exit 65
fi

max_budget=${SECOND_OPINION_MAX_BUDGET_USD:-2}
timeout_seconds=${SECOND_OPINION_TIMEOUT_SECONDS:-300}
budget_args=()
if [[ "$max_budget" != "unlimited" ]]; then
  budget_args=(--max-budget-usd "$max_budget")
fi
second_opinion_model=${SECOND_OPINION_MODEL:-opus}
model_args=(--model "$second_opinion_model")

output_dir=${output_file%/*}
if [[ "$output_dir" == "$output_file" ]]; then
  output_dir=.
fi
rtk mkdir -p "$output_dir"
envelope_file=$(rtk mktemp)
review_cwd=$(rtk mktemp -d)
trap 'rtk rm -f "$envelope_file"; rtk rm -rf "$review_cwd"' EXIT

# Keep transport constraints structural; the local validator owns semantic
# limits, evidence safety, and freshness across provider backends.
schema=$(<"$schema_file")
review_system_prompt="You are a tool-free, read-only advisory reviewer. Use only the evidence supplied through standard input. Do not infer repository, environment, credentials, or external state. Return only schema-compatible review output; never approve, block, merge, or declare readiness."

(
  cd "$review_cwd"
  rtk timeout "$timeout_seconds" claude \
    --safe-mode \
    --disable-slash-commands \
    --system-prompt "$review_system_prompt" \
    --print \
    --tools "" \
    --output-format json \
    --json-schema "$schema" \
    "${budget_args[@]}" \
    --no-session-persistence \
    "${model_args[@]}" \
    < "$prompt_file" \
    > "$envelope_file"
)

rtk python3 "$script_dir/validate-review.py" finalize \
  "$envelope_file" "$prompt_file" "$output_file"

printf '%s\n' "$output_file"
