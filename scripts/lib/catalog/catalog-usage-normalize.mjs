import {
  freeformSource,
  isObject,
  literalToolCalls,
  nestedExecCommands,
  parseObject,
} from "./catalog-usage-json.mjs";
import { normalizeCommandPath, observedSkillsInShell } from "./catalog-usage-shell.mjs";

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
