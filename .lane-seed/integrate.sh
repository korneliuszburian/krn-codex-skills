#!/usr/bin/env bash
# LT-7 integrator: merge one worker branch into the fixture main worktree and
# gate the merged fixed point. The capsule update stays manual (sole writer).
set -euo pipefail

BASE=${BASE:-/mnt/storage/coding/krn/lab/lt7}
FIXTURE=${FIXTURE:-$BASE/fixture}
KRN=${KRN:-$FIXTURE/scripts/krn.mjs}

branch=${1:?usage: integrate.sh <branch> <base-sha> [deciding-check]}
base=${2:?usage: integrate.sh <branch> <base-sha> [deciding-check]}
check=${3:-}

if [ -n "$(git -C "$FIXTURE" status --porcelain)" ]; then
  echo "integrator requires a clean fixture worktree" >&2
  exit 68
fi

git -C "$FIXTURE" merge --no-ff "$branch" -m "merge: integrate $branch"
head=$(git -C "$FIXTURE" rev-parse HEAD)

echo "merged=$head"
# A multi-ticket fixture still carries other pending red checks, so the
# integrator verifies the merged ticket's deciding check, not the whole suite.
if [ -n "$check" ]; then
  (cd "$FIXTURE" && node --test "$check") 2>&1 | tail -4
else
  (cd "$FIXTURE" && node --test) 2>&1 | tail -4
fi

gate=0
node "$KRN" changes check --root "$FIXTURE" --base "$base" --head HEAD --before --strict-recall || gate=$?
echo "integrated_gate_exit=$gate"
echo "integrator records the capsule fixed point at $base..$head"
if [ -n "${CAPSULE:-}" ]; then
  python3 "$BASE/capsule-writeback.py" "$CAPSULE" "$base" "$head" \
    "${EVIDENCE:-worker and integrator gates exit 0 with an executed red->green flip}" \
    "${NEXT:-maintainer: review the fixture outcome}"
  node "$KRN" state check --root "$FIXTURE" | tail -6
fi
[ "$gate" -eq 0 ]
