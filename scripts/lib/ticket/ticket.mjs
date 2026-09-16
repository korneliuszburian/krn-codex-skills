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

export function checkTickets({ root, dirs = DEFAULT_DIRS, git = runGit } = {}) {
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

export function ticketFrontier(options = {}) {
  return checkTickets(options).frontier;
}
