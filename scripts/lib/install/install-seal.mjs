import fs from "node:fs";
import path from "node:path";

import { EXIT_CODES } from "../support/diagnostics.mjs";
import { gitText, gitTopLevel } from "../kernel/git.mjs";
import { writeAtomic } from "../support/write-atomic.mjs";
import { RELEASE_DIGESTS_RELATIVE, releaseDigests } from "./install-inspect.mjs";

const { CORRUPT: EXIT_CORRUPT } = EXIT_CODES;

function releaseDigestsFile(root) {
  return path.join(root, RELEASE_DIGESTS_RELATIVE);
}

// The committed ledger is the append-only anchor: `HEAD:config/release-digests.json`
// records what was already sealed, so rewriting the working copy to drop an
// entry must not launder a replacement digest. A checkout without a committed
// ledger, or one whose committed ledger is unreadable or malformed, falls back
// to today's release-local behavior; a malformed anchor is the inspect path's
// finding, never a crash here.
function committedDigests(root) {
  if (typeof root !== "string" || root === "") return null;
  const toplevel = gitTopLevel(root);
  if (toplevel === "") return null;
  const text = gitText(toplevel, ["show", `HEAD:${RELEASE_DIGESTS_RELATIVE}`]);
  if (text === "") return null;
  let document;
  try {
    document = JSON.parse(text);
  } catch {
    return null;
  }
  const digests = document?.digests;
  if (digests === undefined || digests === null) return null;
  if (typeof digests !== "object" || Array.isArray(digests)) return null;
  return digests;
}

function refuseLedgerDeletion(commit, key) {
  const error = new Error(
    `seal-ledger-deleted: refusing to seal ${commit} because ${key} is missing from or changed in the working ${RELEASE_DIGESTS_RELATIVE}`,
  );
  error.exitCode = EXIT_CORRUPT;
  error.rule = "seal-ledger-deleted";
  throw error;
}

// The ledger is a repository artifact, never a release artifact: it is the
// committed trust anchor the release bytes are checked against. It is
// append-only, so a commit's digest can never be silently replaced — and, with
// the committed anchor consulted below, never silently deleted either. The
// whole document is swapped through the shared atomic writer so a crash cannot
// tear the previous ledger.
export function sealReleaseDigest({ root, commit, digest, ops } = {}) {
  const existing = releaseDigests(root);
  const recorded = existing[commit];
  if (typeof recorded === "string" && recorded !== digest) {
    const error = new Error(
      `seal-mismatched: refusing to replace the sealed digest for ${commit} in ${RELEASE_DIGESTS_RELATIVE}`,
    );
    error.exitCode = EXIT_CORRUPT;
    error.rule = "seal-mismatched";
    throw error;
  }
  const committed = committedDigests(root);
  if (committed) {
    for (const [key, value] of Object.entries(committed)) {
      if (existing[key] !== value) refuseLedgerDeletion(commit, key);
    }
  }
  const file = releaseDigestsFile(root);
  if (recorded === digest) return { file, commit, digest };
  const digests = { ...existing, [commit]: digest };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`, ops);
  return { file, commit, digest };
}
