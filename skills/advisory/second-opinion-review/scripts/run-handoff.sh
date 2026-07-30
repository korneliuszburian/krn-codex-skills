#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: run-handoff.sh [--add-dir DIR]... [--accept-edits] <descriptive-name> <handoff.md>" >&2
}

additional_dirs=()
accept_edits=false
while (( $# > 2 )); do
  case "$1" in
    --add-dir)
      if (( $# < 4 )); then
        usage
        exit 64
      fi
      additional_dirs+=("$2")
      shift 2
      ;;
    --accept-edits)
      accept_edits=true
      shift
      ;;
    *)
      usage
      exit 64
      ;;
  esac
done

if [[ $# -ne 2 ]]; then
  usage
  exit 64
fi

job_name=$1
handoff_file=$2
if [[ "$job_name" == --* ]]; then
  usage
  exit 64
fi
script_path=$(readlink -f "${BASH_SOURCE[0]}")
script_dir=${script_path%/*}

if [[ ! -f "$handoff_file" ]]; then
  echo "handoff file not found: $handoff_file" >&2
  exit 66
fi
handoff_file=$(readlink -f "$handoff_file")

resolved_additional_dirs=()
home_directory=$(readlink -f "$HOME")
protected_agent_config_dirs=()
for config_dir in "$HOME/.codex" "$HOME/.agents" "$HOME/.claude" \
  "${CODEX_HOME:-}" "${CLAUDE_CONFIG_DIR:-}"; do
  if [[ -z "$config_dir" ]]; then
    continue
  fi
  if [[ "$config_dir" != /* ]]; then
    config_dir="$PWD/$config_dir"
  fi
  lexical_config_dir=$(realpath -ms -- "$config_dir")
  protected_agent_config_dirs+=("$lexical_config_dir")
  if [[ -e "$config_dir" || -L "$config_dir" ]]; then
    physical_config_dir=$(readlink -f "$config_dir")
    if [[ "$physical_config_dir" != "$lexical_config_dir" ]]; then
      protected_agent_config_dirs+=("$physical_config_dir")
    fi
  fi
done

path_overlaps() {
  local left=$1
  local right=$2
  [[
    "$left" == "$right" ||
    "$left" == "$right"/* ||
    "$right" == "$left"/*
  ]]
}

assert_not_protected() {
  local candidate=$1
  for config_dir in "${protected_agent_config_dirs[@]}"; do
    if path_overlaps "$candidate" "$config_dir"; then
      echo "refusing broad or agent-configuration --add-dir path: $candidate" >&2
      exit 65
    fi
  done
}

for requested_dir in "${additional_dirs[@]}"; do
  if [[
    "$requested_dir" != /* ||
    "$requested_dir" == *$'\n'* ||
    "$requested_dir" == *$'\r'*
  ]]; then
    echo "--add-dir requires an absolute one-line path: $requested_dir" >&2
    exit 65
  fi
  case "${requested_dir,,}" in
    *superpowers*)
      echo "refusing hard-quarantined --add-dir path" >&2
      exit 65
      ;;
  esac
  lexical_dir=$(realpath -ms -- "$requested_dir")
  if [[ "$requested_dir" != "$lexical_dir" ]]; then
    echo "--add-dir must use its canonical absolute spelling: $requested_dir" >&2
    exit 65
  fi
  assert_not_protected "$lexical_dir"
  if [[ ! -d "$requested_dir" ]]; then
    echo "--add-dir path is not a directory: $requested_dir" >&2
    exit 66
  fi
  resolved_dir=$(readlink -f "$requested_dir")
  if [[ "$lexical_dir" != "$resolved_dir" ]]; then
    echo "--add-dir must not cross a symlink: $requested_dir" >&2
    exit 65
  fi
  if [[ "$home_directory" == "$resolved_dir"/* ]]; then
    echo "refusing --add-dir ancestor of the home directory: $resolved_dir" >&2
    exit 65
  fi
  case "$resolved_dir" in
    / | "$home_directory")
      echo "refusing broad or agent-configuration --add-dir path: $resolved_dir" >&2
      exit 65
      ;;
  esac
  assert_not_protected "$resolved_dir"
  case "${resolved_dir,,}" in
    *superpowers*)
      echo "refusing hard-quarantined --add-dir path" >&2
      exit 65
      ;;
  esac
  resolved_additional_dirs+=("$resolved_dir")
done

if (( ${#resolved_additional_dirs[@]} > 0 )); then
  disposable_root=${SECOND_OPINION_DISPOSABLE_ROOT:-}
  if [[
    "$disposable_root" != /* ||
    "$disposable_root" == *$'\n'* ||
    "$disposable_root" == *$'\r'*
  ]]; then
    echo "--add-dir requires an absolute SECOND_OPINION_DISPOSABLE_ROOT" >&2
    exit 65
  fi
  if [[ ! -d "$disposable_root" ]]; then
    echo "SECOND_OPINION_DISPOSABLE_ROOT is not a directory: $disposable_root" >&2
    exit 66
  fi
  lexical_disposable_root=$(realpath -ms -- "$disposable_root")
  if [[ "$disposable_root" != "$lexical_disposable_root" ]]; then
    echo "SECOND_OPINION_DISPOSABLE_ROOT must use its canonical absolute spelling" >&2
    exit 65
  fi
  disposable_root=$(readlink -f "$disposable_root")
  if [[ "$lexical_disposable_root" != "$disposable_root" ]]; then
    echo "SECOND_OPINION_DISPOSABLE_ROOT must not cross a symlink" >&2
    exit 65
  fi
  assert_not_protected "$disposable_root"
  disposable_root_allowed=false
  allowed_disposable_parents=("$home_directory")
  for candidate in "${TMPDIR:-/tmp}" /tmp /var/tmp; do
    if [[ -d "$candidate" ]]; then
      allowed_disposable_parents+=("$(readlink -f "$candidate")")
    fi
  done
  for allowed_parent in "${allowed_disposable_parents[@]}"; do
    if [[ "$disposable_root" == "$allowed_parent"/* ]]; then
      disposable_root_allowed=true
      break
    fi
  done
  if [[ "$disposable_root_allowed" != true ]]; then
    echo "SECOND_OPINION_DISPOSABLE_ROOT must be below HOME, TMPDIR, /tmp, or /var/tmp" >&2
    exit 65
  fi
  disposable_mode=$(stat -c '%a' "$disposable_root")
  if (( (8#$disposable_mode & 077) != 0 )); then
    echo "SECOND_OPINION_DISPOSABLE_ROOT must not grant group or other permissions" >&2
    exit 65
  fi
  if git -C "$disposable_root" rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "SECOND_OPINION_DISPOSABLE_ROOT must not be inside a Git checkout" >&2
    exit 65
  fi

  for resolved_dir in "${resolved_additional_dirs[@]}"; do
    if [[ "$resolved_dir" != "$disposable_root"/* ]]; then
      echo "--add-dir must be a strict child of SECOND_OPINION_DISPOSABLE_ROOT: $resolved_dir" >&2
      exit 65
    fi
    if git -C "$resolved_dir" rev-parse --show-toplevel >/dev/null 2>&1; then
      echo "--add-dir must be a disposable copy, not a Git checkout: $resolved_dir" >&2
      exit 65
    fi
    if ! find -P "$resolved_dir" -xdev -print >/dev/null; then
      echo "cannot fully validate --add-dir disposable copy: $resolved_dir" >&2
      exit 65
    fi
    if ! unsafe_match=$(find -P "$resolved_dir" -xdev -type l -print -quit); then
      echo "cannot validate symlinks below --add-dir: $resolved_dir" >&2
      exit 65
    fi
    if [[ -n "$unsafe_match" ]]; then
      echo "--add-dir disposable copies must not contain symlinks: $resolved_dir" >&2
      exit 65
    fi
    if ! unsafe_match=$(find -P "$resolved_dir" -xdev -name .git -print -quit); then
      echo "cannot validate Git metadata below --add-dir: $resolved_dir" >&2
      exit 65
    fi
    if [[ -n "$unsafe_match" ]]; then
      echo "--add-dir disposable copies must not contain Git metadata: $resolved_dir" >&2
      exit 65
    fi
    if ! unsafe_match=$(find -P "$resolved_dir" -xdev -iname '*superpowers*' -print -quit); then
      echo "cannot validate quarantined content below --add-dir: $resolved_dir" >&2
      exit 65
    fi
    if [[ -n "$unsafe_match" ]]; then
      echo "refusing hard-quarantined content below --add-dir" >&2
      exit 65
    fi
    if ! unsafe_match=$(find -P "$resolved_dir" -xdev -type f -links +1 -print -quit); then
      echo "cannot validate hardlinks below --add-dir: $resolved_dir" >&2
      exit 65
    fi
    if [[ -n "$unsafe_match" ]]; then
      echo "--add-dir disposable copies must not contain hard-linked files: $resolved_dir" >&2
      exit 65
    fi
  done
fi

if [[ "$job_name" == *$'\n'* || ${#job_name} -lt 3 || ${#job_name} -gt 80 ]]; then
  echo "descriptive name must contain 3-80 characters on one line" >&2
  exit 65
fi

handoff_max_bytes=${SECOND_OPINION_HANDOFF_MAX_BYTES:-64000}
handoff_bytes=$(wc -c < "$handoff_file")
if (( handoff_bytes > handoff_max_bytes )); then
  echo "handoff exceeds SECOND_OPINION_HANDOFF_MAX_BYTES=$handoff_max_bytes" >&2
  exit 65
fi

if ! grep -q -F -x '<claude-handoff>' "$handoff_file" || \
   ! grep -q -F -x '</claude-handoff>' "$handoff_file"; then
  echo "handoff must contain the <claude-handoff> template boundary" >&2
  exit 65
fi

for heading in "## Objective" "## Role and completion" "## Sources" \
  "## Work" "## Deliverables" "## Proof boundaries" \
  "## Safety and ownership" "## Suggested skills"; do
  if ! grep -q -F "$heading" "$handoff_file"; then
    echo "handoff missing required heading: $heading" >&2
    exit 65
  fi
done

role_lines=0
handoff_role=
while IFS= read -r line; do
  case "$line" in
    "- Role:"*)
      ((role_lines += 1))
      case "$line" in
        "- Role: rewrite" | '- Role: `rewrite`')
          handoff_role=rewrite
          ;;
        *)
          echo "background handoff role must be rewrite; use run-research.mjs for research or run-review.sh for check" >&2
          exit 65
          ;;
      esac
      ;;
  esac
done < "$handoff_file"
if (( role_lines != 1 )) || [[ "$handoff_role" != "rewrite" ]]; then
  echo "handoff must contain exactly one background Role: rewrite" >&2
  exit 65
fi
if [[ "$accept_edits" == false ]]; then
  echo "rewrite handoffs require explicit --accept-edits authority" >&2
  exit 65
fi

node "$script_dir/prepare-artifacts.mjs" verify-pass "${handoff_file%/*}" rewrite
node "$script_dir/check-claude-window.mjs" check

if ! repo_root=$(git rev-parse --show-toplevel 2>/dev/null); then
  echo "run the background handoff from a disposable Git worktree" >&2
  exit 65
fi
case "$handoff_file" in
  "$repo_root" | "$repo_root"/*)
    echo "handoff file must stay outside the repository" >&2
    exit 65
    ;;
esac
git_dir=$(git rev-parse --path-format=absolute --git-dir)
common_dir=$(git rev-parse --path-format=absolute --git-common-dir)
if [[ "$git_dir" == "$common_dir" ]]; then
  echo "background handoff refuses the primary checkout; use a disposable linked worktree" >&2
  exit 65
fi
if [[ "$(pwd -P)" != "$repo_root" ]]; then
  echo "run the background handoff from the disposable worktree root: $repo_root" >&2
  exit 65
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "disposable worktree must be clean before Claude takes ownership" >&2
  exit 65
fi

if ! which claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH" >&2
  exit 127
fi

second_opinion_model=${SECOND_OPINION_MODEL:-opus}
model_args=(--model "$second_opinion_model")
if [[ -n "${SECOND_OPINION_EFFORT:-}" ]]; then
  case "$SECOND_OPINION_EFFORT" in
    low | medium | high | xhigh | max)
      model_args+=(--effort "$SECOND_OPINION_EFFORT")
      ;;
    *)
      echo "SECOND_OPINION_EFFORT must be low, medium, high, xhigh, or max" >&2
      exit 65
      ;;
  esac
fi

permission_args=()
if [[ "$accept_edits" == true ]]; then
  permission_args=(--permission-mode acceptEdits)
fi

directory_args=()
for additional_dir in "${resolved_additional_dirs[@]}"; do
  directory_args+=(--add-dir "$additional_dir")
done

handoff=$(<"$handoff_file")
claude --bg --name "$job_name" "${directory_args[@]}" \
  "${model_args[@]}" "${permission_args[@]}" "$handoff"
