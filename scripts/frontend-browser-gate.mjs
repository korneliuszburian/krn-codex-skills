#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const configArgument = process.argv.indexOf("--config");
if (configArgument === -1 || process.argv[configArgument + 1] === undefined) throw new Error("usage: frontend-browser-gate --config <path>");
const configPath = path.resolve(process.argv[configArgument + 1]);
const configDirectory = path.dirname(configPath);
const config = JSON.parse(await readFile(configPath, "utf8"));
const root = path.resolve(configDirectory, config.workspaceRoot ?? ".");
const outputDirectory = path.resolve(root, config.outputDir ?? ".artifacts");
const manifest = JSON.parse(await readFile(path.join(outputDirectory, "manifest.json"), "utf8"));
const actions = config.actions ?? (config.action === undefined ? [] : [config.action]);
const failures = [];
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

if (manifest.targetOrigin !== new URL(config.url).origin || !config.allowedOrigins?.includes(manifest.targetOrigin)) failures.push("target: origin is not allowed");
if (manifest.viewport?.width !== config.viewport?.width || manifest.viewport?.height !== config.viewport?.height) failures.push("viewport: manifest does not match config");
if (JSON.stringify(manifest.evidence?.required) !== JSON.stringify(config.evidence?.required)) failures.push("evidence: manifest policy does not match config");
if (JSON.stringify(manifest.interactions?.map(({ action, role, text }) => ({ action, role, text })) ?? []) !== JSON.stringify(actions.map(({ kind, role = "button", text }) => ({ action: kind, role, text })))) failures.push("interaction: manifest does not match config");

for (const artifact of manifest.artifacts ?? []) {
  const data = await readFile(path.join(outputDirectory, artifact.path));
  if (data.byteLength !== artifact.bytes || sha256(data) !== artifact.sha256) failures.push(`${artifact.path}: digest or byte count mismatch`);
}
for (const file of manifest.build?.files ?? []) {
  const data = await readFile(path.join(root, manifest.build.outputRoot, file.path));
  if (data.byteLength !== file.bytes || sha256(data) !== file.sha256) failures.push(`build/${file.path}: digest or byte count mismatch`);
}

if (config.assertions?.runtime !== undefined) {
  const runtimeValue = JSON.parse(await readFile(path.join(outputDirectory, "runtime.json"), "utf8"));
  const runtime = typeof runtimeValue === "string" ? JSON.parse(runtimeValue) : runtimeValue;
  for (const [key, expected] of Object.entries(config.assertions.runtime)) if (runtime[key] !== expected) failures.push(`runtime: ${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(runtime[key])}`);
}

const cleanup = JSON.parse(await readFile(path.join(outputDirectory, "cleanup.json"), "utf8"));
if (!Array.isArray(cleanup.browsers) || cleanup.browsers.some((browser) => browser.name === manifest.session)) failures.push("cleanup: session is still open");
if (failures.length > 0) {
  console.error(JSON.stringify({ schema: "krn.frontend.browser-gate.v1", status: "fail", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ schema: "krn.frontend.browser-gate.v1", status: "pass", provider: manifest.provider, scenario: manifest.interactions?.length ?? 0, artifacts: manifest.artifacts?.length ?? 0 }, null, 2));
