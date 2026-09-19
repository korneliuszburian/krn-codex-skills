import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ADR_PATH = join(
  process.cwd(),
  "docs",
  "adr",
  "0005-continuous-hardening-with-bounded-passes.md",
);
const SKILL_PATH = join(
  process.cwd(),
  "skills",
  "engineering",
  "delivery-loop",
  "SKILL.md",
);

// The portability decision lives in prose, so read each surface defensively:
// a missing or unreadable file becomes a failed assertion inside the test
// instead of a thrown import-time error.
function readText(path) {
  if (!existsSync(path)) return "";
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

// Collapse soft line wraps so an assertion matches prose that a Markdown
// renderer reads as one sentence.
function prose(content) {
  return content.replace(/\s+/g, " ");
}

const SURFACES = [
  { name: "ADR 0005", path: ADR_PATH },
  { name: "delivery-loop SKILL.md", path: SKILL_PATH },
];

for (const surface of SURFACES) {
  test(`${surface.name} names a durable archive, not only another ignored path`, () => {
    const content = readText(surface.path);
    assert.ok(content.length > 0, `${surface.path} must exist and be readable`);
    const text = prose(content);
    assert.ok(
      text.includes("KRN_OUTCOME_ARCHIVE"),
      `${surface.name} must name the KRN_OUTCOME_ARCHIVE durable-archive override`,
    );
    assert.ok(
      text.includes(".local/state/krn/outcomes"),
      `${surface.name} must name the durable host archive path`,
    );
    assert.ok(
      text.includes(".krn/runs/delivery-loop/<outcome"),
      `${surface.name} must export the outcome capsule directory`,
    );
    assert.ok(
      text.includes(".scratch/tickets/"),
      `${surface.name} must export the local queue directory`,
    );
  });

  test(`${surface.name} names the pause export and the successor restore`, () => {
    const content = readText(surface.path);
    assert.ok(content.length > 0, `${surface.path} must exist and be readable`);
    const text = prose(content);
    assert.match(
      text,
      /export/i,
      `${surface.name} must name the pause export step`,
    );
    assert.match(
      text,
      /restore/i,
      `${surface.name} must name the restore-by-copy step`,
    );
    for (const command of ["krn state check", "krn state resume", "krn ticket next"]) {
      assert.ok(
        text.includes(command),
        `${surface.name} must record the resume command \`${command}\``,
      );
    }
  });

  test(`${surface.name} records the wipe/restore falsifier`, () => {
    const content = readText(surface.path);
    assert.ok(content.length > 0, `${surface.path} must exist and be readable`);
    const text = prose(content);
    assert.match(text, /falsifier/i, `${surface.name} must name a falsifier`);
    assert.match(
      text,
      /empty frontier/i,
      `${surface.name} must state that a skipped restore leaves an empty frontier`,
    );
    assert.match(
      text,
      /load-bearing/i,
      `${surface.name} must state that the archive and restore are load-bearing`,
    );
  });
}
