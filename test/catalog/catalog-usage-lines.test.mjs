import assert from "node:assert/strict";
import test from "node:test";

import {
  consumeLines,
  isCandidateRecordLine,
  MAX_ROLLOUT_RECORD_BYTES,
} from "../../scripts/lib/catalog/catalog-usage-lines.mjs";

async function* chunks(...buffers) {
  for (const buffer of buffers) yield buffer;
}

test("consumeLines joins chunks, strips CR, and reports byte counts", async () => {
  const lines = [];
  const oversized = [];
  let bytes = 0;
  await consumeLines(
    chunks(Buffer.from("alpha\r\nbe"), Buffer.from("ta\ngamma")),
    (line) => lines.push(line.toString("utf8")),
    (count) => (bytes += count),
    (candidate) => oversized.push(candidate),
  );
  assert.deepEqual(lines, ["alpha", "beta", "gamma"]);
  assert.equal(bytes, 17);
  assert.deepEqual(oversized, []);
});

test("isCandidateRecordLine matches call markers regardless of JSON spacing", () => {
  assert.equal(isCandidateRecordLine(Buffer.from('{"type":"function_call"}')), true);
  assert.equal(isCandidateRecordLine(Buffer.from('{"type":"function_call_output"}')), true);
  assert.equal(isCandidateRecordLine(Buffer.from('{"type": "function_call"}')), true);
  assert.equal(isCandidateRecordLine(Buffer.from("plain")), false);
});

test("consumeLines flags oversized records and candidate presence", async () => {
  const candidate = [];
  await consumeLines(
    chunks(Buffer.concat([Buffer.alloc(MAX_ROLLOUT_RECORD_BYTES, 97), Buffer.from('{"type":"function_call"}\n')])),
    () => candidate.push("line"),
    () => {},
    (isCandidate) => candidate.push(isCandidate),
  );
  assert.deepEqual(candidate, [true]);

  const plain = [];
  await consumeLines(
    chunks(Buffer.concat([Buffer.alloc(MAX_ROLLOUT_RECORD_BYTES + 1, 97), Buffer.from("\n")])),
    () => plain.push("line"),
    () => {},
    (isCandidate) => plain.push(isCandidate),
  );
  assert.deepEqual(plain, [false]);
});
