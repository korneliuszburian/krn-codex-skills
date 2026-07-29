#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const MAX_BRIEF_BYTES = 200_000;
const MAX_DIFF_BYTES = 5_000_000;

function fail(message) {
  console.error(`reviewer-handoff: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const values = { paths: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--path") values.paths.push(argv[++index]);
    else if (flag === "--base") values.base = argv[++index];
    else if (flag === "--head") values.head = argv[++index];
    else if (flag === "--brief") values.brief = argv[++index];
    else if (flag === "--output") values.output = argv[++index];
    else if (flag === "--working-pass") values.workingPass = argv[++index];
    else fail(`unknown or incomplete option ${flag}`);
  }
  if (!values.base || !values.head || !values.brief || !values.output || values.paths.length === 0) {
    fail("required: --base BASE --head HEAD --path PATH... --brief FILE --output FILE");
  }
  return values;
}

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: MAX_DIFF_BYTES * 2 });
  if (!allowFailure && result.status !== 0) fail((result.stderr || result.stdout || "git command failed").trim());
  return result;
}

function safeRepoPath(value) {
  return typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.split("/").includes("..") && !value.includes("\\");
}

function inside(parent, candidate) {
  return candidate === parent || candidate.startsWith(`${parent}${path.sep}`);
}

function configuredWorkingRuns(root) {
  const configPath = path.join(root, "docs", "agents", "artifact-paths.json");
  if (!fs.existsSync(configPath)) {
    fail("repository-local --working-pass requires docs/agents/artifact-paths.json");
  }
  const metadata = fs.lstatSync(configPath);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail("artifact-paths.json must be a real file");
  }
  if (fs.realpathSync(configPath) !== configPath) {
    fail("artifact-paths.json must use its canonical repository path without symlinks");
  }
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    fail("artifact-paths.json must contain valid JSON");
  }
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config) ||
    config.schema_version !== 1 ||
    typeof config.working_runs !== "string" ||
    !config.working_runs.trim() ||
    path.isAbsolute(config.working_runs)
  ) {
    fail("artifact-paths.json must define schema_version 1 and a repository-relative working_runs");
  }
  const configured = path.resolve(root, config.working_runs);
  if (!inside(root, configured) || !fs.existsSync(configured)) {
    fail("configured working_runs must be an existing directory inside the repository");
  }
  const resolved = fs.realpathSync(configured);
  if (!inside(root, resolved) || !fs.statSync(resolved).isDirectory()) {
    fail("configured working_runs must resolve to a directory inside the repository");
  }
  return resolved;
}

function resolveOutput(outputValue, workingPassValue, root) {
  if (outputValue === "-") return "-";
  const requestedOutput = path.resolve(outputValue);
  const requestedParent = path.dirname(requestedOutput);
  if (!fs.existsSync(requestedParent)) fail("output parent directory must already exist");
  const output = path.join(fs.realpathSync(requestedParent), path.basename(requestedOutput));
  const outputInRepo = inside(root, output);

  if (!workingPassValue) {
    if (outputInRepo) fail("repository-local output requires --working-pass");
    return output;
  }
  if (!path.isAbsolute(workingPassValue)) fail("--working-pass must be an absolute directory");
  if (!fs.existsSync(workingPassValue) || !fs.statSync(workingPassValue).isDirectory()) {
    fail("--working-pass must be an existing directory");
  }
  if (fs.lstatSync(workingPassValue).isSymbolicLink()) fail("--working-pass must not be a symlink");
  const workingPass = fs.realpathSync(workingPassValue);
  if (!inside(workingPass, output) || output === workingPass) {
    fail("output must be a file inside --working-pass");
  }
  if ((fs.statSync(workingPass).mode & 0o077) !== 0) {
    fail("--working-pass must not grant group or other permissions");
  }
  if (inside(root, workingPass)) {
    const workingRuns = configuredWorkingRuns(root);
    if (workingPass === workingRuns || !inside(workingRuns, workingPass)) {
      fail("repository-local --working-pass must be under configured working_runs");
    }
    const relativePass = path.relative(root, workingPass);
    const ignored = git(root, ["check-ignore", "-q", "--no-index", "--", relativePass], { allowFailure: true });
    if (ignored.status !== 0) fail("repository-local --working-pass must be Git-ignored");
  } else if (outputInRepo) {
    fail("repository-local output must use a repository-local --working-pass");
  }
  return output;
}

const args = parseArgs(process.argv.slice(2));
const rootResult = git(process.cwd(), ["rev-parse", "--show-toplevel"]);
const root = fs.realpathSync(rootResult.stdout.trim());
const output = resolveOutput(args.output, args.workingPass, root);
const allowed = [...new Set(args.paths)];
if (allowed.length !== args.paths.length || allowed.some((item) => !safeRepoPath(item))) fail("every --path must be a unique repository-relative path");

for (const ref of [args.base, args.head]) git(root, ["rev-parse", "--verify", `${ref}^{commit}`]);
const head = git(root, ["rev-parse", args.head]).stdout.trim();
const base = git(root, ["rev-parse", args.base]).stdout.trim();
const parent = git(root, ["show", "-s", "--format=%P", head]).stdout.trim();
const status = git(root, ["status", "--short"]).stdout.trim();
const nameOnly = git(root, ["diff", "--name-only", `${base}..${head}`, "--", ...allowed]).stdout.split("\n").filter(Boolean);
const allChanged = git(root, ["diff", "--name-only", `${base}..${head}`]).stdout.split("\n").filter(Boolean);
if (allChanged.length !== nameOnly.length || allChanged.some((item) => !allowed.includes(item))) fail(`commit diff escapes allowlist: ${allChanged.filter((item) => !allowed.includes(item)).join(", ")}`);
if (allChanged.length !== allowed.length || allowed.some((item) => !allChanged.includes(item))) fail("allowlist does not exactly match the commit diff");
const check = git(root, ["diff", "--check", `${base}..${head}`, "--", ...allowed], { allowFailure: true });
if (check.status !== 0) fail(`git diff --check failed: ${(check.stdout + check.stderr).trim()}`);
const brief = fs.readFileSync(path.resolve(args.brief), "utf8");
if (Buffer.byteLength(brief, "utf8") > MAX_BRIEF_BYTES) fail("brief exceeds 200 KiB");
const diff = git(root, ["diff", "--no-ext-diff", "--unified=80", `${base}..${head}`, "--", ...allowed]).stdout;
if (Buffer.byteLength(diff, "utf8") > MAX_DIFF_BYTES) fail("diff exceeds 5 MiB; split the review surface");
const stat = git(root, ["diff", "--stat", `${base}..${head}`, "--", ...allowed], { allowFailure: true });
if (stat.status !== 0) fail("could not compute diff stat");
const commits = git(root, ["log", "--format=%H %P %s", `${base}..${head}`]).stdout.trim();

const packet = `# Reviewer Handoff Packet

Generated by reviewer-handoff. This packet is evidence for a reviewer; it is not an approval or merge decision.

## Fixed point

- Repository root: \`${root}\`
- Base: \`${args.base}\` → \`${base}\`
- Head: \`${args.head}\` → \`${head}\`
- Head parent(s): \`${parent || "none"}\`
- Working-tree status at compilation:\n\n\`\`\`text\n${status || "clean"}\n\`\`\`

## Changed-path ledger

${allowed.map((item) => `- \`${item}\` — in scope`).join("\n")}

## Commit list

\`\`\`text
${commits || "no commits in range"}
\`\`\`

## Diff summary

\`\`\`text
${stat.stdout.trim()}
\`\`\`

## Reviewer brief

${brief.trim()}

## Diff

\`\`\`diff
${diff}
\`\`\`

## Compiler checks

- Exact changed-path allowlist: PASS
- \`git diff --check\`: PASS
- Full diff included: PASS
- This packet does not prove runtime, deployment, publication, production readiness, or reviewer approval.
`;

if (output === "-") process.stdout.write(packet);
else {
  if (fs.existsSync(output)) fail(`refusing to overwrite existing output ${output}`);
  fs.writeFileSync(output, packet, { encoding: "utf8", mode: 0o600, flag: "wx" });
  console.log(output);
}
