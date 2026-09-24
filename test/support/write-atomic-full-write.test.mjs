import assert from "node:assert/strict";
import {
  closeSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeAtomic } from "../../scripts/lib/support/write-atomic.mjs";

const withDir = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-write-full-"));
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("writeAtomic keeps writing until every UTF-8 byte reaches the replacement", () => {
  withDir((dir) => {
    const file = join(dir, "state.md");
    const content = "café state ✅";
    const writes = [];
    writeFileSync(file, "old state");

    writeAtomic(file, content, {
      write: (handle, value, offset = 0, length = Buffer.byteLength(value), position = null) => {
        const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
        const count = Math.min(4, length);
        writes.push({ offset, count });
        return writeSync(handle, bytes, offset, count, position);
      },
    });

    assert.ok(writes.length > 1, "the injected writer must make several partial writes");
    assert.equal(readFileSync(file, "utf8"), content);
    assert.deepEqual(readdirSync(dir), ["state.md"]);
  });
});

test("writeAtomic refuses zero progress and preserves the old target", () => {
  withDir((dir) => {
    const file = join(dir, "state.md");
    writeFileSync(file, "old state");

    assert.throws(
      () => writeAtomic(file, "replacement", { write: () => 0 }),
      /progress|incomplete/i,
    );

    assert.equal(readFileSync(file, "utf8"), "old state");
    assert.deepEqual(readdirSync(dir), ["state.md"]);
  });
});
