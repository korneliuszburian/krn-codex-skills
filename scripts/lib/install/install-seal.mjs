import fs from "node:fs";
import path from "node:path";

import { EXIT_CODES, fail } from "../support/diagnostics.mjs";
import { RELEASE_DIGESTS_RELATIVE, digestTree, releaseDigests } from "./install-inspect.mjs";

function releaseDigestsFile(root) {
  return path.join(root, RELEASE_DIGESTS_RELATIVE);
}

export function sealReleaseDigest({ root, commit, digest }) {
  const digests = { ...releaseDigests(root), [commit]: digest };
  const file = releaseDigestsFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`);
  return { file, commit, digest };
}

export function sealRelease({ release, commit, digest }) {
  const stat = fs.lstatSync(release, { throwIfNoEntry: false });
  if (!stat || !stat.isDirectory() || stat.isSymbolicLink()) {
    fail(`no release directory to seal: ${release}`, EXIT_CODES.SOURCE);
  }
  const actual = digest ?? digestTree(release).digest;
  return sealReleaseDigest({ root: release, commit, digest: actual });
}
