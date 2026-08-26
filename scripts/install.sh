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
global_hooks_source="$repo_root/$(jq -r '.global_hooks' "$manifest")"
global_hooks_target="$codex_home/hooks.json"
hook_dest="$codex_home/hooks"
upstream_lock=${KRN_UPSTREAM_LOCK:-"$repo_root/config/upstream-sources.json"}
archive_legacy=${KRN_ARCHIVE_LEGACY:-0}
upstream_skill_roots=${KRN_UPSTREAM_SKILLS_ROOTS:-}
replace_global_agents=${KRN_REPLACE_GLOBAL_AGENTS:-0}
replace_global_claude=${KRN_REPLACE_GLOBAL_CLAUDE:-0}
replace_global_hooks=${KRN_REPLACE_GLOBAL_HOOKS:-0}

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
if [[ "$replace_global_hooks" != 0 && "$replace_global_hooks" != 1 ]]; then
  echo "KRN_REPLACE_GLOBAL_HOOKS must be 0 or 1" >&2
  exit 64
fi

KRN_UPSTREAM_LOCK="$upstream_lock" node "$repo_root/scripts/validate.mjs"

mapfile -t skill_rows < <(
  jq -r '.skills[] | [.name, .path] | @tsv' "$manifest"
)
mapfile -t retired_skill_rows < <(
  jq -r '.retired_skills[] | [.name, .owner] | @tsv' "$manifest"
)
mapfile -t bin_rows < <(
  jq -r '.bins[] | [.name, .path] | @tsv' "$manifest"
)
mapfile -t legacy_rows < <(
  jq -r '.legacy_user_paths[] | [.path, .replacement] | @tsv' "$manifest"
)
mapfile -t hook_rows < <(
  jq -r '.global_hook_files[] | [.name, .path] | @tsv' "$manifest"
)
mapfile -t legacy_hook_rows < <(
  jq -r '.legacy_global_hook_paths[]' "$manifest"
)
upstream_commit=$(jq -r '.sources[] | select(.id == "mattpocock/skills") | .commit' "$upstream_lock")
mapfile -t upstream_required_paths < <(
  jq -r '.sources[] | select(.id == "mattpocock/skills") | .required_paths[]' "$upstream_lock"
)
mapfile -t upstream_skill_names < <(
  jq -r '.sources[] | select(.id == "mattpocock/skills") | .required_paths[] | split("/") | .[-2]' "$upstream_lock"
)
if [[ -z "$upstream_commit" || "$upstream_commit" == null || "${#upstream_required_paths[@]}" -eq 0 || "${#upstream_skill_names[@]}" -eq 0 ]]; then
  echo "upstream lock is missing the mattpocock/skills source" >&2
  exit 82
fi

link_matches() {
  local link=$1
  local expected=$2
  [[ -L "$link" ]] || return 1
  [[ "$(readlink -f "$link")" == "$(readlink -f "$expected")" ]]
}

active_upstream_link() {
  local target=$1
  local owner=$2
  local resolved
  local root
  local -a roots
  [[ "$owner" == upstream:* && -L "$target" ]] || return 1
  resolved=$(readlink -f "$target" 2>/dev/null || true)
  [[ -n "$resolved" && -e "$resolved" ]] || return 1
  IFS=: read -r -a roots <<< "$upstream_skill_roots"
  for root in "${roots[@]}"; do
    [[ -n "$root" ]] || continue
    root=$(readlink -f "$root" 2>/dev/null || true)
    if [[ -n "$root" && ( "$resolved" == "$root" || "$resolved" == "$root"/* ) ]]; then
      return 0
    fi
  done
  return 1
}

retired_upstream_name() {
  local candidate=$1
  local row name owner
  for row in "${retired_skill_rows[@]}"; do
    IFS=$'\t' read -r name owner <<< "$row"
    if [[ "$owner" == upstream:* && "$name" == "$candidate" ]]; then
      return 0
    fi
  done
  return 1
}

verify_upstream_root() {
  local root=$1
  local resolved actual status

  resolved=$(readlink -f "$root" 2>/dev/null || true)
  if [[ -z "$resolved" || ! -d "$resolved" ]]; then
    echo "invalid upstream source root: $root" >&2
    return 1
  fi
  actual=$(git -C "$resolved" rev-parse --verify HEAD 2>/dev/null || true)
  if [[ "$actual" != "$upstream_commit" ]]; then
    echo "upstream source drift: $resolved is ${actual:-not a Git revision}, expected $upstream_commit" >&2
    return 1
  fi
  status=$(git -C "$resolved" status --porcelain --untracked-files=all)
  if [[ -n "$status" ]]; then
    echo "upstream source is not clean: $resolved" >&2
    return 1
  fi
  for required_path in "${upstream_required_paths[@]}"; do
    if [[ ! -f "$resolved/$required_path" ]]; then
      echo "upstream source is missing required path: $resolved/$required_path" >&2
      return 1
    fi
  done
}

verify_upstream_roots() {
  if [[ -z "$upstream_skill_roots" ]]; then
    for upstream_name in "${upstream_skill_names[@]}"; do
      target="$skill_dest/$upstream_name"
      if [[ -e "$target" || -L "$target" ]]; then
        echo "upstream source root is required to verify: $target" >&2
        echo "set KRN_UPSTREAM_SKILLS_ROOTS to a pinned source root" >&2
        return 1
      fi
    done
    return 0
  fi
  local root
  local -a roots
  local found_root=false
  IFS=: read -r -a roots <<< "$upstream_skill_roots"
  for root in "${roots[@]}"; do
    [[ -n "$root" ]] || continue
    found_root=true
    verify_upstream_root "$root" || return 1
  done
  if [[ "$found_root" == false ]]; then
    echo "KRN_UPSTREAM_SKILLS_ROOTS must contain at least one source root" >&2
    return 1
  fi
  verify_upstream_links
}

verify_upstream_links() {
  local upstream_name target resolved root
  local -a roots
  IFS=: read -r -a roots <<< "$upstream_skill_roots"
  for upstream_name in "${upstream_skill_names[@]}"; do
    target="$skill_dest/$upstream_name"
    [[ -e "$target" || -L "$target" ]] || continue
    if [[ ! -L "$target" ]]; then
      echo "upstream skill is not a symlink: $target" >&2
      return 1
    fi
    resolved=$(readlink -f "$target" 2>/dev/null || true)
    if [[ -z "$resolved" || ! -e "$resolved" ]]; then
      if retired_upstream_name "$upstream_name"; then
        continue
      fi
      echo "upstream skill link is unresolved: $target" >&2
      return 1
    fi
    local matched_root=false
    for root in "${roots[@]}"; do
      [[ -n "$root" ]] || continue
      root=$(readlink -f "$root" 2>/dev/null || true)
      if [[ -n "$root" && ( "$resolved" == "$root" || "$resolved" == "$root"/* ) ]]; then
        matched_root=true
        break
      fi
    done
    if [[ "$matched_root" == false ]]; then
      echo "upstream skill link escapes verified roots: $target -> $resolved" >&2
      return 1
    fi
  done
}

if ! verify_upstream_roots; then
  exit 82
fi

check_install() {
  local failures=0
  local name relative source target legacy legacy_relative replacement legacy_hook retired_name retired_owner

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

  for row in "${retired_skill_rows[@]}"; do
    IFS=$'\t' read -r retired_name retired_owner <<< "$row"
    target="$skill_dest/$retired_name"
    if active_upstream_link "$target" "$retired_owner"; then
      printf 'ok      %s -> active upstream source\n' "$target"
      continue
    fi
    if [[ -e "$target" || -L "$target" ]]; then
      printf 'retired %s (archive with KRN_ARCHIVE_LEGACY=1)\n' "$target"
      failures=1
    fi
  done

  for row in "${hook_rows[@]}"; do
    IFS=$'\t' read -r name relative <<< "$row"
    source="$repo_root/$relative"
    target="$hook_dest/$name"
    if link_matches "$target" "$source"; then
      printf 'ok      %s -> %s\n' "$target" "$source"
    elif [[ -e "$target" || -L "$target" ]]; then
      printf 'foreign %s (explicit hook replacement authority required)\n' "$target"
      failures=1
    else
      printf 'missing %s\n' "$target"
      failures=1
    fi
  done

  for legacy_hook in "${legacy_hook_rows[@]}"; do
    target="$codex_home/$legacy_hook"
    if [[ -e "$target" || -L "$target" ]]; then
      printf 'legacy  %s -> managed global PreToolUse hook\n' "$target"
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

  if link_matches "$global_hooks_target" "$global_hooks_source"; then
    printf 'ok      %s -> %s\n' "$global_hooks_target" "$global_hooks_source"
  elif [[ -e "$global_hooks_target" || -L "$global_hooks_target" ]]; then
    printf 'foreign %s (explicit hook replacement authority required)\n' "$global_hooks_target"
    failures=1
  else
    printf 'missing %s\n' "$global_hooks_target"
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

for row in "${retired_skill_rows[@]}"; do
  IFS=$'\t' read -r retired_name retired_owner <<< "$row"
  target="$skill_dest/$retired_name"
  if active_upstream_link "$target" "$retired_owner"; then
    continue
  fi
  if [[ -e "$target" || -L "$target" ]] && [[ "$archive_legacy" != 1 ]]; then
    echo "refusing retired skill path: $target" >&2
    echo "set KRN_ARCHIVE_LEGACY=1 only after reviewing that path" >&2
    exit 81
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

if [[ -e "$global_hooks_target" || -L "$global_hooks_target" ]] &&
  ! link_matches "$global_hooks_target" "$global_hooks_source" &&
  [[ "$replace_global_hooks" != 1 ]]; then
  echo "refusing unowned global hooks: $global_hooks_target" >&2
  echo "set KRN_REPLACE_GLOBAL_HOOKS=1 only after reviewing that file" >&2
  exit 79
fi

for row in "${hook_rows[@]}"; do
  IFS=$'\t' read -r name relative <<< "$row"
  source="$repo_root/$relative"
  target="$hook_dest/$name"
  if [[ -e "$target" || -L "$target" ]] &&
    ! link_matches "$target" "$source" &&
    [[ "$replace_global_hooks" != 1 ]]; then
    echo "refusing unowned global hook file: $target" >&2
    echo "set KRN_REPLACE_GLOBAL_HOOKS=1 only after reviewing that file" >&2
    exit 79
  fi
done

for legacy_hook in "${legacy_hook_rows[@]}"; do
  target="$codex_home/$legacy_hook"
  if [[ -e "$target" || -L "$target" ]] && [[ "$replace_global_hooks" != 1 ]]; then
    echo "refusing legacy global hook path: $target" >&2
    echo "set KRN_REPLACE_GLOBAL_HOOKS=1 only after reviewing that file" >&2
    exit 80
  fi
done

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

mkdir -p "$skill_dest" "$bin_dest" "$codex_home" "$claude_home" "$hook_dest"
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

for row in "${retired_skill_rows[@]}"; do
  IFS=$'\t' read -r retired_name retired_owner <<< "$row"
  if active_upstream_link "$skill_dest/$retired_name" "$retired_owner"; then
    continue
  fi
  archive_path "$skill_dest/$retired_name" "retired-skill__${retired_name}"
done

for legacy_hook in "${legacy_hook_rows[@]}"; do
  target="$codex_home/$legacy_hook"
  archive_path "$target" "hook__${legacy_hook//\//__}"
done

for row in "${hook_rows[@]}"; do
  IFS=$'\t' read -r name relative <<< "$row"
  source="$repo_root/$relative"
  target="$hook_dest/$name"
  if link_matches "$target" "$source"; then
    continue
  fi
  archive_path "$target" "hook__${name}"
  ln -s "$source" "$target"
  printf 'linked   %s -> %s\n' "$target" "$source"
done

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

if ! link_matches "$global_hooks_target" "$global_hooks_source"; then
  archive_path "$global_hooks_target" "global__hooks.json"
  ln -s "$global_hooks_source" "$global_hooks_target"
  printf 'linked   %s -> %s\n' "$global_hooks_target" "$global_hooks_source"
fi

if [[ "$backup_created" == true ]]; then
  printf 'backup   %s\n' "$backup_dir"
fi

bash "$0" check
