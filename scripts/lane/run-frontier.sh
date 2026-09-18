#!/usr/bin/env bash
# Frontier-driven lane loop: next -> claim -> envelope lane -> integrator merge
# -> close -> repeat, until the frontier is empty or MAX_RUNS is reached.
set -euo pipefail

ROOT=${ROOT:?usage: ROOT=<repository> [TICKETS=<dir>] run-frontier.sh}
TICKETS=${TICKETS:-$ROOT/.scratch/tickets}
MAX_RUNS=${MAX_RUNS:-3}
KRN=${KRN:-$(command -v krn 2>/dev/null || echo "$ROOT/scripts/krn.mjs")}
LANE=${LANE:-$(dirname "$0")/run-ticket.sh}
WORKER_NAME=${WORKER_NAME:-krn-frontier}
LOG_DIR=${LOG_DIR:-$ROOT/../runs-frontier}
mkdir -p "$LOG_DIR"

for iteration in $(seq 1 "$MAX_RUNS"); do
  id=$(node "$KRN" ticket next --root "$ROOT" --path "$TICKETS" 2>/dev/null | head -1 || true)
  if [ -z "$id" ]; then
    echo "iteration=$iteration frontier=empty"
    break
  fi
  echo "iteration=$iteration pick=$id"
  claim_json=$(node "$KRN" ticket claim --root "$ROOT" --path "$TICKETS" --id "$id" --worker "$WORKER_NAME" --json)
  file=$(printf '%s' "$claim_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["path"])')

  lane_log="$LOG_DIR/${id}-${iteration}.log"
  FIXTURE="$ROOT" TICKET="$file" "$LANE" run >"$lane_log" 2>&1
  branch=$(grep -oE 'branch=[^ ]+' "$lane_log" | head -1 | cut -d= -f2)
  sha=$(git -C "$ROOT" rev-parse "$branch")

  git -C "$ROOT" -c user.email=frontier@lab.invalid -c user.name=frontier merge --no-ff "$branch" -m "merge: integrate $id" >/dev/null
  node "$KRN" ticket close --root "$ROOT" --path "$TICKETS" --id "$id" \
    --evidence "lane branch $branch merged as $sha; worker gate green" \
    --resolution "frontier loop (stub proof)" >/dev/null
  echo "closed=$id sha=$sha"
done

node "$KRN" ticket check --root "$ROOT" --path "$TICKETS"
