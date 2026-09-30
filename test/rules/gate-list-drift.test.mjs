import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("documented handoff gate commands resolve to package scripts", () => {
  const page = readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  const section = page.split("## Local gates\n")[1]?.split("\n## ")[0];
  assert.ok(section, "the repository contract must expose its local gate entrypoint");
  const commands = [...section.matchAll(/npm run ([a-z][a-z:-]*)/g)].map((match) => match[1]);
  assert.ok(commands.includes("gate"), "the handoff must reach the complete gate");
  const { scripts } = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  for (const command of new Set(commands)) {
    assert.ok(Object.hasOwn(scripts, command), `documented command does not exist: npm run ${command}`);
    assert.equal(typeof scripts[command], "string");
    assert.ok(scripts[command].trim(), `documented command is empty: npm run ${command}`);
  }
});
