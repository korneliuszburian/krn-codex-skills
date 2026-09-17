import { readFileSync } from "node:fs";
import { join } from "node:path";

const REGISTRY_PATH = "config/runtime-risks.json";

const RISK_CLASSES = new Set(["read-only", "additive", "destructive", "external"]);
const AUTHORITY_REQUIRED = new Set(["destructive", "external"]);

export function loadRuntimeRisks(root) {
  try {
    return JSON.parse(readFileSync(join(root, REGISTRY_PATH), "utf8"));
  } catch {
    return null;
  }
}

export function riskClassErrors({ manifest, registry }) {
  const entries = Array.isArray(registry?.entries) ? registry.entries : null;
  if (!entries) {
    return [`undeclared-risk: ${REGISTRY_PATH} is missing or declares no entries`];
  }
  const rows = new Map();
  for (const entry of entries) {
    if (entry && typeof entry.path === "string") rows.set(entry.path, entry);
  }
  const errors = [];
  for (const path of manifest?.runtime_paths ?? []) {
    const entry = rows.get(path);
    if (!entry) {
      errors.push(`undeclared-risk: ${path} has no declared risk class`);
      continue;
    }
    if (!RISK_CLASSES.has(entry.class)) {
      errors.push(
        `undeclared-risk: ${path} declares unknown risk class ${JSON.stringify(entry.class)}`,
      );
      continue;
    }
    if (
      AUTHORITY_REQUIRED.has(entry.class) &&
      !(typeof entry.authority === "string" && entry.authority.trim())
    ) {
      errors.push(`undeclared-risk: ${path} is ${entry.class} and needs an authority note`);
    }
  }
  return errors;
}
