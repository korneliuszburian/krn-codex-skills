#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = new URL("./krn-codex.mjs", import.meta.url);
const result = spawnSync(process.execPath, [fileURLToPath(cli), "capability", ...process.argv.slice(2)], { stdio: "inherit" });
process.exitCode = result.status ?? 1;
