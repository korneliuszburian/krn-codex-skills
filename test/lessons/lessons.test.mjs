import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { checkLessons, lessonUsage, parseLessons, recallBindings, recallLessons, recallLines } from "../../scripts/lib/lessons/lessons.mjs";

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), "krn-lessons-"));
  mkdirSync(join(root, "docs", "research"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "gate.test.mjs"), "// probe: the falsifier case\n");
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "test:state": "x" }\n}\n');
  return root;
}

const FALSIFIER = `\`test/gate.test.mjs::probe@abcdef0\``;

test("duplicate triggers across active rows are rejected", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(
    file,
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| A | probe | `test:state` | | | path:src/a.mjs |\n| B | probe | `test:state` | | | path:src/a.mjs |\n",
  );
  const { errors } = checkLessons({ root });
  assert.ok(errors.some((error) => error.includes("share trigger path:src/a.mjs")), JSON.stringify(errors));
  rmSync(root, { recursive: true, force: true });
});

test("parseLessons owns the row schema and reports malformed rows", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | `manual:review` |\n| B | probe | `test:state` | extra |\n");
  const parsed = parseLessons(file);
  assert.deepEqual(parsed.rows.map((row) => row.lesson), ["A"]);
  assert.equal(parsed.malformed.length, 1);
  rmSync(root, { recursive: true, force: true });
});

test("a lesson with a resolving script or manual gate passes", () => {
  const root = makeRoot();
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | `test:state` and `manual:review`. |\n");
  const report = checkLessons({ root });
  assert.deepEqual(report.errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("an unresolvable gate reference fails", () => {
  const root = makeRoot();
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | `scripts/missing.mjs` |\n");
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("no npm script or owned path")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a gate must be an owned path, not a traversal, escape, or directory", () => {
  const root = makeRoot();
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "validate.mjs"), "// gate\n");
  mkdirSync(join(root, "docs", "fakedir.mjs"), { recursive: true });

  const resolveLesson = (gate) => {
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | \`${gate}\` |\n`);
    return checkLessons({ root }).errors;
  };

  assert.ok(resolveLesson("docs/../README.md").length > 0, "traversal to a root file must fail");
  assert.ok(resolveLesson("docs/../../escape.mjs").length > 0, "escape outside the repo must fail");
  assert.ok(resolveLesson("docs/fakedir.mjs").length > 0, "a directory is not a gate file");
  assert.deepEqual(resolveLesson("node scripts/validate.mjs"), [], "an owned node script is a valid gate");
  assert.deepEqual(resolveLesson("node ./scripts/validate.mjs"), [], "a ./ owned node script is a valid gate");
  rmSync(root, { recursive: true, force: true });
});

test("a lesson without any gate candidate fails", () => {
  const root = makeRoot();
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | review only |\n");
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("no resolvable gate")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("recurring friction with only a manual gate must be consolidated", () => {
  const root = makeRoot();
  const row = (gate, occurrences) => `| A | probe | \`${gate}\` | ${occurrences} | ${FALSIFIER} |`;
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    `| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n${row("manual:review", "2026-01-01@abcdef1, 2026-01-02@abcdef2")}\n`,
  );
  assert.ok(
    checkLessons({ root }).errors.some((error) => error.includes("recurring friction")),
    JSON.stringify(checkLessons({ root }).errors),
  );

  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    `| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n${row("test:state", "2026-01-01@abcdef1, 2026-01-02@abcdef2")}\n`,
  );
  assert.deepEqual(checkLessons({ root }).errors, []);

  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    `| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n${row("manual:review", "2026-01-01@abcdef1")}\n`,
  );
  assert.deepEqual(checkLessons({ root }).errors, []);
  rmSync(root, { recursive: true, force: true });
});

test("recurrence bypasses are closed: no trailing pipe, doc-only gate, duplicate tokens", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n";

  writeFileSync(
    file,
    `${header}| A | probe | \`manual:review\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | ${FALSIFIER}`,
  );
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("no structural gate")), "missing trailing pipe");

  writeFileSync(
    file,
    `${header}| A | probe | \`manual:review\`, \`docs/research/orchestration.md\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | ${FALSIFIER} |\n`,
  );
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("no structural gate")), "a doc path is not structural");

  writeFileSync(file, `${header}| A | probe | \`manual:review\` | 2026-01-01@abcdef1, 2026-01-01@abcdef1 |\n`);
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("malformed lesson row")), "duplicate tokens are malformed, not collapsed");
  rmSync(root, { recursive: true, force: true });
});

test("structural classification uses the resolved path, not the raw reference", () => {
  const root = makeRoot();
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "x.mjs"), "// gate\n");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n";
  const file = join(root, "docs", "research", "workflow-lessons.md");

  writeFileSync(file, `${header}| A | probe | \`node ./scripts/x.mjs\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | ${FALSIFIER} |\n`);
  assert.deepEqual(checkLessons({ root }).errors, [], "a normalized node script is structural");

  writeFileSync(file, `${header}| A | probe | \`scripts/../docs/research/workflow-lessons.md\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | ${FALSIFIER} |\n`);
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("no structural gate")), "a traversal to docs is not structural");

  writeFileSync(file, `${header}| A | probe | \`node --test test/x.test.mjs\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | ${FALSIFIER} |\n`);
  mkdirSync(join(root, "test"), { recursive: true });
  writeFileSync(join(root, "test", "x.test.mjs"), "// test\n");
  assert.deepEqual(checkLessons({ root }).errors, [], "a node --test invocation is structural");
  rmSync(root, { recursive: true, force: true });
});

test("prototype-chain names cannot masquerade as npm scripts", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(
    file,
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| A | probe | `npm run constructor` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | `test/gate.test.mjs::probe@abcdef0` |\n",
  );
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("unknown npm script constructor")), JSON.stringify(checkLessons({ root }).errors));
  rmSync(root, { recursive: true, force: true });
});

test("recurring rows must carry the falsifier that proved the gate", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n";

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 |\n`);
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("no falsifier recorded")), "a recurring row without a proof fails");

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | \`test/missing.test.mjs::probe@abcdef0\` |\n`);
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("falsifier file not found")), "a proof file must exist");

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | \`probe@abcdef0\` |\n`);
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("falsifier must be")), "a proof must name a file, case, and commit");

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | \`test/gate.test.mjs::not-a-real-case@abcdef0\` |\n`);
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("is not present in")), "the named case must exist in the file");

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | ${FALSIFIER} |\n`);
  assert.deepEqual(checkLessons({ root }).errors, [], "a resolvable proof passes");

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-01@abcdef1 | ${FALSIFIER} |\n`);
  assert.deepEqual(checkLessons({ root }).errors, [], "a single occurrence may still record its proof");
  rmSync(root, { recursive: true, force: true });
});

test("a falsifier cannot escape the repository through a symlink", () => {
  const root = makeRoot();
  const outside = mkdtempSync(join(tmpdir(), "krn-outside-"));
  writeFileSync(join(outside, "x.test.mjs"), "// probe\n");
  symlinkSync(join(outside, "x.test.mjs"), join(root, "test", "link.test.mjs"));
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1, 2026-01-02@abcdef2 | `test/link.test.mjs::probe@abcdef0` |\n",
  );
  assert.ok(checkLessons({ root }).errors.some((e) => e.includes("through a link")), JSON.stringify(checkLessons({ root }).errors));
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test("friction that recurs after its consolidation proof fails closed", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n";
  const fakeGit = (_root, args) => {
    if (args[0] === "rev-parse") return { ok: true, out: "" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "log") return { ok: true, out: "" };
    if (args[0] === "merge-base") {
      const descendant = args[3];
      return { ok: descendant === "HEAD" || descendant === "aaaaaaa", out: "" };
    }
    return { ok: false, out: "" };
  };

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-02@bbbbbbb, 2026-01-03@aaaaaaa | \`test/gate.test.mjs::probe@ccccccc\` |\n`);
  assert.ok(checkLessons({ root, git: fakeGit }).errors.some((error) => error.includes("recurred at 2026-01-03@aaaaaaa")), "a post-proof occurrence must fail");

  writeFileSync(file, `${header}| A | probe | \`test:state\` | 2026-01-02@bbbbbbb | \`test/gate.test.mjs::probe@ccccccc\` |\n`);
  assert.deepEqual(checkLessons({ root, git: fakeGit }).errors, [], "only pre-proof occurrences are allowed");
  rmSync(root, { recursive: true, force: true });
});

test("a trigger delivers the matching lesson for changed paths", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(
    file,
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n"
    + "| Guards | probe | `test:state` | | | path:scripts/lib/support/git-cli.mjs |\n",
  );
  const all = recallLessons({ root, files: ["scripts/lib/support/git-cli.mjs", "docs/x.md"] });
  assert.equal(all.length, 1);
  assert.deepEqual(all[0].matched, ["scripts/lib/support/git-cli.mjs"]);
  assert.deepEqual(recallLessons({ root, files: ["docs/x.md"] }), []);
  const matchedFor = (trigger, files) => {
    writeFileSync(
      file,
      "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n"
      + `| Guards | probe | \`test:state\` | | | ${trigger} |\n`,
    );
    return recallLessons({ root, files }).flatMap((hit) => hit.matched);
  };
  assert.deepEqual(matchedFor("path:scripts/**", ["scripts/a/b.mjs", "docs/x.md"]), ["scripts/a/b.mjs"]);
  assert.deepEqual(matchedFor("path:scripts/*.mjs", ["scripts/a.mjs", "scripts/a/b.mjs"]), ["scripts/a.mjs"]);
  assert.deepEqual(matchedFor("path:./scripts/**", ["scripts/a.mjs"]), ["scripts/a.mjs"], "a leading ./ is normalized away");
  rmSync(root, { recursive: true, force: true });
});

test("a symbol trigger delivers the matching lesson", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Guards | probe | `test:state` | | | symbol:runGit |\n");
  assert.equal(recallLessons({ root, files: [], symbols: ["runGit"] }).length, 1);
  assert.deepEqual(recallLessons({ root, files: [], symbols: ["other"] }), []);
  rmSync(root, { recursive: true, force: true });
});

test("a churn trigger delivers the lesson for a hot changed file", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Fragile | probe | `test:state` | | | churn:scripts/** |\n");
  assert.equal(recallLessons({ root, files: [], symbols: [], hot: ["scripts/hot.mjs"] }).length, 1);
  assert.deepEqual(recallLessons({ root, files: [], symbols: [], hot: [] }), []);
  assert.deepEqual(recallLessons({ root, files: [], symbols: [], hot: ["docs/hot.md"] }), [], "a hot file outside the glob does not match");
  rmSync(root, { recursive: true, force: true });
});

test("retirement needs a supersession or a removed gate, and is excluded from recall", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
  const git = (_root, args) => {
    if (["rev-parse", "cat-file", "merge-base", "log"].includes(args[0])) return { ok: true, out: "" };
    return { ok: false, out: "" };
  };

  writeFileSync(file, `${header}| Old | probe | \`test:state\` | | | | retired@abcdef0; superseded-by:New |\n| New | probe | \`test:state\` | | | | |\n`);
  assert.deepEqual(checkLessons({ root, git }).errors, [], "a superseded retirement is valid");

  writeFileSync(file, `${header}| Old | probe | \`test:state\` | | | | retired@abcdef0 |\n`);
  assert.ok(checkLessons({ root, git }).errors.some((error) => error.includes("live gate")), "retiring with a live gate must fail");

  writeFileSync(file, `${header}| Old | probe | \`scripts/gone.mjs\` | | | | retired@abcdef0 |\n`);
  assert.deepEqual(checkLessons({ root, git }).errors, [], "a retirement whose enforcement is gone is valid");

  writeFileSync(file, `${header}| Old | probe | \`test:state\` | | | symbol:runGit | retired@abcdef0; superseded-by:test:state |\n`);
  assert.ok(checkLessons({ root, git }).errors.some((error) => error.includes("retired row cannot carry a Trigger")), "a retired row must not be delivered");
  assert.deepEqual(recallLessons({ root, files: [], symbols: ["runGit"] }), [], "a retired lesson is not delivered");
  rmSync(root, { recursive: true, force: true });
});

test("retirement is invalid without a commit and budgets count only active rows", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
  const git = (_root, args) => {
    if (["rev-parse", "cat-file", "merge-base", "log"].includes(args[0])) return { ok: true, out: "" };
    return { ok: false, out: "" };
  };
  const row = (name, status) => `| ${name} | probe | \`test:state\` | | | | ${status} |`;

  writeFileSync(file, `${header}${row("Old", "retired")}\n`);
  assert.ok(checkLessons({ root, git }).errors.some((error) => error.includes("invalid Status")), "a retirement needs a commit token");

  const active = Array.from({ length: 24 }, (_value, index) => row(`L${index}`, "")).join("\n");
  writeFileSync(file, `${header}${active}\n${row("Old", "retired@abcdef0; superseded-by:test:state")}\n`);
  assert.deepEqual(checkLessons({ root, git }).errors, [], "retired rows do not consume the active budget");

  const overflow = Array.from({ length: 25 }, (_value, index) => row(`L${index}`, "")).join("\n");
  writeFileSync(file, `${header}${overflow}\n`);
  assert.ok(checkLessons({ root, git }).errors.some((error) => error.includes("active lesson rows")), "the active budget still applies");

  const archived = Array.from({ length: 25 }, (_value, index) => `| A${index} | probe | \`scripts/gone.mjs\` | | | | retired@abcdef0 |`).join("\n");
  writeFileSync(file, `${header}${archived}\n`);
  assert.ok(checkLessons({ root, git }).errors.some((error) => error.includes("archived rows")), "the archive is bounded too");
  rmSync(root, { recursive: true, force: true });
});

test("glob ? matches one character and unknown trigger prefixes fail", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n";
  const matchedFor = (files) => {
    writeFileSync(file, `${header}| Guards | probe | \`test:state\` | | | path:scripts/v?m.mjs |\n`);
    return recallLessons({ root, files }).flatMap((hit) => hit.matched);
  };
  assert.deepEqual(matchedFor(["scripts/vxm.mjs"]), ["scripts/vxm.mjs"], "? matches exactly one character");
  assert.deepEqual(matchedFor(["scripts/vm.mjs"]), [], "? requires one character");
  assert.deepEqual(matchedFor(["scripts/vxxm.mjs"]), [], "? matches only one character");
  writeFileSync(file, `${header}| A | probe | \`test:state\` | | | sym:runGit |\n`);
  assert.ok(checkLessons({ root }).errors.some((error) => error.includes("unknown trigger")), JSON.stringify(checkLessons({ root }).errors));
  rmSync(root, { recursive: true, force: true });
});

test("a non-ancestor proof, a stale proof, and an unknown proof commit behave distinctly", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n"
    + "| A | probe | `test:state` | 2026-01-02@bbbbbbb | `test/gate.test.mjs::probe@ccccccc` |\n");
  const gitFor = ({ ancestor = true, known = true, stale = false } = {}) => (_root, args) => {
    if (args[0] === "rev-parse") return { ok: true, out: "" };
    if (args[0] === "cat-file") return { ok: known, out: "" };
    if (args[0] === "merge-base") return { ok: ancestor, out: "" };
    if (args[0] === "log") return { ok: true, out: stale ? "abc later edit" : "" };
    if (args[0] === "rev-list") return { ok: true, out: "1" };
    return { ok: false, out: "" };
  };
  assert.ok(checkLessons({ root, git: gitFor({ ancestor: false }) }).errors.some((error) => error.includes("not an ancestor of HEAD")), "a non-ancestor proof fails");
  assert.ok(checkLessons({ root, git: gitFor({ stale: true }) }).warnings.some((warning) => warning.includes("predates later changes")), "a stale proof warns");
  const unknown = checkLessons({ root, git: gitFor({ known: false }) });
  assert.deepEqual(unknown.errors, [], "an unknown proof commit is provenance, not an error");
  rmSync(root, { recursive: true, force: true });
});

test("a triggered lesson with a stale proof fails closed as stale-anchor", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n";
  const body = "| A | probe | `test:state` | | `test/gate.test.mjs::probe@ccccccc` | %TRIGGER% |\n";
  const gitFor = (stale) => (_root, args) => {
    if (args[0] === "rev-parse") return { ok: true, out: "" };
    if (args[0] === "cat-file") return { ok: true, out: "" };
    if (args[0] === "merge-base") return { ok: true, out: "" };
    if (args[0] === "log") return { ok: true, out: stale ? "abc later edit" : "" };
    if (args[0] === "rev-list") return { ok: true, out: "1" };
    return { ok: false, out: "" };
  };
  writeFileSync(file, header + body.replace("%TRIGGER%", "path:scripts/lib/x.mjs"));
  const stale = checkLessons({ root, git: gitFor(true) });
  assert.ok(stale.errors.some((error) => error.includes("stale-anchor")), JSON.stringify(stale.errors));
  assert.ok(stale.errors.some((error) => error.includes("lessons reanchor")), JSON.stringify(stale.errors));
  writeFileSync(file, header + body.replace("%TRIGGER%", ""));
  const untriggered = checkLessons({ root, git: gitFor(true) });
  assert.ok(!untriggered.errors.some((error) => error.includes("stale-anchor")), JSON.stringify(untriggered.errors));
  assert.ok(untriggered.warnings.some((warning) => warning.includes("predates later changes")), JSON.stringify(untriggered.warnings));
  rmSync(root, { recursive: true, force: true });
});

test("a header narrower than a row fails closed", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by |\n|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1 |\n");
  assert.ok(checkLessons({ root }).errors.some((error) => error.includes("widen the header")), JSON.stringify(checkLessons({ root }).errors));
  writeFileSync(file, "| Lesson | Evidence | Enforced by | Occurrences |\n|---|---|---|---|\n| A | probe | `test:state` | 2026-01-01@abcdef1 |\n");
  assert.ok(!checkLessons({ root }).errors.some((error) => error.includes("widen the header")), "a matching header is fine");
  rmSync(root, { recursive: true, force: true });
});

test("a root without a memory page warns instead of a silent skip", () => {
  const root = makeRoot();
  rmSync(join(root, "docs", "research", "workflow-lessons.md"), { force: true });
  const report = checkLessons({ root });
  assert.equal(report.skipped, true);
  assert.ok(report.warnings.some((warning) => warning.includes("memory is not adopted")), JSON.stringify(report.warnings));
  rmSync(root, { recursive: true, force: true });
});

test("lessonUsage counts Recall usage from history and flags never-recalled triggers", () => {
  const root = makeRoot();
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Used | probe | `test:state` | | | path:scripts/x.mjs |\n| Dead | probe | `test:state` | | | path:scripts/y.mjs |\n",
  );
  const commit = (message) => {
    git(["add", "-A"]);
    git(["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
  };
  commit("init");
  writeFileSync(join(root, "scripts", "x.mjs"), "// x2\n");
  commit("feat: touch x\n\nRecall: test:state => scripts/x.mjs");

  const usage = lessonUsage({ root });
  assert.equal(usage.usage.find((entry) => entry.lesson === "Used").recalls, 1);
  assert.ok(usage.neverRecalled.includes("Dead"), JSON.stringify(usage));
  assert.ok(!usage.neverRecalled.includes("Used"));
  rmSync(root, { recursive: true, force: true });
});

test("lessonUsage credits a symbol-triggered lesson", () => {
  const root = makeRoot();
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "x.mjs"), "export const gitSymbol = 1;\n");
  writeFileSync(
    join(root, "docs", "research", "workflow-lessons.md"),
    "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Symbolic | probe | `test:state` | | | symbol:gitSymbol |\n",
  );
  const commit = (message) => {
    git(["add", "-A"]);
    git(["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
  };
  commit("init");
  writeFileSync(join(root, "scripts", "x.mjs"), "export const gitSymbol = 2;\n");
  commit("feat: change gitSymbol\n\nRecall: test:state => scripts/x.mjs");

  const usage = lessonUsage({ root });
  assert.equal(usage.usage.find((entry) => entry.lesson === "Symbolic").recalls, 1, JSON.stringify(usage));
  assert.deepEqual(usage.neverRecalled, []);
  rmSync(root, { recursive: true, force: true });
});

test("memory usage renders text without --json", () => {
  const root = makeRoot();
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Flagged | probe | `test:state` | | | path:scripts/x.mjs |\n");
  git(["add", "-A"]);
  git(["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "init"]);
  const cli = fileURLToPath(new URL("../../scripts/krn-codex.mjs", import.meta.url));
  const result = spawnSync(process.execPath, [cli, "memory", "usage", "--root", root], { encoding: "utf8" });
  assert.ok(!result.stdout.includes("{"), `expected text, got: ${result.stdout}`);
  assert.match(result.stdout, /0\tFlagged/);
  assert.match(result.stdout, /never recalled: 1/);
  rmSync(root, { recursive: true, force: true });
});

test("a triggered lesson that was never recalled warns", () => {
  const root = makeRoot();
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Flagged | probe | `test:state` | | | path:scripts/x.mjs |\n");
  const commit = (message) => {
    git(["add", "-A"]);
    git(["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", message]);
  };
  commit("init");
  assert.ok(checkLessons({ root }).warnings.some((warning) => warning.includes("never been recalled")), "a triggered lesson with no recall warns");
  writeFileSync(join(root, "scripts", "x.mjs"), "// x2\n");
  commit("feat: touch x\n\nRecall: test:state => scripts/x.mjs");
  assert.ok(!checkLessons({ root }).warnings.some((warning) => warning.includes("never been recalled")), "a recalled trigger is quiet");
  rmSync(root, { recursive: true, force: true });
});

test("a Recall in the commit subject counts as usage", () => {
  const root = makeRoot();
  const git = (args) => execFileSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git(["init", "-q"]);
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "scripts", "x.mjs"), "// x\n");
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger |\n|---|---|---|---|---|---|\n| Subject recall | probe | `test:state` | | | path:scripts/x.mjs |\n");
  git(["add", "-A"]);
  git(["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "init"]);
  writeFileSync(join(root, "scripts", "x.mjs"), "// x2\n");
  git(["add", "-A"]);
  git(["-c", "user.email=lab@krn.local", "-c", "user.name=lab", "commit", "-q", "-m", "Recall: test:state => scripts/x.mjs"]);

  const usage = lessonUsage({ root });
  assert.equal(usage.usage.find((entry) => entry.lesson === "Subject recall").recalls, 1, JSON.stringify(usage));
  rmSync(root, { recursive: true, force: true });
});

test("recallBindings binds a recall to a changed target by gate or falsifier", () => {
  const hit = { gate: "`npm run test`", falsifier: "test/greet.test.mjs::greets the supplied name@10aa55c", matched: ["greet.mjs"] };
  assert.deepEqual(recallLines("x\nRecall: npm run test => greet.mjs\ny\nRecall: test/greet.test.mjs => greet.mjs"), ["npm run test => greet.mjs", "test/greet.test.mjs => greet.mjs"]);
  assert.equal(recallBindings({ hit, lines: ["npm run test => greet.mjs"] }).reconstructed, true);
  assert.equal(recallBindings({ hit, lines: ["test/greet.test.mjs => greet.mjs"] }).reconstructed, true);
  const symbolHit = { gate: "`test:state`", falsifier: "", matched: ["gitSymbol", "scripts/x.mjs"] };
  assert.equal(recallBindings({ hit: symbolHit, lines: ["test:state => scripts/x.mjs"] }).reconstructed, true, "the file carrying the symbol satisfies the hit");
  assert.equal(recallBindings({ hit: symbolHit, lines: ["test:state => README.md"] }).reconstructed, false, "an unrelated changed target does not satisfy the matched hit");
  assert.equal(recallBindings({ hit, lines: ["npm run test => other.mjs"] }).reconstructed, false);
  assert.equal(recallBindings({ hit, lines: ["coolnpm run test => greet.mjs"] }).reconstructed, false, "a mid-string 'npm run' is not a gate prefix");
  assert.equal(recallBindings({ hit, lines: ["npm run test"] }).reconstructed, false);
});

test("retirement supersession requires an exact anchor", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
  const active = "| NewGate | probe | `test:state` | | | | |\n";

  writeFileSync(file, `${header}${active}| Old | probe | \`scripts/gone.mjs\` | | | | retired@abcdef0; superseded-by:e |\n`);
  assert.ok(checkLessons({ root }).errors.some((error) => error.includes("resolves to no active row")), "a substring anchor must not resolve");

  writeFileSync(file, `${header}${active}| Old | probe | \`scripts/gone.mjs\` | | | | retired@abcdef0; superseded-by:test:state |\n`);
  assert.ok(!checkLessons({ root }).errors.some((error) => error.includes("resolves to no active row")), "an exact gate anchor resolves");
  rmSync(root, { recursive: true, force: true });
});

test("occurrence tokens must be a date and short commit", () => {
  const root = makeRoot();
  const file = join(root, "docs", "research", "workflow-lessons.md");
  writeFileSync(file, "| Lesson | Evidence | Enforced by | Occurrences | Falsifier |\n|---|---|---|---|---|\n| A | probe | `test:state` | not-a-token |\n");
  assert.equal(parseLessons(file).malformed.length, 1);
  assert.equal(parseLessons(file).rows.length, 0);
  rmSync(root, { recursive: true, force: true });
});

test("a retired row cannot keep an unbackticked live gate", () => {
  const root = makeRoot();
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `${header}| Old | probe | test:state | | | | retired@abcdef0 |\n`);
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("retired with a live gate")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a retired row's prose gate is not mistaken for a live script", () => {
  const root = makeRoot();
  writeFileSync(join(root, "package.json"), '{\n  "scripts": { "validate": "x", "test:state": "x" }\n}\n');
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `${header}| Old | probe | validate the output before shipping | | | | retired@abcdef0 |\n`);
  const report = checkLessons({ root });
  assert.ok(!report.errors.some((error) => error.includes("retired with a live gate")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a retired row cannot keep a bare npm-script name without separators", () => {
  const root = makeRoot();
  const file = join(root, "package.json");
  writeFileSync(file, '{\n  "scripts": { "validate": "x", "test:state": "x" }\n}\n');
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
  writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `${header}| Old | probe | validate | | | | retired@abcdef0 |\n`);
  const report = checkLessons({ root });
  assert.ok(report.errors.some((error) => error.includes("retired with a live gate (validate)")), JSON.stringify(report.errors));
  rmSync(root, { recursive: true, force: true });
});

test("a retired row cannot keep a bare or multi-word gate reference", () => {
  const root = makeRoot();
  const header = "| Lesson | Evidence | Enforced by | Occurrences | Falsifier | Trigger | Status |\n|---|---|---|---|---|---|---|\n";
  for (const gate of ["npm run test:state", "test:state"]) {
    writeFileSync(join(root, "docs", "research", "workflow-lessons.md"), `${header}| Old | probe | ${gate} | | | | retired@abcdef0 |\n`);
    const report = checkLessons({ root });
    assert.ok(report.errors.some((error) => error.includes("retired with a live gate")), `${gate} => ${JSON.stringify(report.errors)}`);
  }
  rmSync(root, { recursive: true, force: true });
});
