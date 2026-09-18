import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { posixRelative } from "../support/path-rules.mjs";

import { maskLiterals, stripComments } from "../support/source-mask.mjs";

function relativePath(root, from, specifier) {
  return posixRelative(root, resolve(dirname(join(root, from)), specifier));
}

function runtimeClosure({ root, manifest }) {
  const queue = [
    ...(manifest.bins ?? []).map((bin) => bin.path),
    manifest.global_agents,
    manifest.global_hooks,
    ...(manifest.global_hook_files ?? []).map((hook) => hook.path),
  ]
    .filter((file) => typeof file === "string" && file.endsWith(".mjs"))
    .map((file) => [null, file]);
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
    const code = stripComments(source);
    const masked = maskLiterals(code);
    const survives = (match, keyword) => new RegExp(keyword).test(masked.slice(match.index, match.index + match[0].length));
    for (const match of code.matchAll(/(?<![\w$.])(?:from|import)\s*\(?\s*["'](\.[^"']+)["']/g)) {
      if (!survives(match, "from|import")) continue;
      queue.push([file, relativePath(root, file, match[1])]);
    }
    for (const match of code.matchAll(/delegate\(\s*["']([^"']+\.mjs)["']/g)) {
      if (!survives(match, "delegate")) continue;
      queue.push([file, match[1]]);
    }
    for (const match of code.matchAll(/spawnSync\([^,]+,\s*\[[^\]]*["']([^"']+\.mjs)["']/g)) {
      if (!survives(match, "spawnSync")) continue;
      queue.push([file, match[1]]);
    }
  }
  return { reachable: [...reachable].sort(), missing: [...missing].map(([file, from]) => ({ file, from: [...from].sort() })).sort((a, b) => a.file.localeCompare(b.file)) };
}

function consumedNonModulePaths({ root, manifest, reachable }) {
  const consumed = new Set(
    (Array.isArray(manifest.opencode_plugins) ? manifest.opencode_plugins : [])
      .map((plugin) => plugin?.path)
      .filter((value) => typeof value === "string"),
  );
  const declared = Array.isArray(manifest.runtime_paths) ? manifest.runtime_paths : [];
  for (const module of reachable) {
    if (!module.endsWith(".mjs")) continue;
    let source;
    try {
      source = stripComments(readFileSync(join(root, module), "utf8"));
    } catch {
      continue;
    }
    for (const file of declared) {
      if (source.includes(file)) consumed.add(file);
    }
  }
  return consumed;
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
  const consumed = consumedNonModulePaths({ root, manifest, reachable: closure.reachable });
  for (const file of Array.isArray(manifest.runtime_paths) ? manifest.runtime_paths : []) {
    if (typeof file !== "string" || file.endsWith(".mjs")) continue;
    let stats;
    try {
      stats = statSync(join(root, file));
    } catch {
      continue;
    }
    if (!stats.isFile() || consumed.has(file)) continue;
    errors.push(`declared runtime path is unreachable-non-module: ${file}`);
  }
  return [...new Set(errors)];
}
