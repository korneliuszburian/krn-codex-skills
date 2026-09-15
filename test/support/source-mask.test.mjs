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

test("a regex after a control-flow head is not read as division", () => {
  const masked = maskLiterals("if (ok) /['\"]/.test(x);\nimport real from './real.mjs';\n");
  assert.ok(masked.includes("import real from"), "the import after the control head is preserved");
  assert.ok(stripComments("while (x) /a/.test(y);\n").includes("/a/"), "the regex literal is kept as code");
});

test("a postfix operator before a slash is division, so a trailing comment is stripped", () => {
  assert.equal(stripComments("let n = 0; n++ / 2; // secret").includes("secret"), false);
  assert.equal(maskLiterals("let n = 0; x++ / 'sk_live_AA/BB';").includes("sk_live_AA"), false);
});

test("a control keyword inside a string cannot fake a control head", () => {
  assert.equal(maskLiterals('const x = fn("if(") / 2; // sk_live_SECRET\n').includes("sk_live_SECRET"), false);
  assert.equal(stripComments('const x = fn("if(") / 2; // sk_live_SECRET\n').includes("sk_live_SECRET"), false);
});

test("an identifier named like a keyword is not treated as one", () => {
  assert.ok(maskLiterals("const of = 1;\nconst half = of / 2;\n").includes("2"));
  assert.ok(maskLiterals("const y = obj.in / 2;\n").includes("2"));
});

test("a leading parenthesized expression is a value position, not a control head", () => {
  assert.ok(maskLiterals("(a) / 2;\n").includes("2"));
  assert.equal(stripComments("(a) / 2; // sk_live_SECRET\n").includes("sk_live_SECRET"), false);
});

test("a regex after a unary sign pair is not read as division", () => {
  assert.equal(stripComments("const x = a - -/}/; // secret\n").includes("secret"), false);
  assert.ok(maskLiterals("const x = a - -/}/;\nconst y = 2;\n").includes("2"));
  assert.equal(maskLiterals("let n = 0; n++ / 2; // secret").includes("secret"), false);
});

test("a division after a regex literal does not swallow the following comment", () => {
  assert.ok(!stripComments("const q = /x/ / 2; // secret\n").includes("secret"));
});
