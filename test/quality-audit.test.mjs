import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditRepository } from "../scripts/lib/quality-audit.mjs";

const withRepo = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "krn-audit-"));
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

test("the repository itself passes the quality audit", () => {
  assert.deepEqual(auditRepository(process.cwd()).errors, []);
});

test("the audit catches a cross-file call that is never imported", () => {
  withRepo(
    {
      "scripts/lib/a.mjs": "export function helper() {\n  return 1;\n}\n",
      "scripts/lib/b.mjs": "helper();\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(
        errors.some((message) => message.includes("b.mjs: calls helper() but never imports it")),
        JSON.stringify(errors),
      );
    },
  );
});

test("the audit catches a dead export and an unreferenced function", () => {
  withRepo(
    {
      "scripts/lib/orphans.mjs": "export function orphan() {\n  return 1;\n}\n\nfunction zombie() {\n  return 2;\n}\n",
    },
    (root) => {
      const { errors } = auditRepository(root);
      assert.ok(errors.some((message) => message.includes("dead export orphan")), JSON.stringify(errors));
      assert.ok(errors.some((message) => message.includes("unreferenced function zombie")), JSON.stringify(errors));
    },
  );
});
