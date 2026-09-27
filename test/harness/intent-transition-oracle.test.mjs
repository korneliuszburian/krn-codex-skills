import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const RUNNER = path.join(root, "scripts", "harness", "trajectory-runner.mjs");

async function withWorkspace(run) {
  const dir = mkdtempSync(path.join(tmpdir(), "krn-intent-oracle-"));
  try {
    const workspace = path.join(dir, "workspace");
    mkdirSync(path.join(workspace, "checks"), { recursive: true });
    writeFileSync(path.join(workspace, "api.mjs"), "export const oldThing = 0;\n");
    writeFileSync(path.join(workspace, "checks", "s1.mjs"), [
      'import assert from "node:assert/strict";',
      'import { oldThing } from "../api.mjs";',
      "assert.equal(oldThing, 1);",
    ].join("\n"));
    writeFileSync(path.join(workspace, "checks", "s2.mjs"), [
      'import assert from "node:assert/strict";',
      'import { newThing } from "../api.mjs";',
      "assert.equal(newThing, 2);",
    ].join("\n"));
    const agent = path.join(dir, "agent.mjs");
    writeFileSync(agent, [
      'import fs from "node:fs";',
      'const { step } = JSON.parse(fs.readFileSync(0, "utf8"));',
      'fs.writeFileSync("api.mjs", step === "s1" ? "export const oldThing=1;\\n" : "export const newThing=2;\\n");',
      'process.stdout.write(`${JSON.stringify({ tokens: 7 })}\\n`);',
    ].join("\n"));
    await run({ dir, agent });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function withSemanticWorkspace(kind, run) {
  await withWorkspace(async (fixture) => {
    const workspace = path.join(fixture.dir, "workspace");
    const oldSource = [
      "export const oldThing = 1;",
      "let balance = 0;",
      'export function applyOld(delta, fail = false) { const next = balance + delta; if (fail) throw Error("abort"); balance = next; }',
      "export function snapshotOld() { return { value: balance }; }",
    ].join("\n");
    const mutation = kind === "atomicity"
      ? 'if (fail) { balance = next; throw Error("abort"); } balance = next;'
      : 'if (fail) throw Error("abort"); balance = next;';
    const snapshot = kind === "isolation"
      ? "return { get value() { return balance; } };"
      : "return { value: balance };";
    const newSource = [
      "export const newThing = 2;",
      "let balance = 0;",
      `export function apply(delta, fail = false) { const next = balance + delta; ${mutation} }`,
      `export function snapshot() { ${snapshot} }`,
    ].join("\n");
    const laterSource = newSource.replace(
      'if (fail) throw Error("abort"); balance = next;',
      'if (fail) { balance = next; throw Error("abort"); } balance = next;',
    );
    writeFileSync(path.join(workspace, "checks", "s1.mjs"), [
      'import assert from "node:assert/strict";',
      'import { oldThing, applyOld, snapshotOld } from "../api.mjs";',
      "assert.equal(oldThing, 1);",
      "assert.equal(snapshotOld().value, 0);",
      "assert.throws(() => applyOld(1, true));",
      "assert.equal(snapshotOld().value, 0);",
      "const prior = snapshotOld(); applyOld(2);",
      "assert.equal(snapshotOld().value, 2);",
      "assert.equal(prior.value, 0);",
    ].join("\n"));
    writeFileSync(path.join(workspace, "checks", "mapping.mjs"), [
      'import assert from "node:assert/strict";',
      'import { newThing, apply, snapshot } from "../api.mjs";',
      "assert.equal(newThing, 2);",
      "assert.equal(snapshot().value, 0);",
      "assert.throws(() => apply(1, true));",
      "assert.equal(snapshot().value, 0, 'atomicity must survive the replacement');",
      "const prior = snapshot(); apply(2);",
      "assert.equal(snapshot().value, 2);",
      "assert.equal(prior.value, 0, 'isolation must survive the replacement');",
    ].join("\n"));
    writeFileSync(fixture.agent, [
      'import fs from "node:fs";',
      'const { step } = JSON.parse(fs.readFileSync(0, "utf8"));',
      `fs.writeFileSync("api.mjs", step === "s1" ? ${JSON.stringify(oldSource)} : step === "s3" ? ${JSON.stringify(laterSource)} : ${JSON.stringify(newSource)});`,
      'process.stdout.write(`${JSON.stringify({ tokens: 7 })}\\n`);',
    ].join("\n"));
    await run({ ...fixture, firstPrompt: "Expose oldThing with atomic updates and isolated snapshots." });
  });
}

function evaluate({ dir, agent, firstPrompt }, { prompt, retires, intent, after = [] }) {
  const task = {
    id: "same-code-different-authority",
    workspace: "workspace",
    hidden: ["checks"],
    steps: [
      { id: "s1", prompt: firstPrompt ?? "Establish oldThing=1.", check: "node checks/s1.mjs" },
      { id: "s2", prompt, check: "node checks/s2.mjs", retires, ...(intent ? { intent } : {}) },
      ...after,
    ],
  };
  const result = spawnSync(process.execPath, [RUNNER], {
    cwd: dir,
    encoding: "utf8",
    input: JSON.stringify({ task, root: dir, lane: "vanilla", enabled: {} }),
    env: { ...process.env, KRN_HARNESS_AGENT: `node ${agent}` },
  });
  const report = result.stdout.trim() ? JSON.parse(result.stdout.trim().split("\n").at(-1)) : null;
  return { status: result.status, stderr: result.stderr, report };
}

// The fixture's request is supplied by an independently curated caller. A
// source label here does not authenticate the real user's intent.
const explicitRevoke = {
  source: "user-request-r2",
  mode: "delta",
  scope: ["s1"],
  dispositions: [{ id: "s1", action: "revoke" }],
};

test("a scoped authorized revoke accepts the successor without the old symbol", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Authorized: remove oldThing and introduce newThing.",
      retires: ["s1"],
      intent: explicitRevoke,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.complete, true, JSON.stringify(result.report));
  });
});

test("the identical code with a request preserving the old obligation cannot retire it", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Introduce newThing while oldThing remains required.",
      retires: ["s1"],
      intent: { source: "user-request-r2", mode: "delta", scope: ["s1"], dispositions: [] },
    });
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /retirement-without-authority/);
  });
});

test("an ambiguous retirement without a request stops scoring instead of succeeding", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Introduce newThing; the prior obligation is not mentioned.",
      retires: ["s1"],
    });
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /retirement-without-authority/);
  });
});

test("duplicate obligation identities cannot make retirement authority ambiguous", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Keep both existing obligations.",
      retires: [],
      after: [{ id: "s1", prompt: "Add a separate change under a reused ID.", check: "node checks/s1.mjs" }],
    });
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /duplicate-step-id/);
  });
});

test("a retirement outside the asserted scope stops scoring", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Add newThing while only an unrelated obligation may change.",
      retires: ["s1"],
      intent: { source: "user-request-r2", mode: "delta", scope: ["other"], dispositions: [{ id: "s1", action: "revoke" }] },
    });
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /retirement-without-authority/);
  });
});

test("a malformed retirement list is refused instead of silently filtered", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Introduce newThing while retaining prior obligations.",
      retires: ["s1", null],
      intent: explicitRevoke,
    });
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /retirement-without-authority/);
  });
});

test("a complete-snapshot claim is not interpreted as a delta without an explicit snapshot contract", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Replace the full authority snapshot.",
      retires: ["s1"],
      intent: { ...explicitRevoke, mode: "snapshot" },
    });
    assert.equal(result.status, 2, JSON.stringify(result));
    assert.match(result.stderr, /retirement-without-authority/);
  });
});

test("without a retirement the older obligation still rejects silent loss", async () => {
  await withWorkspace((fixture) => {
    const result = evaluate(fixture, {
      prompt: "Introduce newThing and retain oldThing.",
      retires: [],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.complete, false, JSON.stringify(result.report));
    assert.deepEqual(result.report.lost, ["s1"]);
  });
});

for (const kind of ["gold", "atomicity", "isolation"]) {
  test(`an authorized replacement ${kind === "gold" ? "preserves" : `rejects the ${kind} mutant without erasing`} prior behavior`, async () => {
    await withSemanticWorkspace(kind, (fixture) => {
      const result = evaluate(fixture, {
        prompt: "Authorized: replace oldThing with newThing while preserving atomicity and isolation.",
        retires: ["s1"],
        intent: {
          source: "user-request-r2",
          mode: "delta",
          scope: ["s1"],
          dispositions: [{ id: "s1", action: "replace", mappingCheck: "node checks/mapping.mjs" }],
        },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.report.steps[1].pass, true, JSON.stringify(result.report));
      assert.equal(result.report.complete, kind === "gold", JSON.stringify(result.report));
      assert.deepEqual(result.report.lost, kind === "gold" ? [] : ["s1"]);
    });
  });
}

test("a replacement mapping remains live after a later silent atomicity regression", async () => {
  await withSemanticWorkspace("late", (fixture) => {
    writeFileSync(path.join(fixture.dir, "workspace", "checks", "s3.mjs"), [
      'import assert from "node:assert/strict";',
      'import { newThing } from "../api.mjs";',
      "assert.equal(newThing, 2);",
    ].join("\n"));
    const result = evaluate(fixture, {
      prompt: "Authorized: replace oldThing but preserve atomicity and isolation.",
      retires: ["s1"],
      intent: {
        source: "user-request-r2",
        mode: "delta",
        scope: ["s1"],
        dispositions: [{ id: "s1", action: "replace", mappingCheck: "node checks/mapping.mjs" }],
      },
      after: [{ id: "s3", prompt: "Change internal implementation without breaking atomicity.", check: "node checks/s3.mjs" }],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.steps[2].pass, true, JSON.stringify(result.report));
    assert.equal(result.report.complete, false, JSON.stringify(result.report));
    assert.deepEqual(result.report.lost, ["s1"]);
  });
});

test("a shared dependency may change without retiring an unchanged public obligation", async () => {
  await withWorkspace((fixture) => {
    const workspace = path.join(fixture.dir, "workspace");
    mkdirSync(path.join(workspace, "lib"));
    writeFileSync(path.join(workspace, "checks", "s1.mjs"), [
      'import assert from "node:assert/strict";',
      'import { compute } from "../app.mjs";',
      'assert.equal(typeof compute, "function");',
      "assert.ok(compute() >= 15);",
    ].join("\n"));
    writeFileSync(path.join(workspace, "checks", "s2.mjs"), [
      'import assert from "node:assert/strict";',
      'import { compute } from "../app.mjs";',
      "assert.equal(compute(), 16);",
    ].join("\n"));
    writeFileSync(fixture.agent, [
      'import fs from "node:fs";',
      'const { step } = JSON.parse(fs.readFileSync(0, "utf8"));',
      'fs.writeFileSync("lib/shared.mjs", `export const seed = ${step === "s1" ? 10 : 11};\\n`);',
      'fs.writeFileSync("app.mjs", "import { seed } from \'./lib/shared.mjs\';\\nexport function compute() { return seed + 5; }\\n");',
      'process.stdout.write(`${JSON.stringify({ tokens: 7 })}\\n`);',
    ].join("\n"));
    const result = evaluate({ ...fixture, firstPrompt: "Keep compute() public; allow internal dependency changes." }, {
      prompt: "Update the shared seed without renaming compute().",
      retires: [],
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.complete, true, JSON.stringify(result.report));
    assert.deepEqual(result.report.lost, []);
  });
});

test("an unrelated added file does not invalidate a still-true obligation", async () => {
  await withWorkspace((fixture) => {
    writeFileSync(fixture.agent, [
      'import fs from "node:fs";',
      'const { step } = JSON.parse(fs.readFileSync(0, "utf8"));',
      'fs.writeFileSync("api.mjs", step === "s1" ? "export const oldThing=1;\\n" : "export const oldThing=1;\\nexport const newThing=2;\\n");',
      'if (step === "s2") fs.writeFileSync("notes.txt", "unrelated change\\n");',
      'process.stdout.write(`${JSON.stringify({ tokens: 7 })}\\n`);',
    ].join("\n"));
    const result = evaluate(fixture, { prompt: "Add newThing and an unrelated note.", retires: [] });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.report.complete, true, JSON.stringify(result.report));
    assert.deepEqual(result.report.lost, []);
  });
});
