import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const PAGE = path.join(root, "docs", "research", "orchestration.md");
const HEADING = "## Adoption ledger";

// A row is `| Adoption | Owner | Evidence | Expires | Retirement trigger |`.
// The ledger fails closed: a missing field or a date that has passed is an
// error, so an adoption that stops being re-justified cannot live on by default.
export function adoptionLedgerErrors(text, today = new Date().toISOString().slice(0, 10)) {
  const lines = String(text).split("\n");
  const start = lines.indexOf(HEADING);
  if (start === -1) return [`${HEADING} is missing`];
  const rows = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^## /.test(lines[index])) break;
    const line = lines[index];
    if (!line.startsWith("| ")) continue;
    const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells[0] === "Adoption" || /^-+$/.test(cells[0])) continue;
    rows.push(cells);
  }
  const errors = [];
  if (rows.length < 8) errors.push(`the ledger carries ${rows.length} rows, expected at least 8`);
  for (const cells of rows) {
    if (cells.length !== 5) {
      errors.push(`a row has ${cells.length} cells, expected 5: ${cells[0]}`);
      continue;
    }
    const [adoption, owner, evidence, expires, trigger] = cells;
    for (const [label, value] of [["owner", owner], ["evidence", evidence], ["expires", expires], ["retirement trigger", trigger]]) {
      if (!value) errors.push(`${adoption}: missing ${label}`);
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(expires) && expires < today) errors.push(`${adoption}: adoption expired on ${expires}`);
  }
  return errors;
}

const fixture = (rows) =>
  [HEADING, "", "| Adoption | Owner | Evidence | Expires | Retirement trigger |", "|---|---|---|---|---|", ...rows].join("\n");

const row = (id, { owner = "maintainer", evidence = "ticket", expires = "2999-01-01", trigger = "never" } = {}) =>
  `| ${id} | ${owner} | ${evidence} | ${expires} | ${trigger} |`;

test("every adoption row carries an owner, evidence, expiry, and retirement trigger", () => {
  assert.deepEqual(adoptionLedgerErrors(readFileSync(PAGE, "utf8")), []);
});

test("the observer rejects a missing field or an expired adoption", () => {
  const errors = adoptionLedgerErrors(
    fixture([
      row("expired", { expires: "2000-01-01" }),
      row("no-evidence", { evidence: "" }),
      ...Array.from({ length: 6 }, (_, index) => row(`ok-${index}`)),
    ]),
    "2026-09-20",
  );
  assert.ok(errors.some((error) => error.includes("expired")), JSON.stringify(errors));
  assert.ok(errors.some((error) => error.includes("missing evidence")), JSON.stringify(errors));
});

test("the observer rejects a missing or short ledger", () => {
  assert.deepEqual(adoptionLedgerErrors("# Nothing\n"), [`${HEADING} is missing`]);
  assert.ok(adoptionLedgerErrors(fixture([row("only-one")]), "2026-09-20").some((error) => error.includes("at least 8")), "a short ledger must be rejected");
});

test("the ledger observer is wired into the library gate", () => {
  const scripts = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  assert.match(scripts["test:lib"] ?? "", /test\/contract\/adoption-ledger\.test\.mjs/, "the ledger observer must run in test:lib");
});
