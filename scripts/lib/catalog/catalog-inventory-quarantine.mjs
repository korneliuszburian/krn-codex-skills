import { HARD_QUARANTINE_FAMILIES, isHardQuarantined } from "./catalog-profiles.mjs";
import { quarantinedFamily } from "./plugin-identity.mjs";

function sanitizeLabel(value) {
  return String(value ?? "unknown")
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

export function compareInventoryRecords(left, right) {
  const leftKey = `${left.kind ?? ""}:${left.id ?? ""}:${left.sourceId ?? ""}`;
  const rightKey = `${right.kind ?? ""}:${right.id ?? ""}:${right.sourceId ?? ""}`;
  return leftKey.localeCompare(rightKey);
}

export function createQuarantineCollector(evidence, additionalFamilies) {
  if (
    !Array.isArray(additionalFamilies) ||
    additionalFamilies.some(
      (family) => typeof family !== "string" || family.trim() === "",
    )
  ) {
    throw new TypeError("quarantineFamilies must contain non-empty strings");
  }
  const families = [
    ...new Set([
      ...HARD_QUARANTINE_FAMILIES,
      ...additionalFamilies.map((family) => family.toLowerCase()),
    ]),
  ];
  const matches = (value) => isHardQuarantined(value, families);
  const familyFor = (value) => quarantinedFamily(value, families);
  const records = new Map();
  const add = (kind, id, evidenceType, sourceId, lexicalPath, configId) => {
    if (!matches(id) && !matches(lexicalPath)) return;
    const record = {
      kind: sanitizeLabel(kind),
      id: sanitizeLabel(id),
      evidence: sanitizeLabel(evidenceType),
      sourceId: sanitizeLabel(sourceId),
      ...(typeof lexicalPath === "string" ? { path: lexicalPath } : {}),
      ...(typeof configId === "string" && configId ? { configId } : {}),
    };
    records.set(JSON.stringify(record), record);
  };

  for (const item of evidence) {
    if (!item || typeof item.id !== "string") continue;
    add(
      item.kind ?? "unknown",
      item.id,
      item.evidence ?? "supplied-name",
      item.sourceId ?? "supplied",
      item.path,
      item.configId,
    );
  }

  return {
    add,
    familyFor,
    matches,
    values: () => [...records.values()].sort(compareInventoryRecords),
  };
}
