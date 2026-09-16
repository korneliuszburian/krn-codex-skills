import assert from "node:assert/strict";
import test from "node:test";

const loadRemoveTree = async () => {
  try {
    return await import("../../scripts/lib/support/remove-tree.mjs");
  } catch {
    return null;
  }
};

const transient = () => {
  const error = new Error("directory not empty");
  error.code = "ENOTEMPTY";
  return error;
};

test("removeTree retries a transient ENOTEMPTY failure until it succeeds", async () => {
  const library = await loadRemoveTree();
  assert.ok(library, "scripts/lib/support/remove-tree.mjs must exist");
  let calls = 0;
  library.removeTree("/tmp/krn-remove-tree", {
    remover: () => {
      calls += 1;
      if (calls <= 2) throw transient();
    },
  });
  assert.equal(calls, 3, "two transient failures are retried before the third removal succeeds");
});

test("removeTree bounds transient retries and rethrows the last failure", async () => {
  const library = await loadRemoveTree();
  assert.ok(library, "scripts/lib/support/remove-tree.mjs must exist");
  let calls = 0;
  assert.throws(
    () => library.removeTree("/tmp/krn-remove-tree", {
      remover: () => { calls += 1; throw transient(); },
      maxRetries: 2,
    }),
    /directory not empty/,
  );
  assert.equal(calls, 3, "the bound is the initial attempt plus maxRetries retries");
});

test("removeTree rethrows a non-transient failure without retrying", async () => {
  const library = await loadRemoveTree();
  assert.ok(library, "scripts/lib/support/remove-tree.mjs must exist");
  let calls = 0;
  const error = new Error("no such file or directory");
  error.code = "ENOENT";
  assert.throws(
    () => library.removeTree("/tmp/krn-remove-tree", { remover: () => { calls += 1; throw error; } }),
    /no such file or directory/,
  );
  assert.equal(calls, 1, "a non-transient error is not retried");
});

test("removeTree hands the retry budget to the production remover", async () => {
  const library = await loadRemoveTree();
  assert.ok(library, "scripts/lib/support/remove-tree.mjs must exist");
  const seen = [];
  library.removeTree("/tmp/krn-remove-tree", { remover: (target, options) => seen.push([target, options]) });
  assert.deepEqual(seen, [["/tmp/krn-remove-tree", { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }]]);
});
