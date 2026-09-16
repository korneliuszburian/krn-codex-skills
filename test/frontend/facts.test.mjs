import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { auditFacts } from "../../scripts/lib/frontend/facts.mjs";

function makeProject({ docs = {}, css = {}, built = null, tokenJson = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), "krn-facts-"));
  mkdirSync(join(root, "src", "css", "blocks"), { recursive: true });
  mkdirSync(join(root, "src", "css", "compositions"), { recursive: true });
  for (const [name, text] of Object.entries(css)) {
    const inCompositions = name.startsWith("compositions/");
    const file = name.replace("compositions/", "");
    writeFileSync(join(root, "src", "css", inCompositions ? "compositions" : "blocks", file), text);
  }
  if (built !== null) {
    mkdirSync(join(root, "assets", "dist"), { recursive: true });
    writeFileSync(join(root, "assets", "dist", "main.css"), built);
  }
  for (const [name, document] of Object.entries(tokenJson)) {
    mkdirSync(join(root, "src", "design-tokens"), { recursive: true });
    writeFileSync(join(root, "src", "design-tokens", name), JSON.stringify(document, null, 2));
  }
  mkdirSync(join(root, "docs", "design"), { recursive: true });
  for (const [name, text] of Object.entries(docs)) {
    writeFileSync(join(root, "docs", "design", name), text);
  }
  return root;
}

const CARD_ONLY = [
  "# Components",
  "",
  "| Block | Variant (`data-*`) | Optionals | Occurrences | Library | Status |",
  "|---|---|---|---|---:|---|",
  "| `card` | media `data-card-state=\"empty\"` | media, heading, link | 6 | `blocks/card.css` | built |",
  "",
].join("\n");

const COMPONENTS = [
  "# Components",
  "",
  "| Block | Variant (`data-*`) | Optionals | Occurrences | Library | Status |",
  "|---|---|---|---|---:|---|",
  "| `card` | media `data-card-state=\"empty\"` | media, heading, link | 6 | `blocks/card.css` | built |",
  "| `gallery` | `data-layout` | images | 1 | reuse `grid` + `frame` | reuse, no block |",
  "",
].join("\n");

test("auditFacts requires a matrix variant to exist in the block CSS", () => {
  const clean = makeProject({
    docs: { "components.md": CARD_ONLY },
    css: { "card.css": ".card__media[data-card-state='empty'] { background: var(--color-accent); }\n" },
  });
  assert.equal(auditFacts({ root: clean }).hard, 0, JSON.stringify(auditFacts({ root: clean }).findings));
  rmSync(clean, { recursive: true, force: true });

  const dirty = makeProject({
    docs: { "components.md": CARD_ONLY },
    css: { "card.css": ".card { color: var(--color-dark); }\n" },
  });
  const report = auditFacts({ root: dirty });
  assert.deepEqual(report.findings.map((finding) => finding.rule), ["facts-components"]);
  assert.match(report.findings[0].detail, /data-card-state/, report.findings[0].detail);
  rmSync(dirty, { recursive: true, force: true });
});

test("auditFacts accepts a variant carried by the component template", () => {
  const root = makeProject({
    docs: { "components.md": CARD_ONLY },
    css: { "card.css": ".card { color: var(--color-dark); }\n" },
  });
  mkdirSync(join(root, "components", "card"), { recursive: true });
  writeFileSync(join(root, "components", "card", "template.php"), '<div class="card" data-card-state="<?php echo esc_attr($state); ?>">\n');
  assert.equal(auditFacts({ root }).hard, 0, JSON.stringify(auditFacts({ root }).findings));
  rmSync(root, { recursive: true, force: true });
});

test("auditFacts resolves a matrix reuse cell against the compositions", () => {
  const missing = makeProject({ docs: { "components.md": COMPONENTS }, css: { "card.css": ".card__media[data-card-state='empty'] { }\n" } });
  const report = auditFacts({ root: missing });
  assert.deepEqual(report.findings.map((finding) => finding.detail).filter((detail) => /grid|frame/.test(detail)).length, 2, JSON.stringify(report.findings));
  rmSync(missing, { recursive: true, force: true });

  const present = makeProject({
    docs: { "components.md": COMPONENTS },
    css: {
      "card.css": ".card__media[data-card-state='empty'] { }\n",
      "compositions/grid.css": ".grid { display: grid; }\n",
      "compositions/frame.css": ".frame img { object-fit: cover; }\n",
    },
  });
  assert.equal(auditFacts({ root: present }).hard, 0);
  rmSync(present, { recursive: true, force: true });
});

test("auditFacts flags a section mapped to an unknown block", () => {
  const sections = [
    "| Section | Mapped block |",
    "|---|---|",
    "| Courses | `courses` |",
    "| Blog | `card` list (article) |",
    "",
  ].join("\n");
  const clean = makeProject({ docs: { "sections.md": sections }, css: { "courses.css": ".courses { }\n", "card.css": ".card { }\n" } });
  assert.equal(auditFacts({ root: clean }).hard, 0);
  rmSync(clean, { recursive: true, force: true });

  const dirty = makeProject({ docs: { "sections.md": sections }, css: { "courses.css": ".courses { }\n" } });
  const report = auditFacts({ root: dirty });
  assert.deepEqual(report.findings.map((finding) => finding.rule), ["facts-sections"]);
  assert.match(report.findings[0].detail, /card/, report.findings[0].detail);
  rmSync(dirty, { recursive: true, force: true });
});

test("auditFacts resolves documented tokens against the shipped layer", () => {
  const tokens = [
    "| Token | Value |",
    "|---|---|",
    "| `--color-primary` | `#02394A` |",
    "| `--space-s-l` | paired |",
    "",
  ].join("\n");
  const clean = makeProject({
    docs: { "tokens.md": tokens },
    css: {},
    built: ":root { --color-primary: #02394A; --space-s-l: clamp(1rem, 2vw, 2rem); }\n",
  });
  assert.equal(auditFacts({ root: clean }).hard, 0, JSON.stringify(auditFacts({ root: clean }).findings));
  rmSync(clean, { recursive: true, force: true });

  const dirty = makeProject({
    docs: { "tokens.md": tokens },
    css: {},
    built: ":root { --color-primary: #02394A; }\n",
  });
  const report = auditFacts({ root: dirty });
  assert.deepEqual(report.findings.map((finding) => finding.rule), ["facts-tokens"]);
  assert.match(report.findings[0].detail, /--space-s-l/, report.findings[0].detail);
  rmSync(dirty, { recursive: true, force: true });
});

test("auditFacts reports an unbuilt project as a soft finding, not a hard one", () => {
  const tokens = ["| Token | Value |", "|---|---|", "| `--color-primary` | `#02394A` |", ""].join("\n");
  const root = makeProject({
    docs: { "tokens.md": tokens },
    css: {},
    tokenJson: { "colors.json": { color: { primary: { $value: "#02394A" } } } },
  });
  const report = auditFacts({ root });
  assert.equal(report.hard, 0, JSON.stringify(report.findings));
  assert.deepEqual(report.findings.map((finding) => finding.severity), ["soft"]);
  rmSync(root, { recursive: true, force: true });
});

test("auditFacts compares documented values with the token source", () => {
  const tokens = [
    "| Token | Value | Role |",
    "|---|---|---|",
    "| `--color-primary` | `#02394A` | brand |",
    "| `--font-base` | Atkinson Hyperlegible, Segoe UI, sans-serif | body |",
    "",
  ].join("\n");
  const clean = makeProject({
    docs: { "tokens.md": tokens },
    tokenJson: {
      "colors.json": { color: { primary: { $value: "#02394A" } } },
      "fonts.json": { font: { base: { $value: ["Atkinson Hyperlegible", "Segoe UI", "sans-serif"] } } },
    },
  });
  assert.equal(auditFacts({ root: clean }).hard, 0, JSON.stringify(auditFacts({ root: clean }).findings));
  rmSync(clean, { recursive: true, force: true });

  const drifted = makeProject({
    docs: { "tokens.md": tokens },
    tokenJson: {
      "colors.json": { color: { primary: { $value: "#8D49B0" } } },
      "fonts.json": { font: { base: { $value: ["DM Sans", "Segoe UI", "sans-serif"] } } },
    },
  });
  const report = auditFacts({ root: drifted });
  const mismatches = report.findings.filter((finding) => finding.severity === "hard" && finding.rule === "facts-tokens");
  assert.equal(mismatches.length, 2, JSON.stringify(report.findings));
  assert.ok(mismatches.some((finding) => /--color-primary/.test(finding.detail)), JSON.stringify(report.findings));
  assert.ok(mismatches.some((finding) => /--font-base/.test(finding.detail)), JSON.stringify(report.findings));
  rmSync(drifted, { recursive: true, force: true });
});
