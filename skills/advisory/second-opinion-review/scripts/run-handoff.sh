#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "usage: run-handoff.sh <descriptive-name> <handoff.md>" >&2
  exit 64
fi

job_name=$1
handoff_file=$2
script_dir=$(cd "${BASH_SOURCE[0]%/*}" && pwd)

if [[ ! -f "$handoff_file" ]]; then
  echo "handoff file not found: $handoff_file" >&2
  exit 66
fi
handoff_file=$(rtk readlink -f "$handoff_file")

if [[ "$job_name" == *$'\n'* || ${#job_name} -lt 3 || ${#job_name} -gt 80 ]]; then
  echo "descriptive name must contain 3-80 characters on one line" >&2
  exit 65
fi

handoff_max_bytes=${SECOND_OPINION_HANDOFF_MAX_BYTES:-64000}
handoff_bytes=$(rtk wc -c < "$handoff_file")
if (( handoff_bytes > handoff_max_bytes )); then
  echo "handoff exceeds SECOND_OPINION_HANDOFF_MAX_BYTES=$handoff_max_bytes" >&2
  exit 65
fi

if ! rtk rg -q '^<claude-handoff>$' "$handoff_file" || \
   ! rtk rg -q '^</claude-handoff>$' "$handoff_file"; then
  echo "handoff must contain the <claude-handoff> template boundary" >&2
  exit 65
fi

for heading in "## Objective" "## Role and completion" "## Sources" \
  "## Work" "## Deliverables" "## Proof boundaries" \
  "## Safety and ownership" "## Suggested skills"; do
  if ! rtk rg -q -F "$heading" "$handoff_file"; then
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
        "- Role: researcher" | '- Role: `researcher`')
          handoff_role=researcher
          ;;
        "- Role: rewrite-maker" | '- Role: `rewrite-maker`')
          handoff_role=rewrite-maker
          ;;
        *)
          echo "background handoff role must be researcher or rewrite-maker; use run-review.sh for checker" >&2
          exit 65
          ;;
      esac
      ;;
  esac
done < "$handoff_file"
if (( role_lines != 1 )) || [[ -z "$handoff_role" ]]; then
  echo "handoff must contain exactly one background Role: researcher or rewrite-maker" >&2
  exit 65
fi

rtk node "$script_dir/check-claude-window.mjs" check

if ! repo_root=$(rtk git rev-parse --show-toplevel 2>/dev/null); then
  echo "run the background handoff from a disposable Git worktree" >&2
  exit 65
fi
case "$handoff_file" in
  "$repo_root" | "$repo_root"/*)
    echo "handoff file must stay outside the repository" >&2
    exit 65
    ;;
esac
git_dir=$(rtk git rev-parse --path-format=absolute --git-dir)
common_dir=$(rtk git rev-parse --path-format=absolute --git-common-dir)
if [[ "$git_dir" == "$common_dir" ]]; then
  echo "background handoff refuses the primary checkout; use a disposable linked worktree" >&2
  exit 65
fi
if [[ "$(pwd -P)" != "$repo_root" ]]; then
  echo "run the background handoff from the disposable worktree root: $repo_root" >&2
  exit 65
fi
if [[ -n "$(rtk git status --porcelain)" ]]; then
  echo "disposable worktree must be clean before Claude takes ownership" >&2
  exit 65
fi

if ! command -v claude >/dev/null 2>&1; then
  echo "claude CLI not found on PATH" >&2
  exit 127
fi

handoff=$(<"$handoff_file")
rtk claude --bg --name "$job_name" "$handoff"
