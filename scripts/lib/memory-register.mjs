import fs from "node:fs";
import path from "node:path";

import { globToRegex } from "./lessons/lessons.mjs";
import { runGit } from "./kernel/git.mjs";
import { fenceLines } from "./support/fences.mjs";
import { posixRelative } from "./support/path-rules.mjs";

const REGISTER = "docs/research/memory-register.md";

const KINDS = new Set(["durable", "config", "derived", "working", "code"]);

const COLUMNS = [
  "Artifact",
  "Kind",
  "Writer",
  "Reader",
  "Trigger",
  "Budget",
  "Falsifier",
  "Status",
  "Verified",
];

const FALSIFIER = /^(test\/[A-Za-z0-9_./-]+\.mjs)::(.+?)@([0-9a-f]{7})$/;
const RETIRE = /^retired@([0-9a-f]{7})(?:;\s*superseded-by:\s*(\S.*?))?$/;
const VERIFIED = /^([0-9a-f]{7})@(\d{4}-\d{2}-\d{2})$/;
const HEADER_STATUS = /Status:\s*`(accepted|lab-test|defer|reject)`/;
const HEADER_VERIFIED = /Verified:\s*`?([0-9a-f]{7})@(\d{4}-\d{2}-\d{2})`?/;
const BUDGET = /^(\d+)\s*(rows?|files?|lines?|chars?)$/i;
const BUDGET_FREE = /^(unbounded|static|historical|-)$/i;
const WARNING_AGING = 20;
const OWNED_ROOTS = ["docs", "scripts", "test", "skills", "config", ".agents", ".github"];

function splitRow(line) {
  const cells = [];
  const inner = line.startsWith("|") ? line.slice(1) : line;
  const body = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

function tableRows(lines, headerPredicate) {
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("|")) continue;
    const cells = splitRow(lines[index]);
    if (!headerPredicate(cells)) continue;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const line = lines[cursor];
      if (!line.startsWith("|")) break;
      if (/^\|[\s:|-]*-{1,}[\s:|-]*\|?$/.test(line)) continue;
      rows.push({ cells: splitRow(line), number: cursor + 1 });
    }
    break;
  }
  return rows;
}

const clean = (value) => String(value ?? "").replace(/`/g, "").trim();

function isRegisterHeader(cells) {
  return cells.length === COLUMNS.length && COLUMNS.every((name, index) => cells[index].toLowerCase() === name.toLowerCase());
}

function isExclusionHeader(cells) {
  return cells.length === 5 && cells[0].toLowerCase() === "pattern";
}

function matchGlob(glob, file) {
  return globToRegex(glob).test(file);
}

function summary(code, message) {
  return `${code}: ${message}`;
}

export function checkMemoryRegister({ root, git = runGit } = {}) {
  const errors = [];
  const warnings = [];
  const registerFile = path.join(root, REGISTER);
  if (!fs.existsSync(registerFile) || !fs.statSync(registerFile).isFile()) {
    return { root, errors: [summary("register-missing", REGISTER)], warnings };
  }
  const text = fs.readFileSync(registerFile, "utf8");
  const { lines } = (() => {
    const entries = fenceLines(text);
    return { lines: entries.filter((entry) => !entry.fenced).map((entry) => entry.line) };
  })();

  const header = text.split("\n## ")[0];
  if (!HEADER_STATUS.test(header)) errors.push(summary("missing-field", `${REGISTER}: header needs a canonical Status enum`));
  if (!/Consumer:\s*\S/.test(header)) errors.push(summary("missing-field", `${REGISTER}: header needs Consumer:`));
  if (!/Owner:\s*\S/.test(header)) errors.push(summary("missing-field", `${REGISTER}: header needs Owner:`));
  const headerVerified = HEADER_VERIFIED.exec(header);

  const registerRows = tableRows(lines, isRegisterHeader);
  const exclusionRows = tableRows(lines, isExclusionHeader);
  if (registerRows.length === 0) {
    return { root, errors: [...errors, summary("missing-field", `${REGISTER}: register table with ${COLUMNS.join(", ")} columns is missing`)], warnings };
  }

  const indexResult = git(root, ["ls-files", "-z", "--cached"]);
  if (!indexResult.ok) {
    return { root, errors: [...errors, summary("git-index-unavailable", `${REGISTER}: git ls-files failed`)], warnings };
  }
  const tracked = indexResult.out.split("\0").filter((entry) => entry !== "");
  const trackedSet = new Set(tracked);

  const exclusions = [];
  for (const row of exclusionRows) {
    const cells = row.cells;
    if (cells.length !== 5 || cells.some((cell) => cell === "")) {
      errors.push(summary("missing-field", `${REGISTER}:${row.number}: exclusion row needs Pattern, Reason, Owner, Falsifier, Verified`));
      continue;
    }
    const pattern = clean(cells[0]);
    const matched = tracked.filter((file) => matchGlob(pattern, file)).length;
    if (matched === 0) warnings.push(summary("blind-exclusion", `${REGISTER}:${row.number}: exclusion "${pattern}" matches no artifact`));
    exclusions.push(pattern);
  }

  const rows = [];
  for (const row of registerRows) {
    const cells = row.cells;
    if (cells.length !== COLUMNS.length) {
      errors.push(summary("missing-field", `${REGISTER}:${row.number}: expected ${COLUMNS.length} columns, found ${cells.length}`));
      continue;
    }
    const parsed = {
      number: row.number,
      artifact: clean(cells[0]),
      kind: clean(cells[1]),
      writer: clean(cells[2]),
      reader: clean(cells[3]),
      trigger: clean(cells[4]),
      budget: clean(cells[5]),
      falsifier: clean(cells[6]),
      status: clean(cells[7]),
      verified: clean(cells[8]),
      cells,
    };
    rows.push(parsed);
  }

  for (const row of rows) {
    const label = row.artifact || `row ${row.number}`;
    for (let index = 0; index < COLUMNS.length; index += 1) {
      if (clean(row.cells[index]) === "") {
        errors.push(summary("missing-field", `${REGISTER}:${row.number}: ${COLUMNS[index]} is empty for ${label}`));
      }
    }
    if (!KINDS.has(row.kind)) {
      errors.push(summary("unknown-kind", `${REGISTER}:${row.number}: "${row.kind}" is not a known kind`));
    }
    const retirement = row.status === "active" ? null : RETIRE.exec(row.status);
    if (row.status !== "active" && !retirement) {
      errors.push(summary("invalid-status", `${REGISTER}:${row.number}: "${row.status}" is not active or retired@<7-hex>`));
    }
    if (retirement && row.trigger !== "never") {
      errors.push(summary("retired-with-trigger", `${REGISTER}:${row.number}: retired row ${label} still carries trigger "${row.trigger}"`));
    }
    for (const entry of row.trigger.split(";").map((value) => value.trim()).filter(Boolean)) {
      if (!/^(session-start|never)$/.test(entry)
        && !/^path:[^\s;|]+$/.test(entry)
        && !/^churn:[^\s;|]+$/.test(entry)
        && !/^symbol:[^\s;|]+$/.test(entry)
        && !/^manual:.+$/.test(entry)) {
        errors.push(summary("invalid-trigger", `${REGISTER}:${row.number}: "${entry}" is not a known trigger for ${label}`));
      }
    }
    if (!VERIFIED.test(row.verified)) {
      errors.push(summary("missing-field", `${REGISTER}:${row.number}: Verified for ${label} must be <7-hex>@<YYYY-MM-DD>`));
    }
    checkReader({ root, row, label, trackedSet, errors, warnings });
    checkFalsifier({ root, git, row, label, errors });
  }

  const activeRows = rows.filter((row) => !/^retired@/.test(row.status));
  for (const row of activeRows) {
    row.mapped = [];
  }
  for (const file of tracked) {
    if (exclusions.some((pattern) => matchGlob(pattern, file))) continue;
    const matched = activeRows.filter((row) => matchGlob(row.artifact, file));
    if (matched.length === 0) {
      errors.push(summary("unmapped-artifact", `${file} is not mapped by any register row`));
      continue;
    }
    if (matched.length > 1) {
      errors.push(summary("double-mapped", `${file} matches ${matched.map((row) => row.artifact).join(", ")}`));
      continue;
    }
    matched[0].mapped.push(file);
  }
  for (const row of activeRows) {
    if ((row.mapped ?? []).length === 0) {
      errors.push(summary("empty-row", `${REGISTER}:${row.number}: active row ${row.artifact} matches no artifact`));
    }
  }

  for (const row of activeRows) {
    if ((row.mapped ?? []).length === 0) continue;
    checkFreshness({ root, git, row, errors, warnings });
    checkAging({ root, git, row, warnings });
  }
  for (const row of activeRows) {
    checkBudget({ root, row, label: row.artifact, errors, warnings });
  }
  for (const row of activeRows) {
    if (headerVerified && VERIFIED.test(row.verified) && row.verified.split("@")[0] !== headerVerified[1]) {
      warnings.push(summary("verified-behind", `${REGISTER}:${row.number}: ${row.artifact} is verified at ${row.verified}, behind the register header ${headerVerified[0]}`));
    }
  }

  return { root, errors, warnings };
}

function checkReader({ root, row, label, trackedSet, errors, warnings }) {
  const reader = row.cells[3] ?? row.reader;
  if (/^(?:-|none|n\/a)$/i.test(clean(reader))) {
    warnings.push(summary("reader-unexercised", `${label} names no reader`));
    return;
  }
  const tokens = [...reader.matchAll(/`([^`]+)`/g)].map((match) => clean(match[1]));
  for (const match of reader.matchAll(/\$([a-z0-9-]+)/g)) tokens.push(`$${match[1]}`);
  for (const token of tokens) {
    if (token.startsWith("$")) {
      const name = token.slice(1);
      const skill = [...trackedSet].some((file) => file === `skills/${name}/SKILL.md` || file.endsWith(`/${name}/SKILL.md`));
      if (!skill) errors.push(summary("dead-reader", `${label} points at unknown skill ${token}`));
      continue;
    }
    if (/[*?[\]]/.test(token)) continue;
    if (!token.includes("/")) continue;
    const first = token.split("/")[0];
    if (!OWNED_ROOTS.includes(first)) continue;
    const within = trackedSet.has(token) || [...trackedSet].some((file) => file.startsWith(`${token.replace(/\/+$/, "")}/`));
    if (!within) errors.push(summary("dead-reader", `${label} points at untracked path ${token}`));
  }
}

function checkFalsifier({ root, git, row, label, errors }) {
  if (row.falsifier === "") {
    errors.push(summary("missing-falsifier", `${label} has no falsifier`));
    return;
  }
  const match = FALSIFIER.exec(row.falsifier);
  if (!match) {
    errors.push(summary("invalid-falsifier", `${label}: falsifier must be <test>/file.mjs::<case>@<7-hex>`));
    return;
  }
  const [, rel, caseName, sha] = match;
  if (!rel.startsWith("test/")) {
    errors.push(summary("invalid-falsifier", `${label}: falsifier ${rel} is not under test/`));
    return;
  }
  const absolute = path.resolve(root, rel);
  const relative = posixRelative(root, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    errors.push(summary("invalid-falsifier", `${label}: falsifier ${rel} escapes the repository`));
    return;
  }
  let content;
  try {
    content = fs.readFileSync(absolute, "utf8");
  } catch {
    errors.push(summary("invalid-falsifier", `${label}: falsifier file ${rel} is missing`));
    return;
  }
  if (!content.includes(caseName)) {
    errors.push(summary("invalid-falsifier", `${label}: case "${caseName}" is not present in ${rel}`));
    return;
  }
  if (!git(root, ["rev-parse", "--git-dir"]).ok) return;
  const commitExists = git(root, ["cat-file", "-e", `${sha}^{commit}`]).ok;
  if (commitExists && !git(root, ["merge-base", "--is-ancestor", sha, "HEAD"]).ok) {
    errors.push(summary("invalid-falsifier", `${label}: anchor ${sha} is not an ancestor of HEAD`));
  }
}

function budgetLimit(budget) {
  const match = BUDGET.exec(budget);
  if (!match) return null;
  return { limit: Number(match[1]), unit: match[2].toLowerCase().replace(/s$/, "") };
}

function metric({ root, row, unit }) {
  const files = row.mapped ?? [];
  if (unit === "row" || unit === "file") return files.length;
  let total = 0;
  for (const file of files) {
    let content = "";
    try {
      content = fs.readFileSync(path.join(root, file), "utf8");
    } catch {
      continue;
    }
    total += unit === "line" ? content.split("\n").length : content.length;
  }
  return total;
}

function checkBudget({ root, row, label, errors, warnings }) {
  if (BUDGET_FREE.test(row.budget)) return;
  const parsed = budgetLimit(row.budget);
  if (!parsed) return;
  const value = metric({ root, row, unit: parsed.unit });
  if (value > parsed.limit) {
    errors.push(summary("budget-exceeded", `${label} uses ${value} ${parsed.unit}s over its ${parsed.limit}-${parsed.unit} budget`));
  } else if (parsed.limit > 0 && value >= parsed.limit * 0.8) {
    warnings.push(summary("budget-near", `${label} uses ${value} of ${parsed.limit} ${parsed.unit}s`));
  }
}

function driftCommits({ root, git, anchor, files }) {
  if (!git(root, ["rev-parse", "--git-dir"]).ok) return [];
  if (!git(root, ["cat-file", "-e", `${anchor}^{commit}`]).ok) return [];
  if (files.length === 0) return [];
  const result = git(root, ["log", "--format=%H", `${anchor}..HEAD`, "--", ...files]);
  if (!result.ok) return [];
  const commits = result.out.split("\n").map((line) => line.trim()).filter(Boolean);
  if (commits.length === 0) return [];
  const registerChanges = git(root, ["log", "--format=%H", `${anchor}..HEAD`, "--", REGISTER]);
  const reverified = new Set(registerChanges.ok ? registerChanges.out.split("\n").map((line) => line.trim()).filter(Boolean) : []);
  return commits.filter((commit) => !reverified.has(commit));
}

function checkFreshness({ root, git, row, errors, warnings }) {
  const label = row.artifact;
  const entries = row.falsifier ? [FALSIFIER.exec(row.falsifier)?.[1]].filter(Boolean) : [];
  if (row.verified && VERIFIED.test(row.verified)) {
    const sha = row.verified.split("@")[0];
    const drift = driftCommits({ root, git, anchor: sha, files: row.mapped ?? [] });
    if (drift.length > 0) {
      errors.push(summary("stale-verified", `${label} changed in ${drift.length} commit(s) after ${sha}; re-verify and update the row`));
    }
  }
  const proof = FALSIFIER.exec(row.falsifier);
  if (proof) {
    const drift = driftCommits({ root, git, anchor: proof[3], files: [...new Set([...entries, ...(row.mapped ?? [])])] });
    if (drift.length > 0) {
      errors.push(summary("stale-falsifier", `${label} falsifier ${proof[1]} drifted in ${drift.length} commit(s) without re-verification`));
    }
  }
}

function checkAging({ root, git, row, warnings }) {
  const proof = FALSIFIER.exec(row.falsifier);
  if (!proof) return;
  if (!git(root, ["rev-parse", "--git-dir"]).ok) return;
  if (!git(root, ["cat-file", "-e", `${proof[3]}^{commit}`]).ok) return;
  const count = git(root, ["rev-list", "--count", `${proof[3]}..HEAD`]);
  if (count.ok && Number(count.out) >= WARNING_AGING) {
    warnings.push(summary("falsifier-aging", `${row.artifact} falsifier anchor ${proof[3]} is ${count.out} commits behind HEAD`));
  }
}
