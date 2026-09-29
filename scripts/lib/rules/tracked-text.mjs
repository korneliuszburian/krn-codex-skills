import fs from "node:fs";
import path from "node:path";

import { runGitBinary, runGitRaw } from "../kernel/git.mjs";

const utf8 = new TextDecoder("utf-8", { fatal: true });
const utf16le = new TextDecoder("utf-16le", { fatal: true });
const utf16be = new TextDecoder("utf-16be", { fatal: true });

function textFrom(bytes) {
  try {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) return utf16le.decode(bytes);
    if (bytes[0] === 0xfe && bytes[1] === 0xff) return utf16be.decode(bytes);
    if (bytes.includes(0)) return null;
    return utf8.decode(bytes);
  } catch {
    return null; // Binary or invalid text, not a Unicode text file.
  }
}

function occurrences(relative, bytes, origin = "") {
  const text = textFrom(bytes);
  if (text === null) return [];
  const errors = [];
  text.split("\n").forEach((line, index) => {
    const count = line.split("\u2014").length - 1;
    if (count) errors.push(`${JSON.stringify(relative)}:${index + 1}: ${count} U+2014 EM DASH occurrence(s)${origin}`);
  });
  return errors;
}

function stagedEntries(root) {
  const listed = runGitRaw(root, ["ls-files", "--stage", "-z"]);
  if (!listed.ok) return { errors: [`cannot list tracked text paths: git ls-files exited ${listed.status}`] };
  const entries = [];
  const errors = [];
  for (const record of listed.out.split("\0").filter(Boolean)) {
    const fields = /^(\d{6}) ([0-9a-f]{40,64}) ([0-3])\t(.*)$/s.exec(record);
    if (!fields || fields[3] !== "0") {
      errors.push("cannot inspect unmerged or invalid tracked path in the index");
      continue;
    }
    if (fields[1] !== "160000") entries.push({ relative: fields[4], oid: fields[2] });
  }
  return { entries, errors };
}

function stagedBlobs(root, entries) {
  if (entries.length === 0) return [];
  const result = runGitBinary(root, ["cat-file", "--batch"], entries.map(({ oid }) => oid).join("\n") + "\n");
  if (!result.ok || !Buffer.isBuffer(result.out)) return null;
  const blobs = [];
  let offset = 0;
  for (const entry of entries) {
    const end = result.out.indexOf(10, offset);
    if (end < 0) return null;
    const header = result.out.toString("utf8", offset, end);
    const fields = /^([0-9a-f]{40,64}) blob (\d+)$/.exec(header);
    if (!fields || fields[1] !== entry.oid) return null;
    const size = Number(fields[2]);
    offset = end + 1;
    if (!Number.isSafeInteger(size) || offset + size >= result.out.length || result.out[offset + size] !== 10) return null;
    blobs.push(result.out.subarray(offset, offset + size));
    offset += size + 1;
  }
  return offset === result.out.length ? blobs : null;
}

function worktreeBytes(root, relative) {
  const parts = relative.split("/");
  parts.pop();
  let parent = root;
  for (const part of parts) {
    parent = path.join(parent, part);
    const kind = fs.lstatSync(parent);
    if (kind.isSymbolicLink()) return { error: "symlinked parent refuses inspection" };
    if (!kind.isDirectory()) return { error: "tracked parent is not a directory" };
  }
  const file = path.join(root, relative);
  const kind = fs.lstatSync(file);
  if (kind.isSymbolicLink()) return { bytes: Buffer.from(fs.readlinkSync(file)) };
  if (kind.isFile()) return { bytes: fs.readFileSync(file) };
  return { error: "tracked path is not a text file" };
}

// Inspect both the index (the next commit) and the worktree (the next edit).
// Read symlink target text, but never follow a symlink out of the checkout.
export function trackedEmDashErrors(root) {
  const { entries, errors } = stagedEntries(root);
  if (!entries) return errors;
  const blobs = stagedBlobs(root, entries);
  if (!blobs) return [...errors, "cannot read staged text blobs from the index"];
  entries.forEach(({ relative }, index) => {
    const staged = blobs[index];
    let worktree;
    try {
      worktree = worktreeBytes(root, relative);
    } catch {
      worktree = { error: "tracked path cannot be read" };
    }
    if (worktree.error) {
      errors.push(...occurrences(relative, staged, " (staged)"));
      errors.push(`${JSON.stringify(relative)}: ${worktree.error}`);
    } else if (staged.equals(worktree.bytes)) {
      errors.push(...occurrences(relative, staged));
    } else {
      errors.push(...occurrences(relative, staged, " (staged)"));
      errors.push(...occurrences(relative, worktree.bytes, " (worktree)"));
    }
  });
  return errors;
}
