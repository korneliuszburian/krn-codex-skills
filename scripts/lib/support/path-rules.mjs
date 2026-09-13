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
