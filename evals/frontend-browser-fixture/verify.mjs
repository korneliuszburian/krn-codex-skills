import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = new URL(".", import.meta.url).pathname;
const dir = path.join(root, ".artifacts");
const manifest = JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
const failures = [];
for (const artifact of manifest.artifacts) {
  const data = await readFile(path.join(dir, artifact.path));
  const digest = createHash("sha256").update(data).digest("hex");
  if (data.byteLength !== artifact.bytes || digest !== artifact.sha256) {
    failures.push(`${artifact.path}: digest or byte count mismatch`);
  }
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
