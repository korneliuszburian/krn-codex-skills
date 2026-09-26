import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const read = (relative) => readFileSync(join(root, relative), "utf8");
const scripts = () => JSON.parse(read("package.json")).scripts;
const workflow = () => read(".github/workflows/validate.yml");

const AUDIT_COMMAND = "node scripts/quality-audit.mjs --root .";

const expand = (scripts, name, seen = new Set()) => {
  if (seen.has(name)) return "";
  seen.add(name);
  return String(scripts[name] ?? "").replace(/npm run ([a-z:-]+)/g, (_, step) => expand(scripts, step, seen));
};

test("the aggregate gate invokes the quality audit before changes:check", () => {
  const commands = scripts();
  assert.equal(commands["quality:audit"], AUDIT_COMMAND, "the gate surface must expose the audit command");
  const gate = String(commands.gate);
  const auditIndex = gate.indexOf("quality:audit");
  const changesIndex = gate.indexOf("changes:check");
  assert.ok(auditIndex >= 0, "npm run gate must run the quality audit");
  assert.ok(changesIndex >= 0, "npm run gate must still run changes:check");
  assert.ok(auditIndex < changesIndex, "the quality audit must run before changes:check");
  assert.match(expand(commands, "gate"), /node scripts\/quality-audit\.mjs --root \./, "the gate chain must resolve to the audit command");
});

test("the CI workflow runs the same quality audit check", () => {
  const commands = scripts();
  assert.match(workflow(), /npm run quality:audit/, "the workflow must run npm run quality:audit");
  assert.equal(commands["quality:audit"], AUDIT_COMMAND, "the workflow and gate must share one audit command");
});

test("the audit wrapper fails when it reports findings", () => {
  const directory = mkdtempSync(join(tmpdir(), "krn-audit-gate-"));
  try {
    const target = join(directory, "scripts", "lib", "noisy.mjs");
    mkdirSync(join(directory, "scripts", "lib"), { recursive: true });
    writeFileSync(target, "export function noisy() {\n  console.log(\"x\");\n  return 1;\n}\n");
    const result = spawnSync(process.execPath, [join(root, "scripts", "quality-audit.mjs")], {
      cwd: directory,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /AUDIT .*noisy\.mjs: smell console\.log/, result.stderr);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the audit wrapper is clean on the repository root", () => {
  const result = spawnSync(process.execPath, [join(root, "scripts", "quality-audit.mjs"), "--root", "."], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quality audit clean/);
});
