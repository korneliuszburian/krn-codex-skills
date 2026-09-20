import { createHash } from "node:crypto";

// One owner for content digests. A sha256 over concatenated parts is the
// repository's source, artifact, and tree identity; the git blob form is the
// header-prefixed sha1 git itself writes for a blob object.
export function sha256Hex(...parts) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}

export function gitBlobHash(buffer) {
  return createHash("sha1").update(`blob ${buffer.length}\0`).update(buffer).digest("hex");
}
