import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

export function taskReferenceErrors(text) {
  return String(text).includes(ABI) ? [] : [`tasks reference must link the historical ticket ABI at ${ABI}`];
}

export function slicePublicationErrors(text) {
  const selected = String(text).split("## Selected Git-ref task queue\n")[1]?.split("## Externally configured Markdown tracker\n")[0] ?? "";
  const markdown = String(text).split("## Externally configured Markdown tracker\n")[1]?.split("## Real tracker\n")[0] ?? "";
  const errors = [];
  for (const command of ["krn task add", "krn task ready", "krn task show", "krn task check", "--depends-on"]) {
    if (!selected.includes(command)) errors.push(`selected task publication omits ${command}`);
  }
  if (!/blocked[^.]*open|open[^.]*block/i.test(selected) || !/done/i.test(selected)) {
    errors.push("selected task publication must not mark blocked work ready");
  }
  if (!/selector/i.test(selected) || selected.includes("krn ticket check")) {
    errors.push("selected task publication must not fall back to Markdown validation");
  }
  if (!markdown.includes("krn task store migrate") || !markdown.includes("<krn-ticket>")
    || markdown.includes("krn ticket check") || markdown.includes("KRN_QUEUE_MODE=legacy")) {
    errors.push("historical Markdown import must not revive the retired public ticket CLI");
  }
  return errors;
}

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

test("the slice-work tasks reference links the historical ticket ABI", () => {
  const reference = readFileSync(join(root, "skills/engineering/slice-work/references/tasks.md"), "utf8");
  assert.deepEqual(taskReferenceErrors(reference), []);
});

test("slice-work publishes selected tasks without treating Markdown ABI files as task state", () => {
  const reference = readFileSync(join(root, "skills/engineering/slice-work/references/tasks.md"), "utf8");
  assert.deepEqual(slicePublicationErrors(reference), []);
});

test("the observer fails on a tasks reference that does not link the historical ABI", () => {
  assert.deepEqual(taskReferenceErrors("# tasks\n\n**Kind:** vertical-slice\n**Status:** ready-for-agent\n"), [
    `tasks reference must link the historical ticket ABI at ${ABI}`,
  ]);
  assert.deepEqual(taskReferenceErrors(`See ${ABI} for the envelope.`), []);
});

test("active task product proof is registered under its task owner", () => {
  const product = "test/task/task-product.test.mjs";
  const script = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts["test:lib"];
  assert.ok(existsSync(join(root, product)), "task product proof must live with its task owner");
  assert.ok(script.includes(product), "the shared gate must execute the moved product proof");
  assert.ok(!script.includes("test/ticket/task-product.test.mjs"), "the gate must not retain the obsolete path");
});

test("one live task store, import and queue lock live under the task owner", () => {
  const manifest = JSON.parse(readFileSync(join(root, "skills/manifest.json"), "utf8"));
  for (const name of ["task-store.mjs", "task-import.mjs", "queue-write-lock.mjs"]) {
    const taskPath = `scripts/lib/task/${name}`;
    assert.ok(existsSync(join(root, taskPath)), `${taskPath} is the live module`);
    assert.ok(manifest.runtime_paths.includes(taskPath), `${taskPath} is installed`);
    assert.ok(!existsSync(join(root, `scripts/lib/ticket/${name}`)), `${name} must not have a second legacy owner`);
  }
});
