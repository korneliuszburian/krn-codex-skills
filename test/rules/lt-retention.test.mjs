import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REGISTRY = fileURLToPath(new URL("../../docs/research/lab-tests.md", import.meta.url));
const COLUMNS = 7;

function readRegistry() {
  if (!existsSync(REGISTRY)) return null;
  try {
    return readFileSync(REGISTRY, "utf8");
  } catch {
    return null;
  }
}

// The retention rule is the paragraph between the `## Registry` heading and the
// table. It is read lazily so a base-tree mismatch is a failing assertion, never
// a module-load setup error.
function retentionRule(content) {
  if (typeof content !== "string") return null;
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.startsWith("The registry is capped at"));
  if (start === -1) return null;
  const paragraph = [];
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim() === "" || lines[index].startsWith("|")) break;
    paragraph.push(lines[index]);
  }
  return paragraph.join(" ").replace(/\s+/g, " ").trim();
}

// A cell may contain a raw `|` inside an inline code span, so split on backtick
// parity the way the id observer does.
function splitRow(line) {
  const cells = [];
  let cell = "";
  let code = false;
  for (const char of line) {
    if (char === "`") code = !code;
    if (char === "|" && !code) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function registryRows(content) {
  if (typeof content !== "string") return [];
  const rows = [];
  for (const line of content.split("\n")) {
    if (!line.startsWith("| LT-")) continue;
    const cells = splitRow(line).map((cell) => cell.trim());
    if (cells.length !== COLUMNS + 2 || cells[0] !== "" || cells.at(-1) !== "") continue;
    const shape = cells.slice(1, -1);
    const match = /^LT-(\d+)$/.exec(shape[0]);
    if (match) rows.push({ id: Number(match[1]), status: shape[5] });
  }
  return rows;
}

test("the active (non-retired) row count stays within the stated cap", () => {
  const content = readRegistry();
  const rule = retentionRule(content);
  assert.ok(rule, "the registry must carry a retention rule paragraph");
  const cap = /capped at (\d+) non-retired rows/i.exec(rule) ?? /capped at (\d+)/i.exec(rule);
  assert.ok(cap, "the retention rule must state a numeric cap");
  const rows = registryRows(content);
  assert.ok(rows.length > 0, "the registry must parse to numbered rows");
  const active = rows.filter((row) => !/retired/i.test(row.status));
  assert.ok(
    active.length <= Number(cap[1]),
    `active rows ${active.length} exceed the stated cap ${cap[1]}`,
  );
});
