import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const ABI = "docs/research/ticket-protocol.md";

export function runtimePathOrderErrors(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return ["manifest: runtime_paths must be a non-empty array"];
  const firstOutOfOrder = paths.find((value, index) => index > 0 && paths[index - 1] > value);
  return firstOutOfOrder === undefined ? [] : [`manifest: runtime_paths is not sorted at ${firstOutOfOrder}`];
}

export function ticketReferenceErrors(text) {
  return String(text).includes(ABI) ? [] : [`tickets reference must link the ticket ABI at ${ABI}`];
}

export function inventoryErrors(label, text, names) {
  const body = String(text);
  return names
    .filter((name) => !new RegExp(`\\b${name}\\b`).test(body))
    .map((name) => `${label} inventory omits ${name}`);
}

const directoryNames = (relative) =>
  readdirSync(join(root, relative), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

test("the manifest runtime_paths are sorted", () => {
  const manifest = JSON.parse(readFileSync(join(root, "skills/manifest.json"), "utf8"));
  assert.deepEqual(runtimePathOrderErrors(manifest.runtime_paths), []);
});

test("the observer fails on an unsorted runtime_paths list", () => {
  assert.deepEqual(runtimePathOrderErrors(["a", "b"]), []);
  assert.deepEqual(runtimePathOrderErrors(["scripts/lib/support/tap.mjs", "skills/manifest.json", "scripts/lib/support/regexp.mjs"]), [
    "manifest: runtime_paths is not sorted at scripts/lib/support/regexp.mjs",
  ]);
  assert.deepEqual(runtimePathOrderErrors(["b", "a"]), ["manifest: runtime_paths is not sorted at a"]);
  assert.deepEqual(runtimePathOrderErrors([]), ["manifest: runtime_paths must be a non-empty array"]);
});

test("the slice-work tickets reference links the ticket ABI", () => {
  const reference = readFileSync(join(root, "skills/engineering/slice-work/references/tickets.md"), "utf8");
  assert.deepEqual(ticketReferenceErrors(reference), []);
});

test("the observer fails on a tickets reference that does not link the ABI", () => {
  assert.deepEqual(ticketReferenceErrors("# tickets\n\n**Kind:** vertical-slice\n**Status:** ready-for-agent\n"), [
    `tickets reference must link the ticket ABI at ${ABI}`,
  ]);
  assert.deepEqual(ticketReferenceErrors(`See ${ABI} for the envelope.`), []);
});

test("AGENTS.md and README.md inventories name every lib owner and test group", () => {
  const names = [...directoryNames("scripts/lib"), ...directoryNames("test")];
  for (const label of ["AGENTS.md", "README.md"]) {
    assert.deepEqual(inventoryErrors(label, readFileSync(join(root, label), "utf8"), names), []);
  }
});

test("the observer fails on an inventory that omits an owner", () => {
  assert.deepEqual(inventoryErrors("README.md", "catalog and contract and install", ["catalog", "contract", "install", "ticket"]), [
    "README.md inventory omits ticket",
  ]);
});
