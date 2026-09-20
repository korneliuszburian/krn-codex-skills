import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { splitTableRow } from "../../scripts/lib/kernel/text.mjs";

const root = fileURLToPath(new URL("../..", import.meta.url));
const PAGE = path.join(root, "docs", "research", "orchestration.md");
const MAP_HEADING = "## Memory and measurement wiring map";
const DECISION_HEADING = "### ADR 0001 first decisions (2026-09-20)";

const ARTIFACTS = [
  "state.md",
  "boundary.md",
  "workflow-lessons.md",
  "lab-tests.md",
  "docs/research/",
  "docs/adr/",
  "CONTEXT.md",
  ".scratch/tickets/",
  "krn memory recall",
  "krn_memory.py",
  "e2e-compare.mjs",
  "lane-runner.mjs",
  "test/harness/tasks/",
  "mutation-probe.mjs",
];

const DECISIONS = [
  "docs/BRIEF.md",
  "boundary.md",
  "e2e-compare.mjs",
  "falsifier-mutate.mjs",
  "mutation-probe.mjs",
  "flake-classify.mjs",
  "ADR 0001 to 0004",
];

const DELETED = [
  "docs/BRIEF.md",
  "scripts/lib/brief/compile.mjs",
  "scripts/lib/audit/falsifier-mutate.mjs",
  "scripts/lib/contract/flake-classify.mjs",
];

const RAW0_IS_BRIEF = /raw\[0\] === "brief"/;

function section(text, heading) {
  const lines = String(text).split("\n");
  const start = lines.indexOf(heading);
  if (start === -1) return null;
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join("\n");
}

export function wiringErrors(text) {
  const errors = [];
  const map = section(text, MAP_HEADING);
  if (map === null) {
    errors.push(`${MAP_HEADING} is missing`);
    return errors;
  }
  const rows = new Map();
  for (const line of map.split("\n")) {
    if (!line.startsWith("| `")) continue;
    const cells = splitTableRow(line);
    if (cells.length !== 8) {
      errors.push(`a wiring row has ${cells.length} cells, expected 8`);
      continue;
    }
    const key = cells[0].replaceAll("`", "").trim();
    if (rows.has(key)) errors.push(`${key} has more than one wiring row`);
    rows.set(key, cells);
  }
  for (const artifact of ARTIFACTS) {
    if (!rows.has(artifact)) errors.push(`${artifact} has no wiring row`);
  }
  for (const [key, cells] of rows) {
    if (!ARTIFACTS.includes(key)) errors.push(`${key} is not a known memory artifact`);
    const missing = cells.filter((cell) => !cell.trim()).length;
    if (missing > 0) errors.push(`${key} has ${missing} empty wiring field(s)`);
  }
  const decisions = section(text, DECISION_HEADING);
  if (decisions === null) errors.push(`${DECISION_HEADING} is missing`);
  else {
    for (const key of DECISIONS) {
      if (!decisions.includes(key)) errors.push(`${key} has no first-decision disposition`);
    }
  }
  return errors;
}

const row = (key) => `| \`${key}\` | w | r | t | b | f | i | d |`;

const fixture = (artifacts) =>
  [
    "# Fixture",
    "",
    MAP_HEADING,
    "",
    "| Artifact | Writer | Reader | Delivery trigger | Budget | Falsifier | Invalidation rule | Deletion owner |",
    "|---|---|---|---|---|---|---|---|",
    ...artifacts.map(row),
    "",
    DECISION_HEADING,
    "",
    ...DECISIONS.map((key) => `- \`${key}\`: decided`),
    "",
  ].join("\n");

test("every living memory artifact has one complete wiring row", () => {
  assert.deepEqual(wiringErrors(fs.readFileSync(PAGE, "utf8")), []);
});

test("a map that omits an artifact is rejected", () => {
  const errors = wiringErrors(fixture(ARTIFACTS.filter((key) => key !== "boundary.md")));
  assert.ok(errors.includes("boundary.md has no wiring row"), JSON.stringify(errors));
});

test("a row with an empty field is rejected", () => {
  const page = fixture(ARTIFACTS).replace(row("state.md"), "| `state.md` |  | r | t | b | f | i | d |");
  assert.ok(wiringErrors(page).includes("state.md has 1 empty wiring field(s)"), JSON.stringify(wiringErrors(page)));
});

test("a page without the map or the dispositions is rejected", () => {
  assert.deepEqual(wiringErrors("# Empty\n"), [`${MAP_HEADING} is missing`]);
  const page = fixture(ARTIFACTS).replace(DECISION_HEADING, "### Other");
  assert.ok(wiringErrors(page).includes(`${DECISION_HEADING} is missing`), JSON.stringify(wiringErrors(page)));
});

test("the retired surfaces stay deleted and the brief verb is gone", () => {
  for (const relative of DELETED) {
    assert.ok(!fs.existsSync(path.join(root, relative)), `${relative} must stay deleted`);
  }
  const cli = fs.readFileSync(path.join(root, "scripts", "krn.mjs"), "utf8");
  assert.ok(!RAW0_IS_BRIEF.test(cli), "the krn brief verb must be removed with its station");
});
