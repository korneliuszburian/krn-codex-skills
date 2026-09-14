import { normalize } from "node:path";

import { ConfigReconcileError } from "./catalog-errors.mjs";
import { matchesQuarantined } from "./plugin-identity.mjs";
import {
  directAssignments,
  parseAssignment,
  parseTomlString,
} from "./catalog-toml.mjs";

export const MCP_SERVER_KEYS = new Set([
  "args",
  "auth",
  "bearer_token_env_var",
  "command",
  "cwd",
  "default_tools_approval_mode",
  "disabled_tools",
  "enabled",
  "enabled_tools",
  "env",
  "env_http_headers",
  "env_vars",
  "experimental_environment",
  "http_headers",
  "http_headers_helper",
  "oauth",
  "oauth_resource",
  "required",
  "scopes",
  "startup_timeout_ms",
  "startup_timeout_sec",
  "tool_timeout_sec",
  "tools",
  "url",
]);

export const PLUGIN_KEYS = new Set(["enabled"]);
export const SKILL_KEYS = new Set(["enabled", "path"]);

function assertManagedBlock(document, block, allowedKeys, target) {
  const assignments = directAssignments(document, block);

  for (const [key, lineIndexes] of assignments) {
    if (!allowedKeys.has(key)) {
      throw new ConfigReconcileError(
        `Unknown key in managed ${target} block: ${key}`,
        { code: "CONFIG_UNKNOWN_MANAGED_KEY", target },
      );
    }
    if (lineIndexes.length > 1) {
      throw new ConfigReconcileError(
        `Duplicate key in managed ${target} block: ${key}`,
        { code: "CONFIG_DUPLICATE_MANAGED_KEY", target },
      );
    }
  }

  return assignments;
}

export function parseEnabled(document, lineIndex, target) {
  const { content } = document.lines[lineIndex];
  const assignment = parseAssignment(content);
  const match = assignment?.key === "enabled"
    ? assignment.value.match(/^(true|false)(\s*(?:#.*)?)$/)
    : undefined;
  if (!match) {
    throw new ConfigReconcileError(
      `Managed ${target} enabled value must be a literal boolean`,
      { code: "CONFIG_AMBIGUOUS_ENABLED", target },
    );
  }
  return {
    enabled: match[1] === "true",
    prefix: assignment.prefix,
    suffix: match[2],
  };
}

export function parseSkillPath(document, block) {
  const assignments = assertManagedBlock(
    document,
    block,
    SKILL_KEYS,
    "skills.config",
  );
  const pathLines = assignments.get("path") ?? [];
  if (pathLines.length !== 1) {
    throw new ConfigReconcileError(
      "Managed skills.config block needs exactly one supported path",
      { code: "CONFIG_AMBIGUOUS_SKILL_PATH" },
    );
  }

  const content = document.lines[pathLines[0]].content;
  const assignment = parseAssignment(content);
  const match = assignment?.key === "path"
    ? assignment.value.match(
      /^((?:"(?:[^"\\]|\\.)*")|(?:'[^']*'))\s*(?:#.*)?$/,
    )
    : undefined;
  if (!match) {
    throw new ConfigReconcileError(
      "Managed skills.config path must be a single-line TOML string",
      { code: "CONFIG_AMBIGUOUS_SKILL_PATH" },
    );
  }
  return normalize(parseTomlString(match[1], "skills.config path"));
}

export function skillPathContainsQuarantine(document, block, skillPath, families) {
  // Inspect the decoded source path before normalization: `/x/badfamily/../ok/SKILL.md`
  // traverses a quarantined family but normalizes it away, so the lexical check
  // must run on the raw value in both the existing-config and desired-config paths.
  const pathLines = directAssignments(document, block).get("path") ?? [];
  const rawQuarantined = pathLines.some((lineIndex) => {
    const content = document.lines[lineIndex].content;
    const value = (parseAssignment(content)?.value ?? "").toLowerCase();
    return matchesQuarantined(value, families);
  });
  if (rawQuarantined) return true;
  if (skillPath !== undefined) return matchesQuarantined(skillPath, families);
  return false;
}

const isCommentLine = (document, index) =>
  document.lines[index].content.trim().startsWith("#") &&
  !document.insideMultiline?.[index] &&
  !document.insideArray?.[index];

// The last line the block owns. A run of comment lines directly above the next
// header documents that header, so it is not owned; a blank line ends the run, so
// a comment separated from the next header by a blank belongs to this block. At
// end of file there is no following header, so only trailing blanks are excluded.
function ownedEndLine(document, block) {
  let cursor = block.endLineIndex - 1;
  if (block.endLineIndex < document.lines.length) {
    while (cursor > block.startLineIndex && isCommentLine(document, cursor)) cursor -= 1;
    return cursor;
  }
  while (cursor > block.startLineIndex && document.lines[cursor].content.trim() === "") cursor -= 1;
  return cursor;
}

// A comment run directly above a header is that header's own documentation, so it
// is owned (and removed) by the block it precedes.
function leadingCommentStart(document, block) {
  let cursor = block.startLineIndex - 1;
  while (cursor >= 0 && isCommentLine(document, cursor)) cursor -= 1;
  return cursor + 1;
}

function insertionAtBlockEnd(document, block, text) {
  const insertLineIndex = ownedEndLine(document, block) + 1;

  const offset =
    insertLineIndex < document.lines.length
      ? document.lines[insertLineIndex].start
      : document.source.length;
  const previous = document.lines[insertLineIndex - 1];
  const leadingEol = previous && previous.eol === "" ? document.eol : "";
  return { start: offset, end: offset, text: `${leadingEol}${text}${document.eol}` };
}

function replaceEnabledOperation(document, lineIndex, enabled) {
  const line = document.lines[lineIndex];
  const parsed = parseEnabled(document, lineIndex, "config");
  return {
    start: line.start,
    end: line.end,
    text: `${parsed.prefix}${String(enabled)}${parsed.suffix}${line.eol}`,
  };
}

function deletionOperation(document, block) {
  const firstOwnedLine = leadingCommentStart(document, block);
  const lastOwnedLine = ownedEndLine(document, block);

  return {
    start: document.lines[firstOwnedLine]?.start ?? block.start,
    end: document.lines[lastOwnedLine]?.end ?? block.end,
    text: "",
  };
}

export function setEnabled({
  document,
  block,
  enabled,
  allowedKeys,
  target,
  resource,
  reason,
  operations,
  actions,
}) {
  const assignments = assertManagedBlock(document, block, allowedKeys, target);
  const enabledLines = assignments.get("enabled") ?? [];

  if (enabledLines.length === 1) {
    const current = parseEnabled(document, enabledLines[0], target).enabled;
    if (current === enabled) return;
    operations.push(
      replaceEnabledOperation(document, enabledLines[0], enabled),
    );
    actions.push({ operation: "set", resource, target, enabled, reason });
    return;
  }

  operations.push(
    insertionAtBlockEnd(document, block, `enabled = ${String(enabled)}`),
  );
  actions.push({ operation: "set", resource, target, enabled, reason });
}

export function removeBlock({
  document,
  block,
  allowedKeys,
  target,
  resource,
  reason,
  operations,
  actions,
}) {
  assertManagedBlock(document, block, allowedKeys, target);
  operations.push(deletionOperation(document, block));
  actions.push({ operation: "remove", resource, target, reason });
}

export function appendPrefix(source, eol) {
  if (source === "") return "";
  if (!/(?:\r\n|\n|\r)$/.test(source)) return `${eol}${eol}`;
  if (/(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)$/.test(source)) return "";
  return eol;
}

export function quoteToml(value) {
  return JSON.stringify(value).replace(/\u007f/g, "\\u007F");
}

export function applyOperations(source, operations) {
  const sorted = [...operations].sort(
    (left, right) => right.start - left.start || right.end - left.end,
  );
  let previousStart = source.length;

  for (const operation of sorted) {
    if (
      operation.start < 0 ||
      operation.end < operation.start ||
      operation.end > source.length ||
      operation.end > previousStart
    ) {
      throw new ConfigReconcileError("Overlapping or invalid config operation", {
        code: "CONFIG_INVALID_OPERATION",
      });
    }
    previousStart = operation.start;
  }

  let result = source;
  for (const operation of sorted) {
    result =
      result.slice(0, operation.start) +
      operation.text +
      result.slice(operation.end);
  }
  return result;
}

export function indexNamedBlocks(blocks, kind) {
  const index = new Map();
  for (const block of blocks.filter((candidate) => candidate.kind === kind)) {
    const entries = index.get(block.id) ?? [];
    entries.push(block);
    index.set(block.id, entries);
  }
  return index;
}

export function assertSingleBlock(blocks, target) {
  if (blocks.length > 1) {
    throw new ConfigReconcileError(`Duplicate managed config block: ${target}`, {
      code: "CONFIG_DUPLICATE_MANAGED_BLOCK",
      target,
    });
  }
  return blocks[0];
}
