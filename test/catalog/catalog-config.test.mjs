import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { applyCatalogConfigPlan, loadCatalogConfigPlan } from "../../scripts/lib/catalog/catalog-config.mjs";

const SOURCE = '[plugins."figma@openai-curated"]\nenabled = false\n';

const withConfig = async (source, body) => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "krn-config-")));
  try {
    const configPath = join(root, "config.toml");
    writeFileSync(configPath, source);
    await body(configPath, root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test("loadCatalogConfigPlan reads a regular config and plans a change", async () => {
  await withConfig(SOURCE, async (configPath) => {
    const plan = await loadCatalogConfigPlan({
      configPath,
      desired: { plugins: { "figma@openai-curated": true } },
    });
    assert.equal(plan.changed, true);
    assert.match(plan.nextSource, /enabled = true/);
  });
  await assert.rejects(
    loadCatalogConfigPlan({ configPath: "" }),
    /configPath must be a non-empty string/,
  );
});

test("loadCatalogConfigPlan rejects symlinks, directories, and quarantined paths", async () => {
  await withConfig(SOURCE, async (configPath, root) => {
    const link = join(root, "link.toml");
    symlinkSync(configPath, link);
    await assert.rejects(
      loadCatalogConfigPlan({ configPath: link }),
      (error) => error.code === "CONFIG_PATH_SYMLINK",
    );
    await assert.rejects(
      loadCatalogConfigPlan({ configPath: root }),
      (error) => error.code === "CONFIG_PATH_NOT_REGULAR",
    );
    const quarantined = join(root, "superpowers.toml");
    writeFileSync(quarantined, SOURCE);
    await assert.rejects(
      loadCatalogConfigPlan({ configPath: quarantined }),
      (error) => error.code === "CONFIG_PATH_QUARANTINED",
    );
  });
});

test("applyCatalogConfigPlan applies a changed plan with a backup", async () => {
  await withConfig(SOURCE, async (configPath) => {
    const plan = await loadCatalogConfigPlan({
      configPath,
      desired: { plugins: { "figma@openai-curated": true } },
    });
    const result = await applyCatalogConfigPlan({ configPath, plan });
    assert.equal(result.changed, true);
    assert.equal(readFileSync(configPath, "utf8"), plan.nextSource);
    assert.ok(result.backupPath && existsSync(result.backupPath));
    assert.equal(readFileSync(result.backupPath, "utf8"), SOURCE);
  });
});

test("applyCatalogConfigPlan short-circuits an unchanged plan", async () => {
  await withConfig(SOURCE, async (configPath) => {
    const plan = await loadCatalogConfigPlan({
      configPath,
      desired: { plugins: { "figma@openai-curated": false } },
    });
    assert.deepEqual(await applyCatalogConfigPlan({ configPath, plan }), {
      changed: false,
      originalHash: plan.originalHash,
      nextHash: plan.nextHash,
      backupPath: undefined,
    });
  });
});

test("applyCatalogConfigPlan rejects tampered, invalid, and stale plans", async () => {
  await withConfig(SOURCE, async (configPath) => {
    const plan = await loadCatalogConfigPlan({
      configPath,
      desired: { plugins: { "figma@openai-curated": true } },
    });
    await assert.rejects(
      applyCatalogConfigPlan({ configPath, plan: { ...plan, nextSource: `${plan.nextSource}# tampered` } }),
      (error) => error.code === "CONFIG_PLAN_TAMPERED",
    );
    await assert.rejects(
      applyCatalogConfigPlan({ configPath, plan: null }),
      /plan is not a catalog config plan/,
    );
    writeFileSync(configPath, SOURCE.replace("false", "true"));
    await assert.rejects(
      applyCatalogConfigPlan({ configPath, plan }),
      (error) => error.name === "ConcurrentConfigChangeError" && error.code === "CONFIG_CONCURRENT_CHANGE",
    );
  });
});
