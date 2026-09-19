import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const FIXTURE = "test/fixture.test.mjs";
const FIXTURE_CASE = "fixture case";
const HEADER = "Status: `accepted`. Consumer: `$setup-repository-workflow`. Owner: maintainer. Verified: 2026-09-19.\n";

// The observer is loaded lazily so the same file can run at the base revision,
// where the module does not exist: the failure is then a failing assertion, not
// a module-load setup error.
let observerPromise = null;
function loadObserver() {
  observerPromise ??= import("../../scripts/lib/memory-register.mjs")
    .then((module) => module.checkMemoryRegister)
    .catch(() => null);
  return observerPromise;
}

async function requireObserver() {
  const checkMemoryRegister = await loadObserver();
  assert.ok(checkMemoryRegister, "scripts/lib/memory-register.mjs must export checkMemoryRegister");
  return checkMemoryRegister;
}

function write(root, rel, content) {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content);
}

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function initRepo(root) {
  execFileSync("git", ["-C", root, "init", "-q"], { stdio: "ignore" });
  git(root, ["config", "commit.gpgsign", "false"]);
  git(root, ["config", "user.email", "fixture@example.com"]);
  git(root, ["config", "user.name", "Fixture"]);
}

function commit(root, message) {
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", message]);
  return git(root, ["rev-parse", "--short=7", "HEAD"]);
}

function registerText({ rows, exclusions = [] }) {
  const head = "| Artifact | Kind | Writer | Reader | Trigger | Budget | Falsifier | Status | Verified |";
  const separator = "|---|---|---|---|---|---|---|---|---|";
  const body = rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
  const exclusionHead = "| Pattern | Reason | Owner | Falsifier | Verified |";
  const exclusionSeparator = "|---|---|---|---|---|";
  const exclusionBody = exclusions.map((cells) => `| ${cells.join(" | ")} |`).join("\n");
  return [
    "# Memory register",
    "",
    HEADER,
    "## Register",
    "",
    head,
    separator,
    body,
    "",
    "## Exclusions",
    "",
    exclusionHead,
    exclusionSeparator,
    exclusionBody,
    "",
  ].join("\n");
}

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), "krn-memreg-"));
  initRepo(root);
  write(root, FIXTURE, `import test from "node:test";\ntest("${FIXTURE_CASE}", () => {});\n`);
  write(root, "docs/research/topic.md", `# Topic\n\n${HEADER}\nbody\n`);
  return root;
}

function defaultRows(sha) {
  return [
    ["docs/research/*.md", "durable", "maintainer", "maintainer", "path:docs/research/**", "unbounded", `${FIXTURE}::${FIXTURE_CASE}@${sha}`, "active", `${sha}@2026-09-19`],
    ["test/**", "code", "maintainer", "maintainer", "path:test/**", "unbounded", `${FIXTURE}::${FIXTURE_CASE}@${sha}`, "active", `${sha}@2026-09-19`],
  ];
}

function codes(report) {
  return report.errors.map((error) => error.slice(0, error.indexOf(":")));
}

test("a missing register fails closed as register-missing", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = mkdtempSync(join(tmpdir(), "krn-memreg-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const report = checkMemoryRegister({ root });
  assert.ok(codes(report).includes("register-missing"), JSON.stringify(report.errors));
});

test("a tracked artifact matched by no row is unmapped-artifact", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  write(root, "docs/loose.md", "# Loose\n");
  write(root, "docs/research/memory-register.md", registerText({ rows: defaultRows(sha) }));
  commit(root, "register and loose file");
  const report = checkMemoryRegister({ root });
  assert.ok(
    report.errors.some((error) => error.startsWith("unmapped-artifact:") && error.includes("docs/loose.md")),
    JSON.stringify(report.errors),
  );
});

test("two rows that claim one artifact are double-mapped", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  const rows = [...defaultRows(sha), defaultRows(sha)[0]];
  write(root, "docs/research/memory-register.md", registerText({ rows }));
  commit(root, "register with a duplicate row");
  const report = checkMemoryRegister({ root });
  assert.ok(
    report.errors.some((error) => error.startsWith("double-mapped:") && error.includes("docs/research/")),
    JSON.stringify(report.errors),
  );
});

test("an active row that matches nothing is empty-row", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  const rows = [...defaultRows(sha), ["docs/void/*.md", "durable", "maintainer", "maintainer", "path:docs/void/**", "unbounded", `${FIXTURE}::${FIXTURE_CASE}@${sha}`, "active", `${sha}@2026-09-19`]];
  write(root, "docs/research/memory-register.md", registerText({ rows }));
  commit(root, "register with an empty row");
  const report = checkMemoryRegister({ root });
  assert.ok(
    report.errors.some((error) => error.startsWith("empty-row:") && error.includes("docs/void")),
    JSON.stringify(report.errors),
  );
});

test("a reader pointer at an untracked path is dead-reader", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  const rows = defaultRows(sha);
  rows[0][3] = "`docs/research/ghost.md`";
  write(root, "docs/research/memory-register.md", registerText({ rows }));
  commit(root, "register with a dead reader");
  const report = checkMemoryRegister({ root });
  assert.ok(
    report.errors.some((error) => error.startsWith("dead-reader:") && error.includes("docs/research/ghost.md")),
    JSON.stringify(report.errors),
  );
});

test("an empty falsifier is missing-falsifier and an unknown case is invalid-falsifier", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");

  const missing = defaultRows(sha);
  missing[0][6] = "";
  write(root, "docs/research/memory-register.md", registerText({ rows: missing }));
  commit(root, "register with an empty falsifier");
  assert.ok(codes(checkMemoryRegister({ root })).includes("missing-falsifier"), JSON.stringify(checkMemoryRegister({ root }).errors));

  const falseCase = defaultRows(sha);
  falseCase[0][6] = `${FIXTURE}::not a real case@${sha}`;
  write(root, "docs/research/memory-register.md", registerText({ rows: falseCase }));
  commit(root, "register with a false falsifier");
  assert.ok(codes(checkMemoryRegister({ root })).includes("invalid-falsifier"), JSON.stringify(checkMemoryRegister({ root }).errors));
});

test("a falsifier file that does not exist is invalid-falsifier", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  const rows = defaultRows(sha);
  rows[0][6] = `test/ghost.test.mjs::${FIXTURE_CASE}@${sha}`;
  write(root, "docs/research/memory-register.md", registerText({ rows }));
  commit(root, "register with a missing falsifier file");
  assert.ok(codes(checkMemoryRegister({ root })).includes("invalid-falsifier"), JSON.stringify(checkMemoryRegister({ root }).errors));
});

test("a row verified before later mapped changes is stale-verified", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const anchor = commit(root, "base");
  write(root, "docs/research/memory-register.md", registerText({ rows: defaultRows(anchor) }));
  commit(root, "register");
  write(root, "docs/research/topic.md", `# Topic\n\n${HEADER}\nrevised body\n`);
  commit(root, "revise the mapped topic");
  const report = checkMemoryRegister({ root });
  assert.ok(codes(report).includes("stale-verified"), JSON.stringify(report.errors));
});

test("an exclusion pattern that matches nothing is blind-exclusion", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  write(root, "docs/research/memory-register.md", registerText({
    rows: defaultRows(sha),
    exclusions: [["docs/ghost/**", "no artifact", "maintainer", FIXTURE, sha]],
  }));
  commit(root, "register with a blind exclusion");
  const report = checkMemoryRegister({ root });
  assert.ok(
    report.warnings.some((warning) => warning.startsWith("blind-exclusion:") && warning.includes("docs/ghost/**")),
    JSON.stringify(report.errors),
  );
});

test("unknown kind, invalid trigger, invalid status, and a retired row with a trigger all fail", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");

  const unknownKind = defaultRows(sha);
  unknownKind[0][1] = "mystery";
  write(root, "docs/research/memory-register.md", registerText({ rows: unknownKind }));
  commit(root, "unknown kind");
  assert.ok(codes(checkMemoryRegister({ root })).includes("unknown-kind"), JSON.stringify(checkMemoryRegister({ root }).errors));

  const invalidTrigger = defaultRows(sha);
  invalidTrigger[0][4] = "sometimes";
  write(root, "docs/research/memory-register.md", registerText({ rows: invalidTrigger }));
  commit(root, "invalid trigger");
  assert.ok(codes(checkMemoryRegister({ root })).includes("invalid-trigger"), JSON.stringify(checkMemoryRegister({ root }).errors));

  const invalidStatus = defaultRows(sha);
  invalidStatus[0][7] = "gone";
  write(root, "docs/research/memory-register.md", registerText({ rows: invalidStatus }));
  commit(root, "invalid status");
  assert.ok(codes(checkMemoryRegister({ root })).includes("invalid-status"), JSON.stringify(checkMemoryRegister({ root }).errors));

  const retiredWithTrigger = defaultRows(sha);
  retiredWithTrigger[0][7] = `retired@${sha}`;
  write(root, "docs/research/memory-register.md", registerText({ rows: retiredWithTrigger }));
  commit(root, "retired with a trigger");
  assert.ok(codes(checkMemoryRegister({ root })).includes("retired-with-trigger"), JSON.stringify(checkMemoryRegister({ root }).errors));
});

test("a row over its numeric budget is budget-exceeded", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  const rows = defaultRows(sha);
  rows[0][5] = "0 files";
  write(root, "docs/research/memory-register.md", registerText({ rows }));
  commit(root, "over budget");
  assert.ok(codes(checkMemoryRegister({ root })).includes("budget-exceeded"), JSON.stringify(checkMemoryRegister({ root }).errors));
});

test("a clean fixture register reports no errors", async (t) => {
  const checkMemoryRegister = await requireObserver();
  const root = makeRepo();
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const sha = commit(root, "base");
  write(root, "docs/research/memory-register.md", registerText({ rows: defaultRows(sha) }));
  commit(root, "register");
  const report = checkMemoryRegister({ root });
  assert.deepEqual(report.errors, []);
});

test("the repository register has no structural errors", async () => {
  const checkMemoryRegister = await requireObserver();
  const report = checkMemoryRegister({ root: REPO_ROOT });
  assert.deepEqual(report.errors, []);
});
