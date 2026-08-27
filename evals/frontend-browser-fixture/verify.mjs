import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = new URL(".", import.meta.url).pathname;
const dir = path.join(root, ".artifacts");
const config = JSON.parse(await readFile(path.join(root, "browser-evidence.config.json"), "utf8"));
const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
const failures = [];
if (manifest.targetOrigin !== new URL(config.url).origin || !config.allowedOrigins.includes(manifest.targetOrigin)) failures.push("target: origin is not allowed");
if (manifest.viewport?.width !== config.viewport.width || manifest.viewport?.height !== config.viewport.height) failures.push("viewport: manifest does not match config");
if (JSON.stringify(manifest.evidence?.required) !== JSON.stringify(config.evidence.required)) failures.push("evidence: manifest policy does not match config");
if (manifest.build?.outputRoot !== config.build?.outputRoot) failures.push("build: manifest output root does not match config");
if (manifest.runtime?.readyUrl !== config.runtime?.readyUrl) failures.push("runtime: manifest readiness URL does not match config");
for (const artifact of manifest.artifacts) {
  const data = await readFile(path.join(dir, artifact.path));
  const digest = createHash("sha256").update(data).digest("hex");
  if (data.byteLength !== artifact.bytes || digest !== artifact.sha256) {
    failures.push(`${artifact.path}: digest or byte count mismatch`);
  }
}
for (const file of manifest.build?.files ?? []) {
  const data = await readFile(path.join(root, manifest.build.outputRoot, file.path));
  const digest = createHash("sha256").update(data).digest("hex");
  if (data.byteLength !== file.bytes || digest !== file.sha256) failures.push(`build/${file.path}: digest or byte count mismatch`);
}
const runtimeValue = JSON.parse(await readFile(path.join(dir, "runtime.json"), "utf8"));
const runtime = typeof runtimeValue === "string" ? JSON.parse(runtimeValue) : runtimeValue;
if (runtime.status !== "Task complete" || runtime.state !== "complete") failures.push("runtime: interaction did not complete");
const cleanup = JSON.parse(await readFile(path.join(dir, "cleanup.json"), "utf8"));
if (!Array.isArray(cleanup.browsers) || cleanup.browsers.some((browser) => browser.name === manifest.session)) failures.push("cleanup: session is still open");
if (failures.length > 0) {
  console.error(JSON.stringify({ schema: "krn.frontend.browser-gate.v1", status: "fail", failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ schema: "krn.frontend.browser-gate.v1", status: "pass", provider: manifest.provider, artifacts: manifest.artifacts.length }, null, 2));
