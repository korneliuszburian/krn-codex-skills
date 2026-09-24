import { execFileSync } from "node:child_process";

const QUEUE_REF = "refs/krn/queue";
const ACTIVE_QUEUE_REF = "refs/krn/queue-active";

export function activateTaskQueueFixture(root) {
  const blob = execFileSync("git", ["-C", root, "hash-object", "-w", "--stdin"], {
    input: JSON.stringify({ version: 1, queueRef: QUEUE_REF }),
    encoding: "utf8",
  }).trim();
  execFileSync("git", ["-C", root, "update-ref", ACTIVE_QUEUE_REF, blob]);
}
