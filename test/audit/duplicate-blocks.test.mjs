import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditRepository } from "../../scripts/lib/audit/quality-audit.mjs";

const withRepo = (files, body) => {
  const root = mkdtempSync(join(tmpdir(), "krn-duplicate-"));
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

// A renamed clone: every identifier and number differs, so the whole-body
// comparison sees two distinct bodies while the token window sees one block.
const clone = (name, shape) => [
  `export function ${name}(input, limit) {`,
  "  let total = 0;",
  "  for (const item of input) {",
  "    if (item > limit) {",
  "      total += item - limit;",
  "    } else {",
  "      total += item + limit;",
  "    }",
  "  }",
  `  const scaled = total * ${shape[0]} + ${shape[1]};`,
  "  return scaled - total;",
  "}",
].join("\n");

const duplicateBlocks = (root, options) => auditRepository(root, options).info.filter((message) => message.startsWith("duplicate-block:"));

const baselineOf = (root, options) =>
  auditRepository(root, options).info.find((message) => message.startsWith("duplicate-block baseline:"));

test("a renamed clone is a duplicate block even though the whole body differs", () => {
  withRepo(
    {
      "scripts/lib/alpha.mjs": `${clone("alpha", [3, 7])}\n`,
      "scripts/lib/beta.mjs": `${clone("beta", [8, 2])}\n`,
    },
    (root) => {
      const { info } = auditRepository(root);
      assert.ok(!info.some((message) => message.includes("duplicate function body")), JSON.stringify(info));
      const blocks = duplicateBlocks(root);
      assert.equal(blocks.length, 1, JSON.stringify(info));
      assert.match(blocks[0], /scripts\/lib\/alpha\.mjs:\d+-\d+ <-> scripts\/lib\/beta\.mjs:\d+-\d+/);
    },
  );
});

test("a run spanning fewer than five lines is not a duplicate block", () => {
  const wide = [
    "export function wide(a, b) { const c = a + b; const d = c * a - b; const e = d + c - a; const f = e * d + c; const g = f - e + d;",
    "  const h = g + f - e + d - c + b - a; const i = h * g - f + e; const j = i + h - g + f;",
    "  return j - i + h - g + f - e + d - c + b - a; }",
  ].join("\n");
  withRepo(
    { "scripts/lib/wide-one.mjs": `${wide}\n`, "scripts/lib/wide-two.mjs": `${wide}\n` },
    (root) => {
      assert.deepEqual(duplicateBlocks(root), []);
    },
  );
});

test("a run shorter than fifty tokens is not a duplicate block", () => {
  const tiny = "export function tiny() {\n  return 1 + 2;\n}\n";
  withRepo(
    { "scripts/lib/tiny-one.mjs": tiny, "scripts/lib/tiny-two.mjs": tiny },
    (root) => {
      assert.deepEqual(duplicateBlocks(root), []);
    },
  );
});

test("the duplicate-block report carries a baseline count", () => {
  withRepo(
    {
      "scripts/lib/alpha.mjs": `${clone("alpha", [3, 7])}\n`,
      "scripts/lib/beta.mjs": `${clone("beta", [8, 2])}\n`,
    },
    (root) => {
      assert.match(baselineOf(root) ?? "", /^duplicate-block baseline: 1 block\(s\) \(>= 50 tokens, >= 5 lines\)$/);
    },
  );
});

test("churn-times-size names the largest churn-hot module", () => {
  const hot = [
    "export const hot = Array.from(",
    "  { length: 40 },",
    "  (_, index) => index,",
    ");",
    "",
  ].join("\n");
  const cold = "export const cold = 1;\n";
  const git = (_root, args) => {
    if (args[0] === "show") return { ok: true, out: "1000000000\n" };
    if (args[0] === "log") return { ok: true, out: "scripts/lib/hot.mjs\0scripts/lib/hot.mjs\0scripts/lib/cold.mjs\0" };
    return { ok: false, out: "" };
  };
  withRepo({ "scripts/lib/hot.mjs": hot, "scripts/lib/cold.mjs": cold }, (root) => {
    const { info } = auditRepository(root, { git });
    assert.ok(
      info.some((message) => /^churn-times-size: scripts\/lib\/hot\.mjs is the largest churn-hot module \(4 lines of 1 hot\)$/.test(message)),
      JSON.stringify(info),
    );
  });
});

test("churn-times-size stays silent when no module is hot", () => {
  const git = (_root, args) => {
    if (args[0] === "show") return { ok: true, out: "1000000000\n" };
    if (args[0] === "log") return { ok: true, out: "scripts/lib/hot.mjs\0scripts/lib/cold.mjs\0" };
    return { ok: false, out: "" };
  };
  withRepo({ "scripts/lib/hot.mjs": "export const hot = 1;\n", "scripts/lib/cold.mjs": "export const cold = 1;\n" }, (root) => {
    assert.ok(!auditRepository(root, { git }).info.some((message) => message.startsWith("churn-times-size:")));
  });
});

test("the repository reports duplicate blocks as advisory info with a baseline", () => {
  const { errors, info } = auditRepository(process.cwd());
  assert.ok(!errors.some((message) => message.includes("duplicate-block")), JSON.stringify(errors));
  assert.ok(
    info.some((message) => /^duplicate-block baseline: \d+ block\(s\) \(>= 50 tokens, >= 5 lines\)$/.test(message)),
    JSON.stringify(info),
  );
  // No reported block may overlap itself: a self-overlap is the same run seen
  // twice, not a duplicate.
  for (const block of info.filter((message) => message.startsWith("duplicate-block:"))) {
    const match = /at (\S+):(\d+)-(\d+) <-> (\S+):(\d+)-(\d+)/.exec(block);
    if (!match) continue;
    const [, firstFile, firstStart, firstEnd, secondFile, secondStart, secondEnd] = match;
    if (firstFile !== secondFile) continue;
    assert.ok(
      Number(firstEnd) < Number(secondStart) || Number(secondEnd) < Number(firstStart),
      `a block must not overlap itself: ${block}`,
    );
  }
});

// A uniform data table (string literals masked, identifiers normalized) has no
// control flow, so it is not a duplicate block.
test("a uniform data table is not a duplicate block", () => {
  const rows = Array.from(
    { length: 20 },
    (_, index) => `  { id: "row-${index}", find: "from-${index}", replace: "to-${index}" },`,
  ).join("\n");
  withRepo({ "scripts/lib/table.mjs": `export const MUTATIONS = [\n${rows}\n];\n` }, (root) => {
    assert.deepEqual(duplicateBlocks(root), [], JSON.stringify(duplicateBlocks(root)));
  });
});
