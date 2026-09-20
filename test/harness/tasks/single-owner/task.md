# Harness task: single-owner

```krn-harness-task
{
  "id": "single-owner",
  "prompt": "Remove the duplicated regexp escaper so exactly one module owns it, and keep the consumer working.",
  "check": "node check.mjs",
  "workspace": "test/harness/tasks/single-owner/workspace"
}
```
