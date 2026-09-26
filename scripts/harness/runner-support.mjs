// One owner for the harness adapters' shared preamble: the stdin reader, the
// refusal error, and the last-JSON-line parser. The adapters differ only in the
// runner name that prefixes a refusal message.
import { readFileSync } from "node:fs";

export function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// A refusal is thrown, not exited, so the caller's `finally` that removes the
// disposable workspace and the held evaluator always runs.
export class Refusal extends Error {
  constructor(runner, rule, detail) {
    super(`${runner} refused: ${rule}${detail ? ` (${detail})` : ""}`);
    this.name = "Refusal";
    this.rule = rule;
    this.detail = detail;
  }
}

export const refusalFor = (runner) => (rule, detail) => {
  throw new Refusal(runner, rule, detail);
};

export function lastJsonLine(text) {
  const line = String(text ?? "").trim().split("\n").filter(Boolean).at(-1);
  if (!line) return null;
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
