import fs from "node:fs";
import path from "node:path";

import { sha256Hex } from "../kernel/digest.mjs";
import { gitTopLevel } from "../kernel/git.mjs";
import { walkFiles } from "../kernel/walk.mjs";
import { blockerIds, claimLockPath, DEFAULT_DIRS } from "./ticket-abi.mjs";
import { parseTicketFieldOccurrences, parseTicketText } from "./ticket.mjs";

const MAPPED_FIELDS = new Set(["Id", "Title", "Status", "Blocked by", "Claim"]);
const CLAIM_FIELDS = new Set(["worker", "session", "at", "epoch", "renew", "duration"]);
const TICKET_END = "</krn-ticket>";

function archiveEntry(relativePath, buffer, mode) {
  return {
    path: relativePath,
    content: buffer.toString("base64"),
    sha256: sha256Hex(buffer),
    mode: mode & 0o777,
  };
}

function addArchiveEntry(archive, relativePath, buffer, mode) {
  const entry = archive.get(relativePath);
  if (entry) {
    if (entry.sha256 !== sha256Hex(buffer)) throw new Error(`archive source changed while reading ${relativePath}`);
    return;
  }
  archive.set(relativePath, archiveEntry(relativePath, buffer, mode));
}

function relativePosix(root, absolute) {
  return path.relative(root, absolute).split(path.sep).join("/");
}

function assertRealDirectoryPath(root, relativePath) {
  let current = root;
  for (const component of relativePath.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    let stat;
    try {
      stat = fs.lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`ticket root path contains a symlink: ${relativePath}`);
    if (!stat.isDirectory()) throw new Error(`ticket root is not a real directory: ${relativePath}`);
  }
  return true;
}

function discoverTicketFiles(repo, ticketDirs) {
  return [...new Set(ticketDirs.flatMap((directory) => {
    const absolute = path.resolve(repo, directory);
    const relative = path.relative(repo, absolute);
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`ticket directory escapes repository: ${directory}`);
    }
    if (!assertRealDirectoryPath(repo, relative)) return [];
    return walkFiles(absolute, {
      filter: (entry) => entry.dirent.name.endsWith(".md"),
      compare: (left, right) => left.name.localeCompare(right.name),
      onError: "throw",
      onEntry: (entry) => {
        if (entry.dirent.isSymbolicLink()) throw new Error(`symlink entry under ticket root: ${entry.relative}`);
      },
    }).map((entry) => entry.path);
  }))].sort((left, right) => relativePosix(repo, left).localeCompare(relativePosix(repo, right)));
}

function discoverClaimLockFiles(repo) {
  const absolute = path.join(repo, ".krn/claims");
  if (!assertRealDirectoryPath(repo, path.join(".krn", "claims"))) return [];
  return walkFiles(absolute, {
    filter: (entry) => entry.dirent.name.endsWith(".lock"),
    compare: (left, right) => left.name.localeCompare(right.name),
    onError: "throw",
    onEntry: (entry) => {
      if (entry.dirent.isSymbolicLink()) throw new Error(`symlink entry under claim lock root: ${relativePosix(repo, entry.path)}`);
    },
  }).map((entry) => entry.path).sort((left, right) => relativePosix(repo, left).localeCompare(relativePosix(repo, right)));
}

function fieldPairs(value) {
  const result = {};
  for (const part of String(value ?? "").split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    const key = part.slice(0, separator).trim();
    if (key) Object.defineProperty(result, key, { value: part.slice(separator + 1).trim(), enumerable: true, configurable: true, writable: true });
  }
  return result;
}

function lockPathFor(root, id) {
  return relativePosix(root, claimLockPath(root, id));
}

function readLock(root, id, archive) {
  const relativePath = lockPathFor(root, id);
  const absolute = path.join(root, ...relativePath.split("/"));
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === "ENOENT") return { relativePath, value: null };
    return { relativePath, value: null, error: `cannot inspect claim lock ${relativePath}` };
  }
  if (stat.isSymbolicLink()) return { relativePath, value: null, error: `claim lock ${relativePath} is a symlink` };
  if (!stat.isFile()) return { relativePath, value: null, error: `claim lock ${relativePath} is not a regular file` };
  const buffer = fs.readFileSync(absolute);
  addArchiveEntry(archive, relativePath, buffer, stat.mode);
  let value;
  try {
    value = JSON.parse(buffer.toString("utf8"));
  } catch {
    return { relativePath, value: null, error: `claim lock ${relativePath} is invalid JSON` };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { relativePath, value: null, error: `claim lock ${relativePath} is not an object` };
  }
  return { relativePath, value };
}

function combineClaim(ticketClaim, lock) {
  const fromTicket = fieldPairs(ticketClaim);
  if (!ticketClaim && lock) return { error: "claim lock has no matching ticket Claim field" };
  if (!ticketClaim) return { claim: null };
  const merged = {};
  const ambiguities = [];
  for (const key of CLAIM_FIELDS) {
    const ticketValue = fromTicket[key];
    const lockValue = lock?.[key] === undefined || lock?.[key] === null ? undefined : String(lock[key]);
    if (ticketValue !== undefined && lockValue !== undefined && ticketValue !== lockValue) {
      if (key === "session") {
        ambiguities.push({ field: "Claim.session", ticketDigest: sha256Hex(ticketValue), lockDigest: sha256Hex(lockValue) });
      } else {
        return { error: `ticket and claim lock disagree on ${key}` };
      }
    }
    const value = ticketValue ?? lockValue;
    if (value !== undefined) Object.defineProperty(merged, key, { value, enumerable: true, configurable: true, writable: true });
  }
  const epoch = Number(merged.epoch ?? 0);
  const duration = Number(merged.duration ?? 0);
  if (!Number.isInteger(epoch) || epoch < 1) return { error: "claim epoch is invalid" };
  if (!Number.isFinite(duration) || duration <= 0) return { error: "claim lease duration is invalid" };
  if (!merged.worker || !merged.at || !merged.renew) return { error: "claim owner or timestamps are missing" };
  return {
    claim: {
      worker: merged.worker,
      session: merged.session ?? "",
      at: merged.at,
      epoch,
      renew: merged.renew,
      duration,
    },
    ambiguities,
  };
}

function addTask(state, task) {
  if (Object.hasOwn(state.tasks, task.id)) throw new Error(`duplicate ticket ID ${task.id}`);
  Object.defineProperty(state.tasks, task.id, { value: task, enumerable: true, configurable: true, writable: true });
}

function headerFieldOccurrences(text) {
  const occurrences = new Map();
  for (const [field, value] of parseTicketFieldOccurrences(text) ?? []) {
    if (!occurrences.has(field)) occurrences.set(field, []);
    occurrences.get(field).push(value);
  }
  return occurrences;
}

function safeArchivePath(root, relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || relativePath.includes("\\") || path.posix.isAbsolute(relativePath)) {
    throw new Error(`unsafe archive path: ${String(relativePath)}`);
  }
  const parts = relativePath.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) throw new Error(`unsafe archive path: ${relativePath}`);
  const absolute = path.resolve(root, ...parts);
  const relative = path.relative(root, absolute);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`unsafe archive path: ${relativePath}`);
  }
  return { absolute, parts };
}

function ensureArchiveParent(root, parts) {
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`unsafe archive parent: ${current}`);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      fs.mkdirSync(current);
    }
  }
}

function validateArchiveParent(root, parts) {
  let current = root;
  for (const part of parts.slice(0, -1)) {
    current = path.join(current, part);
    try {
      const stat = fs.lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`unsafe archive parent: ${current}`);
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
  }
}

export function prepareLegacyQueueImport(root, { ticketDirs = DEFAULT_DIRS } = {}) {
  const repo = gitTopLevel(root);
  if (!repo) throw new Error(`legacy queue import requires a Git worktree: ${root}`);
  if (!Array.isArray(ticketDirs) || ticketDirs.some((directory) => typeof directory !== "string" || path.isAbsolute(directory))) {
    throw new Error("ticket directories must be relative paths");
  }

  const errors = [];
  const ambiguities = [];
  const duplicateFields = [];
  const unmappedFields = [];
  const pathIds = [];
  const archive = new Map();
  const state = { version: 0, tasks: {}, operations: {}, intents: {} };
  const ticketFiles = discoverTicketFiles(repo, ticketDirs);

  for (const absolute of ticketFiles) {
    const relativePath = relativePosix(repo, absolute);
    const buffer = fs.readFileSync(absolute);
    addArchiveEntry(archive, relativePath, buffer, fs.statSync(absolute).mode);
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
      errors.push({ path: relativePath, rule: "invalid-utf8" });
      continue;
    }
    const parsed = parseTicketText(text);
    if (!parsed.fields) {
      for (const finding of parsed.findings) errors.push({ path: relativePath, rule: finding.rule, message: finding.message });
      continue;
    }
    for (const finding of parsed.findings) errors.push({ path: relativePath, rule: finding.rule, message: finding.message });
    const fields = parsed.fields;
    const id = fields.get("Id");
    if (!id) continue;
    pathIds.push({ path: relativePath, id });

    const occurrences = headerFieldOccurrences(text);
    for (const [field, values] of occurrences) {
      if (values.length < 2) continue;
      const identical = values.every((value) => value === values[0]);
      duplicateFields.push({ path: relativePath, id, field, count: values.length, identical });
      if (MAPPED_FIELDS.has(field) && !identical) errors.push({ path: relativePath, rule: "duplicate-mapped-field", field });
    }

    const lock = readLock(repo, id, archive);
    if (lock.error) errors.push({ path: lock.relativePath, rule: "invalid-claim-lock", message: lock.error });
    const claim = combineClaim(fields.get("Claim"), lock.value);
    if (claim.error) errors.push({ path: relativePath, rule: "claim-conflict", message: claim.error });
    for (const ambiguity of claim.ambiguities ?? []) ambiguities.push({ path: relativePath, id, claimLockPath: lock.relativePath, ...ambiguity });
    if (fields.get("Status") === "claimed" && !claim.claim) errors.push({ path: relativePath, rule: "claimed-without-owner" });

    const legacyFields = {};
    for (const [field, value] of fields) {
      if (MAPPED_FIELDS.has(field)) continue;
      const values = occurrences.get(field) ?? [value];
      const retainedValue = values.length > 1 ? values : value;
      Object.defineProperty(legacyFields, field, { value: retainedValue, enumerable: true, configurable: true, writable: true });
      unmappedFields.push({
        path: relativePath,
        id,
        field,
        occurrences: values.length,
        bytes: values.reduce((sum, item) => sum + Buffer.byteLength(item, "utf8"), 0),
        sha256: sha256Hex(JSON.stringify(values)),
      });
    }
    if ((claim.ambiguities?.length ?? 0) > 0) {
      const ticketClaim = fields.get("Claim") ?? "";
      Object.defineProperty(legacyFields, "Claim", { value: ticketClaim, enumerable: true, configurable: true, writable: true });
      unmappedFields.push({
        path: relativePath,
        id,
        field: "Claim",
        occurrences: 1,
        bytes: Buffer.byteLength(ticketClaim, "utf8"),
        sha256: sha256Hex(JSON.stringify([ticketClaim])),
      });
    }
    const end = text.indexOf(TICKET_END);
    const body = end < 0 ? "" : text.slice(end + TICKET_END.length);
    const dependencies = blockerIds(fields.get("Blocked by"));
    const task = {
      id,
      title: fields.get("Title") ?? "",
      body,
      sourcePath: relativePath,
      legacyFields,
      dependencies,
      contextRef: null,
      lane: fields.has("Integration"),
      // Legacy closeTicket consumed proof for every old envelope. Keep this
      // separate from actual automated-lane membership until the task is
      // deliberately migrated to the plain human-task path.
      legacyCloseProofRequired: fields.has("Contract"),
      status: fields.get("Status") ?? "open",
      epoch: claim.claim?.epoch ?? 0,
      owner: claim.claim?.worker ?? "",
      ...(claim.claim ? { lease: claim.claim } : {}),
      comments: [],
      history: [{ type: "imported", sourcePath: relativePath, sourceStatus: fields.get("Status") ?? "open" }],
    };
    try {
      addTask(state, task);
    } catch (error) {
      errors.push({ path: relativePath, rule: "duplicate-ticket-id", message: error.message });
    }
  }

  const knownLockPaths = new Set(pathIds.map(({ id }) => lockPathFor(repo, id)));
  const claimLockFiles = discoverClaimLockFiles(repo);
  for (const absolute of claimLockFiles) {
    const relativePath = relativePosix(repo, absolute);
    const buffer = fs.readFileSync(absolute);
    addArchiveEntry(archive, relativePath, buffer, fs.statSync(absolute).mode);
    if (!knownLockPaths.has(relativePath)) errors.push({ path: relativePath, rule: "orphan-claim-lock" });
  }

  const initialTicketPaths = ticketFiles.map((absolute) => relativePosix(repo, absolute));
  const finalTicketPaths = discoverTicketFiles(repo, ticketDirs).map((absolute) => relativePosix(repo, absolute));
  if (JSON.stringify(initialTicketPaths) !== JSON.stringify(finalTicketPaths)) {
    errors.push({ path: ".scratch/tickets", rule: "source-path-set-changed" });
  }
  const initialLockPaths = claimLockFiles.map((absolute) => relativePosix(repo, absolute));
  const finalLockPaths = discoverClaimLockFiles(repo).map((absolute) => relativePosix(repo, absolute));
  if (JSON.stringify(initialLockPaths) !== JSON.stringify(finalLockPaths)) {
    errors.push({ path: ".krn/claims", rule: "source-claim-set-changed" });
  }
  for (const entry of archive.values()) {
    const absolute = path.resolve(repo, ...entry.path.split("/"));
    if (!fs.existsSync(absolute) || sha256Hex(fs.readFileSync(absolute)) !== entry.sha256) {
      errors.push({ path: entry.path, rule: "source-changed-during-import" });
    }
  }

  const archiveEntries = [...archive.values()].sort((left, right) => left.path.localeCompare(right.path));
  unmappedFields.sort((left, right) => left.path.localeCompare(right.path) || left.field.localeCompare(right.field));
  duplicateFields.sort((left, right) => left.path.localeCompare(right.path) || left.field.localeCompare(right.field));
  ambiguities.sort((left, right) => left.path.localeCompare(right.path) || left.field.localeCompare(right.field));
  pathIds.sort((left, right) => left.path.localeCompare(right.path));
  errors.sort((left, right) => left.path.localeCompare(right.path) || left.rule.localeCompare(right.rule));
  return {
    state,
    archive: { version: 1, entries: archiveEntries },
    report: { errors, ambiguities, duplicateFields, unmappedFields, pathIds, archivePaths: archiveEntries.map((entry) => entry.path) },
    sourceRoot: repo,
    ticketDirs: [...ticketDirs],
  };
}

export function verifyPreparedLegacyQueueImport(prepared) {
  if (!prepared || typeof prepared.sourceRoot !== "string" || !Array.isArray(prepared.ticketDirs)) {
    throw new Error("prepared import is missing its source identity");
  }
  const current = prepareLegacyQueueImport(prepared.sourceRoot, { ticketDirs: prepared.ticketDirs });
  const serialized = (value) => JSON.stringify({ state: value.state, archive: value.archive, report: value.report });
  if (serialized(prepared) !== serialized(current)) throw new Error("prepared import differs from its source snapshot");
  return true;
}

export function restoreLegacyQueueArchive(root, archive) {
  if (!archive || archive.version !== 1 || !Array.isArray(archive.entries)) throw new Error("unsupported legacy queue archive");
  fs.mkdirSync(root, { recursive: true });
  const restoreRoot = fs.realpathSync(root);
  const seen = new Set();
  const restored = [];
  const plan = [];
  for (const entry of archive.entries) {
    if (!entry || typeof entry !== "object" || typeof entry.content !== "string" || typeof entry.sha256 !== "string") {
      throw new Error("invalid legacy queue archive entry");
    }
    if (seen.has(entry.path)) throw new Error(`duplicate archive path: ${entry.path}`);
    seen.add(entry.path);
    const { absolute, parts } = safeArchivePath(restoreRoot, entry.path);
    const buffer = Buffer.from(entry.content, "base64");
    if (buffer.toString("base64") !== entry.content || sha256Hex(buffer) !== entry.sha256) {
      throw new Error(`archive digest mismatch: ${entry.path}`);
    }
    validateArchiveParent(restoreRoot, parts);
    let exists = false;
    try {
      const stat = fs.lstatSync(absolute);
      if (!stat.isFile() || stat.isSymbolicLink() || !fs.readFileSync(absolute).equals(buffer)) {
        throw new Error(`restore target already differs: ${entry.path}`);
      }
      exists = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    plan.push({ entry, absolute, parts, buffer, exists });
  }
  for (const { entry, absolute, parts, buffer, exists } of plan) {
    if (!exists) {
      ensureArchiveParent(restoreRoot, parts);
      fs.writeFileSync(absolute, buffer, { flag: "wx", mode: Number.isInteger(entry.mode) ? entry.mode : 0o644 });
      if (Number.isInteger(entry.mode)) fs.chmodSync(absolute, entry.mode & 0o777);
    }
    restored.push(entry.path);
  }
  return restored.sort();
}
