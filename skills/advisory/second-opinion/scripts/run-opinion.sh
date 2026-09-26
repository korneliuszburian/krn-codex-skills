#!/usr/bin/env bash
# One runner for a bounded advisory second opinion. The transport selects the
# independent model family (codex = the Codex subscription models; opencode =
# DeepSeek); the run directory, artifacts, and exit contract are identical
# across transports so a caller dispositions one shape.
set -euo pipefail

usage() {
  echo "usage: run-opinion.sh <codex|opencode> <absolute-target-dir> <absolute-prompt-file> <absolute-output-file>" >&2
}

if [[ $# -ne 4 ]]; then
  usage
  exit 64
fi

transport=$1
target_dir=$2
prompt_file=$3
output_file=$4

case "$transport" in
  codex|opencode) ;;
  *)
    echo "transport must be codex or opencode" >&2
    exit 64
    ;;
esac

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
  "$target_dir"/.krn/runs/second-opinion/*/opinion.md) ;;
  *)
    echo "output must be <target>/.krn/runs/second-opinion/<run-id>/opinion.md" >&2
    exit 65
    ;;
esac

timeout_seconds=${SECOND_OPINION_TIMEOUT_SECONDS:-600}
if [[ -z "$timeout_seconds" || "$timeout_seconds" == *[!0-9]* || "$timeout_seconds" =~ ^0+$ ]]; then
  echo "SECOND_OPINION_TIMEOUT_SECONDS must be a positive integer" >&2
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

temporary_raw=$(mktemp "$output_dir/.second-opinion-raw.XXXXXX")
temporary_opinion=$(mktemp "$output_dir/.second-opinion-final.XXXXXX")
temporary_extraction_error=$(mktemp "$output_dir/.second-opinion-extraction.XXXXXX")
temporary_stderr=$(mktemp "$output_dir/.second-opinion-stderr.XXXXXX")
raw_failed="$output_dir/raw.failed.jsonl"
failure_note="$output_dir/failure.txt"
trap 'rm -f -- "$temporary_raw" "$temporary_opinion" "$temporary_extraction_error" "$temporary_stderr"' EXIT

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
prompt+=$'\n\nReturn an advisory prose opinion only. Do not edit files, propose a patch, emit a diff, or treat the result as approval.'
prompt_sha=$(sha256sum "$prompt_file" | awk '{print $1}')
started_at=$(date +%s)
run_exit=0

case "$transport" in
  codex)
    if ! command -v codex >/dev/null 2>&1; then
      echo "codex CLI not found on PATH" >&2
      exit 127
    fi
    model=${SECOND_OPINION_MODEL:-gpt-6-luna}
    effort=${SECOND_OPINION_EFFORT:-xhigh}
    if [[ -z "$model" || -z "$effort" ]]; then
      echo "SECOND_OPINION_MODEL and SECOND_OPINION_EFFORT must not be empty" >&2
      exit 64
    fi
    timeout -k 5 "$timeout_seconds" codex exec \
      --ignore-user-config --ephemeral --skip-git-repo-check --color never \
      -s read-only -c approval_policy="never" \
      -m "$model" -c model_reasoning_effort="$effort" \
      -C "$target_dir" --json -o "$temporary_opinion" \
      - < "$prompt_file" > "$temporary_raw" 2> "$temporary_stderr" || run_exit=$?
    ;;
  opencode)
    if ! command -v opencode >/dev/null 2>&1; then
      echo "opencode CLI not found on PATH" >&2
      exit 127
    fi
    model=${SECOND_OPINION_MODEL:-opencode-go/deepseek-v4.1-flash}
    variant=${SECOND_OPINION_VARIANT:-max}
    if [[ -z "$model" || -z "$variant" ]]; then
      echo "SECOND_OPINION_MODEL and SECOND_OPINION_VARIANT must not be empty" >&2
      exit 64
    fi
    timeout -k 5 "$timeout_seconds" opencode run \
      --agent review --model "$model" --variant "$variant" --format json \
      --dir "$target_dir" "$prompt" > "$temporary_raw" 2> "$temporary_stderr" || run_exit=$?
    ;;
esac

if [[ $run_exit -ne 0 ]]; then
  if [[ $run_exit -eq 124 || $run_exit -eq 137 ]]; then
    preserve_failure "$transport run timed out after ${timeout_seconds}s" "$run_exit"
  else
    preserve_failure "$transport run failed" "$run_exit"
  fi
  if [[ -s "$temporary_stderr" ]]; then
    sed 's/^/transport: /' "$temporary_stderr" >> "$failure_note"
  fi
  exit 65
fi

# The Codex transport writes the last message with -o; the OpenCode transport
# needs the terminal message extracted from its JSON stream. Both must fail
# closed rather than publish an empty or unreadable opinion.
case "$transport" in
  codex)
    if [[ ! -s "$temporary_opinion" ]]; then
      preserve_failure "codex returned no final message" 65
      exit 65
    fi
    ;;
  opencode)
    if ! node "$(dirname "$(readlink -f "$0")")/extract-opinion.mjs" opencode "$temporary_raw" "$temporary_opinion" "$target_dir" 2> "$temporary_extraction_error"; then
      preserve_failure "opencode stream had no readable final message" 65
      sed 's/^/extraction: /' "$temporary_extraction_error" >> "$failure_note"
      exit 65
    fi
    ;;
esac

if [[ ! -s "$temporary_opinion" ]]; then
  preserve_failure "opinion was empty" 65
  exit 65
fi

mv -- "$temporary_raw" "$raw_output_file"
mv -- "$temporary_opinion" "$output_file"

elapsed=$(( $(date +%s) - started_at ))
node -e 'const fs=require("fs");const [out,transport,model,effort,target,promptSha,elapsed,timeout]=process.argv.slice(1);fs.writeFileSync(out, JSON.stringify({transport,model,effort,target,prompt_sha256:promptSha,elapsed_seconds:Number(elapsed),timeout_seconds:Number(timeout)}, null, 2)+"\n")' \
  "$output_dir/meta.json" "$transport" "${model:-}" "${effort:-${variant:-}}" "$target_dir" "$prompt_sha" "$elapsed" "$timeout_seconds"

echo "completed: $output_file"
