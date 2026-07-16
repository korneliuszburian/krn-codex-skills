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
if [[ "$output_file" == "$prompt_file" ]] ||
  [[ -e "$output_file" && "$output_file" -ef "$prompt_file" ]]; then
  echo "review output must not replace or alias the checker prompt" >&2
  exit 65
fi
if [[ -e "$output_file" || -L "$output_file" ]]; then
  echo "review output must not already exist" >&2
  exit 65
fi
case "$output_file" in
  "$evidence_root" | "$evidence_root"/*)
    echo "review output must stay outside the fixed evidence root" >&2
    exit 65
    ;;
esac

output_dir=${output_file%/*}
if [[ -z "$output_dir" ]]; then
  output_dir=/
fi
temp_root=
output_reservation=
cleanup() {
  [[ -z "$output_reservation" ]] || rm -f "$output_reservation"
  [[ -z "$temp_root" ]] || rm -rf "$temp_root"
}
trap cleanup EXIT

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
envelope_file="$temp_root/envelope.json"
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

prompt_max_bytes=${SECOND_OPINION_PROMPT_MAX_BYTES:-150000}
prompt_bytes=$(wc -c < "$prompt_snapshot")
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

# Keep transport constraints structural; the local validator owns semantic
# limits, evidence safety, and freshness across provider backends.
schema=$(<"$schema_file")
review_system_prompt="You are a tool-free, read-only advisory reviewer. Use only the evidence supplied through standard input. Do not infer repository, environment, credentials, or external state. Return only schema-compatible review output; never approve, block, merge, or declare readiness."

(
  cd "$review_cwd"
  timeout "$timeout_seconds" claude \
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
    < "$prompt_snapshot" \
    > "$envelope_file"
)

if ! cmp -s "$prompt_file" "$prompt_snapshot"; then
  echo "checker prompt changed while Claude was running" >&2
  exit 65
fi

python3 "$script_dir/validate-review.py" finalize \
  "$envelope_file" "$prompt_snapshot" "$prompt_file" "$output_file" "$identity_file"

printf '%s\n' "$output_file"
