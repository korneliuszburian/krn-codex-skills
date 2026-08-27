import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
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
if (config.action?.kind !== "click" || typeof config.action.text !== "string") throw new Error("browser evidence config currently supports click actions with text");
if (typeof config.runtimeEval !== "string" || config.runtimeEval.length === 0) throw new Error("browser evidence config requires runtimeEval");

const run = async (args) => (await execFileAsync("playwright-cli", ["-s", session, ...args], { cwd: root, env: process.env, maxBuffer: 8 * 1024 * 1024 })).stdout;
const save = async (name, args) => { const stdout = await run(args); await writeFile(path.join(outputDirectory, name), stdout, "utf8"); return stdout; };
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const artifactPath = (name) => path.join(outputDirectory, name);

await mkdir(outputDirectory, { recursive: true });
let opened = false;
let actionRole = "button";
let actionRef;
try {
  await save("open.txt", ["open", config.url]);
  opened = true;
  await save("before-output.txt", ["snapshot", `--filename=${artifactPath("before.yml")}`]);
  await save("before-output-screenshot.txt", ["screenshot", `--filename=${artifactPath("before.png")}`]);
  const findOutput = await save("find.txt", ["find", config.action.text]);
  actionRole = config.action.role ?? "button";
  actionRef = findOutput.match(new RegExp(`${actionRole} "${escaped(config.action.text)}" \\[ref=(e\\d+)\\]`))?.[1];
  if (actionRef === undefined) throw new Error(`browser action target not found: ${actionRole} ${config.action.text}`);
  await save("interaction.txt", ["click", actionRef]);
  await save("after-output.txt", ["snapshot", `--filename=${artifactPath("after.yml")}`]);
  await save("after-output-screenshot.txt", ["screenshot", `--filename=${artifactPath("after.png")}`]);
  await save("runtime.json", ["--raw", "eval", config.runtimeEval]);
  await save("console.json", ["--json", "console"]);
  await save("requests.json", ["--json", "requests"]);
} finally {
  if (opened) await save("close.txt", ["close"]);
  const cleanup = await execFileAsync("playwright-cli", ["list", "--json"], { cwd: root, env: process.env });
  await writeFile(path.join(outputDirectory, "cleanup.json"), cleanup.stdout, "utf8");
}

const names = ["open.txt", "before-output.txt", "before-output-screenshot.txt", "before.yml", "before.png", "find.txt", "interaction.txt", "after-output.txt", "after-output-screenshot.txt", "after.yml", "after.png", "runtime.json", "console.json", "requests.json", "close.txt", "cleanup.json"];
const artifacts = [];
for (const name of names) { const data = await readFile(path.join(outputDirectory, name)); artifacts.push({ path: name, bytes: data.byteLength, sha256: sha256(data) }); }
await writeFile(path.join(outputDirectory, "manifest.json"), `${JSON.stringify({ schema: "krn.frontend.browser-evidence.v1", provider: "playwright-cli", session, target: config.url, interaction: { action: config.action.kind, role: actionRole, text: config.action.text, ref: actionRef }, artifacts }, null, 2)}\n`, "utf8");
