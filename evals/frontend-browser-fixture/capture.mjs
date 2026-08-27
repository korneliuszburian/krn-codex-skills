import { createHash } from "node:crypto";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = new URL(".", import.meta.url).pathname;
const artifactDir = path.join(root, ".artifacts");
const session = `krn-frontend-fixture-${process.pid}`;

const writeCommandOutput = async (name, args) => {
  const result = await execFileAsync("playwright-cli", ["-s", session, ...args], {
    cwd: root,
    maxBuffer: 8 * 1024 * 1024,
    env: process.env
  });
  await writeFile(path.join(artifactDir, name), result.stdout, "utf8");
  return result.stdout;
};

const waitForServer = async () => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:4173/");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("fixture server did not start");
};

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const server = spawn(process.execPath, [path.join(root, "serve.mjs")], { stdio: "ignore" });
try {
  await mkdir(artifactDir, { recursive: true });
  await waitForServer();
  await writeCommandOutput("open.txt", ["open", "http://127.0.0.1:4173/"]);
  await writeCommandOutput("before-output.txt", ["snapshot", "--filename=./.artifacts/before.yml"]);
  await writeCommandOutput("before-output-screenshot.txt", ["screenshot", "--filename=./.artifacts/before.png"]);
  const findOutput = await writeCommandOutput("find.txt", ["find", "Complete task"]);
  const ref = findOutput.match(/button "Complete task" \[ref=(e\d+)\]/)?.[1];
  if (ref === undefined) throw new Error("fixture button ref was not found in snapshot output");
  await writeCommandOutput("interaction.txt", ["click", ref]);
  await writeCommandOutput("after-output.txt", ["snapshot", "--filename=./.artifacts/after.yml"]);
  await writeCommandOutput("after-output-screenshot.txt", ["screenshot", "--filename=./.artifacts/after.png"]);
  await writeCommandOutput("runtime.json", ["--raw", "eval", "JSON.stringify({url: location.href, status: document.querySelector('[data-testid=task-status]').textContent, state: document.querySelector('[data-testid=task-status]').dataset.state, rect: document.querySelector('[data-testid=task-card]').getBoundingClientRect().toJSON()})"]);
  await writeCommandOutput("console.json", ["--json", "console"]);
  await writeCommandOutput("requests.json", ["--json", "requests"]);
  await writeCommandOutput("close.txt", ["close"]);
  const cleanup = await execFileAsync("playwright-cli", ["list", "--json"], { cwd: root });
  await writeFile(path.join(artifactDir, "cleanup.json"), cleanup.stdout, "utf8");

  const names = ["open.txt", "before-output.txt", "before-output-screenshot.txt", "before.yml", "before.png", "find.txt", "interaction.txt", "after-output.txt", "after-output-screenshot.txt", "after.yml", "after.png", "runtime.json", "console.json", "requests.json", "close.txt", "cleanup.json"];
  const artifacts = [];
  for (const name of names) {
    const data = await readFile(path.join(artifactDir, name));
    artifacts.push({ path: name, bytes: data.byteLength, sha256: sha256(data) });
  }
  await writeFile(path.join(artifactDir, "manifest.json"), `${JSON.stringify({ schema: "krn.frontend.browser-evidence.v1", provider: "playwright-cli", session, target: "http://127.0.0.1:4173/", interaction: { action: "click", ref }, artifacts }, null, 2)}\n`, "utf8");
} finally {
  server.kill("SIGTERM");
}
