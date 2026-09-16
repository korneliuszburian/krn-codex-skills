// KRN opencode adapter: ports the Codex hooks to the opencode plugin API.
// Installed by `krn-codex install apply` as ~/.config/opencode/plugins/krn.js
// and loaded automatically at opencode startup. It keeps three Codex
// behaviours: the destructive-command guard (delegating to the same python
// policy the installed Codex hook uses, never modelling shell execution), the
// outcome-capsule brief as the session-start equivalent, and the one-line
// adoption signal for unmanaged work trees.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const GUARD = fileURLToPath(new URL("../../../scripts/hooks/krn_pretooluse.py", import.meta.url));
const CONTINUING = new Set(["ACTIVE", "BLOCKED", "DEFERRED", "NEEDS_REVIEW"]);
const MANAGED_START = "<!-- krn-agent-workflow:start -->";
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];
const ONBOARDING_SIGNAL =
  "KRN onboarding (environment note, not a task): this work tree carries agent " +
  "instructions without the KRN managed contract. When your current task is " +
  "finished, run `krn-codex repo inspect --root .` for a read-only report; " +
  "adoption stays explicit-only.";

export function field(text, label) {
  for (const line of text.split("\n")) {
    const stripped = line.trim();
    if (stripped.startsWith(`${label}:`)) return stripped.slice(label.length + 1).trim();
  }
  return null;
}

export function capsuleBrief(directory) {
  const base = path.join(directory, ".krn", "runs", "delivery-loop");
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  const notes = [];
  for (const entry of entries.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const state = path.join(base, entry.name, "state.md");
    let text;
    try {
      text = fs.readFileSync(state, "utf8");
    } catch {
      continue;
    }
    const outcome = (field(text, "Outcome state") ?? "").toUpperCase();
    if (!CONTINUING.has(outcome)) continue;
    notes.push(
      [
        `Capsule .krn/runs/delivery-loop/${entry.name}/state.md [${outcome}]`,
        `  acceptance: ${field(text, "Outcome and observable acceptance") ?? "unspecified"}`,
        `  next bounded action: ${field(text, "Next bounded owner and action") ?? "unspecified"}`,
        `  blockers: ${field(text, "Open unknowns and blockers with owners") ?? "none"}`,
      ].join("\n"),
    );
  }
  if (notes.length === 0) return null;
  return (
    "KRN memory layer. Read the outcome capsule(s) below and continue from the " +
    "recorded next action; do not restart completed work.\n\n" +
    notes.join("\n\n")
  );
}

export function worktreeRoot(directory) {
  let current = path.resolve(directory);
  for (;;) {
    if (fs.existsSync(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export function adoptionSignal(directory) {
  const root = worktreeRoot(directory);
  if (!root) return null;
  for (const name of INSTRUCTION_FILES) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, name), "utf8");
    } catch {
      continue;
    }
    if (text.includes(MANAGED_START)) return null;
    return ONBOARDING_SIGNAL;
  }
  return null;
}

const PATCH_DIRECTIVE = /^\*\*\* (?:Add|Update|Delete) File:/m;

function patchMappable(text) {
  return text.includes("*** Begin Patch") || PATCH_DIRECTIVE.test(text);
}

export function guardReason(tool, args, directory) {
  let payload = null;
  if (tool === "bash") {
    payload = { tool_name: "Bash", tool_input: { command: String(args?.command ?? "") } };
  } else if (tool === "write" || tool === "edit" || tool === "patch") {
    const target = String(args?.filePath ?? args?.path ?? "").trim();
    const patchText = typeof args?.patchText === "string" ? args.patchText : "";
    const patch = patchMappable(patchText)
      ? patchText
      : target
        ? `*** Begin Patch\n${tool === "write" ? "*** Add File" : "*** Update File"}: ${target}\n*** End Patch`
        : null;
    if (patch === null) {
      return "write-capable tool call is not inspectable; name one concrete path";
    }
    payload = { tool_name: "apply_patch", tool_input: { command: patch } };
  }
  if (!payload) return null;
  const result = spawnSync("python3", [GUARD], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", cwd: directory, ...payload }),
    encoding: "utf8",
    timeout: 5000,
  });
  if (result.error || result.status !== 0 || !result.stdout) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return parsed?.hookSpecificOutput?.permissionDecisionReason ?? null;
  } catch {
    return null;
  }
}

export const KrnAdapter = async ({ directory } = {}) => {
  const cwd = directory ?? process.cwd();
  const marker = (text) => text.includes("KRN memory layer") || text.includes("KRN onboarding");
  return {
    // The Codex SessionStart equivalent: the brief enters the system prompt,
    // not the user turn, so it informs the session without competing with the
    // user's own request.
    "experimental.chat.system.transform": async (input, output) => {
      if (!Array.isArray(output?.system)) return;
      if (output.system.some(marker)) return;
      const injected = capsuleBrief(cwd) ?? adoptionSignal(cwd);
      if (injected) output.system.push(injected);
    },
    "experimental.session.compacting": async (input, output) => {
      const brief = capsuleBrief(cwd);
      if (brief) output?.context?.push(brief);
    },
    "tool.execute.before": async (input, output) => {
      const reason = guardReason(input?.tool, output?.args ?? {}, cwd);
      if (reason) throw new Error(reason);
    },
  };
};
