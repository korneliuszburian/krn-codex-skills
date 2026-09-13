import assert from "node:assert/strict";
import test from "node:test";

import { maskLiterals, maskTemplates, stripComments } from "../scripts/lib/source-mask.mjs";

test("stripComments removes comments but preserves code and import specifiers", () => {
  const source = 'import "./a.mjs"; // trailing\n/* block */\nconst x = 1; // tail';
  const out = stripComments(source);
  assert.ok(out.includes('import "./a.mjs";'));
  assert.ok(out.includes("const x = 1;"));
  assert.ok(!out.includes("trailing"));
  assert.ok(!out.includes("block"));
});

test("stripComments does not treat a division slash or a regex literal as a comment", () => {
  const regex = stripComments('const r = /[//]/; import "./x.mjs";');
  assert.ok(regex.includes('import "./x.mjs";'), regex);
  const division = stripComments('const q = a / b; // c');
  assert.ok(division.includes("a / b"));
  assert.ok(!division.includes("// c"));
});

test("maskTemplates blanks template text and maskLiterals blanks strings", () => {
  const maskedTemplate = maskTemplates('const s = `import "./phantom.mjs"`;');
  assert.ok(!maskedTemplate.includes("phantom"));
  const masked = maskLiterals('const note = "const leaky";\nleaky();');
  assert.ok(masked.includes("leaky()"));
  assert.ok(!masked.includes('"const leaky"'));
});
