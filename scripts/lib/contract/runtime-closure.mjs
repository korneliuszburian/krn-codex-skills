import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { maskTemplates, stripComments } from "../support/source-mask.mjs";

function relativePath(root, from, specifier) {
  return relative(root, resolve(dirname(join(root, from)), specifier)).split(sep).join("/");
}

function runtimeClosure({ root, manifest }) {
  const queue = (manifest.bins ?? []).map((bin) => [null, bin.path]).filter(([, file]) => file.endsWith(".mjs"));
  const reachable = new Set();
  const missing = new Map();
  while (queue.length > 0) {
    const [from, file] = queue.pop();
    if (reachable.has(file)) continue;
    let source;
    try {
      source = readFileSync(join(root, file), "utf8");
    } catch {
      if (file.endsWith(".mjs")) {
        if (!missing.has(file)) missing.set(file, new Set());
        if (from) missing.get(file).add(from);
      }
      continue;
    }
    reachable.add(file);
    const code = maskTemplates(stripComments(source));
    for (const match of code.matchAll(/(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
      queue.push([file, relativePath(root, file, match[1])]);
    }
    for (const match of code.matchAll(/delegate\(\s*["']([^"']+\.mjs)["']/g)) {
      queue.push([file, match[1]]);
    }
    for (const match of code.matchAll(/spawnSync\([^,]+,\s*\[[^\]]*["']([^"']+\.mjs)["']/g)) {
      queue.push([file, match[1]]);
    }
  }
  return { reachable: [...reachable].sort(), missing: [...missing].map(([file, from]) => ({ file, from: [...from].sort() })).sort((a, b) => a.file.localeCompare(b.file)) };
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
  const closure = runtimeClosure({ root, manifest });
  const reachable = new Set(closure.reachable);
  for (const gap of closure.missing) {
    errors.push(`runtime closure gap: ${gap.file} is imported but not present (from ${gap.from.join(", ") || "entrypoint"})`);
  }
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
