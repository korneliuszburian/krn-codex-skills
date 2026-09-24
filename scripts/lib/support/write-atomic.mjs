import { randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  rmSync,
  writeSync,
} from "node:fs";
import path from "node:path";

// Replacing a file in place can be torn by a crash between the truncate and the
// last byte. Writing a sibling temp, fsyncing it, then renaming over the target
// makes the swap atomic: a crash leaves either the whole old file or the whole
// new one. The directory fsync is best effort because not every platform lets a
// directory be opened, but where it works the rename itself is durable.
export function writeAtomic(file, text, {
  open = openSync,
  write = writeSync,
  sync = fsyncSync,
  close = closeSync,
  rename = renameSync,
  remove = rmSync,
} = {}) {
  const dir = path.dirname(file);
  const temp = path.join(dir, `.${path.basename(file)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`);
  let handle = null;
  try {
    handle = open(temp, "wx", 0o600);
    const bytes = Buffer.from(text);
    let offset = 0;
    while (offset < bytes.length) {
      const remaining = bytes.length - offset;
      const written = write(handle, bytes, offset, remaining, null);
      if (!Number.isInteger(written) || written <= 0 || written > remaining) {
        throw new Error(`writeAtomic stalled with invalid progress: ${written}`);
      }
      offset += written;
    }
    sync(handle);
    close(handle);
    handle = null;
    rename(temp, file);
  } catch (error) {
    if (handle !== null) {
      try { close(handle); } catch { /* the handle is already unusable */ }
    }
    try { remove(temp, { force: true }); } catch { /* the partial temp is disposable */ }
    throw error;
  }
  try {
    const dirHandle = open(dir, "r");
    try { sync(dirHandle); } finally { close(dirHandle); }
  } catch { /* the rename is visible; directory durability is best effort */ }
}
