import fs from "node:fs";
import path from "node:path";

import { runGit } from "../support/git-cli.mjs";

const STATUSES = new Set(["ready", "claimed", "blocked", "in-review", "done", "abandoned", "deferred"]);
const TYPES = new Set(["task", "bug", "refactor", "research", "decision", "epic"]);
const REQUIRED = [
  "Id",
  "Title",
  "Status",
  "Type",
  "Repository-base",
  "Scope",
  "Deciding check",
  "Contract",
  "Acceptance",
  "Blocked by",
];
const DEFAULT_DIRS = [".scratch", ".krn/tickets"];

export function parseTicketText(text) {
  const start = text.indexOf("<krn-ticket>");
  const end = text.indexOf("</krn-ticket>");
  if (start === -1 || end === -1 || end < start) {
    return { fields: null, findings: [{ rule: "missing-block", message: "no complete <krn-ticket> block" }] };
  }
  const fields = new Map();
  for (const line of text.slice(start + "<krn-ticket>".length, end).split("\n")) {
    const match = /^([A-Za-z][A-Za-z ()-]*):\s*(.*)$/.exec(line.trim());
    if (match) fields.set(match[1], match[2].trim());
  }
  const findings = [];
  for (const name of REQUIRED) {
    if (!fields.has(name) || fields.get(name) === "") findings.push({ rule: "missing-field", message: `missing field: ${name}` });
  }
  const status = fields.get("Status");
  if (status && !STATUSES.has(status)) findings.push({ rule: "invalid-status", message: `unknown Status "${status}"` });
  const type = fields.get("Type");
  if (type && !TYPES.has(type)) findings.push({ rule: "invalid-type", message: `unknown Type "${type}"` });
  return { fields, findings };
}

function setField(text, name, value) {
  const start = text.indexOf("<krn-ticket>");
  const end = text.indexOf("</krn-ticket>");
  if (start === -1 || end === -1 || end < start) throw new Error("ticket has no complete <krn-ticket> block");
  const block = text.slice(start, end + "</krn-ticket>".length);
  const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:.*$`, "m");
  const updated = pattern.test(block)
    ? block.replace(pattern, `${name}: ${value}`)
    : block.replace("</krn-ticket>", `${name}: ${value}\n</krn-ticket>`);
  return text.slice(0, start) + updated + text.slice(end + "</krn-ticket>".length);
}

function readValidTicket(file) {
  const text = fs.readFileSync(file, "utf8");
  const { fields, findings } = parseTicketText(text);
  if (findings.length) throw new Error(`ticket is invalid: ${findings[0].message}`);
  return { text, fields };
}

function rootForTicket(file) {
  const resolved = path.resolve(file);
  for (const dir of DEFAULT_DIRS) {
    const marker = `${path.sep}${dir.split("/").join(path.sep)}${path.sep}`;
    const index = resolved.lastIndexOf(marker);
    if (index > 0) return resolved.slice(0, index);
  }
  return path.dirname(resolved);
}

function nextEpoch(fields) {
  const match = /(?:^|;\s*)epoch=(\d+)/.exec(fields.get("Claim") ?? "");
  return match ? Number(match[1]) + 1 : 1;
}

export function claimTicket({ file, root, id, worker, session = "", at = new Date().toISOString(), observer } = {}) {
  const claimRoot = root ?? rootForTicket(file);
  const ticketId = id ?? readValidTicket(file).fields.get("Id");
  const lockPath = path.join(claimRoot, ".krn", "claims", `${ticketId}.lock`);
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  let handle;
  try {
    handle = fs.openSync(lockPath, "wx");
  } catch (error) {
    if (error.code === "EEXIST") throw new Error(`ticket ${ticketId} is already-claimed`);
    throw error;
  }
  try {
    const { text, fields } = readValidTicket(file);
    const epoch = nextEpoch(fields);
    const claim = { worker, session, at, epoch };
    fs.writeFileSync(handle, JSON.stringify(claim));
    observer?.({ id: ticketId, lockPath, claim });
    const status = fields.get("Status");
    if (status !== "ready") throw new Error(`ticket ${ticketId} is not ready (Status: ${status})`);
    let next = setField(text, "Status", "claimed");
    next = setField(next, "Claim", `worker=${worker}; session=${session}; at=${at}; epoch=${epoch}`);
    fs.writeFileSync(file, next);
    return { id: ticketId, path: file, status: "claimed", claim };
  } finally {
    fs.closeSync(handle);
    fs.rmSync(lockPath, { force: true });
  }
}

export function closeTicket({ file, evidence = "none", resolution = "none", at = new Date().toISOString() }) {
  const { text, fields } = readValidTicket(file);
  const status = fields.get("Status");
  if (status === "done" || status === "abandoned") throw new Error(`ticket ${fields.get("Id")} is already terminal (Status: ${status})`);
  let next = setField(text, "Status", "done");
  next = setField(next, "Evidence", evidence);
  next = setField(next, "Resolution", `${resolution} (closed ${at})`);
  fs.writeFileSync(file, next);
  return { id: fields.get("Id"), path: file, status: "done" };
}

export function findTicketFile({ root, dirs = DEFAULT_DIRS, id } = {}) {
  for (const file of markdownFiles(root, dirs)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("<krn-ticket>")) continue;
    const { fields } = parseTicketText(text);
    if (fields?.get("Id") === id) return file;
  }
  throw new Error(`no ticket with id "${id}" under ${dirs.join(", ")}`);
}

function markdownFiles(root, dirs) {
  const files = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(full);
    }
  };
  for (const dir of dirs) walk(path.join(root, dir));
  return files.sort();
}

function blockerIds(value) {
  const raw = (value ?? "").trim();
  if (!raw || /^none$/i.test(raw)) return [];
  return raw.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function scopeEntries(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/^\.\//, ""))
    .filter(Boolean);
}

function globToRegExp(pattern) {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${source}$`);
}

function scopeDeclares(entry, file) {
  if (entry.endsWith("/")) return file.startsWith(entry);
  if (/[*?]/.test(entry)) return globToRegExp(entry).test(file);
  return file === entry || file.startsWith(`${entry}/`);
}

function scopeErrors({ root, git, ticket, base, head }) {
  const errors = [];
  const scope = scopeEntries(ticket.fields.get("Scope"));
  const diff = git(root, ["-c", "core.quotePath=false", "diff", "--name-only", `${base}..${head}`]);
  if (!diff.ok) {
    errors.push({ path: ticket.path, rule: "scope-diff-unavailable", message: `cannot diff ${base}..${head}` });
    return errors;
  }
  for (const file of diff.out.split("\n").map((entry) => entry.trim()).filter(Boolean)) {
    if (!scope.some((entry) => scopeDeclares(entry, file))) {
      errors.push({ path: ticket.path, rule: "scope-undeclared", message: `changed file outside Scope: ${file}` });
    }
  }
  return errors;
}

export function checkTickets({ root, dirs = DEFAULT_DIRS, git = runGit, id, base, head = "HEAD" } = {}) {
  const tickets = [];
  const errors = [];
  const warnings = [];
  for (const file of markdownFiles(root, dirs)) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    if (!text.includes("<krn-ticket>")) continue;
    const relative = path.relative(root, file);
    const { fields, findings } = parseTicketText(text);
    for (const finding of findings) errors.push({ path: relative, ...finding });
    if (!fields) continue;
    tickets.push({
      id: fields.get("Id"),
      path: relative,
      status: fields.get("Status"),
      blockedBy: blockerIds(fields.get("Blocked by")),
      fields,
    });
  }
  const byId = new Map();
  for (const ticket of tickets) {
    if (byId.has(ticket.id)) {
      errors.push({ path: ticket.path, rule: "duplicate-id", message: `duplicate ticket id "${ticket.id}"` });
    } else {
      byId.set(ticket.id, ticket);
    }
  }
  if (id && base) {
    const scoped = byId.get(id);
    if (!scoped) errors.push({ rule: "unknown-ticket", message: `no ticket with id "${id}"` });
    else errors.push(...scopeErrors({ root, git, ticket: scoped, base, head }));
  }
  for (const ticket of tickets) {
    for (const blocker of ticket.blockedBy) {
      if (!byId.has(blocker)) {
        errors.push({ path: ticket.path, rule: "unknown-blocker", message: `Blocked by names unknown ticket "${blocker}"` });
      }
    }
  }
  const visiting = new Set();
  const visited = new Set();
  const visit = (ticket, trail) => {
    if (visited.has(ticket.id)) return;
    if (visiting.has(ticket.id)) {
      errors.push({ path: ticket.path, rule: "dependency-cycle", message: `dependency cycle: ${[...trail, ticket.id].join(" -> ")}` });
      return;
    }
    visiting.add(ticket.id);
    for (const blocker of ticket.blockedBy) {
      const next = byId.get(blocker);
      if (next) visit(next, [...trail, ticket.id]);
    }
    visiting.delete(ticket.id);
    visited.add(ticket.id);
  };
  for (const ticket of tickets) visit(ticket, []);
  const isDone = (id) => byId.get(id)?.status === "done";
  const frontier = tickets
    .filter((ticket) => ticket.status === "ready" && ticket.blockedBy.every(isDone))
    .map((ticket) => ticket.id)
    .sort();
  const trailered = new Set();
  if (git(root, ["rev-parse", "--git-dir"]).ok) {
    const log = git(root, ["log", "-n", "200", "--format=%B"]);
    if (log.ok) {
      for (const match of log.out.matchAll(/^Ticket:\s*(\S+)\s*$/gim)) trailered.add(match[1]);
    }
  }
  for (const id of trailered) {
    const ticket = byId.get(id);
    if (!ticket) warnings.push({ rule: "orphan-commit-ticket", message: `commit names unknown ticket "${id}"` });
    else if (ticket.status !== "done") warnings.push({ path: ticket.path, rule: "open-ticket-committed", message: `commits exist for open ticket "${id}"` });
  }
  for (const ticket of tickets) {
    if (ticket.status === "done" && !trailered.has(ticket.id)) {
      warnings.push({ path: ticket.path, rule: "done-without-commit", message: `ticket "${ticket.id}" is done with no Ticket trailer in recent commits` });
    }
  }
  return { root, tickets: tickets.map(({ fields, ...rest }) => rest), frontier, errors, warnings };
}
