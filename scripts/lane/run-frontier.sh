#!/usr/bin/env bash
# Frontier-driven lane loop: next -> claim -> envelope lane -> integrator merge
# -> close -> repeat, until the frontier is empty or MAX_RUNS is reached.
set -euo pipefail

ROOT=${ROOT:?usage: ROOT=<repository> [TICKETS=<dir>] run-frontier.sh}
TICKETS=${TICKETS:-$ROOT/.krn/tickets}
MAX_RUNS=${MAX_RUNS:-3}
KRN=${KRN:-$(command -v krn 2>/dev/null || echo "$ROOT/scripts/krn.mjs")}
LANE=${LANE:-$(dirname "$0")/run-ticket.sh}
PUBLISH_GATE=${PUBLISH_GATE:-}
WORKER_NAME=${WORKER_NAME:-krn-frontier}
KRN_INTENT_ID=${KRN_INTENT_ID:-}
KRN_INTENT_REVISION=${KRN_INTENT_REVISION:-}
LOG_DIR=${LOG_DIR:-$ROOT/.krn/runs/lane-frontier}
mkdir -p "$LOG_DIR"

integrate_active_task() {
  local id=$1 branch=$2 worker_head=$3 worker=$4 epoch=$5
  local intent_id=$6 intent_revision=$7
  local task_env task_fields check_command effect_ref target_before declared_base tree candidate nonce candidate_worktree operation_file operation_id message current_revision
  local check_status=0 completed_status

  if [ -z "$intent_id" ] || ! [[ "$intent_revision" =~ ^[1-9][0-9]*$ ]]; then
    echo "active task integration requires a current outcome ID and stored positive intent revision" >&2
    return 1
  fi
  task_env=$(node "$KRN" ticket env --root "$ROOT" --id "$id")
  eval "$task_env"
  if [ -z "${DECIDING_CHECK:-}" ] || [ -z "${CONTRACT_REF:-}" ] || [ -z "${CONTRACT_DIR:-}" ]; then
    echo "active task is missing its typed deciding check or change contract: $id" >&2
    return 1
  fi
  task_fields=$(node "$KRN" ticket fields --root "$ROOT" --id "$id" --json)
  check_command=$(printf '%s' "$task_fields" | python3 -c 'import json,sys;x=json.load(sys.stdin);print(x.get("Deciding check", ""))')
  if [ -z "$check_command" ]; then
    echo "active task has no raw typed deciding check: $id" >&2
    return 1
  fi

  effect_ref=$(git -C "$ROOT" symbolic-ref --quiet HEAD) || {
    echo "active task integration requires an attached target branch" >&2
    return 1
  }
  target_before=$(git -C "$ROOT" rev-parse --verify "$effect_ref")
  declared_base=$(git -C "$ROOT" rev-parse --verify "${BASE_REF}^{commit}") || {
    echo "active task Repository-base cannot be resolved: ${BASE_REF:-empty}" >&2
    return 1
  }
  if [ "$target_before" != "$declared_base" ]; then
    echo "integrator target $effect_ref is $target_before, but the task lane used base $declared_base" >&2
    return 1
  fi
  tree=$(git -C "$ROOT" merge-tree --write-tree "$target_before" "$worker_head") || {
    echo "cannot construct merge candidate for $branch" >&2
    return 1
  }
  message=$(printf 'merge: integrate %s\n\nTicket: %s\nChange-contract: %s:%s' "$branch" "$id" "$CONTRACT_REF" "$CONTRACT_DIR")
  candidate=$(printf '%s\n' "$message" | GIT_AUTHOR_NAME='KRN integrator' GIT_AUTHOR_EMAIL='krn-integrator@localhost' \
    GIT_COMMITTER_NAME='KRN integrator' GIT_COMMITTER_EMAIL='krn-integrator@localhost' \
    git -C "$ROOT" commit-tree "$tree" -p "$target_before" -p "$worker_head")

  nonce=$(openssl rand -hex 8)
  candidate_worktree="$ROOT/.krn/runs/lane-frontier/$nonce-candidate"
  operation_file="$ROOT/.krn/runs/lane-frontier/$nonce-operation.json"
  operation_id="integrate:$id:$epoch"
  git -C "$ROOT" worktree add --quiet --detach "$candidate_worktree" "$candidate"
  if WORK_ROOT="$candidate_worktree" "$LANE" classify "$check_command"; then
    check_status=0
  else
    check_status=$?
  fi
  if [ "$check_status" -ne 0 ]; then
    echo "integrated deciding check failed on candidate $candidate (exit=$check_status)" >&2
    return 1
  fi
  if ! node "$KRN" changes check --root "$candidate_worktree" --base "$target_before" --head "$candidate" --before --strict-recall; then
    echo "integrated change-contract check failed on candidate $candidate" >&2
    return 1
  fi

python3 - "$operation_file" "$operation_id" "$id" "$intent_id" "$intent_revision" "$effect_ref" "$candidate" "$check_command" "$target_before" <<'PY'
import json, sys
file, operation_id, task_id, intent, revision, effect_ref, candidate, command, expected_effect = sys.argv[1:]
revision = int(revision)
with open(file, "w", encoding="utf-8") as handle:
    json.dump({
        "id": operation_id,
        "taskId": task_id,
        "intent": intent,
        "intentRevision": revision,
        "effectRef": effect_ref,
        "effectObject": candidate,
        "expectedEffectValue": expected_effect,
        "candidateIdentity": candidate,
        "checkResult": {"candidateIdentity": candidate, "command": command, "exitCode": 0},
        "params": {"target": candidate, "intentRevision": revision, "expectedEffectValue": expected_effect},
    }, handle)
PY
  node "$KRN" ticket operation prepare --root "$ROOT" --file "$operation_file" --json >/dev/null
  completed_status=$(node "$KRN" ticket operation apply --root "$ROOT" --id "$operation_id" \
    --worker "$worker" --expected-epoch "$epoch" --json | python3 -c 'import json,sys;print(json.load(sys.stdin).get("status", ""))')
  if [ "$completed_status" != "observed" ]; then
    echo "operation $operation_id application is $completed_status; task remains open for recovery" >&2
    return 1
  fi
  if [ "$(git -C "$ROOT" rev-parse --verify "$effect_ref")" != "$candidate" ]; then
    echo "operation $operation_id atomic readback did not match candidate $candidate" >&2
    return 1
  fi
  git -C "$ROOT" worktree remove --force "$candidate_worktree"
  rm -f "$operation_file"
  echo "closed=$id sha=$candidate operation=$operation_id"
}

for iteration in $(seq 1 "$MAX_RUNS"); do
  claim_worker=""
  claim_epoch=""
  claim_intent_id=""
  claim_intent_revision=""
  next_json=$(node "$KRN" ticket next --root "$ROOT" --path "$TICKETS" --json)
  id=$(printf '%s' "$next_json" | python3 -c 'import json,sys;print((json.load(sys.stdin).get("frontier") or [""])[0])')
  if [ -z "$id" ]; then
    echo "iteration=$iteration frontier=empty"
    break
  fi
  echo "iteration=$iteration pick=$id"
  lane_log="$LOG_DIR/${id}-${iteration}.log"
  probe_error="$LOG_DIR/${id}-${iteration}.task-view.err"
  if node "$KRN" ticket show --root "$ROOT" --id "$id" --json 2>"$probe_error" >/dev/null; then
    claim_intent_id=$KRN_INTENT_ID
    if [ -z "$claim_intent_id" ]; then
      echo "active task queue requires KRN_INTENT_ID from the current authority owner" >&2
      exit 1
    fi
    claim_intent_revision=$(node "$KRN" ticket intent get --root "$ROOT" --intent "$claim_intent_id" --json \
      | python3 -c 'import json,sys;print(json.load(sys.stdin).get("revision", 0))')
    if ! [[ "$claim_intent_revision" =~ ^[1-9][0-9]*$ ]]; then
      echo "active outcome $claim_intent_id has no stored positive intent revision" >&2
      exit 1
    fi
    if [ -n "$KRN_INTENT_REVISION" ] && [ "$KRN_INTENT_REVISION" != "$claim_intent_revision" ]; then
      echo "provided intent revision is stale: expected $KRN_INTENT_REVISION, found $claim_intent_revision" >&2
      exit 1
    fi
    claim_json=$(node "$KRN" ticket claim --root "$ROOT" --id "$id" --worker "$WORKER_NAME" --json)
    claim_identity=$(printf '%s' "$claim_json" | python3 -c 'import json,sys;x=json.load(sys.stdin);print(x.get("owner","")+"\t"+str(x.get("epoch", "")))')
    claim_worker=${claim_identity%%$'\t'*}
    claim_epoch=${claim_identity#*$'\t'}
    if [ "$claim_worker" != "$WORKER_NAME" ] || ! [[ "$claim_epoch" =~ ^[1-9][0-9]*$ ]]; then
      echo "active task claim did not return its owner and generation: $id" >&2
      exit 1
    fi
    FIXTURE="$ROOT" KRN_TASK_ID="$id" KRN_CLAIM_WORKER="$claim_worker" KRN_CLAIM_EPOCH="$claim_epoch" "$LANE" run >"$lane_log" 2>&1
  else
    if ! grep -Fq "Git-ref task queue is not active; Markdown remains authoritative" "$probe_error"; then
      cat "$probe_error" >&2
      exit 1
    fi
    claim_json=$(node "$KRN" ticket claim --root "$ROOT" --path "$TICKETS" --id "$id" --worker "$WORKER_NAME" --json)
    file=$(printf '%s' "$claim_json" | python3 -c 'import json,sys;print(json.load(sys.stdin)["path"])')
    FIXTURE="$ROOT" TICKET="$file" "$LANE" run >"$lane_log" 2>&1
  fi
  branch=$(grep -oE 'branch=[^ ]+' "$lane_log" | head -1 | cut -d= -f2)
  sha=$(git -C "$ROOT" rev-parse "$branch")

  if [ -z "$PUBLISH_GATE" ]; then
    echo "publication gate required: set PUBLISH_GATE to the command that verifies a green PR at the branch fixed point; refusing to merge $branch" >&2
    exit 1
  fi
  if ! "$PUBLISH_GATE" "$branch"; then
    echo "publication gate failed for $branch; refusing to merge and close" >&2
    exit 1
  fi

  if [ -n "$claim_worker" ]; then
    integrate_active_task "$id" "$branch" "$sha" "$claim_worker" "$claim_epoch" "$claim_intent_id" "$claim_intent_revision"
  else
    git -C "$ROOT" -c user.email=frontier@lab.invalid -c user.name=frontier merge --no-ff "$branch" -m "merge: integrate $id" >/dev/null
    node "$KRN" ticket close --root "$ROOT" --path "$TICKETS" --id "$id" --head "$sha" \
      --evidence "lane branch $branch merged as $sha; worker gate green" \
      --resolution "frontier loop (stub proof)" >/dev/null
    echo "closed=$id sha=$sha"
  fi
done

node "$KRN" ticket check --root "$ROOT" --path "$TICKETS"
