import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ConcurrentConfigChangeError,
  ConfigReconcileError,
  QuarantineViolationError,
  applyCatalogConfigPlan,
  loadCatalogConfigPlan,
  planCatalogConfig,
} from "./lib/catalog-config.mjs";

test("changes only enabled in a realistic MCP block and preserves nested config bytes", () => {
  const source = [
    "# operator-owned preamble",
    'model = "gpt-5"',
    "",
    "[mcp_servers.context7]",
    'command = "npx"',
    "args = [",
    '  "-y",',
    '  "@upstash/context7-mcp",',
    "]",
    'env_vars = ["LOCAL_TOKEN", { name = "REMOTE_TOKEN", source = "remote" }]',
    'cwd = "/tmp/work"',
    'experimental_environment = "remote"',
    "startup_timeout_sec = 20",
    'enabled = true # operator comment',
    "",
    "[mcp_servers.context7.env]",
    'API_KEY = "fixture-value"',
    "",
    "[operator_owned]",
    "mystery = { nested = true }",
    "",
  ].join("\r\n");

  const plan = planCatalogConfig({
    source,
    desired: { mcpServers: { context7: false } },
  });

  assert.equal(plan.changed, true);
  assert.equal(
    plan.nextSource,
    source.replace(
      "enabled = true # operator comment",
      "enabled = false # operator comment",
    ),
  );
  assert.deepEqual(plan.actions, [
    {
      operation: "set",
      resource: "mcp-server",
      target: "context7",
      enabled: false,
      reason: "desired-state",
    },
  ]);
});

test("updates literal-quoted plugin and MCP headers without duplicating them", () => {
  const source = [
    "[plugins.'figma@openai-curated']",
    "enabled = true",
    "",
    "[mcp_servers.'context7']",
    'url = "https://example.invalid/mcp"',
    "enabled = true",
    "",
  ].join("\n");

  const plan = planCatalogConfig({
    source,
    desired: {
      plugins: { "figma@openai-curated": false },
      mcpServers: { context7: false },
    },
  });

  assert.equal(
    plan.nextSource,
    source.replaceAll("enabled = true", "enabled = false"),
  );
  assert.equal(plan.nextSource.match(/\[plugins\./g)?.length, 1);
  assert.equal(plan.nextSource.match(/\[mcp_servers\./g)?.length, 1);
});

test("reconciles literal-quoted skill assignment keys in place", () => {
  const skillPath = "/home/example/.agents/skills/agent-browser/SKILL.md";
  const source = [
    "[[skills.config]]",
    `'path' = '${skillPath}'`,
    "'enabled' = true # operator comment",
    "",
  ].join("\n");

  const disabled = planCatalogConfig({
    source,
    desired: { skills: { [skillPath]: false } },
  });
  assert.equal(
    disabled.nextSource,
    source.replace("'enabled' = true", "'enabled' = false"),
  );
  assert.equal(disabled.nextSource.match(/\[\[skills\.config\]\]/g)?.length, 1);

  const enabled = planCatalogConfig({
    source: disabled.nextSource,
    desired: { skills: { [skillPath]: true } },
  });
  assert.equal(enabled.nextSource, "");
});

test("fails closed on an unsupported managed skill path value", () => {
  assert.throws(
    () =>
      planCatalogConfig({
        source: [
          "[[skills.config]]",
          'path = """/tmp/example/SKILL.md"""',
          "enabled = false",
          "",
        ].join("\n"),
        desired: { skills: { "/tmp/example/SKILL.md": false } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_AMBIGUOUS_SKILL_PATH",
  );
});

test("fails closed on ambiguous owner-shaped managed headers", () => {
  assert.throws(
    () =>
      planCatalogConfig({
        source: "[plugins.'figma@openai-curated]\nenabled = true\n",
        desired: { plugins: { "figma@openai-curated": false } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_AMBIGUOUS_MANAGED_HEADER",
  );
  assert.throws(
    () =>
      planCatalogConfig({
        source: "[skills.config]\npath = '/tmp/example/SKILL.md'\nenabled = false\n",
        desired: { skills: { "/tmp/example/SKILL.md": false } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_AMBIGUOUS_MANAGED_HEADER",
  );
  assert.throws(
    () =>
      planCatalogConfig({
        source: "[plugins/foo]\nenabled = true\n",
        desired: { plugins: { foo: false } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_AMBIGUOUS_MANAGED_HEADER",
  );
  assert.throws(
    () =>
      planCatalogConfig({
        source: "[plugins]\nfigma = { enabled = true }\n",
        desired: { plugins: { figma: false } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_AMBIGUOUS_MANAGED_HEADER",
  );
});

test("fails closed on managed top-level dotted and inline assignments", () => {
  for (const source of [
    'plugins."figma@vendor".enabled = true\n',
    '"\\u0070lugins"."figma@vendor".enabled = true\n',
    'mcp_servers.browser.command = "server"\nmcp_servers.browser.enabled = true\n',
    'plugins = { "figma@vendor" = { enabled = true } }\n',
  ]) {
    assert.throws(
      () =>
        planCatalogConfig({
          source,
          desired: {
            plugins: { "figma@vendor": false },
            mcpServers: { browser: false },
          },
        }),
      (error) =>
        error instanceof ConfigReconcileError &&
        error.code === "CONFIG_AMBIGUOUS_MANAGED_ASSIGNMENT",
    );
  }
});

test("rejects an unknown direct key inside a managed block", () => {
  const source = [
    '[plugins."figma@openai-curated"]',
    "#shadow = true (comment, not an assignment)",
    "enabled = true",
    'unexpected_transport = "mystery"',
    "",
  ].join("\n");

  assert.throws(
    () =>
      planCatalogConfig({
        source,
        desired: { plugins: { "figma@openai-curated": false } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_UNKNOWN_MANAGED_KEY",
  );
});

test("removes enabled-by-default skill overrides and is idempotent", () => {
  const skillPath = "/home/example/.agents/skills/code-review/SKILL.md";
  const source = [
    "# untouched",
    "[[skills.config]]",
    `path = "${skillPath}"`,
    "enabled = false",
    "",
    "[operator_owned]",
    'value = "preserved"',
    "",
  ].join("\n");

  const desired = { skills: { [skillPath]: true } };
  const first = planCatalogConfig({ source, desired });
  assert.equal(first.changed, true);
  assert.equal(
    first.nextSource,
    ['# untouched', "", "[operator_owned]", 'value = "preserved"', ""].join(
      "\n",
    ),
  );

  const second = planCatalogConfig({ source: first.nextSource, desired });
  assert.equal(second.changed, false);
  assert.equal(second.nextSource, first.nextSource);
  assert.deepEqual(second.actions, []);
});

test("adds missing plugin and skill states without synthesizing an absent MCP transport", () => {
  const disabledSkill = "/home/example/.agents/skills/gsap-core/SKILL.md";
  const enabledSkill = "/home/example/.agents/skills/code-review/SKILL.md";
  const desired = {
    plugins: { "figma@openai-curated": false },
    mcpServers: { context7: false },
    skills: { [disabledSkill]: false, [enabledSkill]: true },
  };

  const first = planCatalogConfig({ source: "# existing\n", desired });
  assert.equal(first.changed, true);
  assert.match(first.nextSource, /\[plugins\."figma@openai-curated"\]\nenabled = false/);
  assert.equal(first.nextSource.includes("mcp_servers.context7"), false);
  assert.equal(
    first.actions.some((action) => action.resource === "mcp-server"),
    false,
  );
  assert.equal(
    first.nextSource.includes(`path = ${JSON.stringify(disabledSkill)}`),
    true,
  );
  assert.equal(first.nextSource.includes(enabledSkill), false);

  const second = planCatalogConfig({ source: first.nextSource, desired });
  assert.equal(second.changed, false);
  assert.deepEqual(second.actions, []);
});

test("fails precisely when asked to enable an MCP server without a transport", () => {
  assert.throws(
    () =>
      planCatalogConfig({
        source: "# no MCP transport is configured\n",
        desired: { mcpServers: { context7: true } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_MCP_TRANSPORT_MISSING" &&
      error.target === "context7",
  );

  const disabled = planCatalogConfig({
    source: "# no MCP transport is configured\n",
    desired: { mcpServers: { context7: false } },
  });
  assert.equal(disabled.changed, false);
  assert.deepEqual(disabled.actions, []);
});

test("disables config-only plugin families without relying on cache inventory", () => {
  const source = [
    '[plugins."figma@custom-marketplace"]',
    "enabled = true",
    "",
    "[[skills.config]]",
    'path = "/home/example/.codex/plugins/cache/custom-marketplace/figma/9.9.9/skills/figma-use/SKILL.md"',
    "enabled = true",
    "",
    '[plugins."figma-pro@custom-marketplace"]',
    "enabled = true",
    "",
  ].join("\n");

  const plan = planCatalogConfig({
    source,
    desired: { pluginFamilies: { figma: false } },
  });

  assert.match(
    plan.nextSource,
    /\[plugins\."figma@custom-marketplace"\]\nenabled = false/,
  );
  assert.equal(plan.nextSource.includes("/figma/9.9.9/"), false);
  assert.match(
    plan.nextSource,
    /\[plugins\."figma-pro@custom-marketplace"\]\nenabled = true/,
  );
  assert.equal(
    plan.actions.some(
      (action) =>
        action.resource === "plugin" && action.reason === "plugin-family",
    ),
    true,
  );

  const converged = planCatalogConfig({
    source: plan.nextSource,
    desired: { pluginFamilies: { figma: false } },
  });
  assert.equal(converged.changed, false);

  const absent = planCatalogConfig({
    source: "# no plugins\n",
    desired: { pluginFamilies: { figma: false } },
  });
  assert.equal(absent.changed, false);
  assert.deepEqual(absent.actions, []);
});

test("fails closed for invalid, enabled, or conflicting plugin-family selectors", () => {
  assert.throws(
    () =>
      planCatalogConfig({
        source: "",
        desired: { pluginFamilies: { figma: true } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_PLUGIN_FAMILY_ENABLE_UNSUPPORTED",
  );
  assert.throws(
    () =>
      planCatalogConfig({
        source: "",
        desired: { pluginFamilies: { "figma@marketplace": false } },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_INVALID_PLUGIN_FAMILY",
  );
  assert.throws(
    () =>
      planCatalogConfig({
        source: '[plugins."figma@custom-marketplace"]\nenabled = false\n',
        desired: {
          plugins: { "figma@custom-marketplace": true },
          pluginFamilies: { figma: false },
        },
      }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_PLUGIN_FAMILY_CONFLICT" &&
      error.target === "figma@custom-marketplace",
  );
});

test("removes version-pinned skill overrides for a disabled managed plugin", () => {
  const source = [
    '[plugins."figma@openai-curated-remote"]',
    "enabled = false",
    "",
    "[[skills.config]]",
    'path = "/home/example/.codex/plugins/cache/openai-curated-remote/figma/2.0.13/skills/figma-use/SKILL.md"',
    "enabled = false",
    "",
    "[[skills.config]]",
    'path = "/home/example/.codex/plugins/cache/openai-curated-remote/figma/2.0.14/skills/figma-use/SKILL.md"',
    "enabled = true",
    "",
    "[[skills.config]]",
    'path = "/home/example/.agents/skills/code-review/SKILL.md"',
    "enabled = false",
    "",
  ].join("\n");

  const plan = planCatalogConfig({
    source,
    desired: { plugins: { "figma@openai-curated-remote": false } },
  });

  assert.equal(plan.nextSource.includes("/figma/2.0.13/"), false);
  assert.equal(plan.nextSource.includes("/figma/2.0.14/"), false);
  assert.equal(plan.nextSource.includes("/code-review/SKILL.md"), true);
  assert.equal(
    plan.actions.filter((action) => action.reason === "disabled-parent-plugin")
      .length,
    2,
  );

  const second = planCatalogConfig({
    source: plan.nextSource,
    desired: { plugins: { "figma@openai-curated-remote": false } },
  });
  assert.equal(second.changed, false);
});

test("enforces hard quarantine lexically even when the profile omits it", () => {
  const quarantinedSkill =
    "/definitely-not-present/.codex/plugins/cache/openai-curated/superpowers/1.0.0/skills/example/SKILL.md";
  const source = [
    "[plugins.'superpowers@openai-curated']",
    "enabled = true",
    "",
    "[[skills.config]]",
    `path = "${quarantinedSkill}"`,
    "enabled = true",
    "",
  ].join("\n");

  const plan = planCatalogConfig({ source, desired: {} });
  assert.equal(
    plan.nextSource,
    source.replaceAll("enabled = true", "enabled = false"),
  );
  assert.equal(plan.actions.length, 2);
  assert.equal(plan.nextSource.match(/\[plugins\./g)?.length, 1);
  assert.ok(plan.actions.every((action) => action.reason === "hard-quarantine"));

  assert.throws(
    () =>
      planCatalogConfig({
        source,
        desired: { plugins: { "superpowers@openai-curated": true } },
      }),
    QuarantineViolationError,
  );
  assert.throws(
    () =>
      planCatalogConfig({
        source,
        desired: { skills: { [quarantinedSkill]: true } },
      }),
    QuarantineViolationError,
  );
});

test("atomically applies a reviewed plan with 0600 config and backup", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "krn-catalog-config-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, "config.toml");
  const source = '[plugins."figma@openai-curated"]\nenabled = true\n';
  await writeFile(configPath, source, { encoding: "utf8", mode: 0o644 });

  const plan = await loadCatalogConfigPlan({
    configPath,
    desired: { plugins: { "figma@openai-curated": false } },
  });
  const result = await applyCatalogConfigPlan({ configPath, plan });

  assert.equal(result.changed, true);
  assert.equal(await readFile(configPath, "utf8"), plan.nextSource);
  assert.equal((await stat(configPath)).mode & 0o777, 0o600);
  assert.equal(await readFile(result.backupPath, "utf8"), source);
  assert.equal((await stat(result.backupPath)).mode & 0o777, 0o600);

  const names = await readdir(directory);
  assert.equal(names.some((name) => name.includes("krn-tmp")), false);
});

test("rejects a stale plan without overwriting a concurrent config change", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "krn-catalog-race-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = join(directory, "config.toml");
  const source = '[plugins."figma@openai-curated"]\nenabled = true\n';
  const concurrentSource = `${source}\n# concurrent operator edit\n`;
  await writeFile(configPath, source, "utf8");

  const plan = await loadCatalogConfigPlan({
    configPath,
    desired: { plugins: { "figma@openai-curated": false } },
  });
  await writeFile(configPath, concurrentSource, "utf8");

  await assert.rejects(
    applyCatalogConfigPlan({ configPath, plan }),
    ConcurrentConfigChangeError,
  );
  assert.equal(await readFile(configPath, "utf8"), concurrentSource);
  assert.deepEqual(await readdir(directory), ["config.toml"]);
});

test("load and apply reject a symlink config without reading or mutating its target", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "krn-catalog-symlink-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const targetPath = join(directory, "operator-owned.toml");
  const configPath = join(directory, "config.toml");
  const targetSource = '[plugins."figma@openai-curated"]\nenabled = true\n';
  await writeFile(targetPath, targetSource, "utf8");
  await symlink(targetPath, configPath);

  await assert.rejects(
    loadCatalogConfigPlan({
      configPath,
      desired: { plugins: { "figma@openai-curated": false } },
    }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_PATH_SYMLINK",
  );

  const plan = planCatalogConfig({
    source: targetSource,
    desired: { plugins: { "figma@openai-curated": false } },
  });
  await assert.rejects(
    applyCatalogConfigPlan({ configPath, plan }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_PATH_SYMLINK",
  );

  assert.equal(await readFile(targetPath, "utf8"), targetSource);
  assert.equal((await lstat(configPath)).isSymbolicLink(), true);
  assert.equal(await readlink(configPath), targetPath);

  const hiddenParent = join(directory, "hidden-config-parent");
  const safeParentAlias = join(directory, "safe-config-alias");
  const indirectTarget = join(hiddenParent, "config.toml");
  const indirectConfig = join(safeParentAlias, "config.toml");
  await mkdir(hiddenParent, { recursive: true });
  await writeFile(indirectTarget, targetSource, "utf8");
  await symlink(hiddenParent, safeParentAlias);

  await assert.rejects(
    loadCatalogConfigPlan({
      configPath: indirectConfig,
      desired: { plugins: { "figma@openai-curated": false } },
    }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_PATH_SYMLINK",
  );
  await assert.rejects(
    applyCatalogConfigPlan({ configPath: indirectConfig, plan }),
    (error) =>
      error instanceof ConfigReconcileError &&
      error.code === "CONFIG_PATH_SYMLINK",
  );
  assert.equal(await readFile(indirectTarget, "utf8"), targetSource);
});
