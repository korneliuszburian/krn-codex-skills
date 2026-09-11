import { ConfigReconcileError } from "./catalog-errors.mjs";
import { matchesQuarantined } from "./plugin-identity.mjs";

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
  "oauth_resource",
  "required",
  "scopes",
  "startup_timeout_ms",
  "startup_timeout_sec",
  "tool_timeout_sec",
  "url",
]);

export const PLUGIN_KEYS = new Set(["enabled"]);
export const SKILL_KEYS = new Set(["enabled", "path"]);

export function splitLines(source) {
  const lines = [];
  const matcher = /[^\r\n]*(?:\r\n|\n|\r|$)/g;
  let match;
  let offset = 0;

  while ((match = matcher.exec(source)) !== null) {
    const raw = match[0];
    if (raw === "") break;
    const eolMatch = raw.match(/(\r\n|\n|\r)$/);
    const eol = eolMatch?.[1] ?? "";
    const content = eol === "" ? raw : raw.slice(0, -eol.length);
    lines.push({ raw, content, eol, start: offset, end: offset + raw.length });
    offset += raw.length;
  }

  return lines;
}

export function parseTomlString(token, target) {
  if (token.startsWith("'")) return token.slice(1, -1);
  try {
    return JSON.parse(token);
  } catch (error) {
    throw new ConfigReconcileError(`Invalid TOML string for ${target}`, {
      cause: error,
      target,
    });
  }
}

export function splitHeader(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("[")) return undefined;

  const array = trimmed.startsWith("[[");
  const openingLength = array ? 2 : 1;
  const closing = array ? "]]" : "]";
  let quote;
  let escaped = false;

  for (let index = openingLength; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (quote === "\"") {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (quote === "'") {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (trimmed.startsWith(closing, index)) {
      const tail = trimmed.slice(index + closing.length).trimStart();
      return {
        array,
        inner: trimmed.slice(openingLength, index),
        validTail: tail === "" || tail.startsWith("#"),
      };
    }
  }

  return {
    array,
    inner: trimmed.slice(openingLength),
    validTail: false,
  };
}

export function parseDottedHeaderKey(inner) {
  const segments = [];
  let index = 0;

  const skipWhitespace = () => {
    while (index < inner.length && /\s/.test(inner[index])) index += 1;
  };

  skipWhitespace();
  while (index < inner.length) {
    let token;
    const start = index;
    const quote = inner[index];

    if (quote === "\"" || quote === "'") {
      index += 1;
      let escaped = false;
      while (index < inner.length) {
        const character = inner[index];
        if (quote === "\"" && escaped) {
          escaped = false;
        } else if (quote === "\"" && character === "\\") {
          escaped = true;
        } else if (character === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      if (inner[index - 1] !== quote) return undefined;
      token = inner.slice(start, index);
    } else {
      const match = inner.slice(index).match(/^[A-Za-z0-9_-]+/);
      if (!match) return undefined;
      token = match[0];
      index += token.length;
    }

    const segment =
      token.startsWith("\"") || token.startsWith("'")
        ? parseTomlString(token, "table header")
        : token;
    segments.push(segment);
    skipWhitespace();
    if (index === inner.length) return segments;
    if (inner[index] !== ".") return undefined;
    index += 1;
    skipWhitespace();
    if (index === inner.length) return undefined;
  }

  return undefined;
}

export function looksLikeManagedOwner(inner) {
  const trimmed = inner.trimStart();
  const withoutOpeningQuote = /^["']/.test(trimmed)
    ? trimmed.slice(1)
    : trimmed;
  return ["plugins", "mcp_servers", "skills"].some(
    (owner) =>
      withoutOpeningQuote.startsWith(owner) &&
      (withoutOpeningQuote.length === owner.length ||
        !/[A-Za-z0-9_-]/.test(withoutOpeningQuote[owner.length])),
  );
}

export function ambiguousManagedHeader() {
  throw new ConfigReconcileError("Ambiguous managed TOML table header", {
    code: "CONFIG_AMBIGUOUS_MANAGED_HEADER",
  });
}

export function parseHeader(content) {
  const header = splitHeader(content);
  if (!header) return undefined;
  const managedShape = looksLikeManagedOwner(header.inner);
  if (!header.validTail) {
    if (managedShape) ambiguousManagedHeader();
    return { kind: "other" };
  }

  const segments = parseDottedHeaderKey(header.inner);
  if (!segments) {
    if (managedShape) ambiguousManagedHeader();
    return { kind: "other" };
  }

  const [owner, id] = segments;
  if (owner === "plugins") {
    if (!header.array && segments.length === 2) {
      if (id === "") ambiguousManagedHeader();
      return { kind: "plugin", id };
    }
    ambiguousManagedHeader();
  }
  if (owner === "mcp_servers") {
    if (!header.array && segments.length === 2) {
      if (id === "") ambiguousManagedHeader();
      return { kind: "mcp", id };
    }
    if (!header.array && segments.length > 2) return { kind: "other" };
    ambiguousManagedHeader();
  }
  if (owner === "skills") {
    if (header.array && segments.length === 2 && id === "config") {
      return { kind: "skill" };
    }
    ambiguousManagedHeader();
  }

  return { kind: "other" };
}

export function parseDocument(source) {
  const lines = splitLines(source);
  const headers = [];
  let insideTable = false;

  for (let index = 0; index < lines.length; index += 1) {
    const header = parseHeader(lines[index].content);
    if (header) {
      insideTable = true;
      headers.push({ ...header, lineIndex: index });
      continue;
    }
    if (!insideTable && looksLikeManagedRootAssignment(lines[index].content)) {
      throw new ConfigReconcileError(
        "Managed TOML owners must use supported table syntax",
        { code: "CONFIG_AMBIGUOUS_MANAGED_ASSIGNMENT" },
      );
    }
  }

  const blocks = headers.map((header, index) => {
    const endLineIndex = headers[index + 1]?.lineIndex ?? lines.length;
    return {
      ...header,
      startLineIndex: header.lineIndex,
      endLineIndex,
      start: lines[header.lineIndex].start,
      end:
        endLineIndex < lines.length
          ? lines[endLineIndex].start
          : source.length,
    };
  });

  const eol = lines.find((line) => line.eol !== "")?.eol ?? "\n";
  return { source, lines, blocks, eol };
}

export function looksLikeManagedRootAssignment(content) {
  const trimmed = content.trimStart();
  if (trimmed === "" || trimmed.startsWith("#")) return false;

  let quote;
  let escaped = false;
  let assignmentIndex = -1;
  for (let index = 0; index < trimmed.length; index += 1) {
    const character = trimmed[index];
    if (quote === "\"") {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = undefined;
      continue;
    }
    if (quote === "'") {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === "#") return false;
    if (character === "=") {
      assignmentIndex = index;
      break;
    }
  }
  if (assignmentIndex === -1) return false;

  const keySource = trimmed.slice(0, assignmentIndex).trimEnd();
  const segments = parseDottedHeaderKey(keySource);
  if (segments && ["plugins", "mcp_servers", "skills"].includes(segments[0])) {
    return true;
  }
  return looksLikeManagedOwner(keySource);
}

export function parseAssignment(content) {
  if (content.trimStart().startsWith("#")) return undefined;
  const match = content.match(
    /^(\s*)((?:"(?:[^"\\]|\\.)*")|(?:'[^']*')|(?:[^\s=]+))(\s*=\s*)(.*)$/,
  );
  if (!match) return undefined;
  const keyToken = match[2];
  const key = keyToken.startsWith("\"") || keyToken.startsWith("'")
    ? parseTomlString(keyToken, "assignment key")
    : keyToken;
  return {
    key,
    prefix: `${match[1]}${keyToken}${match[3]}`,
    value: match[4],
  };
}

export function parseAssignmentKey(content) {
  return parseAssignment(content)?.key;
}

export function directAssignments(document, block) {
  const assignments = new Map();

  for (
    let index = block.startLineIndex + 1;
    index < block.endLineIndex;
    index += 1
  ) {
    const key = parseAssignmentKey(document.lines[index].content);
    if (key === undefined) continue;
    const entries = assignments.get(key) ?? [];
    entries.push(index);
    assignments.set(key, entries);
  }

  return assignments;
}

export function assertManagedBlock(document, block, allowedKeys, target) {
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
  if (skillPath !== undefined) return matchesQuarantined(skillPath, families);

  // If the path is malformed, inspect only its lexical assignment rather than
  // comments or unrelated lines in the block. The caller will then fail closed
  // without touching the referenced filesystem path.
  const pathLines = directAssignments(document, block).get("path") ?? [];
  return pathLines.some((lineIndex) => {
    const content = document.lines[lineIndex].content;
    const value = (parseAssignment(content)?.value ?? "").toLowerCase();
    return families.some((family) => value.includes(family));
  });
}


export function insertionAtBlockEnd(document, block, text) {
  let insertLineIndex = block.endLineIndex;
  while (
    insertLineIndex > block.startLineIndex + 1 &&
    document.lines[insertLineIndex - 1].content.trim() === ""
  ) {
    insertLineIndex -= 1;
  }

  const offset =
    insertLineIndex < document.lines.length
      ? document.lines[insertLineIndex].start
      : document.source.length;
  const previous = document.lines[insertLineIndex - 1];
  const leadingEol = previous && previous.eol === "" ? document.eol : "";
  return { start: offset, end: offset, text: `${leadingEol}${text}${document.eol}` };
}

export function replaceEnabledOperation(document, lineIndex, enabled) {
  const line = document.lines[lineIndex];
  const parsed = parseEnabled(document, lineIndex, "config");
  return {
    start: line.start,
    end: line.end,
    text: `${parsed.prefix}${String(enabled)}${parsed.suffix}${line.eol}`,
  };
}

export function deletionOperation(document, block) {
  let lastOwnedLine = block.endLineIndex - 1;
  while (
    lastOwnedLine > block.startLineIndex &&
    document.lines[lastOwnedLine].content.trim() === ""
  ) {
    lastOwnedLine -= 1;
  }

  return {
    start: block.start,
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
  return JSON.stringify(value);
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

/**
 * Build a byte-preserving dry-run plan for a Codex config.
 *
 * `desired.skills[path] = true` removes an override because discovered skills
 * are enabled by default. `false` creates or updates an explicit override.
 */
