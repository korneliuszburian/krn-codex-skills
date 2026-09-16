import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditTheme, inventoryTheme } from "../../scripts/lib/frontend/theme.mjs";
import { parseDesign } from "../../scripts/lib/frontend/design.mjs";

function makeTheme({ block = "", tokens = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "krn-frontend-"));
  mkdirSync(join(root, "src", "css", "blocks"), { recursive: true });
  mkdirSync(join(root, "src", "css", "compositions"), { recursive: true });
  mkdirSync(join(root, "src", "css", "utilities"), { recursive: true });
  mkdirSync(join(root, "src", "css", "global"), { recursive: true });
  mkdirSync(join(root, "src", "design-tokens"), { recursive: true });
  mkdirSync(join(root, "inc"), { recursive: true });
  mkdirSync(join(root, "acf-json"), { recursive: true });
  writeFileSync(join(root, "src", "css", "blocks", "text.css"), block || ".text { --text-measure: var(--measure); }\n.text[data-alignment=\"center\"] { text-align: center; }\n");
  writeFileSync(join(root, "src", "css", "compositions", "flow.css"), ".flow > * + * { margin-block-start: var(--flow-space, 1em); }\n");
  writeFileSync(join(root, "src", "css", "utilities", "region.css"), ".region { padding-block: var(--region-space, var(--space-xl-2xl)); }\n");
  writeFileSync(join(root, "src", "design-tokens", "spacing.json"), JSON.stringify(tokens));
  writeFileSync(join(root, "inc", "flexible-content-layouts.php"), "<?php\nreturn [\n    'text' => 'components/text/template',\n];\n");
  writeFileSync(join(root, "acf-json", "group.json"), JSON.stringify({ title: "Components", fields: [{ name: "heading_size", type: "select" }, { name: "link", type: "link" }] }));
  return root;
}

test("inventoryTheme reads the layers, variants, tokens, and ACF layouts", () => {
  const root = makeTheme({ tokens: { space: { a: { $value: 1, $extensions: { "sh.sugarcube": { fluid: {} } } }, b: { $value: 2 } } } });
  const report = inventoryTheme({ root });
  assert.deepEqual(report.blocks.map((block) => block.name), ["text"]);
  assert.deepEqual(report.blocks[0].variants, ["data-alignment=center"]);
  assert.equal(report.tokens.total, 2);
  assert.equal(report.tokens.fluid, 1);
  assert.deepEqual(report.acf.layouts, [{ layout: "text", template: "components/text/template" }]);
  assert.equal(report.acf.fieldGroups[0].tokenSelects, 1);
  rmSync(root, { recursive: true, force: true });
});

test("auditTheme flags a block height floor and a literal color, not the clean case", () => {
  const clean = makeTheme({ block: ".text { min-block-size: 0; color: var(--color-ink); }\n" });
  assert.equal(auditTheme({ root: clean }).hard, 0);
  rmSync(clean, { recursive: true, force: true });

  const dirty = makeTheme({ block: ".text { min-block-size: 20vh; color: #ff0044; }\n" });
  const report = auditTheme({ root: dirty });
  assert.equal(report.hard, 2, JSON.stringify(report.findings));
  assert.deepEqual(report.findings.map((finding) => finding.rule).sort(), ["block-height", "magic-color"]);
  rmSync(dirty, { recursive: true, force: true });
});

test("auditTheme records an accepted exception as accepted, not hard", () => {
  const root = makeTheme({ block: ".text { min-block-size: 20vh; }\n" });
  assert.equal(auditTheme({ root }).hard, 1);
  const report = auditTheme({ root, accept: ["block-height:src/css/blocks/text.css"] });
  assert.equal(report.hard, 0);
  assert.equal(report.findings[0].severity, "accepted");
  rmSync(root, { recursive: true, force: true });
});

test("parseDesign unwraps the MCP envelope into tokens, sections, and components", () => {
  const dir = mkdtempSync(join(tmpdir(), "krn-frontend-design-"));
  const variables = join(dir, "variables.json");
  const metadata = join(dir, "metadata.txt");
  writeFileSync(variables, JSON.stringify({
    content: [{ type: "text", text: JSON.stringify({ Yellow: "#FCCD26", "Nagłówek - H1": 'Font(family: "Montserrat", style: Bold, size: 72, weight: 700, lineHeight: 1.2, letterSpacing: 0)' }) }],
  }));
  writeFileSync(metadata, JSON.stringify({
    content: [{ type: "text", text: "<canvas id=\"1:1\" name=\"Designs\">\n  <frame id=\"1:2\" name=\"Home\">\n    <frame id=\"1:3\" name=\"Hero\">\n      <instance id=\"1:4\" name=\"Button\" />\n    </frame>\n    <frame id=\"1:5\" name=\"Footer\">\n      <instance id=\"1:6\" name=\"Button\" />\n    </frame>\n  </frame>\n</canvas>\n" }],
  }));
  const report = parseDesign({ variablesFile: variables, metadataFile: metadata });
  assert.equal(report.tokens.total, 2);
  assert.equal(report.tokens.typography.length, 1);
  assert.deepEqual(report.tokens.colors, [{ name: "Yellow", value: "#FCCD26" }]);
  assert.deepEqual(report.sections.map((section) => section.name), ["Hero", "Footer"]);
  assert.deepEqual(report.components, [{ name: "Button", count: 2 }]);
  rmSync(dir, { recursive: true, force: true });
});
