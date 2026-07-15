import { createReadStream } from "node:fs";
import { opendir } from "node:fs/promises";
import path from "node:path";

import { requireDirectoryWithoutSymlinks } from "./catalog-path-safety.mjs";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_SINCE_DAYS = 30;
export const MAX_ROLLOUT_RECORD_BYTES = 16 * 1_024 * 1_024;

const FORBIDDEN_DIRECTORY_NAMES = new Set([
  "db",
  "database",
  "databases",
  "history",
  "histories",
  "log",
  "logs",
]);

const FORBIDDEN_FILE_NAMES = new Set(["history.jsonl"]);
const READ_COMMANDS = new Set([
  "awk",
  "bat",
  "batcat",
  "cat",
  "grep",
  "head",
  "less",
  "more",
  "rg",
  "sed",
  "tail",
]);

const LOCAL_EXEC_HELPERS = new Set([
  "clearTimeout",
  "exit",
  "generatedImage",
  "image",
  "load",
  "notify",
  "setTimeout",
  "store",
  "text",
  "yield_control",
]);

const CONFIDENCE_RANK = new Map([
  ["syntactic_only", 1],
  ["confirmed_input", 2],
  ["confirmed", 3],
]);

const CANDIDATE_RECORD_TYPES = [
  '"type":"function_call"',
  '"type":"function_call_output"',
  '"type":"custom_tool_call"',
  '"type":"custom_tool_call_output"',
].map((value) => Buffer.from(value));
const CANDIDATE_MARKER_OVERLAP = Math.max(...CANDIDATE_RECORD_TYPES.map((value) => value.length)) - 1;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isCandidateRecordLine(line) {
  return (
    line.indexOf(CANDIDATE_RECORD_TYPES[0]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[1]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[2]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[3]) !== -1
  );
}

async function consumeLines(stream, onLine, onChunk, onOversized) {
  let fragments = [];
  let fragmentBytes = 0;
  let oversized = false;
  let oversizedCandidate = false;
  let candidateTail = Buffer.alloc(0);

  const scanOversizedPiece = (piece) => {
    if (oversizedCandidate || piece.length === 0) return;
    const window = candidateTail.length === 0 ? piece : Buffer.concat([candidateTail, piece]);
    oversizedCandidate = isCandidateRecordLine(window);
    if (!oversizedCandidate) {
      candidateTail = Buffer.from(window.subarray(Math.max(0, window.length - CANDIDATE_MARKER_OVERLAP)));
    }
  };
  const append = (piece) => {
    if (piece.length === 0) return;
    if (oversized) {
      scanOversizedPiece(piece);
      return;
    }
    if (fragmentBytes + piece.length > MAX_ROLLOUT_RECORD_BYTES) {
      oversized = true;
      for (const fragment of fragments) scanOversizedPiece(fragment);
      scanOversizedPiece(piece);
      fragments = [];
      fragmentBytes = 0;
      return;
    }
    fragments.push(piece);
    fragmentBytes += piece.length;
  };
  const reset = () => {
    fragments = [];
    fragmentBytes = 0;
    oversized = false;
    oversizedCandidate = false;
    candidateTail = Buffer.alloc(0);
  };
  const emit = (piece) => {
    append(piece);
    if (oversized) {
      onOversized(oversizedCandidate);
      reset();
      return;
    }
    let line = fragments.length === 0
      ? Buffer.alloc(0)
      : fragments.length === 1
        ? fragments[0]
        : Buffer.concat(fragments, fragmentBytes);
    if (line[line.length - 1] === 13) line = line.subarray(0, line.length - 1);
    onLine(line);
    reset();
  };

  for await (const chunk of stream) {
    onChunk(chunk.length);
    let start = 0;
    let newline = chunk.indexOf(10, start);
    while (newline !== -1) {
      emit(chunk.subarray(start, newline));
      start = newline + 1;
      newline = chunk.indexOf(10, start);
    }
    if (start < chunk.length) {
      append(chunk.subarray(start));
    }
  }

  if (fragments.length > 0 || oversized) emit(Buffer.alloc(0));
}

function isValidDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

function dayFromMs(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function timestampMs(record) {
  const value = record.timestamp;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function forbiddenName(name) {
  const lower = name.toLowerCase();
  return (
    lower.includes("superpowers") ||
    FORBIDDEN_DIRECTORY_NAMES.has(lower) ||
    FORBIDDEN_FILE_NAMES.has(lower) ||
    /\.(?:db|sqlite|sqlite3)(?:-(?:shm|wal))?$/.test(lower)
  );
}

function assertAllowedRoot(root) {
  const segments = path.resolve(root).split(path.sep).filter(Boolean);
  if (segments.some(forbiddenName)) {
    throw new Error("sessionsRoot belongs to a forbidden path family");
  }
}

function isRolloutFile(name) {
  return /^rollout-.+\.jsonl$/i.test(name);
}

function derivedRolloutDay(sessionsRoot, filePath) {
  const candidates = new Set();
  const basenameMatch = path.basename(filePath).match(/^rollout-(\d{4}-\d{2}-\d{2})(?:T|[-_])/i);
  if (basenameMatch && isValidDay(basenameMatch[1])) {
    candidates.add(basenameMatch[1]);
  }

  const parts = path.relative(sessionsRoot, filePath).split(path.sep);
  for (let index = 0; index <= parts.length - 3; index += 1) {
    if (!/^\d{4}$/.test(parts[index]) || !/^\d{2}$/.test(parts[index + 1]) || !/^\d{2}$/.test(parts[index + 2])) {
      continue;
    }
    const candidate = `${parts[index]}-${parts[index + 1]}-${parts[index + 2]}`;
    if (isValidDay(candidate)) {
      candidates.add(candidate);
    }
  }

  return candidates.size === 1 ? [...candidates][0] : null;
}

async function* rolloutFiles(sessionsRoot) {
  const pendingDirectories = [sessionsRoot];

  while (pendingDirectories.length > 0) {
    const directoryPath = pendingDirectories.pop();
    const directory = await opendir(directoryPath);

    for await (const entry of directory) {
      if (forbiddenName(entry.name) || entry.isSymbolicLink()) {
        continue;
      }

      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        pendingDirectories.push(entryPath);
      } else if (entry.isFile() && isRolloutFile(entry.name)) {
        yield entryPath;
      }
    }
  }
}

function normalizeWindow({ sinceDay, sinceMs, sinceDays, nowMs }) {
  const throughMs = nowMs ?? Date.now();
  if (!Number.isFinite(throughMs)) {
    throw new TypeError("nowMs must be a finite epoch timestamp");
  }
  if (sinceDay !== undefined && sinceMs !== undefined) {
    throw new TypeError("provide either sinceDay or sinceMs, not both");
  }

  let fromMs;
  let source;
  if (sinceDay !== undefined) {
    if (!isValidDay(sinceDay)) {
      throw new TypeError("sinceDay must use YYYY-MM-DD");
    }
    fromMs = Date.parse(`${sinceDay}T00:00:00.000Z`);
    source = "since_day";
  } else if (sinceMs !== undefined) {
    if (!Number.isFinite(sinceMs)) {
      throw new TypeError("sinceMs must be a finite epoch timestamp");
    }
    fromMs = sinceMs;
    source = "since_ms";
  } else {
    const days = sinceDays ?? DEFAULT_SINCE_DAYS;
    if (!Number.isInteger(days) || days <= 0) {
      throw new TypeError("sinceDays must be a positive integer");
    }
    fromMs = throughMs - days * DAY_MS;
    source = "since_days";
  }

  if (fromMs > throughMs) {
    throw new RangeError("usage window cannot begin after nowMs");
  }

  return {
    fromMs,
    source,
    throughMs,
    fromDay: dayFromMs(fromMs),
    throughDay: dayFromMs(throughMs),
  };
}

function canonicalSkills(entries) {
  if (!Array.isArray(entries)) {
    throw new TypeError("canonicalSkillPaths must be an array");
  }

  const byPath = new Map();
  for (const entry of entries) {
    const suppliedPath = typeof entry === "string" ? entry : entry?.path;
    const suppliedId = typeof entry === "string" ? path.basename(path.dirname(entry)) : entry?.id;
    if (typeof suppliedPath !== "string" || !path.isAbsolute(suppliedPath) || path.basename(suppliedPath) !== "SKILL.md") {
      throw new TypeError("each canonical skill path must be an absolute SKILL.md path");
    }
    if (typeof suppliedId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9@._:-]{0,159}$/.test(suppliedId)) {
      throw new TypeError("each canonical skill id must be a safe catalog identifier");
    }
    if (path.resolve(suppliedPath).split(path.sep).filter(Boolean).some(forbiddenName)) {
      throw new Error("canonical skill belongs to a forbidden path family");
    }
    byPath.set(path.normalize(suppliedPath), suppliedId);
  }
  return byPath;
}

function shellCommands(source) {
  const commands = [];
  let tokens = [];
  let token = "";
  let tokenStarted = false;
  let quote = null;
  let escaped = false;

  const finishToken = () => {
    if (tokenStarted) {
      tokens.push(token);
      token = "";
      tokenStarted = false;
    }
  };
  const finishCommand = () => {
    finishToken();
    if (tokens.length > 0) {
      commands.push(tokens);
      tokens = [];
    }
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      token += character;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (character === "'") quote = null;
      else token += character;
      tokenStarted = true;
      continue;
    }
    if (quote === '"') {
      if (character === '"') quote = null;
      else if (character === "\\") escaped = true;
      else token += character;
      tokenStarted = true;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      tokenStarted = true;
    } else if (character === "'" || character === '"') {
      quote = character;
      tokenStarted = true;
    } else if (/\s/.test(character)) {
      finishToken();
      if (character === "\n") finishCommand();
    } else if (character === ";" || character === "|" || character === "&") {
      finishCommand();
      if (source[index + 1] === character) index += 1;
    } else if (character === "#" && !tokenStarted) {
      while (index + 1 < source.length && source[index + 1] !== "\n") index += 1;
    } else {
      token += character;
      tokenStarted = true;
    }
  }

  if (quote !== null || escaped) {
    return [];
  }
  finishCommand();
  return commands;
}

function executableIndex(tokens) {
  let index = 0;
  while (index < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])) index += 1;
  if (path.basename(tokens[index] ?? "") === "rtk") {
    index += 1;
    if (tokens[index] === "proxy") index += 1;
  }
  if (path.basename(tokens[index] ?? "") === "command") index += 1;
  return index;
}

function normalizeCommandPath(candidate, workdir) {
  if (path.isAbsolute(candidate)) return path.normalize(candidate);
  if (typeof workdir === "string" && path.isAbsolute(workdir)) return path.resolve(workdir, candidate);
  return null;
}

function observedSkillsInShell(command, workdir, allowedSkills, confidence, depth = 0) {
  const observed = new Map();
  if (depth > 2) return observed;

  for (const tokens of shellCommands(command)) {
    const commandIndex = executableIndex(tokens);
    const executable = path.basename(tokens[commandIndex] ?? "");

    if (executable === "bash" || executable === "sh" || executable === "zsh") {
      const optionIndex = tokens.findIndex((token, index) => index > commandIndex && /^-[A-Za-z]*c[A-Za-z]*$/.test(token));
      if (optionIndex !== -1 && typeof tokens[optionIndex + 1] === "string") {
        const nested = observedSkillsInShell(tokens[optionIndex + 1], workdir, allowedSkills, confidence, depth + 1);
        for (const [id, nestedConfidence] of nested) observed.set(id, nestedConfidence);
      }
      continue;
    }

    if (!READ_COMMANDS.has(executable)) continue;
    for (const candidate of tokens.slice(commandIndex + 1)) {
      const normalized = normalizeCommandPath(candidate, workdir);
      const id = normalized === null ? undefined : allowedSkills.get(normalized);
      if (id !== undefined) observed.set(id, confidence);
    }
  }
  return observed;
}

function parseObject(value) {
  if (isObject(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value);
    return isObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function balancedJsonObject(source, start) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return { end: index + 1, source: source.slice(start, index + 1) };
    }
  }
  return null;
}

function parseFlatExecLiteral(source) {
  let index = 0;
  let cmd;
  let workdir;
  const seen = new Set();
  const allowedKeys = new Map([
    ["cmd", "string"],
    ["justification", "string"],
    ["login", "boolean"],
    ["max_output_tokens", "number"],
    ["prefix_rule", "string_array"],
    ["sandbox_permissions", "string"],
    ["shell", "string"],
    ["tty", "boolean"],
    ["workdir", "nullable_string"],
    ["yield_time_ms", "number"],
  ]);
  const skipWhitespace = () => {
    while (/\s/.test(source[index] ?? "")) index += 1;
  };
  const readJsonString = () => {
    if (source[index] !== '"') return null;
    const start = index;
    index += 1;
    let escaped = false;
    while (index < source.length) {
      const character = source[index];
      index += 1;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') {
        try {
          const value = JSON.parse(source.slice(start, index));
          return typeof value === "string" ? value : null;
        } catch {
          return null;
        }
      }
    }
    return null;
  };
  const readStringArray = () => {
    if (source[index] !== "[") return null;
    index += 1;
    skipWhitespace();
    const values = [];
    if (source[index] === "]") {
      index += 1;
      return values;
    }
    while (index < source.length) {
      const value = readJsonString();
      if (value === null) return null;
      values.push(value);
      skipWhitespace();
      if (source[index] === "]") {
        index += 1;
        return values;
      }
      if (source[index] !== ",") return null;
      index += 1;
      skipWhitespace();
      if (source[index] === "]") return null;
    }
    return null;
  };
  const readValue = (kind) => {
    if (kind === "string" || kind === "nullable_string") {
      if (kind === "nullable_string" && source.startsWith("null", index)) {
        index += 4;
        return { ok: true, value: null };
      }
      const value = readJsonString();
      return value === null ? { ok: false } : { ok: true, value };
    }
    if (kind === "boolean") {
      if (source.startsWith("true", index)) {
        index += 4;
        return { ok: true, value: true };
      }
      if (source.startsWith("false", index)) {
        index += 5;
        return { ok: true, value: false };
      }
      return { ok: false };
    }
    if (kind === "number") {
      const match = source.slice(index).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
      if (match === null) return { ok: false };
      const value = Number(match[0]);
      if (!Number.isFinite(value)) return { ok: false };
      index += match[0].length;
      return { ok: true, value };
    }
    const value = readStringArray();
    return value === null ? { ok: false } : { ok: true, value };
  };

  skipWhitespace();
  if (source[index] !== "{") return null;
  index += 1;
  skipWhitespace();
  if (source[index] === "}") return null;

  while (index < source.length) {
    let key;
    if (source[index] === '"') {
      key = readJsonString();
    } else {
      const match = source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
      if (match === null) return null;
      key = match[0];
      index += match[0].length;
    }
    const kind = allowedKeys.get(key);
    if (kind === undefined || seen.has(key)) return null;
    seen.add(key);

    skipWhitespace();
    if (source[index] !== ":") return null;
    index += 1;
    skipWhitespace();

    const parsed = readValue(kind);
    if (!parsed.ok) return null;
    if (key === "cmd") cmd = parsed.value;
    else if (key === "workdir") workdir = parsed.value;

    skipWhitespace();
    if (source[index] === "}") {
      index += 1;
      skipWhitespace();
      return index === source.length && typeof cmd === "string" ? { cmd, workdir } : null;
    }
    if (source[index] !== ",") return null;
    index += 1;
    skipWhitespace();
    if (source[index] === "}") return null;
  }
  return null;
}

function literalToolCalls(source) {
  const calls = [];
  let index = 0;

  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      const quote = character;
      index += 1;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        index += 1;
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === quote) break;
      }
      continue;
    }
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const closing = source.indexOf("*/", index + 2);
      index = closing === -1 ? source.length : closing + 2;
      continue;
    }
    if (!source.startsWith("tools.", index) || /[A-Za-z0-9_$.]/.test(source[index - 1] ?? "")) {
      index += 1;
      continue;
    }

    const nameStart = index + "tools.".length;
    const match = source.slice(nameStart).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (match === null || match[0].length > 160) {
      index = nameStart;
      continue;
    }
    let opening = nameStart + match[0].length;
    while (/\s/.test(source[opening] ?? "")) opening += 1;
    if (source[opening] === "(") {
      calls.push({ name: match[0], opening });
    }
    index = opening + 1;
  }
  return calls;
}

function nestedExecCommands(source) {
  const commands = [];
  for (const call of literalToolCalls(source)) {
    if (call.name !== "exec_command") continue;
    let index = call.opening + 1;
    while (/\s/.test(source[index] ?? "")) index += 1;
    if (source[index] !== "{") continue;
    const literal = balancedJsonObject(source, index);
    if (literal === null) continue;
    let closing = literal.end;
    while (/\s/.test(source[closing] ?? "")) closing += 1;
    if (source[closing] === ")") {
      const parsed = parseFlatExecLiteral(literal.source);
      if (typeof parsed?.cmd === "string") {
        commands.push({ cmd: parsed.cmd, workdir: parsed.workdir });
      }
    }
  }
  return commands;
}

function freeformSource(item) {
  if (typeof item.input === "string") return item.input;
  if (typeof item.arguments !== "string") return null;
  const parsed = parseObject(item.arguments);
  if (parsed !== null) {
    for (const key of ["input", "source", "code"]) {
      if (typeof parsed[key] === "string") return parsed[key];
    }
    return null;
  }
  return item.arguments;
}

function mergeObserved(target, source) {
  for (const [id, confidence] of source) {
    const current = target.get(id);
    if (current === undefined || CONFIDENCE_RANK.get(confidence) > CONFIDENCE_RANK.get(current)) {
      target.set(id, confidence);
    }
  }
}

function isOrchestrationExec(toolId) {
  return toolId === "exec" || toolId === "functions.exec";
}

function skillReadsForCall(item, toolId, allowedSkills) {
  const observed = new Map();
  if (isOrchestrationExec(toolId)) {
    const source = freeformSource(item);
    if (source === null) return observed;
    for (const nested of nestedExecCommands(source)) {
      mergeObserved(
        observed,
        observedSkillsInShell(nested.cmd, nested.workdir, allowedSkills, "syntactic_only"),
      );
    }
    return observed;
  }

  if (toolId === "exec_command" || toolId === "functions.exec_command") {
    const input = parseObject(item.arguments) ?? parseObject(item.input);
    if (typeof input?.cmd === "string") {
      mergeObserved(
        observed,
        observedSkillsInShell(input.cmd, input.workdir, allowedSkills, "confirmed_input"),
      );
    }
    return observed;
  }

  if (item.type === "custom_tool_call" && /(?:^|[._:])(?:open_file|read_file|read_text_file)$/.test(toolId)) {
    const input = parseObject(item.input) ?? parseObject(item.arguments);
    const candidate = input?.path ?? input?.file_path;
    if (typeof candidate === "string") {
      const normalized = normalizeCommandPath(candidate, input?.workdir);
      const id = normalized === null ? undefined : allowedSkills.get(normalized);
      if (id !== undefined) observed.set(id, "confirmed_input");
    }
  }
  return observed;
}

function nestedToolsForCall(item, toolId) {
  const observed = new Map();
  if (!isOrchestrationExec(toolId)) return observed;
  const source = freeformSource(item);
  if (source === null) return observed;

  for (const call of literalToolCalls(source)) {
    if (LOCAL_EXEC_HELPERS.has(call.name)) continue;
    observed.set(call.name, (observed.get(call.name) ?? 0) + 1);
  }
  return observed;
}

function normalizedCallId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,256}$/.test(value) ? value : null;
}

function normalizedToolId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
}

function responseItem(record) {
  if (record.type === "response_item" && isObject(record.payload)) return record.payload;
  if (typeof record.type === "string") return record;
  return null;
}

function aggregateKey(kind, id) {
  return `${kind}\u0000${id}`;
}

function recordEvidence(aggregates, { kind, id, calls, observed, reads, day, confidence }) {
  const key = aggregateKey(kind, id);
  let aggregate = aggregates.get(key);
  if (aggregate === undefined) {
    aggregate = {
      kind,
      id,
      confirmed_calls: 0,
      observed_calls: 0,
      observed_reads: 0,
      days: new Set(),
      last_seen_day: null,
      confidence,
    };
    aggregates.set(key, aggregate);
  }
  aggregate.confirmed_calls += calls;
  aggregate.observed_calls += observed;
  aggregate.observed_reads += reads;
  aggregate.days.add(day);
  if (aggregate.last_seen_day === null || day > aggregate.last_seen_day) aggregate.last_seen_day = day;
  if (CONFIDENCE_RANK.get(confidence) > CONFIDENCE_RANK.get(aggregate.confidence)) {
    aggregate.confidence = confidence;
  }
}

function finalAggregates(aggregates) {
  return [...aggregates.values()]
    .map(({ days, ...aggregate }) => ({ ...aggregate, active_days: days.size }))
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

/**
 * Scan bounded Codex rollout evidence without returning transcript content.
 *
 * canonicalSkillPaths accepts absolute paths or { id, path } entries. Skill
 * reads are evidence only; absence from aggregates is never an unused verdict.
 * malformed_lines counts only candidate call/output records that fail JSON
 * parsing or do not contain an object; irrelevant transcript lines are never
 * parsed and therefore cannot contribute to that diagnostic.
 * Records above MAX_ROLLOUT_RECORD_BYTES are discarded in-stream and reported
 * only as aggregate coverage counters; their content is never parsed or kept.
 */
export async function scanCatalogUsage({
  sessionsRoot,
  canonicalSkillPaths,
  sinceDay,
  sinceMs,
  sinceDays,
  nowMs,
}) {
  if (typeof sessionsRoot !== "string" || sessionsRoot.length === 0) {
    throw new TypeError("sessionsRoot must be a non-empty path");
  }
  assertAllowedRoot(sessionsRoot);
  await requireDirectoryWithoutSymlinks(sessionsRoot, {
    label: "sessionsRoot",
    beforeAccess: assertAllowedRoot,
  });

  const allowedSkills = canonicalSkills(canonicalSkillPaths);
  const window = normalizeWindow({ sinceDay, sinceMs, sinceDays, nowMs });
  const aggregates = new Map();
  const report = {
    scanned_files: 0,
    scanned_bytes: 0,
    malformed_lines: 0,
    coverage: {
      since_day: window.fromDay,
      through_day: window.throughDay,
      source: window.source,
      skipped_files_before_window: 0,
      skipped_files_after_window: 0,
      undated_rollout_files_scanned: 0,
      records_without_usable_date: 0,
      max_record_bytes: MAX_ROLLOUT_RECORD_BYTES,
      oversized_lines: 0,
      oversized_candidate_lines: 0,
      absence_means_unused: false,
    },
  };

  for await (const filePath of rolloutFiles(sessionsRoot)) {
    const fileDay = derivedRolloutDay(sessionsRoot, filePath);
    if (fileDay !== null && fileDay < window.fromDay) {
      report.coverage.skipped_files_before_window += 1;
      continue;
    }
    if (fileDay !== null && fileDay > window.throughDay) {
      report.coverage.skipped_files_after_window += 1;
      continue;
    }
    if (fileDay === null) report.coverage.undated_rollout_files_scanned += 1;

    const stream = createReadStream(filePath);
    const pending = new Map();
    const processLine = (line) => {
      if (line.length === 0 || !isCandidateRecordLine(line)) return;
      let record;
      try {
        record = JSON.parse(line.toString("utf8"));
      } catch {
        report.malformed_lines += 1;
        return;
      }
      if (!isObject(record)) {
        report.malformed_lines += 1;
        return;
      }

      const item = responseItem(record);
      if (!isObject(item)) return;
      if (item.type === "function_call" || item.type === "custom_tool_call") {
        const callId = normalizedCallId(item.call_id);
        const toolId = normalizedToolId(item.name);
        if (callId === null || toolId === null || pending.has(callId)) return;
        pending.set(callId, {
          expectedOutput: item.type === "function_call" ? "function_call_output" : "custom_tool_call_output",
          nestedTools: nestedToolsForCall(item, toolId),
          skillReads: skillReadsForCall(item, toolId, allowedSkills),
          timestamp: timestampMs(record),
          toolId,
        });
        return;
      }

      if (item.type !== "function_call_output" && item.type !== "custom_tool_call_output") return;
      const callId = normalizedCallId(item.call_id);
      const call = callId === null ? undefined : pending.get(callId);
      if (call === undefined || call.expectedOutput !== item.type) return;
      pending.delete(callId);

      const evidenceMs = call.timestamp ?? timestampMs(record) ?? (fileDay === null ? null : Date.parse(`${fileDay}T00:00:00.000Z`));
      if (evidenceMs === null) {
        report.coverage.records_without_usable_date += 1;
        return;
      }
      if (evidenceMs < window.fromMs || evidenceMs > window.throughMs) return;
      const day = dayFromMs(evidenceMs);

      recordEvidence(aggregates, {
        kind: "tool",
        id: call.toolId,
        calls: 1,
        observed: 0,
        reads: 0,
        day,
        confidence: "confirmed",
      });
      for (const [skillId, confidence] of call.skillReads) {
        recordEvidence(aggregates, {
          kind: "skill",
          id: skillId,
          calls: 0,
          observed: 0,
          reads: 1,
          day,
          confidence,
        });
      }
      for (const [nestedToolId, count] of call.nestedTools) {
        recordEvidence(aggregates, {
          kind: "nested_tool",
          id: nestedToolId,
          calls: 0,
          observed: count,
          reads: 0,
          day,
          confidence: "syntactic_only",
        });
      }
    };
    await consumeLines(stream, processLine, (bytes) => {
      report.scanned_bytes += bytes;
    }, (candidate) => {
      report.coverage.oversized_lines += 1;
      if (candidate) report.coverage.oversized_candidate_lines += 1;
    });
    report.scanned_files += 1;
  }

  return { aggregates: finalAggregates(aggregates), ...report };
}
