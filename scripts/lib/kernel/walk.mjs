import { readdirSync } from "node:fs";
import path from "node:path";

import { posixRelative } from "../support/path-rules.mjs";

// One owner for recursive filesystem file listing. The walker is depth-first
// and visits each directory's entries in readdir order unless the caller passes
// a comparator, so a digest caller can pin the order it hashes. Each result
// carries the absolute path, the POSIX-relative path, and the dirent, and an
// unreadable root yields an empty list unless the caller asks for the error.
export function walkFiles(root, { filter = () => true, compare = null, onError = "empty" } = {}) {
  const results = [];
  const visit = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (onError === "throw") throw error;
      return;
    }
    if (compare) entries = [...entries].sort(compare);
    for (const entry of entries) {
      const absolute = path.join(dir, entry.name);
      const record = { path: absolute, relative: posixRelative(root, absolute), dirent: entry };
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (entry.isFile() && filter(record)) results.push(record);
    }
  };
  visit(root);
  return results;
}
