import path from "node:path";

export function isSafeRelativePath(value) {
  return (
    typeof value === "string" &&
    Boolean(value.trim()) &&
    !path.isAbsolute(value) &&
    !value.includes("\\") &&
    !value.split("/").includes("..")
  );
}

export function isInside(parent, candidate) {
  const root = path.resolve(parent);
  const rel = path.relative(root, path.resolve(root, candidate));
  return rel === "" || (!rel.startsWith(`..${path.sep}`) && rel !== "..");
}
