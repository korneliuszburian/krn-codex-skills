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

// The ADR is the only durable surface that can fix how an outcome's ignored
// operational state crosses a checkout boundary. Read it defensively so a
// missing file becomes a failed assertion inside the test instead of a
// thrown import-time error.
function readAdr() {
  if (!existsSync(ADR_PATH)) return "";
  try {
    return readFileSync(ADR_PATH, "utf8");
  } catch {
    return "";
  }
}

// Match prose across soft line wraps without weakening the assertions.
function prose(content) {
  return content.replace(/\s+/g, " ");
}

test("ADR 0005 names the explicit handoff copy and both ignored directories", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = prose(adr);
  assert.match(
    text,
    /explicit handoff copy/i,
    "the ADR must name the explicit handoff copy as the portability mechanism",
  );
  assert.ok(
    text.includes(".krn/runs/delivery-loop/<outcome>/"),
    "the ADR must name the copied outcome capsule directory",
  );
  assert.ok(
    text.includes(".krn/tickets/"),
    "the ADR must name the copied local queue directory",
  );
  assert.match(
    text,
    /ignored working state/i,
    "the ADR must keep the copied directories as ignored working state",
  );
});

test("ADR 0005 records the successor checkout resume commands", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = prose(adr);
  for (const command of ["krn state check", "krn state resume", "krn ticket next"]) {
    assert.ok(
      text.includes(command),
      `the ADR must record the resume command \`${command}\``,
    );
  }
});

test("ADR 0005 records the pause/copy/resume falsifier and the bare-clone behavior", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = prose(adr);
  assert.match(text, /falsifier/i, "the ADR must name a falsifier scenario");
  assert.match(text, /checkout A/, "the falsifier must pause in checkout A");
  assert.match(text, /checkout B/, "the falsifier must resume in checkout B");
  assert.match(text, /bare clone/i, "the ADR must record what a bare clone does");
  assert.match(
    text,
    /not-applicable/i,
    "a bare clone must stay not-applicable at `krn state check`",
  );
  assert.match(
    text,
    /empty frontier/i,
    "a bare clone must report an empty frontier by design",
  );
  assert.match(
    text,
    /load-bearing/i,
    "the ADR must state that the copy is the load-bearing step",
  );
});

test("ADR 0005 rejects a tracked operational export", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  assert.match(
    prose(adr),
    /tracked operational (export|artifact)/i,
    "the ADR must record the rejected tracked-export alternative",
  );
});
