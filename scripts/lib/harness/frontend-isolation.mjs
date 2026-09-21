import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256Hex } from "../kernel/digest.mjs";
import { runProcess } from "../kernel/proc.mjs";
import { admitSealedEvaluator, admitV2Task } from "./frontend-contract.mjs";

const MINIMUM_BWRAP = [0, 12, 0];
const ENVIRONMENT_FIELDS = [
  "animationPolicy",
  "browser",
  "colorScheme",
  "container",
  "devicePixelRatio",
  "fontReadiness",
  "fonts",
  "localAssets",
  "locale",
  "os",
  "reducedMotion",
  "runtime",
  "timezone",
];
const PROBE_KEYS = [
  "answerStoreRead",
  "filesystemEscape",
  "inheritedState",
  "network",
  "symlinkEscape",
  "trustedResultWrite",
];

class FrontendIsolationError extends Error {
  constructor(rule, detail) {
    super(`frontend isolation refused: ${rule}${detail ? ` (${detail})` : ""}`);
    this.name = "FrontendIsolationError";
    this.rule = rule;
  }
}

function refuse(rule, detail) {
  throw new FrontendIsolationError(rule, detail);
}

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return sha256Hex(value);
}

const kernelDirectory = fileURLToPath(new URL("../kernel/", import.meta.url));

function kernelMounts(names) {
  return names.map((name) => ({
    source: path.join(kernelDirectory, name),
    destination: `/krn-kernel/${name}`,
  }));
}

function safeChild(root, relative, rule) {
  if (typeof relative !== "string" || !relative.trim() || path.isAbsolute(relative)) refuse(rule, String(relative ?? ""));
  const target = path.resolve(root, relative);
  if (target === root || !target.startsWith(`${root}${path.sep}`)) refuse(rule, relative);
  return target;
}

function existingWithin(root, target, rule, type) {
  let rootReal;
  let targetReal;
  try {
    rootReal = fs.realpathSync(root);
    targetReal = fs.realpathSync(target);
  } catch (error) {
    refuse(rule, error.message);
  }
  if (targetReal === rootReal || !targetReal.startsWith(`${rootReal}${path.sep}`)) refuse(rule, target);
  const stat = fs.statSync(targetReal);
  if (type === "directory" && !stat.isDirectory()) refuse(rule, target);
  if (type === "file" && !stat.isFile()) refuse(rule, target);
  return targetReal;
}

function parseJson(text, rule) {
  try {
    return JSON.parse(text);
  } catch (error) {
    refuse(rule, error.message);
  }
}

function lastJson(text, rule) {
  const line = String(text ?? "").trim().split("\n").filter(Boolean).at(-1);
  if (!line) refuse(rule, "empty output");
  return parseJson(line, rule);
}

function command(value, rule) {
  const parsed = typeof value === "string" ? parseJson(value, rule) : value;
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some((entry) => typeof entry !== "string" || !entry)) {
    refuse(rule, "expected a non-empty JSON string array");
  }
  return parsed;
}

function versionParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) refuse("unsupported-bwrap-version", value);
  return match.slice(1).map(Number);
}

function versionAtLeast(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] > minimum[index]) return true;
    if (actual[index] < minimum[index]) return false;
  }
  return true;
}

function inspectBwrap(binary) {
  if (!binary || !fs.existsSync(binary)) refuse("bwrap-missing", binary || "unset");
  const mode = fs.statSync(binary).mode;
  if ((mode & 0o4000) !== 0) refuse("setuid-bwrap", binary);
  const observed = runProcess(binary, ["--version"]);
  if (!observed.ok) refuse("bwrap-version-failed", observed.err.trim() || String(observed.status));
  const version = observed.out.trim().replace(/^bubblewrap\s+/, "");
  if (!versionAtLeast(versionParts(version), MINIMUM_BWRAP)) refuse("unsupported-bwrap-version", version);
  return { binary, version };
}

function systemMounts() {
  return ["/usr", "/lib", "/lib64"]
    .filter((entry) => fs.existsSync(entry))
    .flatMap((entry) => ["--ro-bind", entry, entry]);
}

function sandboxArgs({ mounts = [], chdir = "/tmp", locale = "C.UTF-8", timezone = "UTC" } = {}) {
  const args = [
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--clearenv",
    "--dev", "/dev",
    "--proc", "/proc",
    ...systemMounts(),
    "--tmpfs", "/tmp",
    "--tmpfs", "/home",
    "--dir", "/home/candidate",
    "--setenv", "HOME", "/home/candidate",
    "--setenv", "PATH", "/usr/bin:/bin",
    "--setenv", "LANG", locale,
    "--setenv", "TZ", timezone,
  ];
  for (const { source, destination, writable = false } of mounts) {
    args.push(writable ? "--bind" : "--ro-bind", source, destination);
  }
  args.push("--chdir", chdir);
  return args;
}

function runSandbox(bwrap, args, executable, input) {
  const outcome = runProcess(bwrap.binary, [...args, "--", ...executable], { input });
  if (outcome.errorCode) refuse("sandbox-spawn-failed", outcome.errorMessage);
  return outcome;
}

const PROBE_SOURCE = String.raw`
import fs from "node:fs";
import net from "node:net";
const deniedRead = (target) => { try { fs.readFileSync(target); return "exposed"; } catch { return "denied"; } };
const deniedWrite = (target) => { try { fs.writeFileSync(target, "probe"); return "exposed"; } catch { return "denied"; } };
const result = {
  answerStoreRead: deniedRead("/oracle/answer.json"),
  environment: { locale: process.env.LANG, timezone: process.env.TZ },
  filesystemEscape: deniedRead("/etc/passwd"),
  inheritedState: process.env.KRN_FRONTEND_HOST_SENTINEL ? "exposed" : "denied",
  symlinkEscape: deniedRead("/workspace/.krn-isolation-link/evaluator.json"),
  trustedResultWrite: deniedWrite("/trusted-result/result.json"),
};
result.network = await new Promise((resolve) => {
  const socket = net.createConnection({ host: "1.1.1.1", port: 53 });
  const finish = (value) => { socket.destroy(); resolve(value); };
  socket.once("connect", () => finish("exposed"));
  socket.once("error", () => finish("denied"));
  socket.setTimeout(250, () => finish("denied"));
});
process.stdout.write(JSON.stringify(result));
`;

function isolationProbe({ bwrap, workspace, sealed, environment }) {
  const link = path.join(workspace, ".krn-isolation-link");
  fs.symlinkSync(sealed, link, "dir");
  try {
    const outcome = runSandbox(bwrap, sandboxArgs({
      ...environment,
      mounts: [{ source: workspace, destination: "/workspace", writable: true }],
      chdir: "/workspace",
    }), ["/usr/bin/node", "--input-type=module", "-e", PROBE_SOURCE]);
    if (!outcome.ok) refuse("isolation-probe-failed", outcome.err.trim() || String(outcome.status));
    const probes = lastJson(outcome.out, "isolation-probe-bad-output");
    for (const key of PROBE_KEYS) {
      if (probes[key] !== "denied") refuse("isolation-probe-exposed", `${key}:${String(probes[key])}`);
    }
    assertEffectiveEnvironment(probes.environment, environment, "isolation-probe-environment-mismatch");
    return probes;
  } finally {
    fs.rmSync(link, { force: true });
  }
}

function treeDigest(root) {
  const records = [];
  function visit(directory) {
    for (const name of fs.readdirSync(directory).sort()) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        records.push(`d\0${relative}\0`);
        visit(absolute);
      } else if (stat.isSymbolicLink()) {
        records.push(`l\0${relative}\0${fs.readlinkSync(absolute)}\0`);
      } else if (stat.isFile()) {
        records.push(`f\0${relative}\0${sha256(fs.readFileSync(absolute))}\0`);
      } else {
        refuse("unsupported-artifact-entry", relative);
      }
    }
  }
  visit(root);
  return `sha256:${sha256(records.join(""))}`;
}

const ENVIRONMENT_PROBE_SOURCE = String.raw`
import fs from "node:fs";
import { sha256Hex } from "/krn-kernel/digest.mjs";
import { runProcess } from "/krn-kernel/proc.mjs";
const request = JSON.parse(fs.readFileSync(0, "utf8"));
const browser = runProcess(request.browser[0], request.browser.slice(1));
if (!browser.ok) process.exit(41);
const fonts = runProcess("fc-list");
if (!fonts.ok) process.exit(42);
const lines = fonts.out.split("\n").filter(Boolean).sort();
const digest = sha256Hex(lines.join("\n") + "\n");
const intl = Intl.DateTimeFormat().resolvedOptions();
process.stdout.write(JSON.stringify({
  browserVersion: browser.out.trim(),
  fonts: { count: lines.length, sha256: digest },
  locale: { environment: process.env.LANG, resolved: intl.locale },
  runtime: { node: process.version },
  timezone: intl.timeZone,
}));
`;

function effectiveEnvironment(task) {
  const locale = typeof task.environment.locale === "string" && task.environment.locale.trim()
    ? task.environment.locale.trim()
    : "C.UTF-8";
  const timezone = typeof task.environment.timezone === "string" && task.environment.timezone.trim()
    ? task.environment.timezone.trim()
    : "UTC";
  return { locale, timezone };
}

function assertEffectiveEnvironment(observed, expected, rule) {
  if (observed?.locale !== expected.locale || observed?.timezone !== expected.timezone) {
    refuse(rule, `${String(observed?.locale)}:${String(observed?.timezone)}`);
  }
}

function measureEnvironment({ bwrap, task, publicSource, environment }) {
  const browserCommand = command(task.environment.browser?.command, "malformed-browser-command");
  const probe = runSandbox(
    bwrap,
    sandboxArgs({ ...environment, mounts: kernelMounts(["digest.mjs", "proc.mjs"]) }),
    ["/usr/bin/node", "--input-type=module", "-e", ENVIRONMENT_PROBE_SOURCE],
    JSON.stringify({ browser: browserCommand }),
  );
  if (!probe.ok) refuse("environment-probe-failed", probe.err.trim() || String(probe.status));
  const observed = lastJson(probe.out, "environment-probe-bad-output");
  const localAssets = (Array.isArray(task.environment.localAssets) ? task.environment.localAssets : []).map((entry) => {
    const file = existingWithin(
      publicSource,
      safeChild(publicSource, entry, "malformed-local-asset-path"),
      "local-asset-outside-public-workspace",
      "file",
    );
    return { path: entry, sha256: sha256(fs.readFileSync(file)) };
  });
  const notApplicable = { status: "not-applicable", reason: "the file observer does not launch a browser capture" };
  const measurement = {
    animationPolicy: notApplicable,
    browser: { command: path.basename(browserCommand[0]), version: observed.browserVersion },
    colorScheme: notApplicable,
    container: { backend: "bubblewrap", version: bwrap.version },
    devicePixelRatio: notApplicable,
    fontReadiness: notApplicable,
    fonts: observed.fonts,
    localAssets,
    locale: observed.locale,
    os: { arch: process.arch, platform: process.platform, release: os.release() },
    reducedMotion: notApplicable,
    runtime: observed.runtime,
    timezone: observed.timezone,
  };
  for (const field of ENVIRONMENT_FIELDS) {
    if (!Object.hasOwn(measurement, field)) refuse("incomplete-environment-measurement", field);
  }
  return { measurement, identity: `sha256:${sha256(canonical(measurement))}` };
}

const FILE_OBSERVER_SOURCE = String.raw`
import fs from "node:fs";
import path from "node:path";
import { sha256Hex } from "/krn-kernel/digest.mjs";
const request = JSON.parse(fs.readFileSync(0, "utf8"));
if (request.kind !== "files" || !Array.isArray(request.files)) process.exit(51);
const root = fs.realpathSync("/artifact");
const files = request.files.map((entry) => {
  if (!entry || typeof entry.path !== "string" || path.isAbsolute(entry.path)) process.exit(52);
  const target = fs.realpathSync(path.resolve(root, entry.path));
  if (target === root || !target.startsWith(root + path.sep) || !fs.statSync(target).isFile()) process.exit(53);
  const bytes = fs.readFileSync(target);
  if (bytes.length > 1024 * 1024) process.exit(54);
  let value;
  if (entry.format === "json") value = JSON.parse(bytes.toString("utf8"));
  else if (entry.format === "text") value = bytes.toString("utf8");
  else process.exit(55);
  return { path: entry.path, format: entry.format, sha256: sha256Hex(bytes), size: bytes.length, value };
});
process.stdout.write(JSON.stringify({
  schema: "krn.frontend-harness.observation.v1",
  environment: { locale: process.env.LANG, timezone: process.env.TZ },
  files,
}));
`;

function observeArtifact({ bwrap, artifact, task, environment }) {
  const request = task.public.observation;
  if (!object(request)) refuse("missing-public-observation", task.id);
  const outcome = runSandbox(
    bwrap,
    sandboxArgs({
      ...environment,
      mounts: [
        { source: artifact, destination: "/artifact" },
        ...kernelMounts(["digest.mjs"]),
      ],
      chdir: "/artifact",
    }),
    ["/usr/bin/node", "--input-type=module", "-e", FILE_OBSERVER_SOURCE],
    JSON.stringify(request),
  );
  if (!outcome.ok) refuse("artifact-observation-failed", outcome.err.trim() || String(outcome.status));
  const observation = lastJson(outcome.out, "artifact-observation-bad-output");
  assertEffectiveEnvironment(observation.environment, environment, "artifact-observation-environment-mismatch");
  return observation;
}

function projectForCandidate(task, payload) {
  return {
    schema: task.schema,
    id: task.id,
    track: task.track,
    prompt: task.prompt,
    public: task.public,
    viewports: task.viewports,
    perturbations: task.perturbations,
    statePaths: task.statePaths,
    axes: task.axes,
    lane: payload.lane ?? null,
    enabled: payload.enabled ?? {},
    mutation: payload.mutation ?? null,
    run: payload.run ?? null,
    runs: payload.runs ?? null,
  };
}

function loadEvaluator(task, sealed) {
  const digest = treeDigest(sealed);
  if (typeof task.evaluator.digest !== "string" || !task.evaluator.digest) refuse("missing-evaluator-digest", task.evaluator.identity);
  if (task.evaluator.digest !== digest) refuse("evaluator-digest-mismatch", `expected ${task.evaluator.digest}, measured ${digest}`);
  const file = path.join(sealed, "evaluator.json");
  if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile()) refuse("evaluator-missing", file);
  const evaluator = admitSealedEvaluator(task, parseJson(fs.readFileSync(file, "utf8"), "evaluator-not-json"));
  return { evaluator, command: command(evaluator.command, "malformed-evaluator-command"), digest };
}

function postHandoffProbe({ bwrap, artifact, environment }) {
  const source = 'import fs from "node:fs"; let access; try { fs.writeFileSync("/artifact/.post-handoff", "bad"); access = "exposed"; } catch { access = "denied"; } process.stdout.write(JSON.stringify({ access, environment: { locale: process.env.LANG, timezone: process.env.TZ } }));';
  const args = sandboxArgs({ ...environment, mounts: [{ source: artifact, destination: "/artifact" }], chdir: "/artifact" });
  const outcome = runSandbox(bwrap, args, ["/usr/bin/node", "--input-type=module", "-e", source]);
  if (!outcome.ok) refuse("post-handoff-mutation-exposed", outcome.err.trim() || String(outcome.status));
  const observed = lastJson(outcome.out, "post-handoff-probe-bad-output");
  if (observed.access !== "denied") refuse("post-handoff-mutation-exposed", String(observed.access));
  assertEffectiveEnvironment(observed.environment, environment, "post-handoff-environment-mismatch");
  return "denied";
}

export function runIsolatedFrontendEvaluation(payload, {
  agent = process.env.KRN_FRONTEND_HARNESS_AGENT,
  bwrapBinary = process.env.KRN_FRONTEND_HARNESS_BWRAP || "/usr/bin/bwrap",
} = {}) {
  const task = admitV2Task(payload?.task);
  const root = path.resolve(payload?.root ?? process.cwd());
  const publicSource = existingWithin(
    root,
    safeChild(root, task.workspace, "public-workspace-outside-root"),
    "public-workspace-outside-root",
    "directory",
  );
  const sealed = existingWithin(
    root,
    safeChild(root, task.evaluator.workspace, "evaluator-workspace-outside-root"),
    "evaluator-workspace-outside-root",
    "directory",
  );
  const bwrap = inspectBwrap(bwrapBinary);
  const environment = effectiveEnvironment(task);
  const candidateCommand = command(agent, "malformed-agent-command");
  const { evaluator, command: evaluatorCommand, digest: evaluatorDigest } = loadEvaluator(task, sealed);
  const disposable = fs.mkdtempSync(path.join(os.tmpdir(), "krn-frontend-isolation-"));
  const candidate = path.join(disposable, "candidate");
  const frozen = path.join(disposable, "frozen");
  try {
    fs.cpSync(publicSource, candidate, { recursive: true, verbatimSymlinks: true });
    const probes = isolationProbe({ bwrap, workspace: candidate, sealed, environment });
    const candidateRun = runSandbox(
      bwrap,
      sandboxArgs({
        ...environment,
        mounts: [{ source: candidate, destination: "/workspace", writable: true }],
        chdir: "/workspace",
      }),
      candidateCommand,
      JSON.stringify(projectForCandidate(task, payload)),
    );
    if (!candidateRun.ok) refuse("candidate-failed", candidateRun.err.trim() || String(candidateRun.status));

    const candidateAtHandoff = treeDigest(candidate);
    fs.cpSync(candidate, frozen, { recursive: true, verbatimSymlinks: true });
    const beforeObservation = treeDigest(frozen);
    const observation = observeArtifact({ bwrap, artifact: frozen, task, environment });
    const measured = measureEnvironment({ bwrap, task, publicSource, environment });
    if (measured.identity !== task.environment.identity) {
      refuse("environment-identity-mismatch", `expected ${task.environment.identity}, measured ${measured.identity}`);
    }
    const evaluatorArgs = sandboxArgs({
      ...environment,
      mounts: [{ source: sealed, destination: "/evaluator" }],
      chdir: "/evaluator",
    });
    const evaluated = runSandbox(
      bwrap,
      evaluatorArgs,
      evaluatorCommand,
      JSON.stringify({ observation, task: { id: task.id, track: task.track, requirements: task.public.requirements } }),
    );
    if (!evaluated.ok) refuse("evaluator-failed", evaluated.err.trim() || String(evaluated.status));
    const observed = lastJson(evaluated.out, "evaluator-bad-output");
    probes.postHandoffMutation = postHandoffProbe({ bwrap, artifact: frozen, environment });
    const afterEvaluation = treeDigest(frozen);
    if (afterEvaluation !== beforeObservation) refuse("frozen-artifact-mutated", `${beforeObservation}:${afterEvaluation}`);
    const candidateAfterEvaluation = treeDigest(candidate);
    if (candidateAfterEvaluation !== candidateAtHandoff) {
      refuse("candidate-descendant-survived", `${candidateAtHandoff}:${candidateAfterEvaluation}`);
    }
    return {
      result: {
        ...observed,
        schema: "krn.frontend-harness.result.v2",
        taskId: task.id,
        track: task.track,
        environmentIdentity: measured.identity,
        evaluatorIdentity: evaluator.identity,
        axes: observed.axes,
        receipt: {
          isolation: {
            backend: `bubblewrap/${bwrap.version}`,
            candidateDescendants: "terminated",
            network: "denied",
            probes,
          },
          artifact: { beforeObservation, afterEvaluation },
          candidate: { atHandoff: candidateAtHandoff, afterEvaluation: candidateAfterEvaluation },
          evaluator: { identity: evaluator.identity, digest: evaluatorDigest },
          environment: measured.measurement,
        },
      },
    };
  } finally {
    fs.rmSync(disposable, { recursive: true, force: true });
  }
}
