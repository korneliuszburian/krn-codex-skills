import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../scripts/catalog.mjs", import.meta.url));

const makeHome = () => {
  const base = mkdtempSync(join(tmpdir(), "krn-catalog-cli-"));
  mkdirSync(join(base, "codex"), { recursive: true });
  return {
    base,
    env: { HOME: base, CODEX_HOME: join(base, "codex"), AGENTS_HOME: join(base, "agents") },
    configPath: join(base, "config.toml"),
  };
};

const run = (args, env) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });

test("a relative CODEX_HOME still yields absolute inventory paths", () => {
  const { base } = makeHome();
  try {
    const relativeHome = "relcodex";
    const skillDir = join(base, relativeHome, "skills", "demo");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, "SKILL.md"), "---\nname: demo\ndescription: demo\n---\n");
    const result = spawnSync(process.execPath, [cli, "inventory", "--json"], {
      encoding: "utf8",
      cwd: base,
      env: { ...process.env, HOME: base, CODEX_HOME: relativeHome, AGENTS_HOME: "relagents" },
    });
    assert.equal(result.status, 0, result.stderr);
    const demo = JSON.parse(result.stdout).skills.find((skill) => skill.id === "demo");
    assert.ok(demo, result.stdout);
    assert.ok(isAbsolute(demo.path), `expected absolute path, got ${demo.path}`);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("catalog profile list reports the installed profiles as JSON", () => {
  const { base, env } = makeHome();
  try {
    const result = run(["profile", "list", "--json"], env);
    assert.equal(result.status, 0, result.stderr);
    const names = JSON.parse(result.stdout).map((profile) => profile.name);
    assert.ok(names.includes("minimal"));
    assert.ok(names.includes("full"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("catalog plan, check, and apply converge a managed config with a backup", () => {
  const { base, env, configPath } = makeHome();
  try {
    writeFileSync(configPath, '[plugins."remember@claude-plugins-official"]\nenabled = true\n');

    const plan = run(["plan", "minimal", "--config", configPath, "--json"], env);
    assert.equal(plan.status, 0, plan.stderr);
    assert.equal(JSON.parse(plan.stdout).plan.changed, true);

    const drift = run(["check", "minimal", "--config", configPath, "--json"], env);
    assert.equal(drift.status, 3, drift.stderr);
    assert.equal(JSON.parse(drift.stdout).status, "drift");
    assert.equal(JSON.parse(drift.stdout).converged, false);
    const driftText = run(["check", "minimal", "--config", configPath], env);
    assert.match(driftText.stdout, /DRIFT:/);

    const applied = run(["apply", "minimal", "--config", configPath, "--json"], env);
    assert.equal(applied.status, 0, applied.stderr);
    const applyReport = JSON.parse(applied.stdout);
    assert.equal(applyReport.result.changed, true);
    assert.ok(applyReport.result.backupPath);
    assert.equal(readFileSync(applyReport.result.backupPath, "utf8"), '[plugins."remember@claude-plugins-official"]\nenabled = true\n');

    const config = readFileSync(configPath, "utf8");
    assert.match(config, /\[plugins\."remember@claude-plugins-official"\]\nenabled = false/);
    assert.match(config, /\[plugins\."codex-cli-wakatime@wakatime"\]\nenabled = true/);

    const converged = run(["check", "minimal", "--config", configPath, "--json"], env);
    assert.equal(converged.status, 0, converged.stderr);
    assert.equal(JSON.parse(converged.stdout).status, "converged");
    assert.equal(JSON.parse(converged.stdout).converged, true);

    const replan = run(["plan", "minimal", "--config", configPath, "--json"], env);
    assert.equal(JSON.parse(replan.stdout).plan.changed, false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("catalog inventory reads an empty temporary capability home", () => {
  const { base, env } = makeHome();
  try {
    const result = run(["inventory", "--json"], env);
    assert.equal(result.status, 0, result.stderr);
    const inventory = JSON.parse(result.stdout);
    assert.equal(inventory.schemaVersion, 1);
    assert.deepEqual(inventory.skills, []);
    assert.deepEqual(inventory.plugins, []);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("the legacy catalog bin delegates to the capability CLI", () => {
  const bin = fileURLToPath(new URL("../../scripts/krn-codex-catalog.mjs", import.meta.url));
  const { base, env } = makeHome();
  try {
    const result = spawnSync(process.execPath, [bin, "profile", "list", "--json"], { encoding: "utf8", env: { ...process.env, ...env } });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(JSON.parse(result.stdout).some((profile) => profile.name === "minimal"));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("catalog profile show prints a resolved profile", () => {
  const { base, env } = makeHome();
  try {
    const result = run(["profile", "show", "minimal", "--json"], env);
    assert.equal(result.status, 0, result.stderr);
    const profile = JSON.parse(result.stdout);
    assert.equal(profile.name, "minimal");
    assert.equal(typeof profile.description, "string");
    assert.ok(profile.description.length > 0, "the profile description is not empty");
    assert.equal(profile.capability_states.profile, "declared");
    assert.ok(profile.plugins.disable.includes("remember@claude-plugins-official"), JSON.stringify(profile.plugins.disable));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("catalog usage reports aggregates and the usage state contract", () => {
  const { base, env } = makeHome();
  try {
    const sessions = join(base, "sessions", "2026", "01", "06");
    mkdirSync(sessions, { recursive: true });
    const at = (seconds, payload) =>
      `${JSON.stringify({ timestamp: `2026-01-06T00:00:0${seconds}.000Z`, type: "response_item", payload })}\n`;
    writeFileSync(
      join(sessions, "rollout-2026-01-06T00-00-00.jsonl"),
      at(0, { type: "function_call", call_id: "c1", name: "exec_command", arguments: JSON.stringify({ cmd: "echo hi" }) }) +
        at(1, { type: "function_call_output", call_id: "c1" }),
    );
    const result = run(["usage", "--json", "--days", "3650", "--sessions-root", join(base, "sessions")], env);
    assert.equal(result.status, 0, result.stderr);
    const usage = JSON.parse(result.stdout);
    assert.deepEqual(
      usage.aggregates.map(({ kind, id, confirmed_calls }) => ({ kind, id, confirmed_calls })),
      [{ kind: "tool", id: "exec_command", confirmed_calls: 1 }],
    );
    assert.ok(Array.isArray(usage.capability_states.optional_capabilities));
    assert.ok(usage.capability_states.optional_capabilities.length > 0, "optional capabilities are resolved, not empty");
    assert.equal(usage.capability_states.evidence_window.through_day, new Date().toISOString().slice(0, 10));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("skipping a pre-window rollout file marks the evidence incomplete", () => {
  const { base, env } = makeHome();
  try {
    const sessions = join(base, "codex", "sessions");
    mkdirSync(join(sessions, "2020", "01", "01"), { recursive: true });
    writeFileSync(join(sessions, "2020", "01", "01", "rollout-2020-01-01T00-00-00.jsonl"), "\n");
    const result = run(["usage", "--json", "--sessions-root", sessions], env);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.coverage.skipped_files_before_window, 1);
    assert.equal(report.capability_states.evidence_incomplete, true);
    assert.equal(report.capability_states.dropped_evidence.skipped_files_before_window, 1);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("a duplicate single-valued option and a bare command are usage errors", () => {
  const { base, env } = makeHome();
  try {
    const dup = run(["plan", "minimal", "--config", join(base, "a.toml"), "--config", join(base, "b.toml")], env);
    assert.equal(dup.status, 64, dup.stdout + dup.stderr);
    assert.match(dup.stderr, /duplicate option: --config/);
    const bare = run([], env);
    assert.equal(bare.status, 64, bare.stdout + bare.stderr);
    const unknownProfile = run(["plan", "does-not-exist", "--config", join(base, "a.toml")], env);
    assert.equal(unknownProfile.status, 64, unknownProfile.stdout + unknownProfile.stderr);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
