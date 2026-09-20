import { sha256Hex } from "../kernel/digest.mjs";

import { ConfigReconcileError } from "./catalog-errors.mjs";
import { applyOperations, appendPrefix, assertSingleBlock, indexNamedBlocks, parseSkillPath, quoteToml, removeBlock, setEnabled, skillPathContainsQuarantine, MCP_SERVER_KEYS, PLUGIN_KEYS, SKILL_KEYS } from "./catalog-document.mjs";
import { parseDocument } from "./catalog-toml.mjs";
import { normalizeDesired, normalizeFamilies, pluginIdFromCachedSkillPath } from "./catalog-desired.mjs";
import { matchesQuarantined, pluginFamilyFromId } from "./plugin-identity.mjs";


export function digest(source) {
  return sha256Hex(source);
}

export function planCatalogConfig({
  source,
  desired = {},
  pluginSkillAliases,
  quarantineFamilies,
}) {
  if (typeof source !== "string") {
    throw new ConfigReconcileError("source must be a string");
  }

  const families = normalizeFamilies(quarantineFamilies);
  const normalizedDesired = normalizeDesired(
    desired,
    families,
    pluginSkillAliases,
  );
  const document = parseDocument(source);
  const operations = [];
  const actions = [];
  const appendSections = [];
  const pluginBlocks = indexNamedBlocks(document.blocks, "plugin");
  const mcpBlocks = indexNamedBlocks(document.blocks, "mcp");
  const managedPluginStates = new Map();

  for (const [id] of pluginBlocks) {
    const family = pluginFamilyFromId(id);
    if (family !== undefined && normalizedDesired.pluginFamilies.has(family)) {
      managedPluginStates.set(id, false);
    }
    const owner = family
      ? normalizedDesired.pluginOwners.get(family)
      : undefined;
    if (owner !== undefined && id !== owner) {
      managedPluginStates.set(id, false);
    }
  }

  for (const [id, enabled] of normalizedDesired.plugins) {
    managedPluginStates.set(id, enabled);
  }

  // Hard quarantine is an invariant over existing config, even when the
  // active profile omits the family.
  for (const [id] of pluginBlocks) {
    if (matchesQuarantined(id, families)) managedPluginStates.set(id, false);
  }

  for (const [id, enabled] of [...managedPluginStates].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const block = assertSingleBlock(pluginBlocks.get(id) ?? [], `plugin ${id}`);
    if (block) {
      setEnabled({
        document,
        block,
        enabled,
        allowedKeys: PLUGIN_KEYS,
        target: id,
        resource: "plugin",
        reason: matchesQuarantined(id, families)
          ? "hard-quarantine"
          : normalizedDesired.plugins.has(id)
            ? "desired-state"
            : normalizedDesired.pluginOwners.has(pluginFamilyFromId(id))
              ? "plugin-owner"
            : "plugin-family",
        operations,
        actions,
      });
    } else {
      appendSections.push(
        `[plugins.${quoteToml(id)}]${document.eol}enabled = ${String(enabled)}`,
      );
      actions.push({
        operation: "add",
        resource: "plugin",
        target: id,
        enabled,
        reason: "desired-state",
      });
    }
  }

  const managedMcpStates = new Map(normalizedDesired.mcpServers);
  for (const [id] of mcpBlocks) {
    if (matchesQuarantined(id, families)) managedMcpStates.set(id, false);
  }

  for (const [id, enabled] of [...managedMcpStates].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    const block = assertSingleBlock(mcpBlocks.get(id) ?? [], `MCP server ${id}`);
    if (block) {
      setEnabled({
        document,
        block,
        enabled,
        allowedKeys: MCP_SERVER_KEYS,
        target: id,
        resource: "mcp-server",
        reason: matchesQuarantined(id, families) ? "hard-quarantine" : "desired-state",
        operations,
        actions,
      });
    } else if (enabled) {
      throw new ConfigReconcileError(
        `Cannot enable unmanaged MCP server without an existing transport: ${id}`,
        {
          code: "CONFIG_MCP_TRANSPORT_MISSING",
          target: id,
        },
      );
    }
  }

  const skillBlocks = document.blocks.filter((block) => block.kind === "skill");
  const desiredSkillBlocks = new Map();

  for (const block of skillBlocks) {
    const skillPath = parseSkillPath(document, block);
    const lexicalQuarantine = skillPathContainsQuarantine(
      document,
      block,
      skillPath,
      families,
    );
    const desiredState = skillPath
      ? normalizedDesired.skills.get(skillPath)
      : undefined;
    const cachedPluginId = skillPath
      ? pluginIdFromCachedSkillPath(skillPath)
      : undefined;
    const cachedPluginFamily = cachedPluginId
      ? pluginFamilyFromId(cachedPluginId)
      : undefined;
    const parentDisabled =
      (cachedPluginId !== undefined &&
        managedPluginStates.get(cachedPluginId) === false) ||
      (cachedPluginFamily !== undefined &&
        (normalizedDesired.pluginFamilies.get(cachedPluginFamily) === false ||
          (normalizedDesired.pluginOwners.has(cachedPluginFamily) &&
            normalizedDesired.pluginOwners.get(cachedPluginFamily) !==
              cachedPluginId)));

    if (skillPath && normalizedDesired.skills.has(skillPath)) {
      const matches = desiredSkillBlocks.get(skillPath) ?? [];
      matches.push(block);
      desiredSkillBlocks.set(skillPath, matches);
    }

    if (lexicalQuarantine) {
      setEnabled({
        document,
        block,
        enabled: false,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "hard-quarantine",
        operations,
        actions,
      });
      continue;
    }

    if (parentDisabled && desiredState === undefined) {
      setEnabled({
        document,
        block,
        enabled: false,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "disabled-parent-plugin",
        operations,
        actions,
      });
      continue;
    }

    if (desiredState === true) {
      removeBlock({
        document,
        block,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "enabled-by-default",
        operations,
        actions,
      });
      continue;
    }

    if (desiredState === false) {
      setEnabled({
        document,
        block,
        enabled: false,
        allowedKeys: SKILL_KEYS,
        target: skillPath,
        resource: "skill",
        reason: "desired-state",
        operations,
        actions,
      });
    }
  }

  for (const [skillPath, blocks] of desiredSkillBlocks) {
    assertSingleBlock(blocks, `skill ${skillPath}`);
  }

  for (const [skillPath, enabled] of [...normalizedDesired.skills].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    if (desiredSkillBlocks.has(skillPath) || enabled) continue;

    appendSections.push(
      `[[skills.config]]${document.eol}path = ${quoteToml(skillPath)}${document.eol}enabled = false`,
    );
    actions.push({
      operation: "add",
      resource: "skill",
      target: skillPath,
      enabled: false,
      reason: "desired-state",
    });
  }

  let nextSource = applyOperations(source, operations);
  if (appendSections.length > 0) {
    nextSource += `${appendPrefix(nextSource, document.eol)}${appendSections.join(
      `${document.eol}${document.eol}`,
    )}${document.eol}`;
  }
  return Object.freeze({
    changed: nextSource !== source,
    originalHash: digest(source),
    nextHash: digest(nextSource),
    nextSource,
    actions: Object.freeze(actions.map((action) => Object.freeze(action))),
  });
}
