import fs from "node:fs";
import path from "node:path";

import { RELEASE_DIGESTS_RELATIVE, releaseDigests } from "./install-inspect.mjs";

function releaseDigestsFile(root) {
  return path.join(root, RELEASE_DIGESTS_RELATIVE);
}

// The ledger is a repository artifact, never a release artifact: it is the
// committed trust anchor the release bytes are checked against.
export function sealReleaseDigest({ root, commit, digest }) {
  const digests = { ...releaseDigests(root), [commit]: digest };
  const file = releaseDigestsFile(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ schema_version: 1, digests }, null, 2)}\n`);
  return { file, commit, digest };
}
