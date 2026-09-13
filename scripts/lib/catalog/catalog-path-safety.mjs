import { lstat } from "node:fs/promises";
import path from "node:path";

function pathSafetyError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function requirePathWithoutSymlinks(
  candidate,
  {
    label,
    kind,
    allowMissing = false,
    beforeAccess = () => {},
  },
) {
  const absolute = path.resolve(candidate);
  beforeAccess(absolute);

  // `path.resolve` cancels `..` lexically before the kernel follows a symlinked
  // component, so reject dot segments in the caller-supplied path (matching the
  // stated lexical trust model) instead of validating a path the traversal will
  // not actually walk.
  if (
    String(candidate)
      .split(path.sep)
      .some((segment) => segment === "..")
  ) {
    throw pathSafetyError(
      `${label} must not contain '..' path segments`,
      "CATALOG_PATH_TRAVERSAL",
    );
  }

  const { root } = path.parse(absolute);
  const segments = absolute.slice(root.length).split(path.sep).filter(Boolean);
  const components = [];
  let current = root;
  for (const segment of segments) {
    current = path.join(current, segment);
    components.push(current);
  }
  if (components.length === 0) components.push(root);

  for (let index = 0; index < components.length; index += 1) {
    const component = components[index];
    const final = index === components.length - 1;
    beforeAccess(component);
    let entry;
    try {
      entry = await lstat(component);
    } catch (error) {
      if (error?.code === "ENOENT" && allowMissing) return false;
      if (error?.code === "ENOENT") {
        throw pathSafetyError(`${label} does not exist`, "CATALOG_PATH_MISSING");
      }
      throw error;
    }
    if (entry.isSymbolicLink()) {
      throw pathSafetyError(
        `${label} must not be a symlink or contain symlinked parents`,
        "CATALOG_PATH_SYMLINK",
      );
    }
    const validType = final
      ? kind === "directory"
        ? entry.isDirectory()
        : entry.isFile()
      : entry.isDirectory();
    if (!validType) {
      const expected = final && kind === "file" ? "a regular file" : "a directory";
      throw pathSafetyError(
        `${label} must be ${expected}`,
        "CATALOG_PATH_WRONG_TYPE",
      );
    }
  }
  return true;
}

export async function requireDirectoryWithoutSymlinks(
  candidate,
  options = {},
) {
  return requirePathWithoutSymlinks(candidate, {
    ...options,
    label: options.label ?? "directory",
    kind: "directory",
  });
}

export async function requireRegularFileWithoutSymlinks(
  candidate,
  options = {},
) {
  return requirePathWithoutSymlinks(candidate, {
    ...options,
    label: options.label ?? "file",
    kind: "file",
  });
}
