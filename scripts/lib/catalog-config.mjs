import { createHash, randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { basename, dirname, isAbsolute, normalize } from "node:path";

import { requireRegularFileWithoutSymlinks } from "./catalog-path-safety.mjs";

const HARD_QUARANTINE_FAMILIES = Object.freeze(["superpowers"]);

const MCP_SERVER_KEYS = new Set([
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

const PLUGIN_KEYS = new Set(["enabled"]);
const SKILL_KEYS = new Set(["enabled", "path"]);

export class ConfigReconcileError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ConfigReconcileError";
    this.code = options.code ?? "CONFIG_RECONCILE_ERROR";
    this.target = options.target;
  }
}

export class ConcurrentConfigChangeError extends ConfigReconcileError {
  constructor(message = "Codex config changed after the plan was created") {
    super(message, { code: "CONFIG_CONCURRENT_CHANGE" });
    this.name = "ConcurrentConfigChangeError";
  }
}

export class QuarantineViolationError extends ConfigReconcileError {
  constructor(target) {
    super(`Hard-quarantined capability cannot be enabled: ${target}`, {
      code: "CONFIG_QUARANTINE_VIOLATION",
      target,
    });
    this.name = "QuarantineViolationError";
  }
}

function digest(source) {
  return createHash("sha256").update(source).digest("hex");
}

function normalizeFamilies(extraFamilies) {
  const families = new Set(HARD_QUARANTINE_FAMILIES);

  if (extraFamilies !== undefined) {
    if (!Array.isArray(extraFamilies)) {
      throw new ConfigReconcileError("quarantineFamilies must be an array");
    }

    for (const family of extraFamilies) {
      if (typeof family !== "string" || family.trim() === "") {
        throw new ConfigReconcileError(
          "quarantineFamilies entries must be non-empty strings",
        );
      }
      families.add(family.trim().toLowerCase());
    }
  }

  return [...families];
}

function isQuarantined(value, families) {
  const lexicalValue = value.toLowerCase();
  return families.some((family) => lexicalValue.includes(family));
}

function normalizeStateRecord(value, label) {
  if (value === undefined) return new Map();
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigReconcileError(`${label} must be an object of boolean states`);
  }

  const states = new Map();
  for (const [id, enabled] of Object.entries(value)) {
    if (id.trim() === "") {
      throw new ConfigReconcileError(`${label} contains an empty identifier`);
    }
    if (typeof enabled !== "boolean") {
      throw new ConfigReconcileError(`${label}.${id} must be boolean`);
    }
    states.set(id, enabled);
  }
  return states;
}

function pluginFamilyFromId(id) {
  const separator = id.lastIndexOf("@");
  if (separator <= 0 || separator === id.length - 1) return undefined;
  return id.slice(0, separator);
}

function normalizePluginFamilies(value) {
  const families = normalizeStateRecord(value, "desired.pluginFamilies");

  for (const [family, enabled] of families) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(family)) {
      throw new ConfigReconcileError(`Invalid plugin family selector: ${family}`, {
        code: "CONFIG_INVALID_PLUGIN_FAMILY",
        target: family,
      });
    }
    if (enabled) {
      throw new ConfigReconcileError(
        `Plugin families can only be disabled, not enabled: ${family}`,
        {
          code: "CONFIG_PLUGIN_FAMILY_ENABLE_UNSUPPORTED",
          target: family,
        },
      );
    }
  }

  return families;
}

function normalizeDesired(desired, families) {
  if (desired === null || typeof desired !== "object" || Array.isArray(desired)) {
    throw new ConfigReconcileError("desired must be an object");
  }

  const plugins = normalizeStateRecord(desired.plugins, "desired.plugins");
  const pluginFamilies = normalizePluginFamilies(desired.pluginFamilies);
  const mcpServers = normalizeStateRecord(
    desired.mcpServers,
    "desired.mcpServers",
  );
  const rawSkills = normalizeStateRecord(desired.skills, "desired.skills");
  const skills = new Map();

  for (const states of [plugins, mcpServers]) {
    for (const [id, enabled] of states) {
      if (enabled && isQuarantined(id, families)) {
        throw new QuarantineViolationError(id);
      }
    }
  }

  for (const [id, enabled] of plugins) {
    const family = pluginFamilyFromId(id);
    if (enabled && family !== undefined && pluginFamilies.has(family)) {
      throw new ConfigReconcileError(
        `Exact plugin enable conflicts with disabled family ${family}: ${id}`,
        {
          code: "CONFIG_PLUGIN_FAMILY_CONFLICT",
          target: id,
        },
      );
    }
  }

  for (const [rawPath, enabled] of rawSkills) {
    // This is deliberately lexical. Skill paths are never statted, resolved,
    // realpathed, or read by the reconciler.
    const quarantinedBeforeNormalization = isQuarantined(rawPath, families);
    if (enabled && quarantinedBeforeNormalization) {
      throw new QuarantineViolationError(rawPath);
    }
    if (!isAbsolute(rawPath)) {
      throw new ConfigReconcileError(
        `desired.skills path must be absolute: ${rawPath}`,
        { target: rawPath },
      );
    }

    const stablePath = normalize(rawPath);
    if (enabled && isQuarantined(stablePath, families)) {
      throw new QuarantineViolationError(rawPath);
    }
    if (skills.has(stablePath)) {
      throw new ConfigReconcileError(
        `desired.skills contains duplicate normalized path: ${stablePath}`,
        { target: stablePath },
      );
    }
    skills.set(stablePath, enabled);
  }

  return { plugins, pluginFamilies, mcpServers, skills };
}

function splitLines(source) {
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

function parseTomlString(token, target) {
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

function splitHeader(content) {
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

function parseDottedHeaderKey(inner) {
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

function looksLikeManagedOwner(inner) {
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

function ambiguousManagedHeader() {
  throw new ConfigReconcileError("Ambiguous managed TOML table header", {
    code: "CONFIG_AMBIGUOUS_MANAGED_HEADER",
  });
}

function parseHeader(content) {
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

function parseDocument(source) {
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

function looksLikeManagedRootAssignment(content) {
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

function parseAssignment(content) {
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

function parseAssignmentKey(content) {
  return parseAssignment(content)?.key;
}

function directAssignments(document, block) {
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

function parseEnabled(document, lineIndex, target) {
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

function parseSkillPath(document, block) {
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

function skillPathContainsQuarantine(document, block, skillPath, families) {
  if (skillPath !== undefined) return isQuarantined(skillPath, families);

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

function pluginIdFromCachedSkillPath(skillPath) {
  const slashPath = skillPath.replaceAll("\\", "/");
  const marker = "/plugins/cache/";
  const markerIndex = slashPath.lastIndexOf(marker);
  if (markerIndex === -1) return undefined;

  const segments = slashPath.slice(markerIndex + marker.length).split("/");
  if (
    segments.length < 6 ||
    segments[0] === "" ||
    segments[1] === "" ||
    segments[2] === "" ||
    segments[3] !== "skills" ||
    segments.at(-1) !== "SKILL.md"
  ) {
    return undefined;
  }

  const [marketplace, plugin] = segments;
  return `${plugin}@${marketplace}`;
}

function insertionAtBlockEnd(document, block, text) {
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

function setEnabled({
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

function removeBlock({
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

function appendPrefix(source, eol) {
  if (source === "") return "";
  if (!/(?:\r\n|\n|\r)$/.test(source)) return `${eol}${eol}`;
  if (/(?:\r\n|\n|\r)[ \t]*(?:\r\n|\n|\r)$/.test(source)) return "";
  return eol;
}

function quoteToml(value) {
  return JSON.stringify(value);
}

function applyOperations(source, operations) {
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

function indexNamedBlocks(blocks, kind) {
  const index = new Map();
  for (const block of blocks.filter((candidate) => candidate.kind === kind)) {
    const entries = index.get(block.id) ?? [];
    entries.push(block);
    index.set(block.id, entries);
  }
  return index;
}

function assertSingleBlock(blocks, target) {
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
export function planCatalogConfig({
  source,
  desired = {},
  quarantineFamilies,
}) {
  if (typeof source !== "string") {
    throw new ConfigReconcileError("source must be a string");
  }

  const families = normalizeFamilies(quarantineFamilies);
  const normalizedDesired = normalizeDesired(desired, families);
  const document = parseDocument(source);
  const operations = [];
  const actions = [];
  const appendSections = [];
  const pluginBlocks = indexNamedBlocks(document.blocks, "plugin");
  const mcpBlocks = indexNamedBlocks(document.blocks, "mcp");
  const managedPluginStates = new Map();

  for (const [id] of pluginBlocks) {
    const family = pluginFamilyFromId(id);
    if (family !== undefined && normalizedDesired.pluginFamilies.has(family)) {
      managedPluginStates.set(id, false);
    }
  }

  for (const [id, enabled] of normalizedDesired.plugins) {
    managedPluginStates.set(id, enabled);
  }

  // Hard quarantine is an invariant over existing config, even when the
  // active profile omits the family.
  for (const [id] of pluginBlocks) {
    if (isQuarantined(id, families)) managedPluginStates.set(id, false);
  }

  for (const [id, enabled] of [...managedPluginStates].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const block = assertSingleBlock(pluginBlocks.get(id) ?? [], `plugin ${id}`);
    if (block) {
      setEnabled({
        document,
        block,
        enabled,
        allowedKeys: PLUGIN_KEYS,
        target: id,
        resource: "plugin",
        reason: isQuarantined(id, families)
          ? "hard-quarantine"
          : normalizedDesired.plugins.has(id)
            ? "desired-state"
            : "plugin-family",
        operations,
        actions,
      });
    } else {
      appendSections.push(
        `[plugins.${quoteToml(id)}]${document.eol}enabled = ${String(enabled)}`,
      );
      actions.push({
        operation: "add",
        resource: "plugin",
        target: id,
        enabled,
        reason: "desired-state",
      });
    }
  }

  const managedMcpStates = new Map(normalizedDesired.mcpServers);
  for (const [id] of mcpBlocks) {
    if (isQuarantined(id, families)) managedMcpStates.set(id, false);
  }

  for (const [id, enabled] of [...managedMcpStates].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const block = assertSingleBlock(mcpBlocks.get(id) ?? [], `MCP server ${id}`);
    if (block) {
      setEnabled({
        document,
        block,
        enabled,
        allowedKeys: MCP_SERVER_KEYS,
        target: id,
        resource: "mcp-server",
        reason: isQuarantined(id, families) ? "hard-quarantine" : "desired-state",
        operations,
        actions,
      });
    } else if (enabled) {
      throw new ConfigReconcileError(
        `Cannot enable unmanaged MCP server without an existing transport: ${id}`,
        {
          code: "CONFIG_MCP_TRANSPORT_MISSING",
          target: id,
        },
      );
    }
  }

  const skillBlocks = document.blocks.filter((block) => block.kind === "skill");
  const desiredSkillBlocks = new Map();

  for (const block of skillBlocks) {
    const skillPath = parseSkillPath(document, block);
    const lexicalQuarantine = skillPathContainsQuarantine(
      document,
      block,
      skillPath,
      families,
    );
    const desiredState = skillPath
      ? normalizedDesired.skills.get(skillPath)
      : undefined;
    const cachedPluginId = skillPath
      ? pluginIdFromCachedSkillPath(skillPath)
      : undefined;
    const parentDisabled =
      cachedPluginId !== undefined && managedPluginStates.get(cachedPluginId) === false;

    if (skillPath && normalizedDesired.skills.has(skillPath)) {
      const matches = desiredSkillBlocks.get(skillPath) ?? [];
      matches.push(block);
      desiredSkillBlocks.set(skillPath, matches);
    }

    if (lexicalQuarantine) {
      if (!skillPath) {
        throw new ConfigReconcileError(
          "Hard-quarantined skills.config block has an ambiguous path",
          { code: "CONFIG_AMBIGUOUS_QUARANTINE_PATH" },
        );
      }
      setEnabled({
        document,
        block,
        enabled: false,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "hard-quarantine",
        operations,
        actions,
      });
      continue;
    }

    if (parentDisabled) {
      removeBlock({
        document,
        block,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "disabled-parent-plugin",
        operations,
        actions,
      });
      continue;
    }

    if (desiredState === true) {
      removeBlock({
        document,
        block,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "enabled-by-default",
        operations,
        actions,
      });
      continue;
    }

    if (desiredState === false) {
      setEnabled({
        document,
        block,
        enabled: false,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "desired-state",
        operations,
        actions,
      });
    }
  }

  for (const [skillPath, blocks] of desiredSkillBlocks) {
    assertSingleBlock(blocks, `skill ${skillPath}`);
  }

  for (const [skillPath, enabled] of [...normalizedDesired.skills].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (desiredSkillBlocks.has(skillPath) || enabled) continue;
    const cachedPluginId = pluginIdFromCachedSkillPath(skillPath);
    if (
      cachedPluginId !== undefined &&
      managedPluginStates.get(cachedPluginId) === false
    ) {
      continue;
    }

    appendSections.push(
      `[[skills.config]]${document.eol}path = ${quoteToml(skillPath)}${document.eol}enabled = false`,
    );
    actions.push({
      operation: "add",
      resource: "skill",
      target: skillPath,
      enabled: false,
      reason: "desired-state",
    });
  }

  let nextSource = applyOperations(source, operations);
  if (appendSections.length > 0) {
    nextSource += `${appendPrefix(nextSource, document.eol)}${appendSections.join(
      `${document.eol}${document.eol}`,
    )}${document.eol}`;
  }
  return Object.freeze({
    changed: nextSource !== source,
    originalHash: digest(source),
    nextHash: digest(nextSource),
    nextSource,
    actions: Object.freeze(actions.map((action) => Object.freeze(action))),
  });
}

export async function loadCatalogConfigPlan({
  configPath,
  desired = {},
  quarantineFamilies,
}) {
  if (typeof configPath !== "string" || configPath === "") {
    throw new ConfigReconcileError("configPath must be a non-empty string");
  }
  const { source } = await readRegularConfig(configPath);
  return planCatalogConfig({ source, desired, quarantineFamilies });
}

function configPathError(message, code) {
  return new ConfigReconcileError(message, { code });
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function inspectRegularConfig(configPath, expectedIdentity) {
  if (isQuarantined(configPath, HARD_QUARANTINE_FAMILIES)) {
    throw configPathError(
      "Refusing filesystem access to a hard-quarantined config path",
      "CONFIG_PATH_QUARANTINED",
    );
  }
  try {
    await requireRegularFileWithoutSymlinks(configPath, {
      label: "Codex config path",
    });
  } catch (error) {
    if (error?.code === "CATALOG_PATH_SYMLINK") {
      throw configPathError(
        `Codex config path must not be a symbolic link: ${configPath}`,
        "CONFIG_PATH_SYMLINK",
      );
    }
    if (error?.code === "CATALOG_PATH_WRONG_TYPE") {
      throw configPathError(
        `Codex config path must be a regular file: ${configPath}`,
        "CONFIG_PATH_NOT_REGULAR",
      );
    }
    throw error;
  }
  const metadata = await lstat(configPath);
  if (metadata.isSymbolicLink()) {
    throw configPathError(
      `Codex config path must not be a symbolic link: ${configPath}`,
      "CONFIG_PATH_SYMLINK",
    );
  }
  if (!metadata.isFile()) {
    throw configPathError(
      `Codex config path must be a regular file: ${configPath}`,
      "CONFIG_PATH_NOT_REGULAR",
    );
  }
  if (expectedIdentity && !sameFileIdentity(metadata, expectedIdentity)) {
    throw new ConcurrentConfigChangeError(
      "Codex config file identity changed after the plan was created",
    );
  }
  return metadata;
}

async function openConfigWithoutFollowing(configPath) {
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw configPathError(
      "This platform cannot safely open Codex config without following links",
      "CONFIG_NOFOLLOW_UNSUPPORTED",
    );
  }

  try {
    return await open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw configPathError(
        `Codex config path must not be a symbolic link: ${configPath}`,
        "CONFIG_PATH_SYMLINK",
      );
    }
    throw error;
  }
}

async function readRegularConfig(configPath, expectedIdentity) {
  const before = await inspectRegularConfig(configPath, expectedIdentity);
  const handle = await openConfigWithoutFollowing(configPath);

  try {
    const opened = await handle.stat();
    if (!opened.isFile()) {
      throw configPathError(
        `Codex config path must be a regular file: ${configPath}`,
        "CONFIG_PATH_NOT_REGULAR",
      );
    }
    if (!sameFileIdentity(opened, before)) {
      throw new ConcurrentConfigChangeError(
        "Codex config file identity changed while it was opened",
      );
    }

    const source = await handle.readFile({ encoding: "utf8" });
    await inspectRegularConfig(configPath, opened);
    return { source, identity: opened };
  } finally {
    await handle.close();
  }
}

async function writeExclusiveSynced(filePath, source) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(source, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeIfPresent(filePath) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function uniqueSiblingPath(configPath, suffix) {
  const token = randomBytes(6).toString("hex");
  return `${dirname(configPath)}/.${basename(configPath)}.krn-${suffix}-${process.pid}-${token}`;
}

function assertApplicablePlan(plan) {
  if (
    plan === null ||
    typeof plan !== "object" ||
    typeof plan.changed !== "boolean" ||
    typeof plan.originalHash !== "string" ||
    typeof plan.nextHash !== "string" ||
    typeof plan.nextSource !== "string"
  ) {
    throw new ConfigReconcileError("plan is not a catalog config plan");
  }
  if (digest(plan.nextSource) !== plan.nextHash) {
    throw new ConfigReconcileError("plan nextSource does not match nextHash", {
      code: "CONFIG_PLAN_TAMPERED",
    });
  }
}

/** Apply a previously reviewed plan with an optimistic hash guard. */
export async function applyCatalogConfigPlan({ configPath, plan }) {
  if (typeof configPath !== "string" || configPath === "") {
    throw new ConfigReconcileError("configPath must be a non-empty string");
  }
  assertApplicablePlan(plan);

  const initial = await readRegularConfig(configPath);
  const originalSource = initial.source;
  if (digest(originalSource) !== plan.originalHash) {
    throw new ConcurrentConfigChangeError();
  }
  if (!plan.changed) {
    return {
      changed: false,
      originalHash: plan.originalHash,
      nextHash: plan.nextHash,
      backupPath: undefined,
    };
  }

  const tempPath = uniqueSiblingPath(configPath, "tmp");
  const backupPath = uniqueSiblingPath(configPath, "backup");
  let backupWritten = false;
  let renamed = false;

  try {
    await writeExclusiveSynced(tempPath, plan.nextSource);

    const { source: beforeBackupSource } = await readRegularConfig(
      configPath,
      initial.identity,
    );
    if (digest(beforeBackupSource) !== plan.originalHash) {
      throw new ConcurrentConfigChangeError();
    }

    await writeExclusiveSynced(backupPath, originalSource);
    backupWritten = true;

    const { source: beforeRenameSource } = await readRegularConfig(
      configPath,
      initial.identity,
    );
    if (digest(beforeRenameSource) !== plan.originalHash) {
      throw new ConcurrentConfigChangeError();
    }

    await rename(tempPath, configPath);
    renamed = true;
    return {
      changed: true,
      originalHash: plan.originalHash,
      nextHash: plan.nextHash,
      backupPath,
    };
  } catch (error) {
    if (!renamed) await removeIfPresent(tempPath);
    if (backupWritten && !renamed) await removeIfPresent(backupPath);
    throw error;
  }
}
