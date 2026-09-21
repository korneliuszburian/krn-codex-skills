#!/usr/bin/env node
import fs from "node:fs";

import { runIsolatedFrontendEvaluation } from "../lib/harness/frontend-isolation.mjs";

function main() {
  try {
    const payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
    process.stdout.write(`${JSON.stringify(runIsolatedFrontendEvaluation(payload))}\n`);
  } catch (error) {
    process.stderr.write(`${error?.message ?? String(error)}\n`);
    process.exitCode = 2;
  }
}

main();
