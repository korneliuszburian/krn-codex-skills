import assert from "node:assert/strict";
import test from "node:test";

import { maskLiterals, maskTemplates, stripComments } from "../../scripts/lib/support/source-mask.mjs";

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

test("masking preserves template interpolation code", () => {
  const source = "const s = `x ${kept(a)} y`;";
  assert.ok(maskLiterals(source).includes("kept(a)"), maskLiterals(source));
  assert.ok(maskTemplates(source).includes("kept(a)"), maskTemplates(source));
  assert.ok(!maskLiterals(source).includes("x "), maskLiterals(source));
});

test("maskTemplates ignores backticks inside strings and masks real templates", () => {
  const fence = 'const fence = "```";\nimport { used } from "./lib/real.mjs";\nconst doc = `# hi`;';
  const masked = maskTemplates(fence);
  assert.ok(masked.includes("./lib/real.mjs"));
  assert.ok(!masked.includes("# hi"));
});

test("a regex after a keyword is recognized and does not swallow code", () => {
  const source = 'return /[\'"]/.test(s);\nconst t = `import phantom from "./x.mjs"`;';
  const masked = maskTemplates(source);
  assert.ok(!masked.includes("phantom"), masked);
  const literals = maskLiterals(`${source}\nphantom();`);
  assert.ok(literals.includes("phantom();"), literals);
});
