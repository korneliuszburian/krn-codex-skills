import fs from "node:fs";
import path from "node:path";

import { EXIT_CODES } from "../support/diagnostics.mjs";
import { writeAtomic } from "../support/write-atomic.mjs";
import { RELEASE_DIGESTS_RELATIVE, releaseDigests } from "./install-inspect.mjs";

const { CORRUPT: EXIT_CORRUPT } = EXIT_CODES;

function releaseDigestsFile(root) {
  return path.join(root, RELEASE_DIGESTS_RELATIVE);
}

// The ledger is a repository artifact, never a release artifact: it is the
// committed trust anchor the release bytes are checked against. It is
// append-only, so a commit's digest can never be silently replaced, and the
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
  const file = releaseDigestsFile(root);
  if (recorded === digest) return { file, commit, digest };
  const digests = { ...existing, [commit]: digest };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeAtomic(file, `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`, ops);
  return { file, commit, digest };
}
