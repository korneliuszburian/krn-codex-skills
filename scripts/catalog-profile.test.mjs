import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { resolveProfile } from "./lib/catalog-profile.mjs";

test("resolves lexical quarantine evidence without executing the CLI", async (context) => {
  const quarantinedSkillPath =
    "/home/example/.agents/skills/quarantined-sentinel/SKILL.md";
  const profile = {
    plugins: { enable: [], disable: [], disableFamilies: ["figma"] },
    skills: {
      enable: [],
      enableFamilies: [],
      disable: [],
      disableFamilies: [],
      preserveScopes: ["project-local"],
    },
    mcps: { enable: [], disable: [] },
    apps: { enable: [], disable: [], mode: "report-only" },
  };
  const inventory = {
    plugins: [],
    skills: [],
    hardQuarantine: [
      {
        kind: "plugin",
        id: "quarantined-sentinel@marketplace",
        evidence: "directory-name",
      },
      {
        kind: "skill",
        id: "quarantined-sentinel",
        path: quarantinedSkillPath,
        evidence: "directory-name",
      },
    ],
  };

  const resolved = resolveProfile(profile, inventory, {
    pluginIds: ["quarantined-sentinel@required-marketplace"],
  });

  assert.equal(resolved.desired.pluginFamilies.figma, false);
  assert.equal(
    resolved.desired.plugins["quarantined-sentinel@marketplace"],
    false,
  );
  assert.equal(
    resolved.desired.plugins["quarantined-sentinel@required-marketplace"],
    false,
  );
  assert.equal(resolved.desired.skills[quarantinedSkillPath], false);

  const cliUrl = new URL("./catalog.mjs", import.meta.url).href;
  const imported = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `await import(${JSON.stringify(cliUrl)})`],
    { encoding: "utf8" },
  );
  assert.equal(imported.status, 0, imported.stderr);
  assert.equal(imported.stdout, "");
  assert.equal(imported.stderr, "");

  const fixture = await mkdtemp(join(tmpdir(), "catalog-entrypoint-"));
  context.after(async () => rm(fixture, { recursive: true, force: true }));
  const sourcePath = fileURLToPath(new URL("./catalog.mjs", import.meta.url));
  const linkedPath = join(fixture, "krn-codex-catalog");
  await symlink(sourcePath, linkedPath);
  const invoked = spawnSync(process.execPath, [linkedPath, "--help"], {
    encoding: "utf8",
  });
  assert.equal(invoked.status, 0, invoked.stderr);
  assert.match(invoked.stdout, /KRN Codex capability catalog/);
});
