import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditRepository } from "../../scripts/lib/audit/quality-audit.mjs";

const withRepo = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "krn-audit-test-only-"));
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

test("a test-only export is reported as an advisory finding with its importers", () => {
  withRepo(
    {
      "scripts/lib/origin.mjs": "export function onlyTests() {\n  return 1;\n}\n",
      "test/origin.test.mjs": 'import { onlyTests } from "../scripts/lib/origin.mjs";\nexport const v = onlyTests();\n',
    },
    (root) => {
      const { errors, info } = auditRepository(root);
      assert.ok(!errors.some((message) => message.includes("dead export onlyTests")), JSON.stringify(errors));
      assert.ok(
        info.some(
          (message) =>
            message.includes("origin.mjs: test-only-export onlyTests") && message.includes("test/origin.test.mjs"),
        ),
        JSON.stringify(info),
      );
    },
  );
});

test("a runtime consumer keeps a test-imported export silent", () => {
  withRepo(
    {
      "scripts/lib/origin.mjs": "export function shared() {\n  return 1;\n}\n",
      "scripts/lib/runtime.mjs": 'import { shared } from "./origin.mjs";\nexport const v = shared();\n',
      "scripts/lib/root.mjs": 'import { v } from "./runtime.mjs";\nexport const w = v;\n',
      "test/origin.test.mjs": 'import { shared } from "../scripts/lib/origin.mjs";\nexport const t = shared();\n',
    },
    (root) => {
      const { info } = auditRepository(root);
      assert.ok(!info.some((message) => message.includes("test-only-export shared")), JSON.stringify(info));
    },
  );
});

test("a dynamic test import marks an export as test-only", () => {
  withRepo(
    {
      "scripts/lib/dyn.mjs": "export function dynOnly() {\n  return 1;\n}\n",
      "test/dyn.test.mjs": 'export const v = (await import("../scripts/lib/dyn.mjs")).dynOnly;\n',
    },
    (root) => {
      const { info } = auditRepository(root);
      assert.ok(info.some((message) => message.includes("test-only-export dynOnly")), JSON.stringify(info));
    },
  );
});
