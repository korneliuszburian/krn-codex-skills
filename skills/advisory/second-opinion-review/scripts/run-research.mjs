#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  buildResearchPrompt,
  campaignShard,
  jobPathFor,
  loadCampaign,
  ResearchContractError,
  resultPathFor,
  validateResearchResult,
} from "./research-campaign.mjs";
import { verifyPassDirectory } from "./prepare-artifacts.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillDirectory = path.dirname(scriptDirectory);
const researchSchemaPath = path.join(skillDirectory, "references", "research.schema.json");
const deniedSegments = new Set([".agents", ".claude", ".codex", ".git", "secrets"]);
const deniedSuffixes = new Set([".key", ".p12", ".pem"]);

class ResearchRunnerError extends Error {}

function fail(message) {
  throw new ResearchRunnerError(message);
}

function command(commandName, args, cwd) {
  const result = spawnSync(commandName, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    fail(`${commandName} ${args.join(" ")} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function repositoryIdentity(cwd) {
  const root = fs.realpathSync(command("git", ["rev-parse", "--show-toplevel"], cwd));
  if (fs.realpathSync(cwd) !== root) fail(`run research from the repository root: ${root}`);
  const status = command("git", ["status", "--porcelain"], root);
  if (status) fail("research repository must be clean before launch");
  return {
    root,
    commit: command("git", ["rev-parse", "HEAD"], root),
    tree: command("git", ["rev-parse", "HEAD^{tree}"], root),
  };
}

function repositoryFixedPoint(repository) {
  return {
    commit: repository.commit,
    tree: repository.tree,
  };
}

function assertRepositoryUnchanged(expected) {
  const observed = repositoryIdentity(expected.root);
  if (observed.commit !== expected.commit || observed.tree !== expected.tree) {
    fail("research repository changed during the pass");
  }
}

function sha256File(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function assertSafeArtifact(source) {
  const metadata = fs.lstatSync(source.locator);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail(`artifact source must be a regular file, not a symlink: ${source.id}`);
  }
  const resolved = fs.realpathSync(source.locator);
  const segments = resolved.split(path.sep);
  const basename = path.basename(resolved).toLowerCase();
  if (
    segments.some((segment) => deniedSegments.has(segment)) ||
    basename === ".env" ||
    basename.startsWith(".env.") ||
    deniedSuffixes.has(path.extname(basename))
  ) {
    fail(`artifact source uses a denied secret-shaped path: ${source.id}`);
  }
  const digest = sha256File(resolved);
  if (digest !== source.revision) fail(`artifact source hash mismatch: ${source.id}`);
  const parent = fs.realpathSync(path.dirname(resolved));
  const home = fs.realpathSync(os.homedir());
  const protectedDirectories = [
    path.join(home, ".agents"),
    path.join(home, ".claude"),
    path.join(home, ".codex"),
  ];
  if (
    new Set(["/", "/tmp", "/var/tmp", home]).has(parent) ||
    home.startsWith(`${parent}${path.sep}`) ||
    protectedDirectories.some(
      (directory) =>
        parent === directory ||
        parent.startsWith(`${directory}${path.sep}`) ||
        directory.startsWith(`${parent}${path.sep}`),
    )
  ) {
    fail(`artifact source parent is too broad or protected: ${source.id}`);
  }
  return { resolved, digest, parent };
}

function atomicJson(file, value) {
  ensurePrivateDirectory(path.dirname(file));
  const temporary = path.join(
    path.dirname(file),
    `.second-opinion-research-${process.pid}-${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function ensurePrivateDirectory(directory) {
  let metadata = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!metadata) {
    fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
    metadata = fs.lstatSync(directory);
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    fail(`research output directory must be a real directory: ${directory}`);
  }
  fs.chmodSync(directory, 0o700);
}

function numericSetting(value, label, { minimum, maximum }) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) {
    fail(`${label} must be between ${minimum} and ${maximum}`);
  }
  return number;
}

function defaultWindowCheck() {
  const result = spawnSync(
    process.execPath,
    [path.join(scriptDirectory, "check-claude-window.mjs"), "check"],
    { encoding: "utf8" },
  );
  if (result.status !== 0) fail(result.stderr.trim() || "Claude execution window denied");
}

function defaultClaudeInvoker({ args, prompt, cwd, timeoutMs }) {
  return spawnSync("claude", args, {
    cwd,
    encoding: "utf8",
    input: prompt,
    timeout: timeoutMs,
    killSignal: "SIGTERM",
    maxBuffer: 20 * 1024 * 1024,
  });
}

function parseEnvelope(invocation) {
  if (invocation.error) {
    if (invocation.error.code === "ETIMEDOUT") fail("Claude research pass timed out");
    fail(`Claude research invocation failed: ${invocation.error.message}`);
  }
  if (invocation.status !== 0) {
    fail(`Claude research exited ${invocation.status}: ${(invocation.stderr ?? "").trim()}`);
  }
  let envelope;
  try {
    envelope = JSON.parse(invocation.stdout);
  } catch (error) {
    fail(`Claude research returned invalid JSON envelope: ${error.message}`);
  }
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    fail("Claude research envelope must be an object");
  }
  if (envelope.is_error === true) fail("Claude research envelope reports is_error=true");
  if (!envelope.structured_output || typeof envelope.structured_output !== "object") {
    fail("Claude research envelope has no structured_output object");
  }
  return envelope;
}

function loadDependency({ campaignFile, campaign, campaignSha256, shardId, repository }) {
  const file = resultPathFor(campaignFile, shardId);
  if (!fs.existsSync(file)) fail(`missing validated dependency result: ${shardId}`);
  let wrapper;
  try {
    wrapper = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read dependency result ${shardId}: ${error.message}`);
  }
  if (wrapper?.research_version !== "1" || !wrapper.validation || !wrapper.result) {
    fail(`dependency result has invalid wrapper: ${shardId}`);
  }
  if (wrapper.validation.campaign_sha256 !== campaignSha256) {
    fail(`dependency result uses a stale campaign: ${shardId}`);
  }
  if (
    wrapper.validation.repository?.commit !== repository.commit ||
    wrapper.validation.repository?.tree !== repository.tree
  ) {
    fail(`dependency result uses a different repository fixed point: ${shardId}`);
  }
  validateResearchResult(wrapper.result, campaign, shardId);
  return { file, wrapper, sha256: sha256File(file) };
}

function selectedSourceEvidence(campaign, shard, repository, { grantArtifactAccess = true } = {}) {
  const addDirectories = new Set();
  const sourceEvidence = [];
  for (const source of campaign.sources.filter((candidate) =>
    shard.source_ids.includes(candidate.id),
  )) {
    if (source.kind === "repository") {
      if (source.revision !== repository.commit) {
        fail(`repository source revision mismatch: ${source.id}`);
      }
      sourceEvidence.push({
        source_id: source.id,
        kind: source.kind,
        locator: source.locator,
        revision: source.revision,
        observed: repository.commit,
      });
      continue;
    }
    if (source.kind === "artifact") {
      const artifact = assertSafeArtifact(source);
      if (grantArtifactAccess) addDirectories.add(artifact.parent);
      sourceEvidence.push({
        source_id: source.id,
        kind: source.kind,
        locator: artifact.resolved,
        revision: source.revision,
        observed: artifact.digest,
      });
      continue;
    }
    sourceEvidence.push({
      source_id: source.id,
      kind: source.kind,
      locator: source.locator,
      revision: source.revision,
      observed: "declared",
    });
  }
  return { addDirectories, sourceEvidence };
}

function validateSynthesisCoverage(result, dependencies, shard) {
  if (shard.kind !== "synthesis") return;
  const dependencyStatuses = new Map();
  for (const { wrapper } of dependencies) {
    for (const coverage of wrapper.result.source_coverage) {
      const statuses = dependencyStatuses.get(coverage.source_id) ?? new Set();
      statuses.add(coverage.status);
      dependencyStatuses.set(coverage.source_id, statuses);
    }
  }
  for (const coverage of result.source_coverage) {
    const statuses = dependencyStatuses.get(coverage.source_id) ?? new Set();
    if (coverage.status === "used" && !statuses.has("used")) {
      fail(`synthesis cannot promote unavailable source to used: ${coverage.source_id}`);
    }
    if (statuses.size === 1 && statuses.has("unavailable") && coverage.status !== "unavailable") {
      fail(`synthesis must preserve unavailable source status: ${coverage.source_id}`);
    }
  }
}

function readResearchWrapper(file) {
  if (!fs.existsSync(file)) fail(`research result not found: ${file}`);
  let wrapper;
  try {
    wrapper = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read research result ${file}: ${error.message}`);
  }
  if (
    !wrapper ||
    typeof wrapper !== "object" ||
    Array.isArray(wrapper) ||
    Object.keys(wrapper).sort().join(",") !== "research_version,result,validation" ||
    wrapper.research_version !== "1"
  ) {
    fail("research result has an invalid wrapper");
  }
  return wrapper;
}

export function checkResearch({
  campaignPath,
  shardId,
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  const { campaign, file: campaignFile, sha256: campaignSha256 } = loadCampaign(campaignPath);
  const shard = campaignShard(campaign, shardId);
  verifyPassDirectory({
    passDirectory: path.dirname(campaignFile),
    expectedRole: "research",
    env,
  });
  const repository = repositoryIdentity(cwd);
  const outputFile = resultPathFor(campaignFile, shardId);
  const wrapper = readResearchWrapper(outputFile);
  const validation = wrapper.validation;
  if (
    !validation ||
    typeof validation !== "object" ||
    Array.isArray(validation) ||
    Object.keys(validation).sort().join(",") !==
      "campaign_sha256,dependencies,repository,source_evidence"
  ) {
    fail("research result has invalid validation metadata");
  }
  if (validation.campaign_sha256 !== campaignSha256) {
    fail("research result uses a stale campaign");
  }
  if (
    validation.repository?.commit !== repository.commit ||
    validation.repository?.tree !== repository.tree
  ) {
    fail("research result uses a different repository fixed point");
  }
  const { sourceEvidence } = selectedSourceEvidence(campaign, shard, repository, {
    grantArtifactAccess: false,
  });
  if (JSON.stringify(validation.source_evidence) !== JSON.stringify(sourceEvidence)) {
    fail("research source evidence changed since publication");
  }
  const dependencies = shard.depends_on.map((dependencyId) => {
    checkResearch({
      campaignPath: campaignFile,
      shardId: dependencyId,
      cwd: repository.root,
      env,
    });
    const dependency = loadDependency({
      campaignFile,
      campaign,
      campaignSha256,
      shardId: dependencyId,
      repository,
    });
    return dependency;
  });
  const expectedDependencies = dependencies.map((dependency) => ({
    shard_id: dependency.wrapper.result.shard_id,
    sha256: dependency.sha256,
  }));
  if (JSON.stringify(validation.dependencies) !== JSON.stringify(expectedDependencies)) {
    fail("research dependency evidence changed since publication");
  }
  validateResearchResult(wrapper.result, campaign, shardId);
  validateSynthesisCoverage(wrapper.result, dependencies, shard);
  return { outputFile, result: wrapper.result };
}

export function runResearch({
  campaignPath,
  shardId,
  cwd = process.cwd(),
  env = process.env,
  windowCheck = defaultWindowCheck,
  claudeInvoker = defaultClaudeInvoker,
} = {}) {
  const { campaign, file: campaignFile, sha256: campaignSha256 } = loadCampaign(campaignPath);
  const shard = campaignShard(campaign, shardId);
  const passDirectory = path.dirname(campaignFile);
  verifyPassDirectory({ passDirectory, expectedRole: "research", env });
  ensurePrivateDirectory(path.join(passDirectory, "results"));
  ensurePrivateDirectory(path.join(passDirectory, "jobs"));
  const outputFile = resultPathFor(campaignFile, shardId);
  const jobFile = jobPathFor(campaignFile, shardId);
  if (fs.existsSync(outputFile) || fs.lstatSync(outputFile, { throwIfNoEntry: false })?.isSymbolicLink()) {
    fail(`research output already exists: ${outputFile}`);
  }
  if (fs.existsSync(jobFile) || fs.lstatSync(jobFile, { throwIfNoEntry: false })?.isSymbolicLink()) {
    fail(`research job already exists: ${jobFile}`);
  }

  const repository = repositoryIdentity(cwd);
  const dependencies = shard.depends_on.map((dependencyId) => {
    if (!fs.existsSync(resultPathFor(campaignFile, dependencyId))) {
      fail(`missing validated dependency result: ${dependencyId}`);
    }
    checkResearch({
      campaignPath: campaignFile,
      shardId: dependencyId,
      cwd: repository.root,
      env,
    });
    return loadDependency({
      campaignFile,
      campaign,
      campaignSha256,
      shardId: dependencyId,
      repository,
    });
  });
  if (shard.kind === "synthesis") {
    const covered = new Set(
      dependencies.flatMap(({ wrapper }) =>
        wrapper.result.source_coverage.map((coverage) => coverage.source_id),
      ),
    );
    for (const sourceId of shard.source_ids) {
      if (!covered.has(sourceId)) {
        fail(`synthesis source is absent from dependency coverage: ${sourceId}`);
      }
    }
  }

  const { addDirectories, sourceEvidence } = selectedSourceEvidence(
    campaign,
    shard,
    repository,
    { grantArtifactAccess: shard.kind === "research" },
  );
  addDirectories.add(passDirectory);

  const budget = env.SECOND_OPINION_RESEARCH_MAX_BUDGET_USD ?? "8";
  if (budget !== "unlimited") {
    numericSetting(budget, "SECOND_OPINION_RESEARCH_MAX_BUDGET_USD", {
      minimum: 0.01,
      maximum: 100,
    });
  }
  const timeoutSeconds = numericSetting(
    env.SECOND_OPINION_RESEARCH_TIMEOUT_SECONDS ?? "1800",
    "SECOND_OPINION_RESEARCH_TIMEOUT_SECONDS",
    { minimum: 60, maximum: 14400 },
  );
  const effort = env.SECOND_OPINION_RESEARCH_EFFORT ?? "max";
  if (!new Set(["low", "medium", "high", "xhigh", "max"]).has(effort)) {
    fail("SECOND_OPINION_RESEARCH_EFFORT must be low, medium, high, xhigh, or max");
  }
  const model = env.SECOND_OPINION_MODEL ?? "opus";
  windowCheck();

  const startedAt = new Date().toISOString();
  const baseJob = {
    job_version: "1",
    state: "running",
    campaign_id: campaign.campaign_id,
    shard_id: shard.id,
    campaign_sha256: campaignSha256,
    repository: repositoryFixedPoint(repository),
    requested_model: model,
    effort,
    max_budget_usd: budget,
    timeout_seconds: timeoutSeconds,
    result_path: outputFile,
    started_at: startedAt,
    finished_at: null,
    error: null,
  };
  atomicJson(jobFile, baseJob);

  try {
    const schema = fs.readFileSync(researchSchemaPath, "utf8");
    const prompt = buildResearchPrompt({
      campaign,
      shard,
      dependencyPaths: dependencies.map(({ file }) => file),
    });
    const allowedTools =
      shard.kind === "synthesis" ? "Read" : "Read,Glob,Grep,WebFetch";
    const invocationCwd = shard.kind === "synthesis" ? passDirectory : repository.root;
    const args = [
      "--safe-mode",
      "--disable-slash-commands",
      "--system-prompt",
      "You are a source-bounded, read-only research worker. Use only allowed read and web tools. Return structured evidence, not approval.",
      "--print",
      "--permission-mode",
      "dontAsk",
      "--tools",
      allowedTools,
      "--output-format",
      "json",
      "--json-schema",
      schema,
      "--no-session-persistence",
      "--model",
      model,
      "--effort",
      effort,
    ];
    if (budget !== "unlimited") args.push("--max-budget-usd", budget);
    for (const directory of addDirectories) args.push("--add-dir", directory);

    const envelope = parseEnvelope(
      claudeInvoker({
        args,
        prompt,
        cwd: invocationCwd,
        timeoutMs: timeoutSeconds * 1000,
      }),
    );
    // Defense in depth: the harness --max-budget-usd flag is the primary
    // authority; reject a pass that reports over-budget despite the flag.
    if (
      budget !== "unlimited" &&
      typeof envelope.total_cost_usd === "number" &&
      envelope.total_cost_usd > Number(budget)
    ) {
      fail(`research cost ${envelope.total_cost_usd.toFixed(2)} exceeded budget ${budget}`);
    }
    const result = validateResearchResult(envelope.structured_output, campaign, shard.id);
    validateSynthesisCoverage(result, dependencies, shard);

    const currentCampaign = loadCampaign(campaignFile);
    if (currentCampaign.sha256 !== campaignSha256) fail("research campaign changed during the pass");
    assertRepositoryUnchanged(repository);
    for (const evidence of sourceEvidence.filter((item) => item.kind === "artifact")) {
      if (sha256File(evidence.locator) !== evidence.observed) {
        fail(`artifact source changed during the pass: ${evidence.source_id}`);
      }
    }
    const wrapper = {
      research_version: "1",
      validation: {
        campaign_sha256: campaignSha256,
        repository: repositoryFixedPoint(repository),
        source_evidence: sourceEvidence,
        dependencies: dependencies.map((dependency) => ({
          shard_id: dependency.wrapper.result.shard_id,
          sha256: dependency.sha256,
        })),
      },
      result,
    };
    atomicJson(outputFile, wrapper);
    atomicJson(jobFile, {
      ...baseJob,
      state: "complete",
      finished_at: new Date().toISOString(),
      claude: {
        session_id: typeof envelope.session_id === "string" ? envelope.session_id : null,
        total_cost_usd:
          typeof envelope.total_cost_usd === "number" ? envelope.total_cost_usd : null,
        duration_ms: typeof envelope.duration_ms === "number" ? envelope.duration_ms : null,
        num_turns: typeof envelope.num_turns === "number" ? envelope.num_turns : null,
      },
    });
    return { jobFile, outputFile, result };
  } catch (error) {
    atomicJson(jobFile, {
      ...baseJob,
      state: "failed",
      finished_at: new Date().toISOString(),
      error: error.message,
    });
    throw error;
  }
}

function main(argv) {
  if (argv[0] === "check") {
    if (argv.length !== 3) {
      fail("usage: run-research.mjs check <absolute-campaign.json> <shard-id>");
    }
    const outcome = checkResearch({ campaignPath: argv[1], shardId: argv[2] });
    process.stdout.write(`valid current research result: ${outcome.outputFile}\n`);
    return;
  }
  if (argv.length !== 2) {
    fail("usage: run-research.mjs <absolute-campaign.json> <shard-id>\n   or: run-research.mjs check <absolute-campaign.json> <shard-id>");
  }
  const outcome = runResearch({ campaignPath: argv[0], shardId: argv[1] });
  process.stdout.write(`${outcome.outputFile}\n`);
}

function invokedAsMain() {
  if (!process.argv[1]) return false;
  try {
    return (
      fs.realpathSync(process.argv[1]) ===
      fs.realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (invokedAsMain()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    const label =
      error instanceof ResearchContractError || error instanceof ResearchRunnerError
        ? error.message
        : `unexpected failure: ${error.message}`;
    process.stderr.write(`research runner failed: ${label}\n`);
    process.exitCode = 1;
  }
}
