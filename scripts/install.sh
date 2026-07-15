#!/usr/bin/env bash
set -euo pipefail

mode=${1:-check}
case "$mode" in
  check|install) ;;
  *)
    echo "usage: install.sh [check|install]" >&2
    exit 64
    ;;
esac

script_dir=${BASH_SOURCE[0]%/*}
repo_root=$(cd "$script_dir/.." && pwd)
manifest="$repo_root/skills/manifest.json"
skill_dest=${KRN_SKILLS_DEST:-"$HOME/.agents/skills"}
bin_dest=${KRN_BIN_DEST:-"$HOME/.local/bin"}
codex_home=${CODEX_HOME:-"$HOME/.codex"}
claude_home=${CLAUDE_CONFIG_DIR:-"$HOME/.claude"}
global_agents_source="$repo_root/$(jq -r '.global_agents' "$manifest")"
global_agents_target="$codex_home/AGENTS.md"
global_agents_override="$codex_home/AGENTS.override.md"
global_claude_source="$repo_root/$(jq -r '.global_claude' "$manifest")"
global_claude_target="$claude_home/CLAUDE.md"
archive_legacy=${KRN_ARCHIVE_LEGACY:-0}
replace_global_agents=${KRN_REPLACE_GLOBAL_AGENTS:-0}
replace_global_claude=${KRN_REPLACE_GLOBAL_CLAUDE:-0}

if [[ "$archive_legacy" != 0 && "$archive_legacy" != 1 ]]; then
  echo "KRN_ARCHIVE_LEGACY must be 0 or 1" >&2
  exit 64
fi
if [[ "$replace_global_agents" != 0 && "$replace_global_agents" != 1 ]]; then
  echo "KRN_REPLACE_GLOBAL_AGENTS must be 0 or 1" >&2
  exit 64
fi
if [[ "$replace_global_claude" != 0 && "$replace_global_claude" != 1 ]]; then
  echo "KRN_REPLACE_GLOBAL_CLAUDE must be 0 or 1" >&2
  exit 64
fi

node "$repo_root/scripts/validate.mjs"

mapfile -t skill_rows < <(
  jq -r '.skills[] | [.name, .path] | @tsv' "$manifest"
)
mapfile -t bin_rows < <(
  jq -r '.bins[] | [.name, .path] | @tsv' "$manifest"
)
mapfile -t legacy_rows < <(
  jq -r '.legacy_user_paths[] | [.path, .replacement] | @tsv' "$manifest"
)

link_matches() {
  local link=$1
  local expected=$2
  [[ -L "$link" ]] || return 1
  [[ "$(readlink -f "$link")" == "$(readlink -f "$expected")" ]]
}

check_install() {
  local failures=0
  local name relative source target legacy legacy_relative replacement

  for row in "${bin_rows[@]}"; do
    IFS=$'\t' read -r name relative <<< "$row"
    source="$repo_root/$relative"
    target="$bin_dest/$name"
    if link_matches "$target" "$source"; then
      printf 'ok      %s -> %s\n' "$target" "$source"
    elif [[ -e "$target" || -L "$target" ]]; then
      printf 'foreign %s (installer will not replace it)\n' "$target"
      failures=1
    else
      printf 'missing %s\n' "$target"
      failures=1
    fi
  done

  for row in "${skill_rows[@]}"; do
    IFS=$'\t' read -r name relative <<< "$row"
    source="$repo_root/$relative"
    target="$skill_dest/$name"
    if link_matches "$target" "$source"; then
      printf 'ok      %s -> %s\n' "$target" "$source"
    elif [[ -e "$target" || -L "$target" ]]; then
      printf 'foreign %s (installer will not replace it)\n' "$target"
      failures=1
    else
      printf 'missing %s\n' "$target"
      failures=1
    fi
  done

  for row in "${legacy_rows[@]}"; do
    IFS=$'\t' read -r legacy replacement <<< "$row"
    legacy_relative=${legacy#.codex/}
    legacy="$codex_home/$legacy_relative"
    if [[ -e "$legacy" || -L "$legacy" ]]; then
      printf 'legacy  %s -> replacement %s\n' "$legacy" "$replacement"
      failures=1
    fi
  done

  if link_matches "$global_agents_target" "$global_agents_source"; then
    printf 'ok      %s -> %s\n' "$global_agents_target" "$global_agents_source"
  elif [[ -e "$global_agents_target" || -L "$global_agents_target" ]]; then
    printf 'foreign %s (explicit replacement authority required)\n' "$global_agents_target"
    failures=1
  else
    printf 'missing %s\n' "$global_agents_target"
    failures=1
  fi

  if [[ -e "$global_agents_override" || -L "$global_agents_override" ]]; then
    printf 'masked  %s overrides the managed global AGENTS.md\n' "$global_agents_override"
    failures=1
  fi

  if link_matches "$global_claude_target" "$global_claude_source"; then
    printf 'ok      %s -> %s\n' "$global_claude_target" "$global_claude_source"
  elif [[ -e "$global_claude_target" || -L "$global_claude_target" ]]; then
    printf 'foreign %s (explicit Claude replacement authority required)\n' "$global_claude_target"
    failures=1
  else
    printf 'missing %s\n' "$global_claude_target"
    failures=1
  fi

  return "$failures"
}

if [[ "$mode" == "check" ]]; then
  check_install
  exit $?
fi

for row in "${bin_rows[@]}"; do
  IFS=$'\t' read -r name relative <<< "$row"
  source="$repo_root/$relative"
  target="$bin_dest/$name"
  if [[ -e "$target" || -L "$target" ]] && ! link_matches "$target" "$source"; then
    echo "refusing unowned executable collision: $target" >&2
    exit 78
  fi
done

for row in "${skill_rows[@]}"; do
  IFS=$'\t' read -r name relative <<< "$row"
  source="$repo_root/$relative"
  target="$skill_dest/$name"
  if [[ -e "$target" || -L "$target" ]] && ! link_matches "$target" "$source"; then
    echo "refusing unowned destination collision: $target" >&2
    exit 73
  fi
done

if [[ -e "$global_agents_override" || -L "$global_agents_override" ]]; then
  echo "refusing masked global instructions: $global_agents_override" >&2
  exit 75
fi

if [[ -e "$global_agents_target" || -L "$global_agents_target" ]] &&
  ! link_matches "$global_agents_target" "$global_agents_source" &&
  [[ "$replace_global_agents" != 1 ]]; then
  echo "refusing unowned global instructions: $global_agents_target" >&2
  echo "set KRN_REPLACE_GLOBAL_AGENTS=1 only after reviewing that file" >&2
  exit 74
fi

if [[ -e "$global_claude_target" || -L "$global_claude_target" ]] &&
  ! link_matches "$global_claude_target" "$global_claude_source" &&
  [[ "$replace_global_claude" != 1 ]]; then
  echo "refusing unowned Claude instructions: $global_claude_target" >&2
  echo "set KRN_REPLACE_GLOBAL_CLAUDE=1 only after reviewing that file" >&2
  exit 77
fi

for row in "${legacy_rows[@]}"; do
  IFS=$'\t' read -r legacy replacement <<< "$row"
  legacy_relative=${legacy#.codex/}
  legacy="$codex_home/$legacy_relative"
  if [[ -e "$legacy" || -L "$legacy" ]] && [[ "$archive_legacy" != 1 ]]; then
    echo "refusing unowned legacy path: $legacy" >&2
    echo "set KRN_ARCHIVE_LEGACY=1 only after reviewing manifest-owned paths" >&2
    exit 76
  fi
done

mkdir -p "$skill_dest" "$bin_dest" "$codex_home" "$claude_home"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir="$codex_home/skill-migration-backups/$timestamp-$$"
backup_created=false

archive_path() {
  local source=$1
  local label=$2
  if [[ ! -e "$source" && ! -L "$source" ]]; then
    return
  fi
  if [[ "$backup_created" == false ]]; then
    mkdir -p "$backup_dir"
    backup_created=true
  fi
  mv -- "$source" "$backup_dir/$label"
  printf 'archived %s -> %s\n' "$source" "$backup_dir/$label"
}

for row in "${bin_rows[@]}"; do
  IFS=$'\t' read -r name relative <<< "$row"
  source="$repo_root/$relative"
  target="$bin_dest/$name"
  if link_matches "$target" "$source"; then
    continue
  fi
  ln -s "$source" "$target"
  printf 'linked   %s -> %s\n' "$target" "$source"
done

for row in "${legacy_rows[@]}"; do
  IFS=$'\t' read -r legacy replacement <<< "$row"
  legacy_relative=${legacy#.codex/}
  archive_path "$codex_home/$legacy_relative" "${legacy//\//__}"
done

for row in "${skill_rows[@]}"; do
  IFS=$'\t' read -r name relative <<< "$row"
  source="$repo_root/$relative"
  target="$skill_dest/$name"
  if link_matches "$target" "$source"; then
    continue
  fi
  if [[ -e "$target" || -L "$target" ]]; then
    echo "refusing unowned destination collision: $target" >&2
    exit 73
  fi
  ln -s "$source" "$target"
  printf 'linked   %s -> %s\n' "$target" "$source"
done

if ! link_matches "$global_agents_target" "$global_agents_source"; then
  archive_path "$global_agents_target" "global__AGENTS.md"
  ln -s "$global_agents_source" "$global_agents_target"
  printf 'linked   %s -> %s\n' "$global_agents_target" "$global_agents_source"
fi

if ! link_matches "$global_claude_target" "$global_claude_source"; then
  archive_path "$global_claude_target" "claude__CLAUDE.md"
  ln -s "$global_claude_source" "$global_claude_target"
  printf 'linked   %s -> %s\n' "$global_claude_target" "$global_claude_source"
fi

if [[ "$backup_created" == true ]]; then
  printf 'backup   %s\n' "$backup_dir"
fi

bash "$0" check
