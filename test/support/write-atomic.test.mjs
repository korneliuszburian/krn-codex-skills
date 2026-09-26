import assert from "node:assert/strict";
import {
  closeSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const loadWriteAtomic = async () => {
  try {
    return await import("../../scripts/lib/support/write-atomic.mjs");
  } catch {
    return null;
  }
};

const withDir = (body) => {
  const dir = mkdtempSync(join(tmpdir(), "krn-write-atomic-"));
  try {
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("writeAtomic replaces a file through a sibling temp and rename", async () => {
  const library = await loadWriteAtomic();
  assert.ok(library, "scripts/lib/support/write-atomic.mjs must exist");
  withDir((dir) => {
    const file = join(dir, "state.md");
    writeFileSync(file, "old bytes");
    library.writeAtomic(file, "new bytes");
    assert.equal(readFileSync(file, "utf8"), "new bytes");
    assert.deepEqual(readdirSync(dir), ["state.md"], "the temp file is renamed away, never left behind");
  });
});

test("a crash after a half write leaves the original bytes intact", async () => {
  const library = await loadWriteAtomic();
  assert.ok(library, "scripts/lib/support/write-atomic.mjs must exist");
  withDir((dir) => {
    const file = join(dir, "state.md");
    writeFileSync(file, "original bytes");
    assert.throws(
      () => library.writeAtomic(file, "replacement bytes", {
        write: (handle, text) => {
          writeSync(handle, text.slice(0, Math.floor(text.length / 2)));
          throw new Error("crash after a half write");
        },
      }),
      /crash after a half write/,
    );
    assert.equal(readFileSync(file, "utf8"), "original bytes", "the untouched target survives the torn temp");
    assert.deepEqual(readdirSync(dir), ["state.md"], "the partial temp file is removed");
  });
});

test("a remover that throws after a half write cannot tear the original", async () => {
  const library = await loadWriteAtomic();
  assert.ok(library, "scripts/lib/support/write-atomic.mjs must exist");
  withDir((dir) => {
    const file = join(dir, "state.md");
    writeFileSync(file, "original bytes");
    const failure = new Error("crash after a half write");
    let removed = 0;
    assert.throws(
      () => library.writeAtomic(file, "replacement bytes", {
        write: (handle, text) => {
          writeSync(handle, text.slice(0, 4));
          throw failure;
        },
        remove: () => {
          removed += 1;
          throw new Error("remover failed");
        },
      }),
      (error) => error === failure,
      "the write failure still propagates when the remover throws",
    );
    assert.equal(removed, 1, "the best-effort remover is still invoked");
    assert.equal(readFileSync(file, "utf8"), "original bytes", "the original is never the temp's target");
  });
});

test("writeAtomic fsyncs the temp, renames, then best-effort fsyncs the directory", async () => {
  const library = await loadWriteAtomic();
  assert.ok(library, "scripts/lib/support/write-atomic.mjs must exist");
  withDir((dir) => {
    const file = join(dir, "state.md");
    writeFileSync(file, "old bytes");
    const events = [];
    library.writeAtomic(file, "new bytes", {
      open: (target, flags, mode) => {
        events.push(target === dir ? "open-dir" : "open-temp");
        return openSync(target, flags, mode);
      },
      write: (handle, text) => { events.push("write"); return writeSync(handle, text); },
      sync: (handle) => { events.push("fsync"); return fsyncSync(handle); },
      rename: (from, to) => { events.push("rename"); return renameSync(from, to); },
      close: closeSync,
    });
    assert.deepEqual(events, ["open-temp", "write", "fsync", "rename", "open-dir", "fsync"]);
    assert.equal(readFileSync(file, "utf8"), "new bytes");
  });
});

test("a directory fsync failure does not discard the completed write", async () => {
  const library = await loadWriteAtomic();
  assert.ok(library, "scripts/lib/support/write-atomic.mjs must exist");
  withDir((dir) => {
    const file = join(dir, "state.md");
    writeFileSync(file, "old bytes");
    let syncs = 0;
    library.writeAtomic(file, "new bytes", {
      sync: (handle) => {
        syncs += 1;
        if (syncs === 2) throw new Error("directory fsync failed");
        return fsyncSync(handle);
      },
    });
    assert.equal(syncs, 2, "the temp is fsynced before the directory attempt");
    assert.equal(readFileSync(file, "utf8"), "new bytes", "the rename already committed the new bytes");
  });
});

test("writeAtomic keeps writing until every UTF-8 byte reaches the replacement", async () => {
  const library = await loadWriteAtomic();
  assert.ok(library, "scripts/lib/support/write-atomic.mjs must exist");
  withDir((dir) => {
    const file = join(dir, "state.md");
    const content = "café state ✅";
    const writes = [];
    writeFileSync(file, "old state");
    library.writeAtomic(file, content, {
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

test("writeAtomic refuses zero progress and preserves the old target", async () => {
  const library = await loadWriteAtomic();
  assert.ok(library, "scripts/lib/support/write-atomic.mjs must exist");
  withDir((dir) => {
    const file = join(dir, "state.md");
    writeFileSync(file, "old state");
    assert.throws(
      () => library.writeAtomic(file, "replacement", { write: () => 0 }),
      /progress|incomplete/i,
    );
    assert.equal(readFileSync(file, "utf8"), "old state");
    assert.deepEqual(readdirSync(dir), ["state.md"]);
  });
});
