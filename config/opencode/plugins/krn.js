// KRN opencode adapter: ports the Codex hooks to the opencode plugin API.
// Installed by `krn install apply` as ~/.config/opencode/plugins/krn.js
// and loaded automatically at opencode startup. It keeps three Codex
// behaviours: the destructive-command guard (delegating to the same python
// policy the installed Codex hook uses, never modelling shell execution), the
// outcome-capsule brief as the session-start equivalent, and the one-line
// adoption signal for unmanaged work trees.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { checkTickets } from "../../../scripts/lib/ticket/ticket.mjs";
import { fieldLine } from "../../../scripts/lib/state/capsule-abi.mjs";
import { configureOpenCodeCapabilities } from "../../../scripts/lib/catalog/opencode-capabilities.mjs";

const GUARD = fileURLToPath(new URL("../../../scripts/hooks/krn_pretooluse.py", import.meta.url));
const CONTINUING = new Set(["ACTIVE", "BLOCKED", "DEFERRED", "NEEDS_REVIEW"]);
const MANAGED_START = "<!-- krn-agent-workflow:start -->";
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];
const ONBOARDING_SIGNAL =
  "KRN onboarding (environment note, not a task): this work tree carries agent " +
  "instructions without the KRN managed contract. When your current task is " +
  "finished, run `krn repo inspect --root .` for a read-only report; " +
  "adoption stays explicit-only.";
const CLAIM_COMMAND = "krn ticket claim --root . --id <id>";

function isInside(parent, candidate) {
  const base = path.resolve(parent);
  const rel = path.relative(base, path.resolve(base, candidate));
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== "..");
}

function realPathOrNull(target) {
  try {
    return fs.realpathSync(target);
  } catch {
    return null;
  }
}

export function capsuleBrief(directory) {
  const root = worktreeRoot(directory) ?? path.resolve(directory);
  const realRoot = realPathOrNull(root) ?? root;
  const base = path.join(root, ".krn", "runs", "delivery-loop");
  let entries = [];
  try {
    entries = fs.readdirSync(base, { withFileTypes: true });
  } catch {
    return null;
  }
  const found = new Map();
  for (const entry of entries.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    const capsule = path.join(base, entry.name);
    const real = realPathOrNull(capsule);
    if (!real || !isInside(realRoot, real)) continue;
    let directoryStat;
    try {
      directoryStat = fs.statSync(real);
    } catch {
      continue;
    }
    if (!directoryStat.isDirectory()) continue;
    const state = path.join(capsule, "state.md");
    const realState = realPathOrNull(state);
    if (!realState || !isInside(realRoot, realState)) continue;
    let stateStat;
    try {
      stateStat = fs.statSync(realState);
    } catch {
      continue;
    }
    if (!stateStat.isFile()) continue;
    const link = entry.isSymbolicLink();
    const previous = found.get(real);
    if (!previous || (previous.link && !link)) found.set(real, { id: entry.name, link, state });
  }
  const notes = [];
  for (const { state } of found.values()) {
    let text;
    try {
      text = fs.readFileSync(state, "utf8");
    } catch {
      continue;
    }
    const outcome = (fieldLine(text, "Outcome state") ?? "").toUpperCase();
    if (!CONTINUING.has(outcome)) continue;
    notes.push(
      [
        `Capsule .krn/runs/delivery-loop/${path.basename(path.dirname(state))}/state.md [${outcome}]`,
        `  acceptance: ${fieldLine(text, "Outcome and observable acceptance") ?? "unspecified"}`,
        `  next bounded action: ${fieldLine(text, "Next bounded owner and action") ?? "unspecified"}`,
        `  blockers: ${fieldLine(text, "Open unknowns and blockers with owners") ?? "none"}`,
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

function managedRoot(directory) {
  const root = worktreeRoot(directory);
  if (!root) return null;
  for (const name of INSTRUCTION_FILES) {
    let text;
    try {
      text = fs.readFileSync(path.join(root, name), "utf8");
    } catch {
      continue;
    }
    if (text.includes(MANAGED_START)) return root;
  }
  return null;
}

export function readyIds(root) {
  try {
    const report = checkTickets({ root, reconcile: false });
    return report.errors.length === 0 ? report.frontier : [];
  } catch {
    return [];
  }
}

export function queueBrief(directory) {
  if (capsuleBrief(directory)) return null;
  const root = managedRoot(directory);
  if (!root) return null;
  const ids = readyIds(root);
  if (ids.length === 0) return null;
  return `KRN ready queue: ${ids.slice(0, 3).join(", ")}. Claim one with \`${CLAIM_COMMAND}\`.`;
}

const PATCH_DIRECTIVE = /^\*\*\* (?:Add|Update|Delete) File:/m;

function patchMappable(text) {
  return text.includes("*** Begin Patch") || PATCH_DIRECTIVE.test(text);
}

const MALFORMED_DECISION =
  "the destructive-command guard returned a malformed decision; refusing the call rather than failing open";
const UNEXPLAINED_DENIAL =
  "the destructive-command guard denied the call without an explanation; refusing the call rather than failing open";

// A guard decision is authoritative only when it is well formed. A parseable but
// shapeless payload, an unknown decision, or a denial with no explanatory text
// is malformed, and a malformed decision refuses the call instead of silently
// becoming an allow. Only an explicit `allow` and the guard's own silent success
// (empty output) allow the call.
function decisionReason(parsed) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return MALFORMED_DECISION;
  const output = parsed.hookSpecificOutput;
  if (!output || typeof output !== "object" || Array.isArray(output)) return MALFORMED_DECISION;
  const decision = output.permissionDecision;
  const reason = output.permissionDecisionReason;
  const explained = typeof reason === "string" && reason.trim().length > 0;
  if (decision === "allow") return null;
  if (decision === "deny") return explained ? reason : UNEXPLAINED_DENIAL;
  if (decision === undefined || decision === null) {
    // A decision-less payload is malformed unless it still carries a reason,
    // which the guard contract has always treated as a denial.
    return explained ? reason : MALFORMED_DECISION;
  }
  return MALFORMED_DECISION;
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
  // Fail closed: a guard that cannot run, times out, exits non-zero, or returns
  // an unreadable decision must refuse the call, never allow it. A guard that
  // runs and prints nothing has raised no objection, which is the allow signal.
  if (result.error) {
    return `the destructive-command guard could not run (${result.error.code ?? "spawn error"}); refusing the call rather than failing open`;
  }
  if (result.status !== 0) {
    return `the destructive-command guard exited ${result.status}; refusing the call rather than failing open`;
  }
  if (!result.stdout) return null;
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return "the destructive-command guard returned an unreadable decision; refusing the call rather than failing open";
  }
  return decisionReason(parsed);
}

// The per-component ablation flags are read at call time so a harness lane can
// disable the brief and the guard independently without unloading the plugin.
function disabled(name) {
  return Boolean(process.env[name]);
}

export const KrnAdapter = async ({ directory } = {}) => {
  const cwd = directory ?? process.cwd();
  const marker = (text) =>
    text.includes("KRN memory layer") || text.includes("KRN ready queue") || text.includes("KRN onboarding");
  return {
    config: async (config) => configureOpenCodeCapabilities(config, { directory: cwd }),
    // The Codex SessionStart equivalent: the brief enters the system prompt,
    // not the user turn, so it informs the session without competing with the
    // user's own request.
    "experimental.chat.system.transform": async (input, output) => {
      if (disabled("KRN_DISABLE_BRIEF")) return;
      if (!Array.isArray(output?.system)) return;
      if (output.system.some(marker)) return;
      const injected = capsuleBrief(cwd) ?? queueBrief(cwd) ?? adoptionSignal(cwd);
      if (injected) output.system.push(injected);
    },
    "experimental.session.compacting": async (input, output) => {
      if (disabled("KRN_DISABLE_BRIEF")) return;
      const brief = capsuleBrief(cwd);
      if (brief) output?.context?.push(brief);
    },
    "tool.execute.before": async (input, output) => {
      if (disabled("KRN_DISABLE_GUARD")) return;
      const reason = guardReason(input?.tool, output?.args ?? {}, cwd);
      if (reason) throw new Error(reason);
    },
  };
};
