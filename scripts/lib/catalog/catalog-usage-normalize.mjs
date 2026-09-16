import path from "node:path";
import {
  balancedJsonObject,
  isObject,
  literalToolCalls,
  nestedExecCommands,
  parseFlatExecLiteral,
  parseObject,
} from "./catalog-usage-literals.mjs";

export {
  balancedJsonObject,
  isObject,
  literalToolCalls,
  nestedExecCommands,
  parseFlatExecLiteral,
  parseObject,
};

const DAY_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_SINCE_DAYS = 30;

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

export function isValidDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}

export function dayFromMs(value) {
  return new Date(value).toISOString().slice(0, 10);
}

export function normalizeWindow({ sinceDay, sinceMs, sinceDays, nowMs }) {
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
  for (const value of [fromMs, throughMs]) {
    if (Math.abs(value) > 8.64e15) {
      throw new RangeError("usage window is outside the representable date range");
    }
  }

  return {
    fromMs,
    source,
    throughMs,
    fromDay: dayFromMs(fromMs),
    throughDay: dayFromMs(throughMs),
  };
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

export function skillReadsForCall(item, toolId, allowedSkills) {
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

export function nestedToolsForCall(item, toolId) {
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

export function normalizedCallId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,256}$/.test(value) ? value : null;
}

export function normalizedToolId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(value) ? value : null;
}

export function responseItem(record) {
  if (record.type === "response_item" && isObject(record.payload)) return record.payload;
  if (typeof record.type === "string") return record;
  return null;
}

function aggregateKey(kind, id) {
  return `${kind}\u0000${id}`;
}

export function recordEvidence(aggregates, { kind, id, calls, observed, reads, day, confidence }) {
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

export function finalAggregates(aggregates) {
  return [...aggregates.values()]
    .map(({ days, ...aggregate }) => ({ ...aggregate, active_days: days.size }))
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
}

export function freeformSource(item) {
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

// Shell command decoding (merged from catalog-usage-shell.mjs).
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

function stripHeredocBodies(text) {
  const lines = text.split("\n");
  const out = [];
  let delimiter = null;
  for (const line of lines) {
    if (delimiter !== null) {
      if (line.trim() === delimiter) delimiter = null;
      out.push("");
      continue;
    }
    const match = /<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(line);
    if (match) delimiter = match[2];
    out.push(line);
  }
  return out.join("\n");
}

function shellCommands(rawSource) {
  const source = stripHeredocBodies(rawSource);
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

export function normalizeCommandPath(candidate, workdir) {
  if (path.isAbsolute(candidate)) return path.normalize(candidate);
  if (typeof workdir === "string" && path.isAbsolute(workdir)) return path.resolve(workdir, candidate);
  return null;
}

export function observedSkillsInShell(command, workdir, allowedSkills, confidence, depth = 0) {
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
