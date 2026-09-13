import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { maskTemplates, stripComments } from "./source-mask.mjs";

function relativePath(root, from, specifier) {
  return relative(root, resolve(dirname(join(root, from)), specifier)).split(sep).join("/");
}

function runtimeClosure({ root, manifest }) {
  const queue = (manifest.bins ?? []).map((bin) => bin.path).filter((path) => path.endsWith(".mjs"));
  const reachable = new Set();
  while (queue.length > 0) {
    const file = queue.pop();
    if (reachable.has(file)) continue;
    let source;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    reachable.add(file);
    const code = maskTemplates(stripComments(source));
    for (const match of code.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
      queue.push(relativePath(root, file, match[1]));
    }
    for (const match of code.matchAll(/delegate\(\s*["']([^"']+\.mjs)["']/g)) {
      queue.push(match[1]);
    }
    for (const match of code.matchAll(/spawnSync\([^,]+,\s*\[[^\]]*["']([^"']+\.mjs)["']/g)) {
      queue.push(match[1]);
    }
  }
  return [...reachable].sort();
}

export function runtimeClosureErrors({ root, manifest }) {
  const declared = [
    ...(manifest.runtime_paths ?? []),
    manifest.global_agents,
    manifest.global_hooks,
    ...(manifest.global_hook_files ?? []).map((hook) => hook.path),
    ...(manifest.bins ?? []).map((bin) => bin.path),
  ].filter(Boolean);
  const declaredSet = new Set(declared);
  const skillDirectories = (manifest.skills ?? []).map((skill) => skill.path);
  const covered = (file) =>
    declaredSet.has(file) || skillDirectories.some((directory) => file === directory || file.startsWith(`${directory}/`));

  const errors = [];
  const reachable = new Set(runtimeClosure({ root, manifest }));
  for (const file of reachable) {
    if (!covered(file)) {
      errors.push(`runtime closure gap: ${file} is reachable from installed entrypoints but not declared`);
    }
  }
  for (const file of declared) {
    if (file.endsWith(".mjs") && !reachable.has(file)) {
      errors.push(`declared runtime path is unreachable from installed entrypoints: ${file}`);
    }
  }
  return [...new Set(errors)];
}
