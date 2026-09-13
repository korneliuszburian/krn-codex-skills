const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function pluginFamilyFromId(id) {
  if (typeof id !== "string") return undefined;
  const separator = id.lastIndexOf("@");
  if (separator <= 0 || separator === id.length - 1) return undefined;
  const family = id.slice(0, separator);
  const marketplace = id.slice(separator + 1);
  return TOKEN.test(family) && TOKEN.test(marketplace) ? family : undefined;
}

export function quarantinedFamily(value, families = []) {
  const candidate = String(value ?? "").toLowerCase();
  return families.find((family) => candidate.includes(String(family).toLowerCase()));
}

export function matchesQuarantined(value, families = []) {
  return quarantinedFamily(value, families) !== undefined;
}
