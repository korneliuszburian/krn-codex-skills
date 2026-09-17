import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditRepository } from "../../scripts/lib/audit/quality-audit.mjs";

const withRepo = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "krn-oracle-"));
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

const HEADER = 'import assert from "node:assert/strict";\nimport test from "node:test";\n';

const oracleErrors = (root) => auditRepository(root).errors.filter((message) => message.includes("without an oracle"));

test("a test callback with no assertion token is an oracle error", () => {
  withRepo(
    {
      "test/empty.test.mjs": `${HEADER}test("empty case", () => {\n  runScenario();\n});\n`,
    },
    (root) => {
      const errors = oracleErrors(root);
      assert.equal(errors.length, 1, JSON.stringify(auditRepository(root).errors));
      assert.match(errors[0], /^test\/empty\.test\.mjs: test callback without an oracle \("empty case"\)$/);
    },
  );
});

test("a test callback that asserts is not flagged", () => {
  withRepo(
    {
      "test/real.test.mjs": `${HEADER}test("real case", () => {\n  assert.equal(runScenario(), 2);\n});\n`,
    },
    (root) => {
      assert.deepEqual(oracleErrors(root), []);
    },
  );
});

test("a concise-arrow callback still counts its assertion", () => {
  withRepo(
    {
      "test/concise.test.mjs": `${HEADER}test("concise case", () => assert.ok(runScenario()));\n`,
    },
    (root) => {
      assert.deepEqual(oracleErrors(root), []);
    },
  );
});

test("a property-style helper carries the oracle out of the callback", () => {
  withRepo(
    {
      "test/helper.test.mjs": `${HEADER}${[
        "function checkScenario(input, expected) {",
        "  assert.equal(runScenario(input), expected);",
        "}",
        'test("helper case", () => {',
        "  checkScenario(2, 2);",
        "});",
      ].join("\n")}\n`,
    },
    (root) => {
      assert.deepEqual(oracleErrors(root), []);
    },
  );
});

test("a comment-carved case may declare where its oracle lives", () => {
  withRepo(
    {
      "test/carved.test.mjs": `${HEADER}${[
        'test("carved case", () => {',
        "  // oracle: the integration suite owns this assertion",
        "  runScenario();",
        "});",
      ].join("\n")}\n`,
    },
    (root) => {
      assert.deepEqual(oracleErrors(root), []);
    },
  );
});

test("a commented-out test callback is not scanned", () => {
  withRepo(
    {
      "test/disabled.test.mjs": `${HEADER}${[
        '// test("disabled case", () => {',
        "//   runScenario();",
        "// });",
      ].join("\n")}\n`,
    },
    (root) => {
      assert.deepEqual(oracleErrors(root), []);
    },
  );
});

test("a test-like string does not fabricate a callback", () => {
  withRepo(
    {
      "test/strings.test.mjs": `${HEADER}const fixture = 'test("phantom", () => { runScenario(); })';\ntest("reads a fixture", () => {\n  assert.equal(fixture.length > 0, true);\n});\n`,
    },
    (root) => {
      assert.deepEqual(oracleErrors(root), []);
    },
  );
});

test("assertion density is reported as info", () => {
  withRepo(
    {
      "test/density.test.mjs": `${HEADER}test("a", () => assert.ok(true));\ntest("b", () => assert.equal(1, 1));\n`,
    },
    (root) => {
      const { info } = auditRepository(root);
      assert.ok(
        info.some((message) => /test oracle density: 2 assertion tokens across 2 test callbacks \(1\.00 per callback\)/.test(message)),
        JSON.stringify(info),
      );
    },
  );
});

test("the repository itself has no oracle-free test callback", () => {
  assert.deepEqual(oracleErrors(process.cwd()), []);
});
