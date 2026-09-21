# Harness task: fail-closed

```krn-harness-task
{
  "id": "fail-closed",
  "prompt": "The lessons staleness checker under scripts/lib/lessons must fail closed: a stale marker must exit non-zero instead of warning.",
  "check": "node check.mjs",
  "workspace": "test/harness/tasks/fail-closed/workspace",
  "hidden": [
    "check.mjs"
  ]
}
```
