import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditRepository } from "../../scripts/lib/audit/quality-audit.mjs";

const withRepo = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "krn-audit-dyn-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const target = join(root, path);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, content);
    }
    body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("the audit does not credit a same-basename dynamic import in another directory", () => {
  withRepo({
    "scripts/lib/a.mjs": "export const a = 1;\n",
    "scripts/other/c.mjs": 'export const c = () => import("./nested/a.mjs");\n',
  }, (root) => {
    const errors = auditRepository(root).errors;
    assert.ok(errors.some((error) => error.includes("dead export a")), JSON.stringify(errors));
  });
});
