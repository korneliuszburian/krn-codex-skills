import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, rename, unlink } from "node:fs/promises";
import { basename, dirname } from "node:path";

import { requireRegularFileWithoutSymlinks } from "./catalog-path-safety.mjs";
import { matchesQuarantined } from "./plugin-identity.mjs";
import { ConcurrentConfigChangeError, ConfigReconcileError, HARD_QUARANTINE_FAMILIES } from "./catalog-errors.mjs";
import { digest, planCatalogConfig } from "./catalog-plan.mjs";

export async function loadCatalogConfigPlan({
  configPath,
  desired = {},
  pluginSkillAliases,
  quarantineFamilies,
}) {
  if (typeof configPath !== "string" || configPath === "") {
    throw new ConfigReconcileError("configPath must be a non-empty string");
  }
  const { source } = await readRegularConfig(configPath);
  return planCatalogConfig({
    source,
    desired,
    pluginSkillAliases,
    quarantineFamilies,
  });
}

function configPathError(message, code) {
  return new ConfigReconcileError(message, { code });
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

async function inspectRegularConfig(configPath, expectedIdentity) {
  if (matchesQuarantined(configPath, HARD_QUARANTINE_FAMILIES)) {
    throw configPathError(
      "Refusing filesystem access to a hard-quarantined config path",
      "CONFIG_PATH_QUARANTINED",
    );
  }
  try {
    await requireRegularFileWithoutSymlinks(configPath, {
      label: "Codex config path",
    });
  } catch (error) {
    if (error?.code === "CATALOG_PATH_SYMLINK") {
      throw configPathError(
        `Codex config path must not be a symbolic link: ${configPath}`,
        "CONFIG_PATH_SYMLINK",
      );
    }
    if (error?.code === "CATALOG_PATH_WRONG_TYPE") {
      throw configPathError(
        `Codex config path must be a regular file: ${configPath}`,
        "CONFIG_PATH_NOT_REGULAR",
      );
    }
    throw error;
  }
  const metadata = await lstat(configPath);
  if (metadata.isSymbolicLink()) {
    throw configPathError(
      `Codex config path must not be a symbolic link: ${configPath}`,
      "CONFIG_PATH_SYMLINK",
    );
  }
  if (!metadata.isFile()) {
    throw configPathError(
      `Codex config path must be a regular file: ${configPath}`,
      "CONFIG_PATH_NOT_REGULAR",
    );
  }
  if (expectedIdentity && !sameFileIdentity(metadata, expectedIdentity)) {
    throw new ConcurrentConfigChangeError(
      "Codex config file identity changed after the plan was created",
    );
  }
  return metadata;
}

async function openConfigWithoutFollowing(configPath) {
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw configPathError(
      "This platform cannot safely open Codex config without following links",
      "CONFIG_NOFOLLOW_UNSUPPORTED",
    );
  }

  try {
    return await open(configPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if (error?.code === "ELOOP") {
      throw configPathError(
        `Codex config path must not be a symbolic link: ${configPath}`,
        "CONFIG_PATH_SYMLINK",
      );
    }
    throw error;
  }
}

async function readRegularConfig(configPath, expectedIdentity) {
  const before = await inspectRegularConfig(configPath, expectedIdentity);
  const handle = await openConfigWithoutFollowing(configPath);

  try {
    const opened = await handle.stat();
    if (!opened.isFile()) {
      throw configPathError(
        `Codex config path must be a regular file: ${configPath}`,
        "CONFIG_PATH_NOT_REGULAR",
      );
    }
    if (!sameFileIdentity(opened, before)) {
      throw new ConcurrentConfigChangeError(
        "Codex config file identity changed while it was opened",
      );
    }

    const source = await handle.readFile({ encoding: "utf8" });
    await inspectRegularConfig(configPath, opened);
    return { source, identity: opened };
  } finally {
    await handle.close();
  }
}

async function writeExclusiveSynced(filePath, source) {
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(source, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function removeIfPresent(filePath) {
  if (!filePath) return;
  try {
    await unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function uniqueSiblingPath(configPath, suffix) {
  const token = randomBytes(6).toString("hex");
  return `${dirname(configPath)}/.${basename(configPath)}.krn-${suffix}-${process.pid}-${token}`;
}

function assertApplicablePlan(plan) {
  if (
    plan === null ||
    typeof plan !== "object" ||
    typeof plan.changed !== "boolean" ||
    typeof plan.originalHash !== "string" ||
    typeof plan.nextHash !== "string" ||
    typeof plan.nextSource !== "string"
  ) {
    throw new ConfigReconcileError("plan is not a catalog config plan");
  }
  if (digest(plan.nextSource) !== plan.nextHash) {
    throw new ConfigReconcileError("plan nextSource does not match nextHash", {
      code: "CONFIG_PLAN_TAMPERED",
    });
  }
}

/** Apply a previously reviewed plan with an optimistic hash guard. */
export async function applyCatalogConfigPlan({ configPath, plan }) {
  if (typeof configPath !== "string" || configPath === "") {
    throw new ConfigReconcileError("configPath must be a non-empty string");
  }
  assertApplicablePlan(plan);

  const initial = await readRegularConfig(configPath);
  const originalSource = initial.source;
  if (digest(originalSource) !== plan.originalHash) {
    throw new ConcurrentConfigChangeError();
  }
  if (!plan.changed) {
    return {
      changed: false,
      originalHash: plan.originalHash,
      nextHash: plan.nextHash,
      backupPath: undefined,
    };
  }

  const tempPath = uniqueSiblingPath(configPath, "tmp");
  const backupPath = uniqueSiblingPath(configPath, "backup");
  let backupWritten = false;
  let renamed = false;

  try {
    await writeExclusiveSynced(tempPath, plan.nextSource);

    const { source: beforeBackupSource } = await readRegularConfig(
      configPath,
      initial.identity,
    );
    if (digest(beforeBackupSource) !== plan.originalHash) {
      throw new ConcurrentConfigChangeError();
    }

    await writeExclusiveSynced(backupPath, originalSource);
    backupWritten = true;

    const { source: beforeRenameSource } = await readRegularConfig(
      configPath,
      initial.identity,
    );
    if (digest(beforeRenameSource) !== plan.originalHash) {
      throw new ConcurrentConfigChangeError();
    }

    await rename(tempPath, configPath);
    renamed = true;
    return {
      changed: true,
      originalHash: plan.originalHash,
      nextHash: plan.nextHash,
      backupPath,
    };
  } catch (error) {
    if (!renamed) await removeIfPresent(tempPath);
    if (backupWritten && !renamed) await removeIfPresent(backupPath);
    throw error;
  }
}
