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

// The ADR is the only durable surface that can fix who observes a hardening
// trigger and who produces the bounded pass. Read it defensively so a missing
// file becomes a failed assertion inside the test instead of a thrown
// import-time error.
function readAdr() {
  if (!existsSync(ADR_PATH)) return "";
  try {
    return readFileSync(ADR_PATH, "utf8");
  } catch {
    return "";
  }
}

// Collapse soft line wraps so an assertion matches prose that a Markdown
// renderer reads as one sentence.
function prose(content) {
  return content.replace(/\s+/g, " ");
}

// The obligations are anchored to the Decision section, so a stray mention in
// another section cannot satisfy them.
function section(content, heading) {
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line.trim() === heading);
  if (start === -1) return "";
  const body = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break;
    body.push(lines[index]);
  }
  return body.join("\n");
}

const decision = (adr) => prose(section(adr, "## Decision"));

test("ADR 0005 names the observer of record and its inputs", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = decision(adr);
  assert.match(
    text,
    /\*\*observer of record\*\*/,
    "the Decision must carry the observer-of-record anchor",
  );
  assert.match(
    text,
    /maintainer session at outcome bind/i,
    "the observer must be the maintainer session at outcome bind",
  );
  for (const input of [
    "`krn ticket check`",
    "`krn state check`",
    "session-start queue brief",
  ]) {
    assert.ok(
      text.includes(input),
      `the observer must read ${input}`,
    );
  }
  assert.match(
    text,
    /operator as the named backstop/i,
    "the ADR must name the operator as the backstop",
  );
});

test("ADR 0005 names the producer and rules out a second sensor", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = decision(adr);
  assert.match(text, /\*\*producer\*\*/, "the Decision must carry the producer anchor");
  assert.match(
    text,
    /maintainer session or the operator/i,
    "the producer must be the maintainer session or the operator",
  );
  assert.match(
    text,
    /no scheduled job/i,
    "the ADR must rule out a scheduled job",
  );
  assert.match(
    text,
    /no automatic ticket creation/i,
    "the ADR must rule out automatic ticket creation",
  );
  assert.match(
    text,
    /no second sensor service/i,
    "the ADR must rule out a second sensor service",
  );
});

test("ADR 0005 names every tripwire that starts a pass", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = decision(adr);
  for (const tripwire of [
    /red gate on the integrated branch/i,
    /reproduced bypass or failed falsifier/i,
    "`state check` warning",
    /LT row without an adoption decision/i,
    /dangling friction candidate/i,
    /memory hit-rate under the delivery target/i,
  ]) {
    if (tripwire instanceof RegExp) {
      assert.match(text, tripwire, `the ADR must name the tripwire ${tripwire}`);
    } else {
      assert.ok(
        text.includes(tripwire),
        `the ADR must name the tripwire ${tripwire}`,
      );
    }
  }
});

test("ADR 0005 states the numeric budget for a pass", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = decision(adr);
  assert.ok(
    text.includes("wall-clock ≤ 4 hours"),
    "the ADR must cap a pass at 4 hours wall-clock",
  );
  assert.ok(
    text.includes("tokens ≤ 400k"),
    "the ADR must cap a pass at 400k tokens",
  );
  assert.ok(
    text.includes("findings ≤ 8 per pass"),
    "the ADR must cap a pass at 8 findings",
  );
});

test("ADR 0005 names the exhaustion handoff and its successor", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = decision(adr);
  assert.match(
    text,
    /\*\*exhaustion handoff\*\*/,
    "the Decision must carry the exhaustion-handoff anchor",
  );
  assert.match(
    text,
    /next pass ticket/i,
    "undispositioned findings must hand to the next pass ticket",
  );
  assert.match(
    text,
    /owned by the same session/i,
    "the successor pass must be owned by the same session",
  );
  assert.match(
    text,
    /recorded in the capsule/i,
    "the handoff must be recorded in the capsule",
  );
});

// The durable-archive anchors moved here from durable-handoff.test.mjs so one
// owner holds every ADR-0005 obligation.
test("ADR 0005 names the durable archive, the resume commands, and the wipe falsifier", () => {
  const adr = readAdr();
  assert.ok(adr.length > 0, `${ADR_PATH} must exist and be readable`);
  const text = decision(adr);
  for (const anchor of [
    "KRN_OUTCOME_ARCHIVE",
    ".local/state/krn/outcomes",
    ".krn/runs/delivery-loop/<outcome",
    ".krn/tickets/",
  ]) {
    assert.ok(
      text.includes(anchor),
      `the Decision must name the durable anchor ${anchor}`,
    );
  }
  for (const command of ["krn state check", "krn state resume", "krn ticket next"]) {
    assert.ok(
      text.includes(command),
      `the Decision must record the resume command \`${command}\``,
    );
  }
  assert.match(text, /falsifier/i, "the Decision must name the wipe/restore falsifier");
});
