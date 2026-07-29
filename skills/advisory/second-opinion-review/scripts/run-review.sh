#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: run-review.sh git <repo-root> <commit> <tree> <clean|dirty> <state-sha256> <prompt.md> <output.review.json>" >&2
  echo "   or: run-review.sh artifact <file> <sha256> <prompt.md> <output.review.json>" >&2
  echo "the runner enters the declared Git root or artifact parent before validation" >&2
}

if (( $# < 1 )); then
  usage
  exit 64
fi

mode=$1
shift
case "$mode" in
  git)
    if [[ $# -ne 7 ]]; then
      usage
      exit 64
    fi
    requested_root=$1
    expected_commit=$2
    expected_tree=$3
    expected_dirty=$4
    expected_state_sha256=$5
    prompt_file=$6
    output_file=$7
    if [[ "$requested_root" != /* || ! -d "$requested_root" ]]; then
      echo "git evidence root must be an existing absolute directory" >&2
      exit 66
    fi
    evidence_root=$(readlink -f "$requested_root")
    identity_args=(snapshot-git "$evidence_root" "$expected_commit" "$expected_tree" "$expected_dirty" "$expected_state_sha256")
    ;;
  artifact)
    if [[ $# -ne 4 ]]; then
      usage
      exit 64
    fi
    requested_artifact=$1
    expected_sha256=$2
    prompt_file=$3
    output_file=$4
    if [[ "$requested_artifact" != /* || ! -f "$requested_artifact" ]]; then
      echo "review artifact must be an existing absolute file" >&2
      exit 66
    fi
    artifact=$(readlink -f "$requested_artifact")
    evidence_root=${artifact%/*}
    identity_args=(snapshot-artifact "$artifact" "$expected_sha256")
    ;;
  *)
    usage
    exit 64
    ;;
esac

if [[ "$evidence_root" == "/" ]]; then
  echo "filesystem root cannot be used as the evidence root" >&2
  exit 65
fi

script_dir=$(cd "${BASH_SOURCE[0]%/*}" && pwd)
skill_dir=$(cd "$script_dir/.." && pwd)
schema_file="$skill_dir/references/review.schema.json"
pass_helper="$script_dir/prepare-artifacts.mjs"
job_helper="$script_dir/review-job.mjs"

if [[ "$prompt_file" != /* || ! -f "$prompt_file" ]]; then
  echo "prompt file not found: $prompt_file" >&2
  exit 66
fi
prompt_file=$(readlink -f "$prompt_file")
if [[ "$output_file" != /* ]]; then
  echo "review output must use an absolute path" >&2
  exit 66
fi
output_file=$(readlink -m "$output_file")
pass_dir=${prompt_file%/*}
if [[ "${prompt_file##*/}" != "checker.md" ]] ||
  [[ "${output_file##*/}" != "checker.review.json" ]] ||
  [[ "${output_file%/*}" != "$pass_dir" ]]; then
  echo "checker prompt and output must be checker.md and checker.review.json in the same verified pass" >&2
  exit 65
fi
if [[ "$output_file" == "$prompt_file" ]] ||
  [[ -e "$output_file" && "$output_file" -ef "$prompt_file" ]]; then
  echo "review output must not replace or alias the checker prompt" >&2
  exit 65
fi
if [[ -e "$output_file" || -L "$output_file" ]]; then
  echo "review output must not already exist" >&2
  exit 65
fi
node "$pass_helper" verify-pass "$pass_dir" check >/dev/null

output_dir=${output_file%/*}
if [[ -z "$output_dir" ]]; then
  output_dir=/
fi
job_file="$pass_dir/jobs/checker.job.json"
if [[ -e "$job_file" || -L "$job_file" ]]; then
  echo "checker job must not already exist: $job_file" >&2
  exit 65
fi
schema_retries=${SECOND_OPINION_SCHEMA_RETRIES:-1}
if [[ ! "$schema_retries" =~ ^[0-3]$ ]]; then
  echo "SECOND_OPINION_SCHEMA_RETRIES must be an integer from 0 through 3" >&2
  exit 64
fi
max_attempts=$((schema_retries + 1))

prompt_max_bytes=${SECOND_OPINION_PROMPT_MAX_BYTES:-150000}
if [[ ! "$prompt_max_bytes" =~ ^[1-9][0-9]*$ ]]; then
  echo "SECOND_OPINION_PROMPT_MAX_BYTES must be a positive integer" >&2
  exit 64
fi
max_budget=${SECOND_OPINION_MAX_BUDGET_USD:-2}
timeout_seconds=${SECOND_OPINION_TIMEOUT_SECONDS:-300}
if [[ ! "$timeout_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]] ||
  [[ "$timeout_seconds" =~ ^0+([.]0+)?$ ]]; then
  echo "SECOND_OPINION_TIMEOUT_SECONDS must be a positive number" >&2
  exit 64
fi
second_opinion_model=${SECOND_OPINION_MODEL:-opus}
if [[ -z "$second_opinion_model" ]]; then
  echo "SECOND_OPINION_MODEL must not be empty" >&2
  exit 64
fi
second_opinion_effort=${SECOND_OPINION_EFFORT:-medium}
case "$second_opinion_effort" in
  low | medium | high | xhigh | max) ;;
  *)
    echo "SECOND_OPINION_EFFORT must be one of: low, medium, high, xhigh, max" >&2
    exit 64
    ;;
esac

budget_args=()
if [[ "$max_budget" != "unlimited" ]]; then
  budget_args=(--max-budget-usd "$max_budget")
fi
model_args=(--model "$second_opinion_model")
effort_args=(--effort "$second_opinion_effort")

temp_root=
output_reservation=
job_started=0
job_terminal=0
current_attempt=0

on_exit() {
  local status=$1
  trap - EXIT
  set +e
  [[ -z "$output_reservation" ]] || rm -f -- "$output_reservation"
  [[ -z "$temp_root" ]] || rm -rf -- "$temp_root"
  if (( job_started == 1 && job_terminal == 0 )); then
    node "$job_helper" fail-runner "$job_file" "$current_attempt" \
      runner_failed runner unexpected_exit "" \
      "runner exited unexpectedly with status $status" false >/dev/null 2>&1
  fi
  exit "$status"
}
trap 'on_exit $?' EXIT

fail_runner_job() {
  local failure_kind=$1
  local stage=$2
  local code=$3
  local pointer=$4
  local message=$5
  node "$job_helper" fail-runner "$job_file" "$current_attempt" \
    "$failure_kind" "$stage" "$code" "$pointer" "$message" false
  job_terminal=1
}

prior_diagnostic=
handle_contract_failure() {
  local diagnostic_file=$1
  local diagnostic_text
  local retry_status
  if [[ ! -f "$diagnostic_file" ]]; then
    fail_runner_job validation_failed runner diagnostic_missing "" \
      "validator failed without an output-contract diagnostic"
    echo "second-opinion validator failed without a diagnostic; no review was finalized" >&2
    return 1
  fi

  set +e
  node "$job_helper" diagnostic-retryable "$diagnostic_file" >/dev/null
  retry_status=$?
  set -e
  diagnostic_text=$(<"$diagnostic_file")

  if (( retry_status == 0 && current_attempt < max_attempts )); then
    node "$job_helper" retry "$job_file" "$current_attempt" "$diagnostic_file"
    prior_diagnostic=$diagnostic_text
    echo "second-opinion output contract failed on attempt ${current_attempt}/${max_attempts}; retrying with the validator diagnostic" >&2
    printf '%s\n' "$diagnostic_text" >&2
    return 0
  fi

  if (( retry_status == 0 )); then
    node "$job_helper" fail-diagnostic "$job_file" "$current_attempt" \
      schema_failed "$diagnostic_file"
    job_terminal=1
    echo "second-opinion schema failed after ${current_attempt}/${max_attempts} attempts; no review was finalized" >&2
    printf '%s\n' "$diagnostic_text" >&2
    return 1
  fi

  if (( retry_status == 1 )); then
    node "$job_helper" fail-diagnostic "$job_file" "$current_attempt" \
      validation_failed "$diagnostic_file"
    job_terminal=1
    echo "second-opinion validation failed with a non-retryable diagnostic; no review was finalized" >&2
    printf '%s\n' "$diagnostic_text" >&2
    return 1
  fi

  fail_runner_job validation_failed runner diagnostic_invalid "" \
    "validator emitted an invalid diagnostic"
  echo "second-opinion validator emitted an invalid diagnostic; no review was finalized" >&2
  return 1
}

temp_base=
for requested_temp_base in /tmp /var/tmp; do
  [[ -d "$requested_temp_base" && -w "$requested_temp_base" ]] || continue
  resolved_temp_base=$(readlink -f "$requested_temp_base")
  case "$resolved_temp_base" in
    "$evidence_root" | "$evidence_root"/*) continue ;;
  esac
  temp_base=$resolved_temp_base
  break
done
if [[ -z "$temp_base" ]]; then
  echo "no writable temporary directory exists outside the evidence root" >&2
  exit 65
fi

temp_root=$(mktemp -d "$temp_base/second-opinion-review.XXXXXX")
temp_root=$(readlink -f "$temp_root")
case "$temp_root" in
  "$evidence_root" | "$evidence_root"/*)
    echo "temporary review root must stay outside the fixed evidence root" >&2
    exit 65
    ;;
esac

prompt_snapshot="$temp_root/prompt.md"
identity_file="$temp_root/identity.json"
review_cwd="$temp_root/review-cwd"
cp -- "$prompt_file" "$prompt_snapshot"
mkdir -m 700 "$review_cwd"
cd "$evidence_root"

python3 "$script_dir/validate-review.py" "${identity_args[@]}" \
  "$prompt_snapshot" "$identity_file"

mkdir -p "$output_dir"
output_reservation=$(mktemp "$output_dir/.second-opinion-review.XXXXXX")
node "$script_dir/check-claude-window.mjs" check

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH" >&2
  exit 127
fi

prompt_bytes=$(wc -c < "$prompt_snapshot")
if (( prompt_bytes > prompt_max_bytes )); then
  echo "prompt exceeds SECOND_OPINION_PROMPT_MAX_BYTES=$prompt_max_bytes" >&2
  exit 65
fi

# Keep transport constraints structural; the local validator owns semantic
# limits, evidence safety, and freshness across provider backends.
schema=$(<"$schema_file")
base_system_prompt="You are a tool-free, read-only advisory reviewer. Use only the evidence supplied through standard input. Do not infer repository, environment, credentials, or external state. Return only schema-compatible review output; never approve, block, merge, or declare readiness. Every finding must cite exactly one path and satisfy line_end - line_start <= 19."
case "$mode" in
  git) job_target=$evidence_root ;;
  artifact) job_target=$artifact ;;
esac
node "$job_helper" start "$job_file" "$max_attempts" "$mode" "$job_target" \
  "$prompt_file" "$output_file" "$second_opinion_model" \
  "$second_opinion_effort" "$max_budget" "$timeout_seconds"
job_started=1

for (( current_attempt = 1; current_attempt <= max_attempts; current_attempt++ )); do
  node "$job_helper" attempt "$job_file" "$current_attempt"
  envelope_file="$temp_root/envelope-${current_attempt}.json"
  normalized_envelope="$temp_root/normalized-envelope-${current_attempt}.json"
  normalization_file="$temp_root/normalization-${current_attempt}.json"
  normalize_diagnostic="$temp_root/normalize-diagnostic-${current_attempt}.json"
  finalize_diagnostic="$temp_root/finalize-diagnostic-${current_attempt}.json"
  review_system_prompt=$base_system_prompt
  if [[ -n "$prior_diagnostic" ]]; then
    review_system_prompt+=$'\n\nThe previous structured output was rejected. Correct exactly this validator diagnostic and return a complete replacement:\n'
    review_system_prompt+="$prior_diagnostic"
  fi

  set +e
  (
    cd "$review_cwd"
    timeout --preserve-status --kill-after=10 "$timeout_seconds" claude \
      --safe-mode \
      --disable-slash-commands \
      --system-prompt "$review_system_prompt" \
      --print \
      --tools "" \
      --output-format json \
      --json-schema "$schema" \
      "${budget_args[@]}" \
      "${effort_args[@]}" \
      --no-session-persistence \
      "${model_args[@]}" \
      < "$prompt_snapshot" \
      > "$envelope_file"
  )
  review_status=$?
  set -e

  if (( review_status == 137 || review_status == 143 )); then
    fail_runner_job timeout transport timeout "" \
      "reviewer timed out after ${timeout_seconds}s with exit status ${review_status}"
    echo "second-opinion reviewer timed out after ${timeout_seconds}s (model=${second_opinion_model}, effort=${second_opinion_effort}, exit_status=${review_status}); no review was finalized" >&2
    exit "$review_status"
  fi
  if (( review_status != 0 )); then
    fail_runner_job transport_failed transport reviewer_failed "" \
      "reviewer failed with exit status ${review_status}"
    echo "second-opinion reviewer failed with exit status ${review_status} (model=${second_opinion_model}, effort=${second_opinion_effort}); no review was finalized" >&2
    exit "$review_status"
  fi

  if ! cmp -s "$prompt_file" "$prompt_snapshot"; then
    fail_runner_job prompt_changed runner prompt_changed "/prompt" \
      "checker prompt changed while Claude was running"
    echo "checker prompt changed while Claude was running; no review was finalized" >&2
    exit 65
  fi

  set +e
  python3 "$script_dir/validate-review.py" normalize \
    "$envelope_file" "$normalized_envelope" "$normalization_file" \
    --diagnostic-json "$normalize_diagnostic"
  normalize_status=$?
  set -e
  if (( normalize_status != 0 )); then
    if handle_contract_failure "$normalize_diagnostic"; then
      continue
    fi
    exit 1
  fi

  set +e
  python3 "$script_dir/validate-review.py" finalize \
    "$normalized_envelope" "$prompt_snapshot" "$prompt_file" "$output_file" \
    "$identity_file" "$normalization_file" \
    --diagnostic-json "$finalize_diagnostic"
  finalize_status=$?
  set -e
  if (( finalize_status != 0 )); then
    if handle_contract_failure "$finalize_diagnostic"; then
      continue
    fi
    exit 1
  fi

  node "$job_helper" complete "$job_file" "$current_attempt" "$normalization_file"
  job_terminal=1
  printf '%s\n' "$output_file"
  exit 0
done

fail_runner_job runner_failed runner attempts_exhausted "" \
  "checker attempt loop exhausted without a terminal result"
echo "second-opinion attempt loop exhausted without a terminal result" >&2
exit 70
