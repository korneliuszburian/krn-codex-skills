import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";

const root = new URL(".", import.meta.url).pathname;
const result = spawn("krn-frontend-browser", ["--config", path.join(root, "browser-evidence.config.json")], { stdio: "inherit", cwd: root });
const [exitCode] = await once(result, "close");
if (exitCode !== 0) process.exitCode = exitCode ?? 1;
