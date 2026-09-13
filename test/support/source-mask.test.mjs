import assert from "node:assert/strict";
import test from "node:test";

import { maskLiterals, stripComments } from "../../scripts/lib/support/source-mask.mjs";

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

test("maskLiterals blanks template and string literals", () => {
  const maskedTemplate = maskLiterals('const s = `import "./phantom.mjs"`;');
  assert.ok(!maskedTemplate.includes("phantom"));
  const masked = maskLiterals('const note = "const leaky";\nleaky();');
  assert.ok(masked.includes("leaky()"));
  assert.ok(!masked.includes('"const leaky"'));
});

test("masking preserves template interpolation code", () => {
  const source = "const s = `x ${kept(a)} y`;";
  assert.ok(maskLiterals(source).includes("kept(a)"), maskLiterals(source));
  assert.ok(!maskLiterals(source).includes("x "), maskLiterals(source));
});

test("a nested template inside an interpolation keeps the enclosing code", () => {
  const source = "const x = `${ {a: `b${y}c`}, d: extraCall() }`;";
  assert.ok(maskLiterals(source).includes("extraCall()"), maskLiterals(source));
});

test("backticks inside strings do not start a template and real templates stay masked", () => {
  const fence = 'const fence = "```";\nimport { used } from "./lib/real.mjs";\nconst doc = `# hi`;';
  const stripped = stripComments(fence);
  assert.ok(stripped.includes("./lib/real.mjs"));
  assert.ok(stripped.includes("# hi"));
  assert.ok(!maskLiterals(fence).includes("# hi"));
});

test("a regex after a keyword is recognized and does not swallow code", () => {
  const source = 'return /[\'"]/.test(s);\nconst t = `import phantom from "./x.mjs"`;';
  const masked = maskLiterals(source);
  assert.ok(!masked.includes("phantom"), masked);
  const literals = maskLiterals(`${source}\nphantom();`);
  assert.ok(literals.includes("phantom();"), literals);
});
