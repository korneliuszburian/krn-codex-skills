import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { loadCases, runConformance } from "../../scripts/lib/conformance/conformance.mjs";
import { adoptionSignal } from "../../config/opencode/plugins/krn.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const OLD = "krn-codex";
const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");

// The runtime hint surfaces this rename owns. The conformance loader keeps the
// legacy path as an accepted fallback, so it is exercised functionally instead.
const RUNTIME_HINTS = [
  "scripts/krn.mjs",
  "scripts/lib/state/state-brief.mjs",
  "scripts/lib/lessons/lessons.mjs",
  "scripts/hooks/krn_memory.py",
  "config/opencode/plugins/krn.js",
];

const SKILL_FILES = [
  "skills/engineering/delivery-loop/SKILL.md",
  "skills/engineering/setup-repository-workflow/SKILL.md",
  "skills/engineering/setup-repository-workflow/scripts/init-repository-workflow.mjs",
  "skills/engineering/slice-work/references/tickets.md",
];

const EXPORT_FILES = [
  ".agents/skills/delivery-loop/SKILL.md",
  ".agents/skills/setup-repository-workflow/SKILL.md",
  ".agents/skills/setup-repository-workflow/scripts/init-repository-workflow.mjs",
  ".agents/skills/slice-work/references/tickets.md",
];

function withWorktree(body) {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-rename-hints-"));
  try {
    mkdirSync(path.join(dir, ".git"));
    writeFileSync(path.join(dir, "AGENTS.md"), "# Demo\n");
    return body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("the usage text and runtime diagnostics name krn", () => {
  const cli = path.join(root, "scripts", "krn.mjs");
  const help = spawnSync(process.execPath, [cli, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /krn install plan/);
  assert.doesNotMatch(help.stdout, new RegExp(OLD));

  const misuse = spawnSync(process.execPath, [cli, "skills", "check"], { encoding: "utf8" });
  assert.equal(misuse.status, 64, `${misuse.stdout}${misuse.stderr}`);
  assert.doesNotMatch(misuse.stderr, new RegExp(OLD));
});

test("the runtime hint sources name krn", () => {
  for (const file of RUNTIME_HINTS) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
    assert.doesNotMatch(read(file), new RegExp(OLD), `${file} still emits ${OLD}`);
  }
});

test("the memory hook and the catalog plugin emit the krn adoption command", () => {
  withWorktree((dir) => {
    const hook = path.join(root, "scripts", "hooks", "krn_memory.py");
    const result = spawnSync("python3", ["-B", hook], {
      input: JSON.stringify({ hook_event_name: "SessionStart", cwd: dir }),
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.match(context, /krn repo inspect/);
    assert.doesNotMatch(context, new RegExp(OLD));

    const signal = adoptionSignal(dir);
    assert.match(signal, /krn repo inspect/);
    assert.doesNotMatch(signal, new RegExp(OLD));
  });
});

test("the conformance loader defaults to krn and accepts the legacy file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-rename-conformance-"));
  try {
    const casesFile = path.join(dir, "cases.json");
    writeFileSync(casesFile, JSON.stringify({
      rootArg: null,
      cases: [{
        id: "smoke",
        steps: [{ files: { "marker.txt": "x\n" }, message: "chore" }],
        run: [],
        expect: { exit: 0 },
      }],
    }));
    const cases = loadCases(casesFile);
    assert.equal(cases[0].program, "scripts/krn.mjs");

    const candidate = path.join(dir, "candidate");
    mkdirSync(path.join(candidate, "scripts"), { recursive: true });
    writeFileSync(path.join(candidate, "scripts", "krn-codex.mjs"), "process.exit(0);\n");
    const results = runConformance({ candidate, cases });
    assert.equal(results[0].ok, true, JSON.stringify(results));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the skill sources and their generated export name krn", () => {
  for (const file of [...SKILL_FILES, ...EXPORT_FILES]) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} is missing`);
    assert.doesNotMatch(read(file), new RegExp(OLD), `${file} still emits ${OLD}`);
  }
});

test("the historical research rows keep the old name verbatim", () => {
  const labTests = read("docs/research/lab-tests.md");
  assert.match(labTests, /`scripts\/krn-codex\.mjs` is a re-export shim that keeps every path-only caller working/);
  assert.match(labTests, /text and docs still say `krn-codex` until sh-51\/sh-52 land/);
});
