import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REGISTRY = fileURLToPath(new URL("../../docs/research/lab-tests.md", import.meta.url));
const COLUMNS = 7;

// A row cell may contain a raw `|` inside an inline code span, so the split
// tracks backtick parity instead of splitting the whole line naively.
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

function parseRegistry(content) {
  const rows = [];
  for (const [index, line] of content.split("\n").entries()) {
    if (!line.startsWith("| LT-")) continue;
    const cells = splitRow(line).map((cell) => cell.trim());
    if (cells.length !== COLUMNS + 2 || cells[0] !== "" || cells.at(-1) !== "") {
      rows.push({ number: index + 1, shape: null });
      continue;
    }
    const shape = cells.slice(1, -1);
    const match = /^LT-(\d+)$/.exec(shape[0]);
    rows.push({ number: index + 1, id: match ? Number(match[1]) : null, shape });
  }
  return rows;
}

function registryRows() {
  return parseRegistry(readFileSync(REGISTRY, "utf8"));
}

function describe(row) {
  return row.id === null || row.id === undefined ? `line ${row.number}` : `LT-${row.id} (line ${row.number})`;
}

test("the lab-test registry parses to numbered rows", () => {
  const rows = registryRows();
  assert.ok(rows.length > 1, "the registry must parse to more than one row");
  assert.equal(rows[0].id, 1, "the registry must start at LT-1");
});

test("every lab-test id is unique", () => {
  const rows = registryRows();
  const counts = new Map();
  for (const row of rows) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  const duplicates = [...counts]
    .filter(([, count]) => count > 1)
    .map(([id]) => `LT-${id}`);
  assert.deepEqual(duplicates, [], `duplicate lab-test ids: ${duplicates.join(", ")}`);
});

test("the numbered lab-test range has no gap", () => {
  const rows = registryRows();
  const ids = new Set(rows.map((row) => row.id));
  const max = Math.max(...ids);
  const missing = [];
  for (let id = 1; id <= max; id += 1) {
    if (!ids.has(id)) missing.push(`LT-${id}`);
  }
  assert.deepEqual(missing, [], `missing lab-test ids in 1..${max}: ${missing.join(", ")}`);
});

test("every lab-test row carries the seven-column shape", () => {
  const rows = registryRows();
  const malformed = rows
    .filter((row) => !row.shape || row.shape.length !== COLUMNS || row.shape.some((cell) => cell === ""))
    .map((row) => describe(row));
  assert.deepEqual(malformed, [], `rows without the ${COLUMNS}-column shape: ${malformed.join(", ")}`);
});

const HEADER = ["Id", "Claim", "Form and lanes", "Metric", "Falsifier", "Status", "Result / non-proof"];

// The header owns the column vocabulary: references live in the Result /
// non-proof cell, so the registry must not grow a Trigger column.
test("the registry header names the seven columns and no Trigger column", () => {
  const line = readFileSync(REGISTRY, "utf8").split("\n").find((entry) => entry.startsWith("| ") && entry.includes("| Id |"));
  assert.ok(line, "the registry must carry a header row");
  const cells = splitRow(line).map((cell) => cell.trim()).slice(1, -1);
  assert.deepEqual(cells, HEADER, "the header must name the seven registry columns");
  assert.ok(!cells.includes("Trigger"), "references belong to the Result / non-proof cell, not a Trigger column");
});
