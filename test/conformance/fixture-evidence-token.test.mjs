import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const document = JSON.parse(readFileSync(join(root, "config", "conformance.json"), "utf8"));
const cases = document.cases ?? [];
const caseIds = new Set(cases.map((entry) => entry?.id));

const evidenceToken = (capsule) => {
  const line = String(capsule ?? "")
    .split("\n")
    .find((entry) => /Review fixed point/.test(entry));
  return /evidence\s*=\s*([^\s;,`]+)/i.exec(line ?? "")?.[1]?.replace(/[<>]/g, "") ?? "";
};

// A success case is a frozen acceptance assertion, so its review evidence
// token must be resolvable in the fixture: a frozen case id or a path the
// fixture creates or the repository already carries. Failure cases may name
// deliberately unresolved tokens because that is their assertion.
test("every success conformance case names a resolvable review evidence token", () => {
  for (const entry of cases) {
    if (entry?.expect?.exit !== 0) continue;
    const capsule = entry?.after?.[".krn/runs/delivery-loop/out-1/state.md"];
    const token = evidenceToken(capsule);
    if (!token) continue;
    if (token.startsWith("case:")) {
      assert.ok(caseIds.has(token.slice("case:".length)), `case ${entry.id} names an absent conformance case: ${token}`);
      continue;
    }
    const created = new Set(Object.keys(entry?.steps?.[0]?.files ?? {}));
    assert.ok(
      created.has(token) || existsSync(join(root, token)),
      `case ${entry.id} names an evidence token that is neither an existing path nor a frozen case: ${token}`,
    );
  }
});
