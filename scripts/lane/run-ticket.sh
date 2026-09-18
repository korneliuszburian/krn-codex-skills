#!/usr/bin/env bash
# In-repo AFK lane runner (admitted from the LT-7 lab by sh-62).
# Modes: probe | run | classify | probe-verdict | bwrap-args.
# One ticket, one fresh worker session, one isolated clone. The worker never
# writes the capsule, the lessons page, or the tracker; the host-side
# integrator (integrate.sh) merges and gates the merged fixed point.
set -euo pipefail

BASE=${BASE:-$PWD}
FIXTURE=${FIXTURE:-$BASE}
BASE_REF=${BASE_REF:-main}
KRN=${KRN:-$(command -v krn 2>/dev/null || echo "$FIXTURE/scripts/krn.mjs")}
BWRAP=${BWRAP:-$(command -v bwrap 2>/dev/null || echo bwrap)}
WORKER_ENV=${WORKER:-}
WORKER=${WORKER:-codex}
TICKET=${TICKET:-}
CHANGED=${CHANGED:-}
DECIDING_CHECK=${DECIDING_CHECK:-}
WORK_ROOT=${WORK_ROOT:-$FIXTURE}
WORKER_HOME=${WORKER_HOME:-/home/worker}
GIT_COMMON=${GIT_COMMON:-}
MISE_ROOT=${MISE_ROOT:-}
RUN_DIR=${RUN_DIR:-}
WT=${WT:-}
OPENCODE_HOME=${OPENCODE_HOME:-${HOME:-/root}/.opencode}
OPENCODE_AUTH=${OPENCODE_AUTH:-${HOME:-/root}/.local/share/opencode/auth.json}
CODEX_HOME_HOST=${CODEX_HOME_HOST:-${HOME:-/root}/.codex}
CODEX_PKG_HOST=${CODEX_PKG_HOST:-}
CODEX_JS=${CODEX_JS:-${CODEX_PKG_HOST:+$CODEX_PKG_HOST/bin/codex.js}}
CODEX_VERSION=${CODEX_VERSION:-}
CODEX_INTEGRITY=${CODEX_INTEGRITY:-}
STUB_SCRIPT=${STUB_SCRIPT:-}

trim() { printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'; }

tool_path() {
  local dirs="" tool path
  for tool in node npm npx git python3 openssl; do
    path=$(command -v "$tool" 2>/dev/null || true)
    [ -n "$path" ] && dirs="${dirs:+$dirs:}$(dirname "$path")"
  done
  if [ -n "$MISE_ROOT" ]; then dirs="$MISE_ROOT/shims:$dirs"; fi
  printf '%s' "${dirs:-/usr/bin:/bin}"
}

resolve_git_common() {
  if [ -n "$GIT_COMMON" ]; then printf '%s' "$GIT_COMMON"; return 0; fi
  git -C "$FIXTURE" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || printf '%s' "$FIXTURE/.git"
}

# Classify the declared check before a lane starts. A lane needs a real assertion
# failure, never a load/setup error. The declared check decides how it executes:
# an `npm run <script>` goes through npm, a bare path through `node --test`.
# Prints classification=<red|green|refused-setup>; exits 0 green, 1 red, 2 setup.
classify_check() {
  local spec path target out rc=0
  spec=$(trim "${1:-}")
  if [ -z "$spec" ]; then
    echo "classification=refused-setup reason=empty-check"
    return 2
  fi
  if [ "${spec:0:11}" = "node --test" ]; then spec=$(trim "${spec#node --test}"); fi
  case "$spec" in
    "npm run "*|"npm run-script "*)
      local script=${spec#npm run }
      script=${script#npm run-script }
      script=$(trim "$script")
      out=$(cd "$WORK_ROOT" && npm run "$script" 2>&1) && rc=0 || rc=$?
      if printf '%s' "$out" | grep -Eq 'Could not find|Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|SyntaxError'; then
        echo "classification=refused-setup reason=npm-load-error script=$script"
        return 2
      fi
      if [ "$rc" -ne 0 ]; then
        echo "classification=red reason=npm-run-failure exit=$rc"
        return 1
      fi
      echo "classification=green reason=npm-run-passed"
      return 0
      ;;
  esac
  path="$spec"
  if [ -e "$WORK_ROOT/$path" ]; then target="$WORK_ROOT/$path"; elif [ -e "$path" ]; then target="$path"; else
    echo "classification=refused-setup reason=missing-check path=$path"
    return 2
  fi
  out=$(node --test "$target" 2>&1) && rc=0 || rc=$?
  if printf '%s' "$out" | grep -Eq 'Could not find|Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|SyntaxError'; then
    echo "classification=refused-setup reason=load-error path=$path"
    return 2
  fi
  if [ "$rc" -ne 0 ]; then
    echo "classification=red reason=tap-failure exit=$rc"
    return 1
  fi
  echo "classification=green reason=tap-passed"
  return 0
}

# Verdict over the sandbox probe lines. Any host-home visibility, canary or
# fixture write, or shared-ref update means the isolation contract is broken.
probe_verdict() {
  local bad="" line
  while IFS= read -r line; do
    case "$line" in
      *=WROTE*) bad="${bad:+$bad,}write-succeeded" ;;
      *=UPDATED*) bad="${bad:+$bad,}ref-updated" ;;
      *=VISIBLE*) bad="${bad:+$bad,}host-home-visible" ;;
    esac
  done
  if [ -n "$bad" ]; then
    echo "isolation=FAILED reasons=$bad"
    return 1
  fi
  echo "isolation=ok"
  return 0
}

compose_bwrap() {
  local git_common
  git_common=$(resolve_git_common)
  BWRAP_ARGS=(
    --die-with-parent --dev /dev --proc /proc
    --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64
    --ro-bind /etc /etc --ro-bind /run /run --tmpfs /run/user --ro-bind /sys /sys
    --ro-bind "$BASE" "$BASE"
    --ro-bind "$FIXTURE" "$FIXTURE"
    --ro-bind "$git_common" "$git_common"
    --bind "$RUN_DIR" "$RUN_DIR"
    --bind "$WT" "$WT"
    --bind "$RUN_DIR/share" /share
    --bind "$RUN_DIR/home" "$WORKER_HOME"
    --tmpfs /tmp --chdir "$WT"
    --setenv HOME "$WORKER_HOME"
    --setenv XDG_CACHE_HOME "$WORKER_HOME/.cache"
    --setenv XDG_STATE_HOME "$WORKER_HOME/.state"
    --setenv PATH "$(tool_path)"
  )
  if [ -n "$MISE_ROOT" ]; then BWRAP_ARGS+=( --ro-bind "$MISE_ROOT" /mise ); fi
  case "$WORKER" in
    codex) BWRAP_ARGS+=( --setenv CODEX_HOME /share/codex ) ;;
    opencode)
      BWRAP_ARGS+=(
        --ro-bind "$OPENCODE_HOME" /opencode
        --bind "$RUN_DIR/config" /config
        --unsetenv DBUS_SESSION_BUS_ADDRESS --unsetenv XDG_RUNTIME_DIR
        --setenv XDG_DATA_HOME /share --setenv XDG_CONFIG_HOME /config
      )
      ;;
  esac
}

mode=${1:-probe}
case "$mode" in
  classify) shift; classify_check "${1:-}" || exit $?; exit 0 ;;
  probe-verdict) probe_verdict || exit $?; exit 0 ;;
  bwrap-args)
    RUN_DIR=${RUN_DIR:-$BASE/runs-live/print}
    WT=${WT:-$RUN_DIR/wt}
    compose_bwrap
    printf '%s\n' "${BWRAP_ARGS[@]}"
    exit 0
    ;;
esac

# Ticket ABI: when the ticket carries a <krn-ticket> block, its fields drive the
# lane and the environment variables become fallbacks for legacy tickets.
ticket_abi=no
TICKET_ID=""
CONTRACT_REF=""
CONTRACT_DIR=""
if [ -n "$TICKET" ] && [ -f "$TICKET" ] && grep -q "<krn-ticket>" "$TICKET" 2>/dev/null; then
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
  if [ -z "$CODEX_JS" ] || [ ! -f "$CODEX_JS" ]; then
    echo "codex entrypoint missing (set CODEX_JS or CODEX_PKG_HOST)" >&2
    exit 65
  fi
  if [ -n "$CODEX_VERSION" ]; then
    have=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('version',''))" "$(dirname "$(dirname "$CODEX_JS")")/package.json" 2>/dev/null || echo "")
    if [ "$have" != "$CODEX_VERSION" ]; then
      echo "codex $CODEX_VERSION required (have '${have:-none}'); reinstall the pinned package" >&2
      exit 65
    fi
  fi
elif [ "$WORKER" = "opencode" ]; then
  if [ ! -x "$OPENCODE_HOME/bin/opencode" ]; then
    echo "opencode binary missing at $OPENCODE_HOME/bin/opencode" >&2
    exit 65
  fi
  opencode_version=$("$OPENCODE_HOME/bin/opencode" --version 2>/dev/null || echo missing)
  echo "opencode_version=$opencode_version"
else
  if [ -z "$STUB_SCRIPT" ] || [ ! -f "$STUB_SCRIPT" ]; then
    echo "stub script missing (set STUB_SCRIPT)" >&2
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

nonce=$(openssl rand -hex 6)
base=$(git -C "$FIXTURE" rev-parse "$BASE_REF")
branch="ticket/live-$nonce"
RUN_DIR=${RUN_DIR:-$BASE/runs-live/$nonce}
WT=${WT:-$RUN_DIR/wt}
mkdir -p "$RUN_DIR/home/.cache" "$RUN_DIR/home/.state" "$RUN_DIR/out"
if [ "$WORKER" = "codex" ]; then
  mkdir -p "$RUN_DIR/share/codex"
  cp "$CODEX_HOME_HOST/auth.json" "$RUN_DIR/share/codex/auth.json"
  chmod 600 "$RUN_DIR/share/codex/auth.json"
else
  mkdir -p "$RUN_DIR/share/opencode" "$RUN_DIR/config"
  cp "$OPENCODE_AUTH" "$RUN_DIR/share/opencode/auth.json"
  chmod 600 "$RUN_DIR/share/opencode/auth.json"
fi
sentinel=$(openssl rand -hex 16)
echo "$sentinel" >"$RUN_DIR/sentinel.txt"

# The worker commits inside a private clone, so the fixture and its shared git
# common directory stay read-only; the host fetches the branch back below.
git clone --quiet --no-hardlinks --no-checkout "$FIXTURE" "$WT"
git -C "$WT" checkout --quiet -B "$branch" "$base"

# The lane requires a red task: if the deciding check already passes at the cut
# base, a worker can only manufacture a diff to satisfy the commit rule. The
# classifier refuses a load/setup error instead of mistaking it for red.
WORK_ROOT="$WT"
class_code=0
classify_check "$DECIDING_CHECK" || class_code=$?
case "$class_code" in
  1) : ;;
  0)
    echo "preflight: deciding check '$DECIDING_CHECK' already passes at the cut base; the lane requires a red task" >&2
    exit 69
    ;;
  *)
    echo "preflight: deciding check '$DECIDING_CHECK' could not be exercised as declared (load/setup error)" >&2
    exit 70
    ;;
esac

if [ -z "$CHANGED" ]; then CHANGED=$DECIDING_CHECK; fi
recall=$(node "$KRN" memory recall --root "$FIXTURE" --changed "$CHANGED" 2>/dev/null || echo 'no recalled lessons')
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
cat >"$RUN_DIR/PROMPT.txt" <<EOF
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

compose_bwrap
echo "run=$RUN_DIR"
echo "worker=$WORKER"
echo "worktree=$WT"
echo "branch=$branch"
echo "base=$base"
echo "ticket_abi=$ticket_abi"
if [ -n "$TICKET_ID" ]; then echo "ticket_id=$TICKET_ID"; fi
[ "$WORKER" = "codex" ] && echo "codex_pin=${CODEX_VERSION:-none} ${CODEX_INTEGRITY:-none}"

probe() {
  "$BWRAP" "${BWRAP_ARGS[@]}" -- /usr/bin/sh -c '
    printf "lab="; test -d "$0" && echo visible || echo hidden
    printf "hosthome="; test ! -e "$HOME/.codex" && test ! -e "$HOME/.local/share/opencode" && echo hidden || echo VISIBLE
    printf "canary="; ( : > /etc/lane-canary ) 2>/dev/null && echo WROTE || echo denied
    printf "fixture_write="; ( : > "$1/.lane-canary" ) 2>/dev/null && echo WROTE || echo denied
    printf "ref_update="; git -C "$1" update-ref "refs/heads/$2" HEAD 2>/dev/null && echo UPDATED || echo denied
    printf "auth="; test -f /share/'"$WORKER"'/auth.json && echo seeded || echo missing
    printf "git="; git --version 2>/dev/null | awk "{print \$NF}" || echo missing
    printf "whoami="; id -u
  ' "$BASE" "$FIXTURE" "$BASE_REF"
}

if [ "$mode" = "probe" ]; then
  probe
  exit 0
fi

preflight=$(probe)
printf '%s\n' "$preflight" | sed 's/^/probe /'
if ! printf '%s\n' "$preflight" | probe_verdict >/dev/null; then
  echo "isolation preflight failed" >&2
  exit 67
fi

identity=(
  --setenv GIT_AUTHOR_NAME "lane worker" --setenv GIT_AUTHOR_EMAIL "lane@lab.invalid"
  --setenv GIT_COMMITTER_NAME "lane worker" --setenv GIT_COMMITTER_EMAIL "lane@lab.invalid"
)
invoke_worker() {  # $1 prompt file, $2 events path, $3 stderr path
  local prompt_file=$1 events=$2 errlog=$3
  local env_args=("${identity[@]}")
  env_args+=( ${SESSION_EXTRA[@]+"${SESSION_EXTRA[@]}"} )
  if [ "$WORKER" = "stub" ]; then
    "$BWRAP" "${BWRAP_ARGS[@]}" ${env_args[@]+"${env_args[@]}"} -- /usr/bin/sh "$STUB_SCRIPT" "${WORKER_PHASE:-first}" "$WT" "$prompt_file" \
      >"$events" 2>"$errlog"
  elif [ "$WORKER" = "codex" ]; then
    "$BWRAP" "${BWRAP_ARGS[@]}" ${env_args[@]+"${env_args[@]}"} -- node "$CODEX_JS" exec -C "$WT" --skip-git-repo-check \
      --dangerously-bypass-approvals-and-sandbox --dangerously-bypass-hook-trust -m "$MODEL" --json "$(cat "$prompt_file")" \
      >"$events" 2>"$errlog"
  else
    "$BWRAP" "${BWRAP_ARGS[@]}" ${env_args[@]+"${env_args[@]}"} -- /opencode/bin/opencode run --model "$MODEL" --format json --dir "$WT" \
      "$(cat "$prompt_file")" \
      >"$events" 2>"$errlog"
  fi
}

# PRESESSION_NO_COMMIT=1 is a lab double for a worker that ends without a
# commit: a git shim on PATH makes `git commit` fail in the first session only,
# so the recovery path is exercised deterministically.
SESSION_EXTRA=()
if [ "${PRESESSION_NO_COMMIT:-0}" = "1" ]; then
  mkdir -p "$RUN_DIR/bin"
  cat >"$RUN_DIR/bin/git" <<'SHIM'
#!/bin/sh
case "$1" in
  commit) echo "lane: commit is disabled in this session" >&2; exit 1 ;;
esac
exec git "$@"
SHIM
  chmod +x "$RUN_DIR/bin/git"
  SESSION_EXTRA=( --setenv PATH "$RUN_DIR/bin:$(tool_path)" )
fi
start=$(date +%s)
status=0
invoke_worker "$RUN_DIR/PROMPT.txt" "$RUN_DIR/out/events.jsonl" "$RUN_DIR/out/stderr.log" || status=$?
end=$(date +%s)
echo "worker_exit=$status"
echo "model=$MODEL"
echo "wall_seconds=$((end - start))"

# A worker that finishes without committing gets one bounded recovery session in
# the same clone, so the lane never silently hands off work.
commit_recovery=not-needed
recovery_seconds=na
if [ "$status" -eq 0 ] && [ "$(git -C "$WT" rev-parse HEAD)" = "$base" ] && [ -n "$(git -C "$WT" status --porcelain)" ]; then
  SESSION_EXTRA=()
  cat >"$RUN_DIR/RECOVERY_PROMPT.txt" <<EOF
Your previous session completed work in this repository but did not commit it.
Commit the existing changes now, exactly once, with a Conventional Commit
subject and these body lines:
$trailers
Do not change the work; do not push. Print the commit SHA.
EOF
  commit_recovery=attempted
  rstart=$(date +%s)
  WORKER_PHASE=recovery invoke_worker "$RUN_DIR/RECOVERY_PROMPT.txt" "$RUN_DIR/out/recovery-events.jsonl" "$RUN_DIR/out/recovery-stderr.log" || true
  rend=$(date +%s)
  recovery_seconds=$((rend - rstart))
  if [ "$(git -C "$WT" rev-parse HEAD)" != "$base" ]; then
    commit_recovery=succeeded
  else
    commit_recovery=failed
  fi
fi
echo "commit_recovery=$commit_recovery"
echo "recovery_seconds=$recovery_seconds"

leak=no
if grep -q "$sentinel" "$RUN_DIR/out/events.jsonl" 2>/dev/null; then leak=YES; fi
echo "sentinel_leak=$leak"

echo "--- worker tree ---"
git -C "$WT" log --oneline -2 || true
git -C "$WT" status --short || true

# The host integrates the worker commit back into the fixture refs before the
# worker gate, so integrate.sh merges a real fixture branch.
worker_head=$(git -C "$WT" rev-parse HEAD)
if [ "$worker_head" != "$base" ]; then
  git -C "$FIXTURE" fetch --quiet "$WT" "+refs/heads/$branch:refs/heads/$branch"
fi
echo "worker_head=$worker_head"

echo "--- worker-side gate (host-executed) ---"
gate=0
node "$KRN" changes check --root "$WT" --base "$base" --head HEAD --before --strict-recall || gate=$?
echo "worker_gate_exit=$gate"
echo "run_dir=$RUN_DIR"

[ "$status" -eq 0 ] && [ "$leak" = "no" ] && [ "$gate" -eq 0 ]
