import fs from "node:fs";
import path from "node:path";

import { fieldLine } from "../state/capsule-abi.mjs";
import { parseLessons } from "../lessons/lessons.mjs";

// The compiled-memory station. It is derived, never hand-edited: `krn brief
// --write` regenerates it, `krn brief --check` fails when it is stale. The
// shape follows the researched pattern that a harness keeps one small, current
// map (Karpathy's compiled wiki, OpenAI's short AGENTS.md map, Anthropic's
// progress file) instead of re-deriving context per session.
const INVARIANTS = [
  "One owner per primitive; a meaning implemented twice is a defect.",
  "One writer per outcome; independent work is read-only.",
  "Every durable pattern carries a trigger and a falsifier; a pattern with no reader is deleted.",
  "Gain is measured against a frozen baseline, never asserted.",
  "Deletion is progress.",
];

function newestCapsule(root) {
  const base = path.join(root, ".krn", "runs", "delivery-loop");
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(base, entry.name, "state.md"))
    .filter((file) => fs.existsSync(file))
    .sort();
  return files.length > 0 ? files[files.length - 1] : null;
}

function labTestIds(root) {
  const file = path.join(root, "docs", "research", "lab-tests.md");
  if (!fs.existsSync(file)) return [];
  const ids = [];
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = /^\|\s*(LT-\d+)\s*\|/.exec(line);
    if (match) ids.push(match[1]);
  }
  return ids;
}

export function compileBrief({ root }) {
  const lines = [];
  lines.push("# Brief", "");
  lines.push("Compiled from the outcome capsule, the workflow lessons, and the lab-test registry. Do not edit by hand; regenerate with `krn brief --root . --write`.", "");

  const capsule = newestCapsule(root);
  lines.push("## Objective", "");
  if (capsule) {
    const text = fs.readFileSync(capsule, "utf8");
    lines.push((fieldLine(text, "Outcome and observable acceptance") ?? "none recorded").trim(), "");
    lines.push(`Outcome state: ${(fieldLine(text, "Outcome state") ?? "unknown").trim()}`, "");
  } else {
    lines.push("No outcome capsule recorded.", "");
  }

  lines.push("## Invariants", "");
  for (const invariant of INVARIANTS) lines.push(`- ${invariant}`);
  lines.push("");

  const lessons = parseLessons(path.join(root, "docs", "research", "workflow-lessons.md"));
  const active = lessons.rows.filter((row) => !row.status);
  lines.push("## Patterns in force", "");
  lines.push(`- ${active.length} active lessons in docs/research/workflow-lessons.md`);
  const triggers = active.map((row) => (row.trigger ?? "").trim()).filter(Boolean);
  if (triggers.length > 0) lines.push(`- triggers: ${triggers.join("; ")}`);
  lines.push("");

  const tests = labTestIds(root);
  lines.push("## Measurements", "");
  if (tests.length > 0) {
    lines.push(`- ${tests.length} lab-test rows; latest: ${tests.slice(-5).join(", ")}`);
    lines.push("- the paired harness-vs-vanilla run on the frozen denominator is a recorded non-proof until it lands");
  } else {
    lines.push("- no lab-test rows recorded");
  }
  lines.push("");

  const retired = lessons.rows.filter((row) => row.status);
  lines.push("## Retired", "");
  if (retired.length > 0) for (const row of retired) lines.push(`- ${row.lesson}`);
  else lines.push("- none recorded");
  lines.push("");

  return lines.join("\n");
}
