import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, rmSync, writeFileSync } from "node:fs";
import { release, tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const repository = path.resolve(import.meta.dirname, "../..");
const cli = path.join(repository, "scripts", "krn.mjs");
const runner = path.join(repository, "scripts", "harness", "frontend-runner.mjs");
const commandPath = (name) => spawnSync("bash", ["-lc", `command -v ${name}`], { encoding: "utf8" }).stdout.trim();
const bwrap = commandPath("bwrap");
const chromium = commandPath("chromium");
const fontconfig = commandPath("fc-list");
const bwrapVersion = bwrap
  ? spawnSync(bwrap, ["--version"], { encoding: "utf8" }).stdout.trim().replace(/^bubblewrap\s+/, "")
  : "";
const browserVersion = chromium ? spawnSync(chromium, ["--version"], { encoding: "utf8" }).stdout.trim() : "";
const sandboxNodeVersion = spawnSync("/usr/bin/node", ["--version"], { encoding: "utf8" }).stdout.trim();
const fontLines = fontconfig
  ? spawnSync(fontconfig, [], { encoding: "utf8" }).stdout.split("\n").filter(Boolean).sort()
  : [];
const guard = bwrap && bwrapVersion && chromium && browserVersion && fontconfig && fontLines.length > 0
  ? false
  : "bubblewrap, chromium, or fontconfig unavailable";

const AXES = [
  "execution",
  "behavior",
  "accessibility",
  "responsive",
  "geometry",
  "visual",
  "architecture",
  "efficiency",
  "provenance",
];
const CANDIDATE_SOURCE = [
  'import { spawn } from "node:child_process";',
  'import { readFileSync, writeFileSync } from "node:fs";',
  'const input = JSON.parse(readFileSync(0, "utf8"));',
  'if (Object.hasOwn(input, "evaluator") || Object.hasOwn(input, "environment")) process.exit(23);',
  'writeFileSync("candidate-input.json", JSON.stringify(input));',
  'writeFileSync("execution-environment.json", JSON.stringify({ locale: process.env.LANG, timezone: process.env.TZ }));',
  'writeFileSync("solution.txt", "candidate output\\n");',
  'spawn("/usr/bin/node", ["-e", "setTimeout(() => require(\\\"node:fs\\\").writeFileSync(\\\"/workspace/.late-descendant\\\", \\\"survived\\\"), 300)"], { detached: true, stdio: "ignore" }).unref();',
  'process.stdout.write(JSON.stringify({ tokens: 7 }) + "\\n");',
  "",
].join("\n");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function identity(measurement) {
  return `sha256:${digest(canonical(measurement))}`;
}

function treeIdentity(root) {
  const records = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = lstatSync(absolute);
      if (stat.isDirectory()) {
        records.push(`d\0${relative}\0`);
        visit(absolute);
      } else if (stat.isSymbolicLink()) {
        records.push(`l\0${relative}\0${readlinkSync(absolute)}\0`);
      } else {
        records.push(`f\0${relative}\0${digest(readFileSync(absolute))}\0`);
      }
    }
  };
  visit(root);
  return `sha256:${digest(records.join(""))}`;
}

function measuredEnvironment({ locale = "C.UTF-8", timezone = "UTC" } = {}) {
  const notApplicable = { status: "not-applicable", reason: "the file observer does not launch a browser capture" };
  const intl = JSON.parse(spawnSync("/usr/bin/node", [
    "-e",
    "process.stdout.write(JSON.stringify(Intl.DateTimeFormat().resolvedOptions()))",
  ], { encoding: "utf8", env: { PATH: "/usr/bin:/bin", LANG: locale, TZ: timezone } }).stdout);
  return {
    animationPolicy: notApplicable,
    browser: { command: path.basename(chromium), version: browserVersion },
    colorScheme: notApplicable,
    container: { backend: "bubblewrap", version: bwrapVersion },
    devicePixelRatio: notApplicable,
    fontReadiness: notApplicable,
    fonts: { count: fontLines.length, sha256: digest(`${fontLines.join("\n")}\n`) },
    localAssets: [{ path: "candidate.mjs", sha256: digest(CANDIDATE_SOURCE) }],
    locale: { environment: locale, resolved: intl.locale },
    os: { arch: process.arch, platform: process.platform, release: release() },
    reducedMotion: notApplicable,
    runtime: { node: sandboxNodeVersion },
    timezone: intl.timeZone,
  };
}

function axes() {
  return Object.fromEntries(AXES.map((axis) => [axis, axis === "execution" || axis === "architecture"
    ? { applicable: true, requirementIds: [axis === "execution" ? "REQ-EXEC" : "REQ-CUBE"] }
    : { applicable: false, reason: `${axis} is outside the isolation fixture` }]));
}

function resultAxes() {
  return Object.fromEntries(AXES.map((axis) => [axis, axis === "execution" || axis === "architecture"
    ? { status: "pass", measurements: [{ id: `${axis}-check`, value: 1 }], evidence: [] }
    : { status: "not-applicable", reason: `${axis} is outside the isolation fixture` }]));
}

function taskSource(payload) {
  return `# Isolated frontend task\n\n\`\`\`krn-harness-task\n${JSON.stringify(payload)}\n\`\`\`\n`;
}

function makeFixture({
  runtimeLocale = "C.UTF-8",
  expectedLocale = "C.UTF-8",
  runtimeTimezone = "UTC",
  expectedTimezone = "UTC",
} = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "krn-frontend-runner-"));
  const publicWorkspace = path.join(root, "fixtures", "public");
  const sealedWorkspace = path.join(root, "fixtures", "sealed");
  mkdirSync(publicWorkspace, { recursive: true });
  mkdirSync(sealedWorkspace, { recursive: true });
  writeFileSync(path.join(publicWorkspace, "candidate.mjs"), CANDIDATE_SOURCE);

  writeFileSync(path.join(sealedWorkspace, "evaluate.mjs"), [
    'import { spawnSync } from "node:child_process";',
    'import { readFileSync } from "node:fs";',
    'const request = JSON.parse(readFileSync(0, "utf8"));',
    'const files = Object.fromEntries(request.observation.files.map((entry) => [entry.path, entry]));',
    'const candidate = files["candidate-input.json"].value;',
    'const executionEnvironment = files["execution-environment.json"].value;',
    'if (candidate.evaluator || candidate.environment) process.exit(31);',
    'if (files["solution.txt"].value !== "candidate output\\n") process.exit(32);',
    `if (executionEnvironment.locale !== ${JSON.stringify(runtimeLocale)} || executionEnvironment.timezone !== ${JSON.stringify(runtimeTimezone)}) { process.stderr.write("candidate-effective-environment-mismatch"); process.exit(34); }`,
    `if (process.env.LANG !== ${JSON.stringify(runtimeLocale)} || process.env.TZ !== ${JSON.stringify(runtimeTimezone)}) { process.stderr.write("evaluator-effective-environment-mismatch"); process.exit(35); }`,
    'const escape = spawnSync("node", ["/artifact/candidate.mjs"], { encoding: "utf8" });',
    'if (escape.status === 0) process.exit(33);',
    `process.stdout.write(JSON.stringify({ axes: ${JSON.stringify(resultAxes())} }) + "\\n");`,
    "",
  ].join("\n"));
  writeFileSync(path.join(sealedWorkspace, "evaluator.json"), `${JSON.stringify({
    schema: "krn.frontend-harness.evaluator.v2",
    taskId: "isolated-card",
    identity: "isolated-card-evaluator-v1",
    command: ["node", "evaluate.mjs"],
    assertions: [
      { id: "ASSERT-EXEC", requirementId: "REQ-EXEC", track: "design-transfer", axis: "execution" },
      { id: "ASSERT-CUBE", requirementId: "REQ-CUBE", track: "design-transfer", axis: "architecture" },
    ],
  }, null, 2)}\n`);

  const task = {
    schema: "krn.frontend-harness.task.v2",
    id: "isolated-card",
    track: "design-transfer",
    prompt: "Build the public card fixture.",
    public: {
      workspace: "fixtures/public",
      requirements: [
        { id: "REQ-EXEC", statement: "The candidate produces the requested artifact." },
        { id: "REQ-CUBE", statement: "The artifact follows the public CUBE contract." },
      ],
      observation: {
        kind: "files",
        files: [
          { path: "candidate-input.json", format: "json" },
          { path: "execution-environment.json", format: "json" },
          { path: "solution.txt", format: "text" },
        ],
      },
    },
    evaluator: {
      identity: "isolated-card-evaluator-v1",
      workspace: "fixtures/sealed",
      digest: treeIdentity(sealedWorkspace),
    },
    environment: {
      identity: identity(measuredEnvironment({ locale: expectedLocale, timezone: expectedTimezone })),
      locale: runtimeLocale,
      timezone: runtimeTimezone,
      browser: { command: [chromium, "--version"] },
      localAssets: ["candidate.mjs"],
    },
    viewports: [],
    perturbations: [],
    statePaths: [],
    evidence: [],
    axes: axes(),
  };
  const taskFile = path.join(root, "task.md");
  writeFileSync(taskFile, taskSource(task));
  return { root, taskFile, sealedWorkspace };
}

function observerDriftBwrap(root) {
  const wrapper = path.join(root, "bwrap-observer-drift.mjs");
  writeFileSync(wrapper, [
    "#!/usr/bin/node",
    'import { spawnSync } from "node:child_process";',
    "const args = process.argv.slice(2);",
    'if (args.some((value) => value.includes("krn.frontend-harness.observation.v1"))) {',
    '  for (let index = 0; index < args.length - 2; index += 1) {',
    '    if (args[index] === "--setenv" && args[index + 1] === "TZ") args[index + 2] = "UTC";',
    "  }",
    "}",
    `const outcome = spawnSync(${JSON.stringify(bwrap)}, args, { stdio: "inherit" });`,
    "process.exit(outcome.status ?? 1);",
    "",
  ].join("\n"));
  chmodSync(wrapper, 0o755);
  return wrapper;
}

function invoke({ root, taskFile }, { bwrapBinary = bwrap } = {}) {
  return spawnSync(process.execPath, [
    cli,
    "harness",
    "compare",
    "--task",
    taskFile,
    "--lanes",
    "vanilla,full",
    "--runs",
    "1",
    "--root",
    root,
    "--json",
  ], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      KRN_HARNESS_LANE_RUNNER: runner,
      KRN_FRONTEND_HARNESS_AGENT: JSON.stringify(["node", "candidate.mjs"]),
      KRN_FRONTEND_HARNESS_BWRAP: bwrapBinary,
      KRN_FRONTEND_HOST_SENTINEL: "must-not-cross-clearenv",
    },
  });
}

test("v2 crosses artifact-only observation into sealed offline evaluation", { skip: guard }, () => {
  const fixture = makeFixture();
  try {
    const run = invoke(fixture);
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    assert.equal(report.schema, "krn.harness.compare.v2");
    assert.equal(report.lanes.length, 2);
    for (const lane of report.lanes) {
      const result = lane.results[0];
      assert.equal(result.evaluatorIdentity, "isolated-card-evaluator-v1");
      assert.equal(result.environmentIdentity, identity(measuredEnvironment()));
      assert.equal(result.axes.execution.status, "pass");
      assert.deepEqual(result.receipt.isolation.probes, {
        answerStoreRead: "denied",
        environment: { locale: "C.UTF-8", timezone: "UTC" },
        filesystemEscape: "denied",
        inheritedState: "denied",
        network: "denied",
        postHandoffMutation: "denied",
        symlinkEscape: "denied",
        trustedResultWrite: "denied",
      });
      assert.equal(result.receipt.isolation.backend, `bubblewrap/${bwrapVersion}`);
      assert.equal(result.receipt.isolation.network, "denied");
      assert.equal(result.receipt.isolation.candidateDescendants, "terminated");
      assert.equal(result.receipt.evaluator.digest, treeIdentity(fixture.sealedWorkspace));
      assert.equal(result.receipt.artifact.beforeObservation, result.receipt.artifact.afterEvaluation);
      assert.equal(result.receipt.candidate.atHandoff, result.receipt.candidate.afterEvaluation);
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a sealed evaluator byte change is rejected under the selected identity", { skip: guard }, () => {
  const fixture = makeFixture();
  try {
    const evaluator = path.join(fixture.sealedWorkspace, "evaluate.mjs");
    writeFileSync(evaluator, `${readFileSync(evaluator, "utf8")}\n// substituted\n`);
    const run = invoke(fixture);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /evaluator-digest-mismatch/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("a real sandbox locale change invalidates the declared environment identity", { skip: guard }, () => {
  const fixture = makeFixture({ runtimeLocale: "en_US.UTF-8", expectedLocale: "C.UTF-8" });
  try {
    const run = invoke(fixture);
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /environment-identity-mismatch/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("candidate and evaluator use the non-default measured environment", { skip: guard }, () => {
  const fixture = makeFixture({
    runtimeLocale: "C",
    expectedLocale: "C",
    runtimeTimezone: "Europe/Warsaw",
    expectedTimezone: "Europe/Warsaw",
  });
  try {
    const run = invoke(fixture);
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout);
    for (const lane of report.lanes) {
      assert.deepEqual(lane.results[0].receipt.isolation.probes.environment, {
        locale: "C",
        timezone: "Europe/Warsaw",
      });
    }
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});

test("observer environment drift is refused at the stage boundary", { skip: guard }, () => {
  const fixture = makeFixture({
    runtimeLocale: "C",
    expectedLocale: "C",
    runtimeTimezone: "Europe/Warsaw",
    expectedTimezone: "Europe/Warsaw",
  });
  try {
    const run = invoke(fixture, { bwrapBinary: observerDriftBwrap(fixture.root) });
    assert.notEqual(run.status, 0);
    assert.match(run.stderr, /artifact-observation-environment-mismatch/);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
