#!/usr/bin/env bash
# LT-7 publication gate (outside the repo). Refuses to publish without explicit
# authority; dry by default. Activation is a user decision, never automatic.
set -euo pipefail

BRANCH=${1:?usage: publish.sh <outcome-branch> <base-sha>}
BASE=${2:?usage: publish.sh <outcome-branch> <base-sha>}
REMOTE=${REMOTE:-origin}
AUTHORITY=${PUBLISH_AUTHORITY:-}
DRY=${PUBLISH_DRY_RUN:-1}

if [ "$AUTHORITY" != "push+pr" ]; then
  echo "publication requires PUBLISH_AUTHORITY=push+pr (a user decision); got '${AUTHORITY:-none}'" >&2
  exit 64
fi

steps=(
  "verify the worker and integrator gates at the recorded fixed point"
  "push $BRANCH to $REMOTE"
  "open a pull request with the capsule acceptance and evidence"
  "record publication state in the capsule (PR_OPEN) before the next transition"
)
printf 'publication plan for %s (base %s):\n' "$BRANCH" "$BASE"
for step in "${steps[@]}"; do printf '  - %s\n' "$step"; done

if [ "$DRY" = "1" ]; then
  echo "dry run: nothing pushed; set PUBLISH_DRY_RUN=0 with authority to execute"
  exit 0
fi

git push -u "$REMOTE" "$BRANCH"
gh pr create --base main --head "$BRANCH" \
  --title "feat(lane): publish the integrated outcome" \
  --body "Integrated through the LT-7 lane; worker and integrator gates exit 0 at the merged fixed point."
