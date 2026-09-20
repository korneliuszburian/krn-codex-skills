import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../..", import.meta.url));
const ADAPTER = path.join(root, "scripts", "harness", "opencode-agent.mjs");

const FAKE = [
  "#!/usr/bin/env node",
  'import { existsSync, readFileSync, writeFileSync } from "node:fs";',
  'import path from "node:path";',
  'const home = process.env.HOME;',
  'const configDir = path.join(home, ".config", "opencode");',
  'const agents = path.join(configDir, "AGENTS.md");',
  "const seen = {",
  '  argv: process.argv.slice(2),',
  '  skills: existsSync(path.join(home, ".agents", "skills")),',
  '  plugins: existsSync(path.join(configDir, "plugins")),',
  '  instructions: existsSync(agents) ? readFileSync(agents, "utf8") : "",',
  "};",
  "writeFileSync(process.env.KRN_FAKE_OUT, JSON.stringify(seen));",
  'process.stdout.write(`${JSON.stringify({ type: "step_finish", part: { tokens: { total: 42 } } })}\\n`);',
].join("\n");

function fixtureHome(dir) {
  const home = path.join(dir, "home");
  mkdirSync(path.join(home, ".agents", "skills"), { recursive: true });
  mkdirSync(path.join(home, ".config", "opencode", "plugins"), { recursive: true });
  mkdirSync(path.join(home, ".local", "share", "opencode"), { recursive: true });
  writeFileSync(path.join(home, ".config", "opencode", "AGENTS.md"), "# KRN contract\n");
  writeFileSync(path.join(home, ".config", "opencode", "opencode.json"), "{}\n");
  writeFileSync(path.join(home, ".local", "share", "opencode", "auth.json"), "{}\n");
  return home;
}

function runAdapter(enabled) {
  assert.ok(existsSync(ADAPTER), "scripts/harness/opencode-agent.mjs must exist");
  const dir = mkdtempSync(path.join(tmpdir(), "krn-opencode-agent-"));
  const fake = path.join(dir, "opencode");
  const out = path.join(dir, "seen.json");
  writeFileSync(fake, FAKE);
  chmodSync(fake, 0o755);
  try {
    const result = spawnSync(process.execPath, [ADAPTER], {
      input: JSON.stringify({ lane: "full", enabled, prompt: "fix the bug", workspace: root, run: 1, runs: 1 }),
      encoding: "utf8",
      env: {
        ...process.env,
        KRN_HARNESS_OPENCODE: fake,
        KRN_FAKE_OUT: out,
        KRN_HARNESS_AGENT_HOME: fixtureHome(dir),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    return { seen: JSON.parse(readFileSync(out, "utf8")), stdout: result.stdout.trim() };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the vanilla lane materializes no KRN surface", () => {
  const { seen } = runAdapter({ skills: false, memory: false, brief: false, hooks: false });
  assert.equal(seen.skills, false);
  assert.equal(seen.plugins, false);
  assert.equal(seen.instructions, "");
});

test("the full lane materializes skills, the plugin, and the recall instruction", () => {
  const { seen } = runAdapter({ skills: true, memory: true, brief: true, hooks: true });
  assert.equal(seen.skills, true);
  assert.equal(seen.plugins, true);
  assert.match(seen.instructions, /krn memory recall/);
  assert.ok(seen.argv.includes("--dir"));
  assert.ok(seen.argv.includes("run"));
});

test("the memory surface alone adds only the recall instruction", () => {
  const { seen } = runAdapter({ skills: false, memory: true, brief: false, hooks: false });
  assert.equal(seen.skills, false);
  assert.equal(seen.plugins, false);
  assert.match(seen.instructions, /krn memory recall/);
});

test("the adapter reports the token total from the opencode stream", () => {
  const { stdout } = runAdapter({ skills: true, memory: true, brief: true, hooks: true });
  assert.equal(stdout, JSON.stringify({ tokens: 42 }));
});
