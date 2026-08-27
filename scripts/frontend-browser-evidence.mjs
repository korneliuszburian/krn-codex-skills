#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const configArgument = process.argv.indexOf("--config");
if (configArgument === -1 || process.argv[configArgument + 1] === undefined) throw new Error("usage: frontend-browser-evidence.mjs --config <path>");
const configPath = path.resolve(process.argv[configArgument + 1]);
const configDirectory = path.dirname(configPath);
const config = JSON.parse(await readFile(configPath, "utf8"));
const root = path.resolve(configDirectory, config.workspaceRoot ?? ".");
const outputDirectory = path.resolve(root, config.outputDir ?? ".artifacts");
const session = `${config.sessionPrefix ?? "krn-frontend"}-${process.pid}`;
if (typeof config.url !== "string" || config.url.length === 0) throw new Error("browser evidence config requires a non-empty url");
const actions = config.actions ?? (config.action === undefined ? [] : [config.action]);
if (!Array.isArray(actions) || actions.length === 0 || actions.some((action) => action?.kind !== "click" || typeof action.text !== "string")) throw new Error("browser evidence config requires one or more click actions with text");
if (typeof config.runtimeEval !== "string" || config.runtimeEval.length === 0) throw new Error("browser evidence config requires runtimeEval");
const targetOrigin = new URL(config.url).origin;
if (!Array.isArray(config.allowedOrigins) || !config.allowedOrigins.includes(targetOrigin)) throw new Error(`browser evidence target origin is not allowed: ${targetOrigin}`);
const viewport = config.viewport;
if (!Number.isInteger(viewport?.width) || viewport.width < 1 || !Number.isInteger(viewport?.height) || viewport.height < 1) throw new Error("browser evidence config requires a positive integer viewport");
const requiredEvidence = config.evidence?.required;
if (!Array.isArray(requiredEvidence) || requiredEvidence.length === 0) throw new Error("browser evidence config requires evidence.required");
const build = config.build;
const runtime = config.runtime;
if (build !== undefined && (typeof build.command !== "string" || !Array.isArray(build.args) || typeof build.outputRoot !== "string")) throw new Error("browser evidence build config requires command, args and outputRoot");
if (runtime !== undefined && (typeof runtime.command !== "string" || !Array.isArray(runtime.args) || typeof runtime.readyUrl !== "string")) throw new Error("browser evidence runtime config requires command, args and readyUrl");

const run = async (args) => (await execFileAsync("playwright-cli", ["-s", session, ...args], { cwd: root, env: process.env, maxBuffer: 8 * 1024 * 1024 })).stdout;
const save = async (name, args) => { const stdout = await run(args); await writeFile(path.join(outputDirectory, name), stdout, "utf8"); return stdout; };
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const artifactPath = (name) => path.join(outputDirectory, name);
const commandCwd = (spec) => path.resolve(root, spec.cwd ?? ".");

const buildInventory = async (directory, prefix = "") => {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`build output may not contain symlink: ${relative}`);
    if (entry.isDirectory()) entries.push(...await buildInventory(path.join(directory, entry.name), relative));
    else if (entry.isFile()) {
      const data = await readFile(path.join(directory, entry.name));
      entries.push({ path: relative.split(path.sep).join("/"), bytes: data.byteLength, sha256: sha256(data) });
    }
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
};

const runBuild = async () => {
  if (build === undefined) return undefined;
  const result = await execFileAsync(build.command, build.args, { cwd: commandCwd(build), env: process.env, maxBuffer: 8 * 1024 * 1024 });
  await writeFile(path.join(outputDirectory, "build-output.txt"), `${result.stdout}${result.stderr}`, "utf8");
  const outputRoot = path.resolve(root, build.outputRoot);
  const relativeOutputRoot = path.relative(root, outputRoot);
  if (relativeOutputRoot.startsWith("..") || path.isAbsolute(relativeOutputRoot)) throw new Error("build outputRoot must stay inside workspaceRoot");
  return { command: [build.command, ...build.args], outputRoot: relativeOutputRoot.split(path.sep).join("/"), files: await buildInventory(outputRoot) };
};

const waitForRuntime = async () => {
  if (runtime === undefined) return undefined;
  const child = spawn(runtime.command, runtime.args, { cwd: commandCwd(runtime), env: process.env, stdio: "ignore" });
  const timeoutMs = Number.isInteger(runtime.timeoutMs) && runtime.timeoutMs > 0 ? runtime.timeoutMs : 10000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(runtime.readyUrl)).ok) return child;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill("SIGTERM");
  throw new Error(`runtime did not become ready: ${runtime.readyUrl}`);
};

await mkdir(outputDirectory, { recursive: true });
let opened = false;
let runtimeProcess;
const interactions = [];
let buildManifest;
try {
  buildManifest = await runBuild();
  runtimeProcess = await waitForRuntime();
  await save("open.txt", ["open", config.url]);
  opened = true;
  await save("viewport.txt", ["resize", String(viewport.width), String(viewport.height)]);
  await save("before-output.txt", ["snapshot", `--filename=${artifactPath("before.yml")}`]);
  await save("before-output-screenshot.txt", ["screenshot", `--filename=${artifactPath("before.png")}`]);
  for (const [index, action] of actions.entries()) {
    const actionRole = action.role ?? "button";
    const findOutput = await save(`find-${String(index + 1).padStart(2, "0")}.txt`, ["find", action.text]);
    const actionRef = findOutput.match(new RegExp(`${escaped(actionRole)} "${escaped(action.text)}"[^\\n]*\\[ref=(e\\d+)\\]`))?.[1];
    if (actionRef === undefined) throw new Error(`browser action target not found: ${actionRole} ${action.text}`);
    await save(`interaction-${String(index + 1).padStart(2, "0")}.txt`, ["click", actionRef]);
    interactions.push({ action: action.kind, role: actionRole, text: action.text, ref: actionRef });
  }
  await save("runtime.json", ["--raw", "eval", config.runtimeEval]);
  await save("after-output.txt", ["snapshot", `--filename=${artifactPath("after.yml")}`]);
  await save("after-output-screenshot.txt", ["screenshot", `--filename=${artifactPath("after.png")}`]);
  await save("console.json", ["--json", "console"]);
  await save("requests.json", ["--json", "requests"]);
} finally {
  if (opened) await save("close.txt", ["close"]);
  if (runtimeProcess !== undefined) {
    runtimeProcess.kill("SIGTERM");
    await Promise.race([once(runtimeProcess, "close"), new Promise((resolve) => setTimeout(resolve, 1000))]);
  }
  const cleanup = await execFileAsync("playwright-cli", ["list", "--json"], { cwd: root, env: process.env });
  await writeFile(path.join(outputDirectory, "cleanup.json"), cleanup.stdout, "utf8");
}

const names = ["open.txt", "viewport.txt", "before-output.txt", "before-output-screenshot.txt", "before.yml", "before.png", ...interactions.flatMap((_, index) => [`find-${String(index + 1).padStart(2, "0")}.txt`, `interaction-${String(index + 1).padStart(2, "0")}.txt`]), "after-output.txt", "after-output-screenshot.txt", "after.yml", "after.png", "runtime.json", "console.json", "requests.json", "close.txt", "cleanup.json", ...(buildManifest === undefined ? [] : ["build-output.txt"])]
  .filter((name) => name !== "close.txt" || opened);
const artifacts = [];
for (const name of names) { const data = await readFile(path.join(outputDirectory, name)); artifacts.push({ path: name, bytes: data.byteLength, sha256: sha256(data) }); }
await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({ schema: "krn.frontend.browser-evidence.v1", provider: "playwright-cli", session, target: config.url, targetOrigin, viewport, evidence: { required: requiredEvidence }, ...(buildManifest === undefined ? {} : { build: buildManifest }), ...(runtime === undefined ? {} : { runtime: { command: [runtime.command, ...runtime.args], readyUrl: runtime.readyUrl } }), interactions, artifacts }, null, 2)}\n`, "utf8");
