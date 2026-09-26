#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: check-opinion.sh <absolute-run-directory>" >&2
  exit 64
fi

run_dir=$1
if [[ "$run_dir" != /* || ! -d "$run_dir" ]]; then
  echo "invalid: run directory must be an existing absolute directory" >&2
  exit 64
fi
run_dir=$(readlink -f "$run_dir")
case "$run_dir" in
  */.krn/runs/second-opinion/*) ;;
  *)
    echo "invalid: run directory must be under .krn/runs/second-opinion" >&2
    exit 64
    ;;
esac

opinion="$run_dir/opinion.md"
raw="$run_dir/raw.jsonl"
meta="$run_dir/meta.json"
failed_raw="$run_dir/raw.failed.jsonl"
failure="$run_dir/failure.txt"

if [[ -e "$opinion" || -e "$raw" || -e "$meta" ]]; then
  if [[ -f "$opinion" && -s "$opinion" && -f "$raw" && -s "$raw" && -f "$meta" && -s "$meta" && ! -e "$failure" && ! -e "$failed_raw" ]]; then
    echo "completed: $opinion"
    exit 0
  fi
  if [[ -e "$failure" || -e "$failed_raw" ]]; then
    echo "invalid: completed artifacts conflict with failure artifacts" >&2
    exit 64
  fi
  # The runner can still be finalizing after the host yields, so a partial
  # artifact set without failure artifacts is pending, not malformed.
  echo "pending: $run_dir"
  exit 2
fi

if [[ -e "$failure" || -e "$failed_raw" ]]; then
  if [[ -f "$failure" && -s "$failure" ]]; then
    echo "failed: $failure"
    exit 1
  fi
  echo "invalid: failure artifacts are incomplete" >&2
  exit 64
fi

echo "pending: $run_dir"
exit 2
