#!/usr/bin/env node

import { fileURLToPath } from "node:url";

import { spawnInherit } from "./lib/kernel/proc.mjs";

const cli = new URL("./krn-codex.mjs", import.meta.url);
const result = spawnInherit(process.execPath, [fileURLToPath(cli), "capability", ...process.argv.slice(2)]);
process.exitCode = result.status ?? 1;
