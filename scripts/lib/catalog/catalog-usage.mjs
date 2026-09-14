import { createReadStream } from "node:fs";
import { opendir } from "node:fs/promises";
import path from "node:path";
import { requireDirectoryWithoutSymlinks } from "./catalog-path-safety.mjs";
import { HARD_QUARANTINE_FAMILIES } from "./catalog-errors.mjs";
import { matchesQuarantined } from "./plugin-identity.mjs";
import {
  dayFromMs,
  isValidDay,
  isObject,
  finalAggregates,
  nestedToolsForCall,
  normalizeWindow,
  normalizedCallId,
  normalizedToolId,
  recordEvidence,
  responseItem,
  skillReadsForCall,
} from "./catalog-usage-normalize.mjs";

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

async function* rolloutFiles(sessionsRoot) {
  const pendingDirectories = [sessionsRoot];

  while (pendingDirectories.length > 0) {
    const directoryPath = pendingDirectories.pop();
    let directory;
    try {
      directory = await opendir(directoryPath);
    } catch (error) {
      if (error?.code === "ENOENT" || error?.code === "EACCES" || error?.code === "EPERM") continue;
      throw error;
    }

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
  const present = await requireDirectoryWithoutSymlinks(sessionsRoot, {
    label: "sessionsRoot",
    beforeAccess: assertAllowedRoot,
    allowMissing: true,
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
      skipped_unreadable_files: 0,
      undated_rollout_files_scanned: 0,
      records_without_usable_date: 0,
      max_record_bytes: MAX_ROLLOUT_RECORD_BYTES,
      oversized_lines: 0,
      oversized_candidate_lines: 0,
      absence_means_unused: false,
    },
  };
  if (!present) {
    // A missing sessions root is unobserved, never evidence of non-use.
    report.coverage.absence_means_unused = false;
    return { aggregates: finalAggregates(aggregates), ...report };
  }

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
    let stream;
    try {
      stream = createReadStream(filePath);
      await consumeLines(stream, processLine, (bytes) => {
        report.scanned_bytes += bytes;
      }, (candidate) => {
        report.coverage.oversized_lines += 1;
        if (candidate) report.coverage.oversized_candidate_lines += 1;
      });
    } catch {
      // A file that becomes unreadable or vanishes mid-scan degrades to partial
      // evidence instead of aborting the whole scan.
      report.coverage.skipped_unreadable_files += 1;
      stream?.destroy?.();
      continue;
    }
    report.scanned_files += 1;
  }

  return { aggregates: finalAggregates(aggregates), ...report };
}

// Rollout line streaming (merged from catalog-usage-lines.mjs).
export const MAX_ROLLOUT_RECORD_BYTES = 16 * 1_024 * 1_024;

const CANDIDATE_RECORD_TYPES = [
  "function_call",
  "function_call_output",
  "custom_tool_call",
  "custom_tool_call_output",
].map((value) => Buffer.from(value));
const CANDIDATE_MARKER_OVERLAP = Math.max(...CANDIDATE_RECORD_TYPES.map((value) => value.length)) - 1;

export function isCandidateRecordLine(line) {
  return (
    line.indexOf(CANDIDATE_RECORD_TYPES[0]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[1]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[2]) !== -1 ||
    line.indexOf(CANDIDATE_RECORD_TYPES[3]) !== -1
  );
}

export async function consumeLines(stream, onLine, onChunk, onOversized) {
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

// Rollout path and canonical skill helpers (merged from catalog-usage-paths.mjs).
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

export function forbiddenName(name) {
  const lower = name.toLowerCase();
  return (
    matchesQuarantined(lower, HARD_QUARANTINE_FAMILIES) ||
    FORBIDDEN_DIRECTORY_NAMES.has(lower) ||
    FORBIDDEN_FILE_NAMES.has(lower) ||
    /\.(?:db|sqlite|sqlite3)(?:-(?:shm|wal))?$/.test(lower)
  );
}

export function assertAllowedRoot(root) {
  const segments = path.resolve(root).split(path.sep).filter(Boolean);
  if (segments.some(forbiddenName)) {
    throw new Error("sessionsRoot belongs to a forbidden path family");
  }
}

export function isRolloutFile(name) {
  return /^rollout-.+\.jsonl$/i.test(name);
}

export function derivedRolloutDay(sessionsRoot, filePath) {
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

const CATALOG_ID = /^[A-Za-z0-9][A-Za-z0-9@._:-]{0,159}$/;

function isCanonicalSkillPath(candidate) {
  return (
    typeof candidate === "string"
    && path.isAbsolute(candidate)
    && path.basename(candidate) === "SKILL.md"
    && !path.resolve(candidate).split(path.sep).filter(Boolean).some(forbiddenName)
  );
}

const safeId = (id) => (typeof id === "string" && CATALOG_ID.test(id) ? id : null);

export function canonicalSkillEntries(inventory) {
  const skills = (inventory?.skills ?? []).flatMap(({ id, path: skillPath, targetPath }) => {
    const validId = safeId(id);
    if (!validId) return [];
    return [skillPath, targetPath].filter(isCanonicalSkillPath).map((path) => ({ id: validId, path }));
  });
  const plugins = (inventory?.plugins ?? []).flatMap((plugin) =>
    (plugin.allSkillPaths || plugin.skillPaths || [])
      .filter(isCanonicalSkillPath)
      .map((skillPath) => ({ id: `${plugin.id}:${path.basename(path.dirname(skillPath))}`, path: skillPath }))
      .filter((entry) => safeId(entry.id)),
  );
  return [...skills, ...plugins];
}

export function canonicalSkills(entries) {
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
    if (!safeId(suppliedId)) {
      throw new TypeError("each canonical skill id must be a safe catalog identifier");
    }
    if (path.resolve(suppliedPath).split(path.sep).filter(Boolean).some(forbiddenName)) {
      throw new Error("canonical skill belongs to a forbidden path family");
    }
    byPath.set(path.normalize(suppliedPath), suppliedId);
  }
  return byPath;
}
