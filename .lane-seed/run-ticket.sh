#!/usr/bin/env bash
# LT-7 AFK worktree lane runner (outside the repo, ephemeral).
# mode: probe | run. One ticket, one fresh worker session, one isolated worktree.
# WORKER=codex (default) or WORKER=opencode. The worker never writes the
# capsule, the lessons page, or the tracker; the host-side integrator
# (integrate.sh) merges and gates the merged fixed point.
set -euo pipefail

BASE=${BASE:-/mnt/storage/coding/krn/lab/lt7}
FIXTURE=${FIXTURE:-$BASE/fixture}
BASE_REF=${BASE_REF:-main}
KRN=${KRN:-/home/krn/.codex/krn/current/scripts/krn.mjs}
BWRAP=${BWRAP:-/home/krn/.local/share/krn-tools/bwrap-0.12.0/bwrap}
WORKER_ENV=${WORKER:-}
WORKER=${WORKER:-codex}
TICKET=${TICKET:-$FIXTURE/.scratch/lt7/01-version-coupling.md}
CHANGED=${CHANGED:-src/greeting.mjs}
DECIDING_CHECK=${DECIDING_CHECK:-test/coupling.test.mjs}

# Ticket ABI: when the ticket carries a <krn-ticket> block, its fields drive the
# lane and the environment variables become fallbacks for legacy tickets.
ticket_abi=no
TICKET_ID=""
CONTRACT_REF=""
CONTRACT_DIR=""
if [ -f "$TICKET" ] && rg -q "<krn-ticket>" "$TICKET" 2>/dev/null; then
  ticket_abi=yes
  parsed=$(python3 - "$TICKET" <<'PY'
import re, shlex, sys

text = open(sys.argv[1], encoding="utf-8").read()
block = text.split("<krn-ticket>", 1)[1].split("</krn-ticket>", 1)[0]
fields = {}
for line in block.split("\n"):
    match = re.match(r"^([A-Za-z][A-Za-z ()-]*):\s*(.*)$", line.strip())
    if match:
        fields[match.group(1)] = match.group(2).strip()

for key, name in (("Repository-base", "BASE_REF"), ("Scope", "CHANGED"), ("Id", "TICKET_ID")):
    if fields.get(key):
        print(f"{name}={shlex.quote(fields[key])}")
if fields.get("Deciding check"):
    check = re.sub(r"^node --test\s+", "", fields["Deciding check"]).strip()
    print(f"DECIDING_CHECK={shlex.quote(check)}")
if fields.get("Contract") and ":" in fields["Contract"]:
    ref, direction = fields["Contract"].rsplit(":", 1)
    print(f"CONTRACT_REF={shlex.quote(ref.strip())}")
    print(f"CONTRACT_DIR={shlex.quote(direction.strip())}")
if fields.get("Execution"):
    agent = re.search(r"agent=([A-Za-z]+)", fields["Execution"])
    if agent:
        print(f"TICKET_AGENT={shlex.quote(agent.group(1))}")
PY
)
  eval "$parsed"
  if [ -n "${TICKET_AGENT:-}" ] && [ -z "$WORKER_ENV" ]; then
    WORKER=$TICKET_AGENT
  fi
fi
contract_ref=${CONTRACT_REF:-$DECIDING_CHECK}
contract_dir=${CONTRACT_DIR:-red->green}
ticket_trailer=""
if [ -n "$TICKET_ID" ]; then ticket_trailer="  Ticket: $TICKET_ID
"; fi

# Transport pins and authorized models. Only explicitly authorized models run.
CODEX_HOME_HOST=${CODEX_HOME_HOST:-/home/krn/.codex}
CODEX_PKG_HOST=${CODEX_PKG_HOST:-/home/krn/.local/share/mise/installs/node/26.2.0/lib/node_modules/@openai/codex}
CODEX_JS=/mise/installs/node/26.2.0/lib/node_modules/@openai/codex/bin/codex.js
CODEX_VERSION=${CODEX_VERSION:-0.154.0}
CODEX_INTEGRITY=${CODEX_INTEGRITY:-sha512-FV/x1OHXYv/ifjf3mXj9ThTTAWcUZN6cGIRQRhRxkKNOPuImu1WW0c8ev1vUkE9XGH90dEnYG1tBjIkxRikg0w==}
OPENCODE_HOME=${OPENCODE_HOME:-/home/krn/.opencode}
OPENCODE_AUTH=${OPENCODE_AUTH:-/home/krn/.local/share/opencode/auth.json}

case "$WORKER" in
  codex)
    MODEL=${MODEL:-gpt-5.6-luna}
    ALLOWED_MODELS=${ALLOWED_MODELS:-gpt-5.6-luna}
    ;;
  opencode)
    MODEL=${MODEL:-opencode-go/deepseek-v4.1-flash}
    ALLOWED_MODELS=${ALLOWED_MODELS:-opencode-go/deepseek-v4.1-flash}
    ;;
  stub)
    # Deterministic test double for the runner mechanics only; it never calls a
    # model. Phase "first" applies the work uncommitted, "recovery" commits it.
    MODEL=${MODEL:-stub}
    ALLOWED_MODELS=${ALLOWED_MODELS:-stub}
    ;;
  *)
    echo "unsupported worker transport: '$WORKER' (use codex, opencode, or the stub double)" >&2
    exit 64
    ;;
esac
case " $ALLOWED_MODELS " in
  *" $MODEL "*) ;;
  *) echo "model '$MODEL' is not authorized on this lane (allowed: $ALLOWED_MODELS)" >&2; exit 64 ;;
esac

if [ "$WORKER" = "codex" ]; then
  have=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('version',''))" "$CODEX_PKG_HOST/package.json" 2>/dev/null || echo "")
  if [ "$have" != "$CODEX_VERSION" ]; then
    echo "codex $CODEX_VERSION required (have '${have:-none}'); reinstall the pinned package" >&2
    exit 65
  fi
elif [ "$WORKER" = "opencode" ]; then
  if [ ! -x "$OPENCODE_HOME/bin/opencode" ]; then
    echo "opencode binary missing at $OPENCODE_HOME/bin/opencode" >&2
    exit 65
  fi
  opencode_version=$("$OPENCODE_HOME/bin/opencode" --version 2>/dev/null || echo missing)
  echo "opencode_version=$opencode_version"
else
  STUB_SCRIPT=${STUB_SCRIPT:-$BASE/stubs/commit-on-recovery.sh}
  if [ ! -f "$STUB_SCRIPT" ]; then
    echo "stub script missing at $STUB_SCRIPT" >&2
    exit 65
  fi
fi

bwrap_version=$("$BWRAP" --version 2>/dev/null | awk '{print $NF}')
if [ "$(printf '%s\n0.12.0\n' "$bwrap_version" | sort -V | head -1)" != "0.12.0" ]; then
  echo "bwrap >= 0.12.0 required (have '${bwrap_version:-none}')" >&2
  exit 66
fi
mode_bits=$(stat -c '%a' "$BWRAP")
if [ "${mode_bits:0:1}" = "4" ]; then
  echo "setuid bwrap refused (CVE-2026-41163 class); use a non-setuid build" >&2
  exit 66
fi

mode=${1:-probe}   # probe | run
nonce=$(openssl rand -hex 6)
base=$(git -C "$FIXTURE" rev-parse "$BASE_REF")
wt="$BASE/wt-live-$nonce"
branch="ticket/live-$nonce"
run="$BASE/runs-live/$nonce"
mkdir -p "$run/home/.cache" "$run/home/.state" "$run/out"
if [ "$WORKER" = "codex" ]; then
  mkdir -p "$run/share/codex"
  cp "$CODEX_HOME_HOST/auth.json" "$run/share/codex/auth.json"
  chmod 600 "$run/share/codex/auth.json"
  HOOKS=${HOOKS:-0}
  HOOK_SRC=${HOOK_SRC:-/home/krn/.codex/krn/current/scripts/hooks/krn_memory.py}
  if [ "$HOOKS" = "1" ]; then
    mkdir -p "$run/share/codex/hooks"
    cp "$HOOK_SRC" "$run/share/codex/hooks/krn_memory.py"
    cat >"$run/share/codex/hooks.json" <<'JSON'
{ "hooks": { "SessionStart": [ { "matcher": "", "hooks": [ { "type": "command", "command": "python3 /share/codex/hooks/krn_memory.py", "timeout": 10 } ] } ], "PreCompact": [ { "matcher": "", "hooks": [ { "type": "command", "command": "python3 /share/codex/hooks/krn_memory.py", "timeout": 10 } ] } ] } }
JSON
  fi
else
  mkdir -p "$run/share/opencode" "$run/config"
  cp "$OPENCODE_AUTH" "$run/share/opencode/auth.json"
  chmod 600 "$run/share/opencode/auth.json"
fi
sentinel=$(openssl rand -hex 16)
echo "$sentinel" >"$run/sentinel.txt"
git -C "$FIXTURE" worktree add -q "$wt" -b "$branch" "$BASE_REF"

# Ignored run state does not cross into a worktree, so a hook-seeded worker
# needs the active capsule forwarded or the memory layer is invisible to it.
if [ "$WORKER" = "codex" ] && [ "${HOOKS:-0}" = "1" ] && [ -d "$FIXTURE/.krn/runs/delivery-loop" ]; then
  mkdir -p "$wt/.krn/runs"
  cp -a "$FIXTURE/.krn/runs/delivery-loop" "$wt/.krn/runs/"
fi

# The lane requires a red task: if the deciding check already passes at the cut
# base, a worker can only manufacture a diff to satisfy the commit rule, which is
# what `before-state-not-red` caught on 2026-09-16. Show it failing first.
if (cd "$wt" && node --test "$DECIDING_CHECK" >/dev/null 2>&1); then
  echo "preflight: deciding check '$DECIDING_CHECK' already passes at the cut base; the lane requires a red task" >&2
  git -C "$FIXTURE" worktree remove --force "$wt"
  git -C "$FIXTURE" branch -D "$branch" >/dev/null 2>&1 || true
  exit 69
fi

recall=$(node "$KRN" memory recall --root "$FIXTURE" --changed "$CHANGED" 2>/dev/null || echo 'no recalled lessons')
# Derive the exact trailer lines per recalled lesson from the JSON contract.
# Gate cells are prose with embedded backticks (the churn lesson names
# `Change-contract:` and `npm run changes:check`), so a naive regex misses
# them; every backticked token and the falsifier file become Recall targets.
recall_json=$(node "$KRN" memory recall --root "$FIXTURE" --changed "$CHANGED" --json 2>/dev/null || echo '{"hits":[]}')
recall_trailers=$(python3 - "$recall_json" "$CHANGED" <<'PY'
import json, re, sys
data = json.loads(sys.argv[1]); changed = sys.argv[2]
lines, at_risk, seen = [], [], set()
for hit in data.get("hits", []):
    tokens = re.findall(r"`([^`]+)`", hit.get("gate") or "")
    falsifier = re.search(r"(test/[^:@\s]+\.mjs)", hit.get("falsifier") or "")
    if falsifier:
        tokens.append(falsifier.group(1))
    for token in tokens:
        token = re.sub(r"^(npm run|node)\s+", "", token.strip())
        token = re.sub(r"^--test\s+", "", token).strip()
        if not token or token in seen:
            continue
        seen.add(token)
        lines.append(f"  Recall: {token} => {changed}")
        if token.startswith("test/") and token.endswith(".mjs"):
            at_risk.append(token)
print("\n".join(lines))
print("__AT__" + " ".join(sorted(set(at_risk))))
PY
)
recall_lines=$(printf '%s\n' "$recall_trailers" | sed '/^__AT__/d')
at_risk=$(printf '%s\n' "$recall_trailers" | sed -n 's/^__AT__//p')
if [ -n "$at_risk" ]; then
  trailers="${ticket_trailer}  Change-contract: $contract_ref:$contract_dir
$recall_lines
  At-risk: $at_risk"
elif [ -n "$recall_lines" ]; then
  trailers="${ticket_trailer}  Change-contract: $contract_ref:$contract_dir
$recall_lines"
else
  trailers="${ticket_trailer}  Change-contract: $contract_ref:$contract_dir"
fi
cat >"$run/PROMPT.txt" <<EOF
You are one AFK worker on one ticket, working only inside the current directory (branch $branch).
Ticket:
$(cat "$TICKET")

Harness-evaluated lesson recall for $CHANGED:
$recall

Rules:
- The deciding check is: node --test $DECIDING_CHECK (red at base; make it green).
- Commit exactly once with a Conventional Commit subject, then these body lines:
$trailers
- Do not push. Do not modify docs/research/workflow-lessons.md or .krn/.
- Print the commit SHA and the check result in your final message.
EOF

common=(
  --die-with-parent --dev /dev --proc /proc
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64
  --ro-bind /etc /etc --ro-bind /run /run --tmpfs /run/user --ro-bind /sys /sys
  --ro-bind /home/krn/.local/share/mise /mise
  --bind "$BASE" "$BASE"
  --bind "$run/share" /share
  --bind "$run/home" /home/krn
  --tmpfs /tmp --chdir "$wt"
  --setenv HOME /home/krn
  --setenv XDG_CACHE_HOME /home/krn/.cache
  --setenv XDG_STATE_HOME /home/krn/.state
)
identity=(
  --setenv GIT_AUTHOR_NAME "LT-7 worker" --setenv GIT_AUTHOR_EMAIL "lt7@lab.invalid"
  --setenv GIT_COMMITTER_NAME "LT-7 worker" --setenv GIT_COMMITTER_EMAIL "lt7@lab.invalid"
)
git_common=$(git -C "$FIXTURE" rev-parse --path-format=absolute --git-common-dir)
common+=( --bind "$git_common" "$git_common" )
if [ "$WORKER" = "codex" ]; then
  BASE_PATH="/mise/installs/node/26.2.0/bin:/mise/shims:/usr/bin:/bin"
  common+=(
    --setenv CODEX_HOME /share/codex
    --setenv PATH "$BASE_PATH"
  )
else
  BASE_PATH="/opencode/bin:/mise/installs/node/26.2.0/bin:/mise/shims:/usr/bin:/bin"
  common+=(
    --ro-bind "$OPENCODE_HOME" /opencode
    --bind "$run/config" /config
    --unsetenv DBUS_SESSION_BUS_ADDRESS
    --unsetenv XDG_RUNTIME_DIR
    --setenv XDG_DATA_HOME /share
    --setenv XDG_CONFIG_HOME /config
    --setenv PATH "$BASE_PATH"
  )
fi

echo "run=$run"
echo "worker=$WORKER"
echo "worktree=$wt"
echo "branch=$branch"
echo "base=$base"
echo "ticket_abi=$ticket_abi"
if [ -n "$TICKET_ID" ]; then echo "ticket_id=$TICKET_ID"; fi
[ "$WORKER" = "codex" ] && echo "codex_pin=$CODEX_VERSION $CODEX_INTEGRITY"

probe() {
  "$BWRAP" "${common[@]}" -- /usr/bin/sh -c '
    printf "lab="; test -d "$0" && echo visible || echo hidden
    printf "hosthome="; test ! -e /home/krn/.codex && test ! -e /home/krn/.local/share/opencode && echo hidden || echo VISIBLE
    printf "write="; ( : > /etc/lt7-canary ) 2>/dev/null && echo WROTE || echo denied
    printf "auth="; test -f /share/'"$WORKER"'/auth.json && echo seeded || echo missing
    printf "git="; git --version 2>/dev/null | awk "{print \$NF}" || echo missing
    printf "whoami="; id -u
  ' "$BASE"
}

if [ "$mode" = "probe" ]; then
  probe
  exit 0
fi

preflight=$(probe)
printf '%s\n' "$preflight" | sed 's/^/probe /'
if printf '%s' "$preflight" | rg -q '=(VISIBLE|WROTE)'; then
  echo "isolation preflight failed" >&2
  exit 67
fi

invoke_worker() {  # $1 prompt file, $2 events path, $3 stderr path
  local prompt_file=$1 events=$2 errlog=$3
  local env_args=("${identity[@]}")
  env_args+=( ${SESSION_EXTRA[@]+"${SESSION_EXTRA[@]}"} )
  if [ "$WORKER" = "stub" ]; then
    "$BWRAP" "${common[@]}" ${env_args[@]+"${env_args[@]}"} -- /usr/bin/sh "$STUB_SCRIPT" "${WORKER_PHASE:-first}" "$wt" "$prompt_file" \
      >"$events" 2>"$errlog"
  elif [ "$WORKER" = "codex" ]; then
    "$BWRAP" "${common[@]}" ${env_args[@]+"${env_args[@]}"} -- node "$CODEX_JS" exec -C "$wt" --skip-git-repo-check \
      --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust -m "$MODEL" --json "$(cat "$prompt_file")" \
      >"$events" 2>"$errlog"
  else
    "$BWRAP" "${common[@]}" ${env_args[@]+"${env_args[@]}"} -- /opencode/bin/opencode run --model "$MODEL" --format json --dir "$wt" \
      "$(cat "$prompt_file")" \
      >"$events" 2>"$errlog"
  fi
}

# PRESESSION_NO_IDENTITY=1 withholds the git identity from the first session so
# its commit deterministically fails; the recovery session always has identity.
# This is a lab hook for proving the recovery path without relying on a worker
# obeying a "do not commit" instruction.
# PRESESSION_NO_COMMIT=1 is a lab double for the observed worker behaviour of
# ending without a commit: a git shim on PATH makes `git commit` fail in the
# first session only, so the recovery path is exercised deterministically.
SESSION_EXTRA=()
if [ "${PRESESSION_NO_COMMIT:-0}" = "1" ]; then
  mkdir -p "$run/bin"
  cat >"$run/bin/git" <<'SHIM'
#!/bin/sh
case "$1" in
  commit) echo "krn lab: commit is disabled in this session" >&2; exit 1 ;;
esac
exec /usr/bin/git "$@"
SHIM
  chmod +x "$run/bin/git"
  SESSION_EXTRA=( --setenv PATH "$run/bin:$BASE_PATH" )
fi
start=$(date +%s)
status=0
invoke_worker "$run/PROMPT.txt" "$run/out/events.jsonl" "$run/out/stderr.log" || status=$?
end=$(date +%s)
echo "worker_exit=$status"
echo "model=$MODEL"
echo "wall_seconds=$((end - start))"

# Commit verification: a worker that finishes without committing gets one
# bounded recovery session in the same worktree (observed twice on the larger
# refactor tickets, 2026-09-16), so the lane never silently hands off work.
commit_recovery=not-needed
recovery_diff=not-applicable
recovery_seconds=na
if [ "$status" -eq 0 ] && [ "$(git -C "$wt" rev-parse HEAD)" = "$base" ] && [ -z "$(git -C "$wt" status --porcelain)" ]; then
  # Nothing uncommitted and no commit: the session produced no work at all.
  commit_recovery=skipped-clean
fi
if [ "$status" -eq 0 ] && [ "$(git -C "$wt" rev-parse HEAD)" = "$base" ] && [ -n "$(git -C "$wt" status --porcelain)" ]; then
  # Snapshot the uncommitted work as a dangling tree (stash create leaves the
  # working tree untouched), so the recovery commit can be compared 1:1.
  presession=""
  git -C "$wt" add -A >/dev/null 2>&1 || true
  presession=$(git -C "$wt" stash create 2>/dev/null || true)
  git -C "$wt" reset -q >/dev/null 2>&1 || true
  SESSION_EXTRA=()
  cat >"$run/RECOVERY_PROMPT.txt" <<EOF
Your previous session completed work in this repository but did not commit it.
Commit the existing changes now, exactly once, with a Conventional Commit
subject and these body lines:
$trailers
Do not change the work; do not push. Print the commit SHA.
EOF
  commit_recovery=attempted
  rstart=$(date +%s)
  rstatus=0
  WORKER_PHASE=recovery invoke_worker "$run/RECOVERY_PROMPT.txt" "$run/out/recovery-events.jsonl" "$run/out/recovery-stderr.log" || rstatus=$?
  rend=$(date +%s)
  recovery_seconds=$((rend - rstart))
  if [ "$(git -C "$wt" rev-parse HEAD)" != "$base" ]; then
    commit_recovery=succeeded
    if [ -n "$presession" ]; then
      if git -C "$wt" diff --quiet "$presession" HEAD; then recovery_diff=match; else recovery_diff=changed; fi
    fi
  else
    commit_recovery=failed
  fi
fi
echo "commit_recovery=$commit_recovery"
echo "recovery_diff=$recovery_diff"
echo "recovery_seconds=$recovery_seconds"

leak=no
if rg -q "$sentinel" "$run/out/events.jsonl" 2>/dev/null; then leak=YES; fi
echo "sentinel_leak=$leak"
if [ "$WORKER" = "codex" ]; then
  rollout=$(ls -t "$run/share/codex/sessions"/*/*/*/rollout-*.jsonl 2>/dev/null | head -1 || true)
  served_model=$(rg -o '"model":"[^"]+"' "$rollout" 2>/dev/null | tail -1 | sed 's/.*:"//; s/"$//' || true)
else
  served=$(rg -o 'providerID=[^ ]+ modelID=[^ ]+' "$run/share/opencode/log/opencode.log" 2>/dev/null | tail -1 || true)
  served_provider=${served#providerID=}; served_provider=${served_provider%% *}
  served_model=${served##*modelID=}
  # Compare the full provider/model identity, then report it in the same shape.
  if [ -n "$served_model" ]; then
    served_model="$served_provider/$served_model"
  fi
fi
echo "served_model=$served_model"
mismatch=no
if [ -n "$served_model" ] && [ "$served_model" != "$MODEL" ]; then mismatch=YES; fi
echo "model_mismatch=$mismatch"
capsule_seen=no
if [ "$WORKER" = "codex" ] && [ "${HOOKS:-0}" = "1" ] && rg -q "delivery-loop/lt7-demo" "$run/share/codex/sessions" 2>/dev/null; then capsule_seen=YES; fi
echo "hooks=${HOOKS:-0}"
echo "capsule_seen=$capsule_seen"

echo "--- worker tree ---"
git -C "$wt" log --oneline -2 || true
git -C "$wt" status --short || true
echo "--- worker-side gate (host-executed) ---"
gate=0
node "$KRN" changes check --root "$wt" --base "$base" --head HEAD --before --strict-recall || gate=$?
echo "worker_gate_exit=$gate"
echo "run_dir=$run"

[ "$status" -eq 0 ] && [ "$leak" = "no" ] && [ "$mismatch" = "no" ] && [ "$gate" -eq 0 ]
