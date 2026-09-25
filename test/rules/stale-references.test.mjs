import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";

// The observer lives in the shared content-rules module. Load it dynamically so
// the check can be executed at the base revision, where the export is absent.
const contentRules = await import("../../scripts/lib/rules/content-rules.mjs");

function staleReferenceErrors(content, options) {
  const observer = contentRules.staleReferenceErrors;
  if (typeof observer !== "function") {
    throw new Error("scripts/lib/rules/content-rules.mjs must export staleReferenceErrors");
  }
  return observer(content, options);
}

const OPERATOR_PAGES = ["README.md", "CONTEXT.md", "AGENTS.md"];

// Research pages and PRD briefs record retired artifacts, external projects,
// and paths that only ever existed as proposed deliverables, so a live
// reference check cannot demand they resolve. Every such reference is listed
// here so a new stale reference anywhere in the durable surface still fails.
const HISTORICAL_REFERENCES = new Set([
  "docs/adr/0001-compact-context-spine.md:docs/agents/artifact-paths.json",
  "docs/research/lab-tests.md:npm run verify",
  "docs/research/lab-tests.md:test/edition.test.mjs",
  "docs/research/lab-tests.md:scripts/lib/evaluation/lt5-admissibility.mjs",
  "docs/research/lab-tests.md:docs/prd/0002",
  "docs/research/lab-tests.md:docs/prd/0001",
  "docs/research/lab-tests.md:docs/adr/0003",
  "docs/research/lab-tests.md:docs/BRIEF.md",
  "docs/research/lab-tests.md:scripts/lib/audit/falsifier-mutate.mjs",
  "docs/research/lab-tests.md:scripts/lib/contract/flake-classify.mjs",
  "docs/research/lab-tests.md:test/audit/falsifier-mutate.test.mjs",
  "docs/research/lab-tests.md:test/contract/flake-classify.test.mjs",
  "docs/research/orchestration.md:docs/adr/0003",
  "docs/research/orchestration.md:docs/BRIEF.md",
  "docs/research/orchestration.md:config/paths.json",
]);

function formatStaleReference(finding) {
  return finding.kind === "path"
    ? `${finding.label}:${finding.number}: backticked path does not exist: ${finding.value}`
    : `${finding.label}:${finding.number}: npm run references a script absent from package.json: ${finding.value}`;
}

function staleReferenceKey(finding) {
  return finding.kind === "path"
    ? `${finding.label}:${finding.value}`
    : `${finding.label}:npm run ${finding.value}`;
}

function markdownFiles(directory) {
  const files = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!existsSync(current)) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith(".md")) files.push(path);
    }
  }
  return files.sort();
}

function durableDocuments(root) {
  const files = OPERATOR_PAGES.filter((name) => existsSync(join(root, name)));
  for (const file of markdownFiles(join(root, "docs"))) {
    files.push(relative(root, file).replace(/\\/g, "/"));
  }
  return files.sort();
}

function packageScripts(root) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return new Set(Object.keys(manifest.scripts ?? {}));
}

function repoStaleReferences(root, scripts) {
  const findings = [];
  for (const file of durableDocuments(root)) {
    const content = readFileSync(join(root, file), "utf8");
    findings.push(...staleReferenceErrors(content, { label: file, root, scripts }));
  }
  return findings;
}

test("staleReferenceErrors reports missing repo paths and npm scripts but exempts fences", () => {
  const root = "/repo";
  const existing = new Set([
    "/repo/scripts/validate.mjs",
    "/repo/docs/adr/0001-record.md",
  ]);
  const scripts = new Set(["test:lib", "validate"]);
  const content = [
    "Keep `scripts/validate.mjs`, `docs/adr/0001-record.md#status`, and `npm run test:lib`.",
    "Break `scripts/missing.mjs`, `test/ghost.test.mjs`, and `npm run gone`.",
    "Ignore `https://example.com/a/b`, `src/registry.mjs`, `<placeholder>/x.md`, `.codex/config.toml`, and `documentation/...`.",
    "```",
    "Fenced `scripts/also-missing.mjs` and `npm run also-gone` are examples.",
    "```",
  ].join("\n");
  assert.deepEqual(
    staleReferenceErrors(content, {
      label: "README.md",
      root,
      scripts,
      exists: (path) => existing.has(path),
    }).map(formatStaleReference),
    [
      "README.md:2: backticked path does not exist: scripts/missing.mjs",
      "README.md:2: backticked path does not exist: test/ghost.test.mjs",
      "README.md:2: npm run references a script absent from package.json: gone",
    ],
  );
});

test("fenced npm scripts and tilde fences are exempt while inline examples are not", () => {
  const root = "/repo";
  const scripts = new Set(["validate"]);
  const content = [
    "~~~",
    "npm run ghost",
    "`scripts/ghost.mjs`",
    "~~~",
    "An inline `npm run ghost` and `scripts/ghost.mjs` still count.",
  ].join("\n");
  assert.deepEqual(
    staleReferenceErrors(content, {
      label: "CONTEXT.md",
      root,
      scripts,
      exists: () => false,
    }).map(formatStaleReference),
    [
      "CONTEXT.md:5: backticked path does not exist: scripts/ghost.mjs",
      "CONTEXT.md:5: npm run references a script absent from package.json: ghost",
    ],
  );
});

test("durableDocuments spans the operator pages and docs/**/*.md", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-stale-"));
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "docs", "prd"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# Readme\n");
  writeFileSync(join(root, "CONTEXT.md"), "# Context\n");
  writeFileSync(join(root, "AGENTS.md"), "# Agents\n");
  writeFileSync(join(root, "docs", "capabilities.md"), "# Caps\n");
  writeFileSync(join(root, "docs", "adr", "0001-record.md"), "# ADR\n");
  writeFileSync(join(root, "docs", "research", "notes.md"), "# Notes\n");
  writeFileSync(join(root, "docs", "prd", "brief.md"), "# Brief\n");
  assert.deepEqual(durableDocuments(root), [
    "AGENTS.md",
    "CONTEXT.md",
    "README.md",
    "docs/adr/0001-record.md",
    "docs/capabilities.md",
    "docs/prd/brief.md",
    "docs/research/notes.md",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("a missing path in a docs page is reported with its file and line", () => {
  const root = mkdtempSync(join(tmpdir(), "krn-stale-"));
  mkdirSync(join(root, "docs"), { recursive: true });
  writeFileSync(join(root, "README.md"), "# Readme\nsee `docs/ghost.md`\n");
  writeFileSync(join(root, "docs", "capabilities.md"), "# Caps\nsee `scripts/ghost.mjs`\n");
  const findings = repoStaleReferences(root, new Set());
  assert.deepEqual(findings.map(formatStaleReference), [
    "README.md:2: backticked path does not exist: docs/ghost.md",
    "docs/capabilities.md:2: backticked path does not exist: scripts/ghost.mjs",
  ]);
  rmSync(root, { recursive: true, force: true });
});

test("the durable surface cites no unrecorded stale reference", () => {
  const root = process.cwd();
  const findings = repoStaleReferences(root, packageScripts(root));
  assert.ok(
    findings.length > 0,
    "the observer must still see the recorded historical references",
  );
  const unexpected = findings.filter(
    (finding) => !HISTORICAL_REFERENCES.has(staleReferenceKey(finding)),
  );
  assert.deepEqual(unexpected.map(formatStaleReference), []);
});

test("the ticket protocol records the executed queue cutover", () => {
  const protocol = readFileSync(join(process.cwd(), "docs", "research", "ticket-protocol.md"), "utf8");
  assert.ok(
    !protocol.includes("Markdown queue remains authoritative"),
    "the protocol must not claim a retired Markdown authority",
  );
  assert.match(protocol, /Cutover record \(2026-09-25\)/, "the protocol must record the executed cutover");
  assert.match(
    protocol,
    /4b1887607f3b0f66d50d47cd032b097f0d0dff72/,
    "the cutover record must name the integrated merge",
  );
});
