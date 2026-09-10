#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: run-opinion.sh <absolute-target-dir> <absolute-prompt-file> <absolute-output-file>" >&2
}

if [[ $# -ne 3 ]]; then
  usage
  exit 64
fi

target_dir=$1
prompt_file=$2
output_file=$3

if [[ "$target_dir" != /* || ! -d "$target_dir" ]]; then
  echo "target directory must be an existing absolute directory" >&2
  exit 66
fi
if [[ "$prompt_file" != /* || ! -f "$prompt_file" ]]; then
  echo "prompt file must be an existing absolute file" >&2
  exit 66
fi
if [[ "$output_file" != /* ]]; then
  echo "output file must be an absolute path" >&2
  exit 66
fi

target_dir=$(readlink -f "$target_dir")
prompt_file=$(readlink -f "$prompt_file")
output_file=$(readlink -m "$output_file")
output_dir=${output_file%/*}

if [[ "$output_dir" == / || ! -d "$output_dir" ]]; then
  echo "output parent must be an existing non-root directory" >&2
  exit 66
fi
if [[ -e "$output_file" || -L "$output_file" ]]; then
  echo "output file must not already exist" >&2
  exit 65
fi
raw_output_file="$output_dir/raw.jsonl"
if [[ -e "$raw_output_file" || -L "$raw_output_file" ]]; then
  echo "raw output file must not already exist" >&2
  exit 65
fi
case "$output_file" in
  "$target_dir"/.krn/runs/opencode-second-opinion/*/opinion.md) ;;
  *)
    echo "output must be <target>/.krn/runs/opencode-second-opinion/<run-id>/opinion.md" >&2
    exit 65
    ;;
esac
if ! command -v opencode >/dev/null 2>&1; then
  echo "opencode CLI not found on PATH" >&2
  exit 127
fi

# OpenCode Go exposes DeepSeek V4.1 Flash through this stable provider model
# identifier. Callers may override it with another independent reviewer.
model=${OPENCODE_SECOND_OPINION_MODEL:-opencode-go/deepseek-flash}
variant=${OPENCODE_SECOND_OPINION_VARIANT:-max}
if [[ -z "$variant" ]]; then
  echo "OPENCODE_SECOND_OPINION_VARIANT must not be empty" >&2
  exit 64
fi
agent=review
timeout_seconds=${OPENCODE_SECOND_OPINION_TIMEOUT_SECONDS:-600}
if [[ -z "$timeout_seconds" || "$timeout_seconds" == *[!0-9]* || "$timeout_seconds" == 0 ]]; then
  echo "OPENCODE_SECOND_OPINION_TIMEOUT_SECONDS must be a positive integer" >&2
  exit 64
fi
output_mode=${OPENCODE_SECOND_OPINION_OUTPUT:-prose}
if [[ "$output_mode" != prose && "$output_mode" != json ]]; then
  echo "OPENCODE_SECOND_OPINION_OUTPUT must be prose or json" >&2
  exit 64
fi
if ! command -v timeout >/dev/null 2>&1; then
  echo "GNU coreutils 'timeout' not found on PATH" >&2
  exit 127
fi
if ! command -v sha256sum >/dev/null 2>&1; then
  echo "sha256sum not found on PATH" >&2
  exit 127
fi

temporary_raw=$(mktemp "$output_dir/.opencode-second-opinion-raw.XXXXXX")
temporary_opinion=$(mktemp "$output_dir/.opencode-second-opinion-final.XXXXXX")
temporary_extraction_error=$(mktemp "$output_dir/.opencode-second-opinion-extraction.XXXXXX")
raw_failed="$output_dir/raw.failed.jsonl"
failure_note="$output_dir/failure.txt"
trap 'rm -f -- "$temporary_raw" "$temporary_opinion" "$temporary_extraction_error"' EXIT

# A failed or rejected run retains the partial stream and the reason as
# forensic evidence instead of destroying them.
preserve_failure() {
  local reason=$1 exit_code=$2
  if [[ -s "$temporary_raw" && ! -e "$raw_failed" ]]; then
    mv -- "$temporary_raw" "$raw_failed"
  else
    rm -f -- "$temporary_raw"
  fi
  printf 'reason=%s\nexit_code=%s\n' "$reason" "$exit_code" > "$failure_note"
}

interrupted() {
  preserve_failure "opinion runner interrupted" 143
  exit 143
}

trap interrupted HUP INT TERM

prompt="$(<"$prompt_file")"
if [[ "$output_mode" == json ]]; then
  prompt+=$'\n\nReturn exactly one JSON object only. Do not use Markdown or a code fence. Do not edit files, propose a patch, emit a diff, or treat the result as approval.'
else
  prompt+=$'\n\nReturn an advisory prose opinion only. Do not edit files, propose a patch, emit a diff, or treat the result as approval.'
fi
prompt_sha=$(sha256sum "$prompt_file" | awk '{print $1}')

run_exit=0
timeout -k 5 "$timeout_seconds" opencode run --agent "$agent" --model "$model" --variant "$variant" --format json --dir "$target_dir" "$prompt" > "$temporary_raw" || run_exit=$?
if [[ $run_exit -ne 0 ]]; then
  if [[ $run_exit -eq 124 || $run_exit -eq 137 ]]; then
    preserve_failure "opencode run timed out after ${timeout_seconds}s" "$run_exit"
  else
    preserve_failure "opencode run failed" "$run_exit"
  fi
  exit "$run_exit"
fi

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
extraction_exit=0
node "$script_dir/extract-final-opinion.mjs" "$temporary_raw" "$temporary_opinion" "$target_dir" "$output_mode" 2> "$temporary_extraction_error" || extraction_exit=$?
if [[ $extraction_exit -ne 0 ]]; then
  extraction_reason=$(awk '
    /^Error:/ { print; found = 1; exit }
    NF && first == "" { first = $0 }
    END { if (!found && first != "") print first }
  ' "$temporary_extraction_error" | tr '\n' ' ')
  preserve_failure "opinion extraction rejected: ${extraction_reason:-unknown extraction error}" 78
  exit 78
fi

mv -- "$temporary_raw" "$raw_output_file"
mv -- "$temporary_opinion" "$output_file"
node -e '
  const [promptSha256, model, variant, target, completedAt] = process.argv.slice(1);
  process.stdout.write(`${JSON.stringify({ promptSha256, model, variant, target, completedAt })}\n`);
' "$prompt_sha" "$model" "$variant" "$target_dir" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$output_dir/meta.json"
trap - EXIT
rm -f -- "$temporary_extraction_error"
