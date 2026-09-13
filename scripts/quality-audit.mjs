#!/usr/bin/env node

import process from "node:process";

import { auditRepository } from "./lib/audit/quality-audit.mjs";

const { errors, info } = auditRepository(process.cwd());
for (const message of info) console.log(`AUDIT-INFO ${message}`);
if (errors.length > 0) {
  for (const message of errors) console.error(`AUDIT ${message}`);
  process.exit(1);
}
console.log("quality audit clean");
