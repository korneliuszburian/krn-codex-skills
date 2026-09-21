#!/usr/bin/env node

import { parseCliArgs } from "./lib/kernel/cli.mjs";
import { checkFrontendLibrary, importFrontendLibrary } from "./lib/frontend/library-import.mjs";

const usage = "Usage: krn-frontend-library import --root KRN --bundle DIR [--json]\n       krn-frontend-library check --root KRN [--json]";
const abort = (message = usage) => {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
};

try {
  const { positional, options } = parseCliArgs(process.argv.slice(2), {
    booleans: { "--json": "json" },
    values: { "--root": "root", "--bundle": "bundle" },
    defaults: { json: false },
    fail: abort,
  });
  const command = positional[0];
  if (!options.root || positional.length !== 1 || !["import", "check"].includes(command)
    || (command === "import" ? !options.bundle : options.bundle)) {
    abort();
  } else {
    const report = command === "import"
      ? importFrontendLibrary({ root: options.root, bundle: options.bundle })
      : checkFrontendLibrary({ root: options.root });
    process.stdout.write(options.json
      ? `${JSON.stringify(report)}\n`
      : `frontend library ${command === "import" ? "imported" : "verified"}: ${report.bundleDigest} (${report.files} files)\n`);
  }
} catch (error) {
  abort(error.message);
}
