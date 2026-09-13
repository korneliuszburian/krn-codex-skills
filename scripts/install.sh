#!/usr/bin/env bash
set -euo pipefail

# One-release compatibility shim. The installation domain and public contract
# live behind `krn-codex`; this preserves the former two commands without
# allowing stable indexes to target a mutable source checkout.
mode=${1:-check}
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
case "$mode" in
  check) exec node "$script_dir/krn-codex.mjs" install check ;;
  install) exec node "$script_dir/krn-codex.mjs" install apply --source "$(cd "$script_dir/.." && pwd)" --yes ;;
  *) echo "usage: install.sh [check|install]" >&2; exit 64 ;;
esac
