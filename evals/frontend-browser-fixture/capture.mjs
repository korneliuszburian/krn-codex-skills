import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const root = new URL(".", import.meta.url).pathname;
const server = spawn(process.execPath, [path.join(root, "serve.mjs")], { stdio: "ignore" });
try {
  let serverReady = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      if ((await fetch("http://127.0.0.1:4173/")).ok) {
        serverReady = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (!serverReady) throw new Error("fixture server did not start");
  const result = spawn(process.execPath, [
    path.resolve(root, "../../scripts/frontend-browser-evidence.mjs"),
    "--config",
    path.join(root, "browser-evidence.config.json")
  ], { stdio: "inherit", cwd: root });
  const [exitCode] = await once(result, "close");
  if (exitCode !== 0) process.exitCode = exitCode ?? 1;
} finally {
  server.kill("SIGTERM");
}
