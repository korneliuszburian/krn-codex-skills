#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const digestPattern = /^[a-f0-9]{64}$/;
const objectIdPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

const campaignKeys = new Set([
  "campaign_version",
  "campaign_id",
  "objective",
  "sources",
  "shards",
  "human_decisions",
  "does_not_prove",
]);
const sourceKeys = new Set([
  "id",
  "kind",
  "locator",
  "revision",
  "authority",
  "purpose",
  "required",
]);
const repositorySourceKeys = new Set([...sourceKeys, "allowed_paths"]);
const shardKeys = new Set([
  "id",
  "kind",
  "objective",
  "source_ids",
  "depends_on",
  "deliverable",
]);
const resultKeys = new Set([
  "result_version",
  "campaign_id",
  "shard_id",
  "status",
  "scope_summary",
  "source_coverage",
  "findings",
  "evidence_gaps",
  "human_decisions",
  "does_not_prove",
]);
const coverageKeys = new Set(["source_id", "status", "evidence_summary"]);
const findingKeys = new Set([
  "id",
  "title",
  "citations",
  "mechanism",
  "conditions_and_traps",
  "implication",
  "candidate_disposition",
  "consumer",
  "example",
  "falsifier",
  "does_not_prove",
]);
const gapKeys = new Set(["what", "requested_proof"]);
const decisionKeys = new Set(["choice", "why_human"]);
const citationKeys = new Set(["source_id", "locator", "detail"]);

export class ResearchContractError extends Error {}

function fail(message) {
  throw new ResearchContractError(message);
}

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function exactKeys(value, allowed, label) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unsupported key: ${key}`);
  }
  for (const key of allowed) {
    if (!(key in value)) fail(`${label} is missing required key: ${key}`);
  }
}

function string(value, label, maxLength = 4000) {
  if (typeof value !== "string" || !value.trim() || value.length > maxLength) {
    fail(`${label} must be a non-empty string no longer than ${maxLength} characters`);
  }
  return value;
}

function identifier(value, label) {
  const result = string(value, label, 80);
  if (!idPattern.test(result)) {
    fail(`${label} must use lowercase letters, digits, and single hyphens`);
  }
  return result;
}

function array(value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function uniqueStrings(value, label, { allowEmpty = false } = {}) {
  const values = array(value, label).map((item, index) =>
    identifier(item, `${label}[${index}]`),
  );
  if (!allowEmpty && values.length === 0) fail(`${label} must not be empty`);
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
  return values;
}

function textList(value, label, { allowEmpty = true } = {}) {
  const values = array(value, label).map((item, index) =>
    string(item, `${label}[${index}]`, 1000),
  );
  if (!allowEmpty && values.length === 0) fail(`${label} must not be empty`);
  return values;
}

function repositoryPaths(value, label) {
  const values = array(value, label).map((item, index) => {
    const repositoryPath = string(item, `${label}[${index}]`, 1000);
    const segments = repositoryPath.split("/");
    if (
      repositoryPath.includes("\\") ||
      /[*?\[\]]/.test(repositoryPath) ||
      path.posix.isAbsolute(repositoryPath) ||
      path.posix.normalize(repositoryPath) !== repositoryPath ||
      segments.some((segment) => !segment || segment === "." || segment === "..")
    ) {
      fail(`${label}[${index}] must be a literal normalized repository-relative path`);
    }
    return repositoryPath;
  });
  if (values.length === 0) fail(`${label} must not be empty`);
  if (values.length > 200) fail(`${label} must contain at most 200 paths`);
  if (new Set(values).size !== values.length) fail(`${label} contains duplicates`);
  return values;
}

export function repositoryPathMatchesAllowed(repositoryPath, allowedPaths) {
  return allowedPaths.some(
    (allowedPath) =>
      repositoryPath === allowedPath || repositoryPath.startsWith(`${allowedPath}/`),
  );
}

function repositoryCitationPath(locator, label) {
  const match = /^(.+):([1-9]\d{0,9})(?:-([1-9]\d{0,9}))?$/.exec(locator);
  if (!match) {
    fail(`${label} for a repository source must use <path>:<line>[-<line>]`);
  }
  const [, repositoryPath, firstLine, lastLine] = match;
  repositoryPaths([repositoryPath], `${label} path`);
  if (lastLine && Number(lastLine) < Number(firstLine)) {
    fail(`${label} line range must not run backwards`);
  }
  return repositoryPath;
}

function parseJson(file, label) {
  let raw;
  try {
    raw = fs.readFileSync(file);
    if (label === "campaign" && raw.length > 256 * 1024) {
      fail("campaign exceeds 262144 bytes");
    }
    return { raw, value: JSON.parse(raw.toString("utf8")) };
  } catch (error) {
    fail(`cannot read ${label} ${file}: ${error.message}`);
  }
}

export function validateCampaign(value) {
  const campaign = object(value, "campaign");
  exactKeys(campaign, campaignKeys, "campaign");
  if (campaign.campaign_version !== "1") fail("campaign_version must be '1'");
  identifier(campaign.campaign_id, "campaign_id");
  string(campaign.objective, "objective", 4000);
  textList(campaign.human_decisions, "human_decisions");
  textList(campaign.does_not_prove, "does_not_prove", { allowEmpty: false });

  const sourceIds = new Set();
  const sources = array(campaign.sources, "sources");
  if (sources.length > 100) fail("sources must contain at most 100 entries");
  for (const [index, rawSource] of sources.entries()) {
    const source = object(rawSource, `sources[${index}]`);
    exactKeys(
      source,
      source.kind === "repository" ? repositorySourceKeys : sourceKeys,
      `sources[${index}]`,
    );
    const sourceId = identifier(source.id, `sources[${index}].id`);
    if (sourceIds.has(sourceId)) fail(`duplicate source id: ${sourceId}`);
    sourceIds.add(sourceId);
    if (!new Set(["repository", "url", "artifact"]).has(source.kind)) {
      fail(`invalid source kind for ${sourceId}: ${source.kind}`);
    }
    const locator = string(source.locator, `sources[${index}].locator`, 4000);
    const revision = string(source.revision, `sources[${index}].revision`, 500);
    if (!new Set(["primary", "practitioner", "local"]).has(source.authority)) {
      fail(`invalid source authority for ${sourceId}: ${source.authority}`);
    }
    string(source.purpose, `sources[${index}].purpose`, 1000);
    if (typeof source.required !== "boolean") {
      fail(`sources[${index}].required must be boolean`);
    }
    if (source.kind === "repository") {
      if (locator !== ".") fail(`repository source ${sourceId} must use locator '.'`);
      if (!objectIdPattern.test(revision)) {
        fail(`repository source ${sourceId} revision must be a full Git object id`);
      }
      repositoryPaths(source.allowed_paths, `sources[${index}].allowed_paths`);
    }
    if (source.kind === "url") {
      let parsed;
      try {
        parsed = new URL(locator);
      } catch {
        fail(`URL source ${sourceId} has an invalid locator`);
      }
      if (parsed.protocol !== "https:") fail(`URL source ${sourceId} must use HTTPS`);
    }
    if (source.kind === "artifact") {
      if (!path.isAbsolute(locator)) fail(`artifact source ${sourceId} must be absolute`);
      if (!digestPattern.test(revision)) {
        fail(`artifact source ${sourceId} revision must be a lowercase SHA-256 digest`);
      }
    }
  }
  if (sourceIds.size === 0) fail("sources must not be empty");

  const shardIds = new Set();
  const shards = array(campaign.shards, "shards");
  if (shards.length > 100) fail("shards must contain at most 100 entries");
  for (const [index, rawShard] of shards.entries()) {
    const shard = object(rawShard, `shards[${index}]`);
    exactKeys(shard, shardKeys, `shards[${index}]`);
    const shardId = identifier(shard.id, `shards[${index}].id`);
    if (shardIds.has(shardId)) fail(`duplicate shard id: ${shardId}`);
    shardIds.add(shardId);
    if (!new Set(["research", "synthesis"]).has(shard.kind)) {
      fail(`invalid shard kind for ${shardId}: ${shard.kind}`);
    }
    string(shard.objective, `shards[${index}].objective`, 4000);
    string(shard.deliverable, `shards[${index}].deliverable`, 1000);
    const shardSources = uniqueStrings(shard.source_ids, `shards[${index}].source_ids`);
    for (const sourceId of shardSources) {
      if (!sourceIds.has(sourceId)) fail(`shard ${shardId} names unknown source: ${sourceId}`);
    }
    const dependencies = uniqueStrings(
      shard.depends_on,
      `shards[${index}].depends_on`,
      { allowEmpty: true },
    );
    if (shard.kind === "research" && dependencies.length > 0) {
      fail(`research shard ${shardId} cannot depend on another shard`);
    }
    if (shard.kind === "synthesis" && dependencies.length === 0) {
      fail(`synthesis shard ${shardId} must depend on at least one research shard`);
    }
  }
  if (shardIds.size === 0) fail("shards must not be empty");

  const shardsById = new Map(campaign.shards.map((shard) => [shard.id, shard]));
  for (const shard of campaign.shards) {
    for (const dependency of shard.depends_on) {
      if (!shardsById.has(dependency)) {
        fail(`shard ${shard.id} names unknown dependency: ${dependency}`);
      }
      if (dependency === shard.id) fail(`shard ${shard.id} cannot depend on itself`);
    }
  }
  const visiting = new Set();
  const visited = new Set();
  function visit(shardId) {
    if (visiting.has(shardId)) fail(`shard dependency cycle includes ${shardId}`);
    if (visited.has(shardId)) return;
    visiting.add(shardId);
    for (const dependency of shardsById.get(shardId).depends_on) visit(dependency);
    visiting.delete(shardId);
    visited.add(shardId);
  }
  for (const shardId of shardIds) visit(shardId);
  return campaign;
}

export function loadCampaign(file) {
  const absolute = path.resolve(file);
  if (!path.isAbsolute(file)) fail("campaign path must be absolute");
  const metadata = fs.lstatSync(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    fail("campaign must be a regular file, not a symlink");
  }
  const { raw, value } = parseJson(absolute, "campaign");
  return {
    campaign: validateCampaign(value),
    file: absolute,
    sha256: createHash("sha256").update(raw).digest("hex"),
  };
}

export function campaignShard(campaign, shardId) {
  const shard = campaign.shards.find((candidate) => candidate.id === shardId);
  if (!shard) fail(`campaign has no shard: ${shardId}`);
  return shard;
}

function pairItems(value, label, keys) {
  for (const [index, rawItem] of array(value, label).entries()) {
    const item = object(rawItem, `${label}[${index}]`);
    exactKeys(item, keys, `${label}[${index}]`);
    for (const key of keys) string(item[key], `${label}[${index}].${key}`, 4000);
  }
}

function locatorUsesDisposableTransport(
  locator,
  forbiddenLocatorRoots,
  forbiddenLocatorSegments,
) {
  const normalizedLocator = locator.replaceAll("\\", "/");
  return (
    forbiddenLocatorRoots.some((root) => {
      const normalizedRoot = path.resolve(root).replaceAll("\\", "/");
      return [normalizedRoot, `file://${normalizedRoot}`].some(
        (prefix) =>
          normalizedLocator === prefix ||
          normalizedLocator.startsWith(`${prefix}/`) ||
          normalizedLocator.startsWith(`${prefix}:`),
      );
    }) ||
    normalizedLocator
      .split("/")
      .some((segment) => forbiddenLocatorSegments.includes(segment))
  );
}

export function validateResearchResult(
  value,
  campaign,
  shardId,
  {
    forbiddenLocatorRoots = [],
    forbiddenLocatorSegments = [],
  } = {},
) {
  const result = object(value, "research result");
  exactKeys(result, resultKeys, "research result");
  if (result.result_version !== "1") fail("result_version must be '1'");
  if (result.campaign_id !== campaign.campaign_id) fail("result campaign_id mismatch");
  if (result.shard_id !== shardId) fail("result shard_id mismatch");
  if (!new Set(["complete", "partial", "blocked"]).has(result.status)) {
    fail(`invalid result status: ${result.status}`);
  }
  string(result.scope_summary, "scope_summary", 500);
  const shard = campaignShard(campaign, shardId);
  const expectedSourceIds = new Set(shard.source_ids);
  const sourcesById = new Map(campaign.sources.map((source) => [source.id, source]));
  const coverageById = new Map();
  for (const [index, rawCoverage] of array(result.source_coverage, "source_coverage").entries()) {
    const coverage = object(rawCoverage, `source_coverage[${index}]`);
    exactKeys(coverage, coverageKeys, `source_coverage[${index}]`);
    const sourceId = identifier(coverage.source_id, `source_coverage[${index}].source_id`);
    if (!expectedSourceIds.has(sourceId)) fail(`coverage names out-of-shard source: ${sourceId}`);
    if (coverageById.has(sourceId)) fail(`duplicate source coverage: ${sourceId}`);
    if (!new Set(["used", "unavailable", "omitted"]).has(coverage.status)) {
      fail(`invalid coverage status for ${sourceId}: ${coverage.status}`);
    }
    string(coverage.evidence_summary, `source_coverage[${index}].evidence_summary`, 2000);
    if (sourcesById.get(sourceId).required && coverage.status === "omitted") {
      fail(`required source cannot be omitted: ${sourceId}`);
    }
    coverageById.set(sourceId, coverage);
  }
  for (const sourceId of expectedSourceIds) {
    if (!coverageById.has(sourceId)) fail(`missing source coverage: ${sourceId}`);
  }

  const findingIds = new Set();
  const findings = array(result.findings, "findings");
  if (findings.length > 100) fail("findings must contain at most 100 entries");
  for (const [index, rawFinding] of findings.entries()) {
    const finding = object(rawFinding, `findings[${index}]`);
    exactKeys(finding, findingKeys, `findings[${index}]`);
    const findingId = identifier(finding.id, `findings[${index}].id`);
    if (findingIds.has(findingId)) fail(`duplicate finding id: ${findingId}`);
    findingIds.add(findingId);
    for (const key of [
      "title",
      "mechanism",
      "conditions_and_traps",
      "implication",
      "consumer",
      "example",
      "falsifier",
      "does_not_prove",
    ]) {
      string(finding[key], `findings[${index}].${key}`, 4000);
    }
    if (
      !new Set(["adopt", "reject", "lab_test", "defer"]).has(
        finding.candidate_disposition,
      )
    ) {
      fail(
        `invalid candidate disposition for ${findingId}: ${finding.candidate_disposition}`,
      );
    }
    const citations = array(finding.citations, `findings[${index}].citations`);
    if (citations.length === 0) fail(`finding ${findingId} must contain citations`);
    if (citations.length > 20) fail(`finding ${findingId} has more than 20 citations`);
    for (const [citationIndex, rawCitation] of citations.entries()) {
      const citation = object(
        rawCitation,
        `findings[${index}].citations[${citationIndex}]`,
      );
      exactKeys(
        citation,
        citationKeys,
        `findings[${index}].citations[${citationIndex}]`,
      );
      const sourceId = identifier(
        citation.source_id,
        `findings[${index}].citations[${citationIndex}].source_id`,
      );
      const locator = string(
        citation.locator,
        `findings[${index}].citations[${citationIndex}].locator`,
        2000,
      );
      if (
        locatorUsesDisposableTransport(
          locator,
          forbiddenLocatorRoots,
          forbiddenLocatorSegments,
        )
      ) {
        fail(`finding ${findingId} cites a disposable research transport path`);
      }
      string(
        citation.detail,
        `findings[${index}].citations[${citationIndex}].detail`,
        2000,
      );
      if (coverageById.get(sourceId)?.status !== "used") {
        fail(`finding ${findingId} cites source not marked used: ${sourceId}`);
      }
      const citedSource = sourcesById.get(sourceId);
      if (citedSource.kind === "repository") {
        const repositoryPath = repositoryCitationPath(
          locator,
          `finding ${findingId} citation`,
        );
        if (!repositoryPathMatchesAllowed(repositoryPath, citedSource.allowed_paths)) {
          fail(
            `finding ${findingId} cites repository path outside source ${sourceId} allowed_paths`,
          );
        }
      }
    }
  }
  pairItems(result.evidence_gaps, "evidence_gaps", gapKeys);
  pairItems(result.human_decisions, "human_decisions", decisionKeys);
  textList(result.does_not_prove, "does_not_prove", { allowEmpty: false });
  return result;
}

export function resultPathFor(campaignFile, shardId) {
  return path.join(path.dirname(campaignFile), "results", `${shardId}.research.json`);
}

export function jobPathFor(campaignFile, shardId) {
  return path.join(path.dirname(campaignFile), "jobs", `${shardId}.job.json`);
}

export function buildResearchPrompt({ campaign, shard, dependencyPaths }) {
  const selectedSources = campaign.sources.filter((source) =>
    shard.source_ids.includes(source.id),
  );
  return `You are the read-only researcher for one bounded shard of a larger campaign.
Use only the named sources and dependency results. Do not edit files, run shell
commands, infer missing source contents, or make product decisions. Return only
schema-compatible structured output. Mark inaccessible sources unavailable and
unsupported conclusions as evidence gaps.

Campaign objective:
${campaign.objective}

Required result identity (copy these values exactly):
- result_version: "1"
- campaign_id: ${JSON.stringify(campaign.campaign_id)}
- shard_id: ${JSON.stringify(shard.id)}
- shard_kind: ${JSON.stringify(shard.kind)}

Generated identifier grammar:
- Every findings[].id must match
  ^[a-z0-9]+(?:-[a-z0-9]+)*$.
- Use lowercase kebab-case only: hyphens, never underscores, spaces, uppercase,
  leading or trailing hyphens, or repeated hyphens.

Campaign human-only decisions:
${JSON.stringify(campaign.human_decisions, null, 2)}

Campaign does-not-prove boundaries:
${JSON.stringify(campaign.does_not_prove, null, 2)}

Shard:
${JSON.stringify(shard, null, 2)}

Declared sources:
${JSON.stringify(selectedSources, null, 2)}

Validated dependency result paths:
${JSON.stringify(dependencyPaths, null, 2)}

Read local bytes only through each source's transport_locator when present.
Never put a disposable transport_locator in the result; keep the canonical
locator, not the transport path, in citations.
A synthesis shard must read only the validated dependency paths above; its
declared source locators are provenance, not permission to reopen raw sources.

For every finding preserve this chain: nearby citations -> mechanism ->
conditions and traps -> local implication -> candidate disposition -> consumer
-> example -> falsifier -> does_not_prove. Citation locators must identify the
specific repository path and line range, URL section, or transcript timestamp
that supports the nearby claim; never paste long source passages. Repository
citations must use <normalized-path>:<line>[-<line>] and stay under
the cited repository source's own allowed_paths. Cover every
shard source exactly once in source_coverage. A required source may be used or
unavailable, never omitted. Candidate dispositions are advisory; the local
owner makes the actual adopt/reject/lab-test/defer decision.
`;
}

function cli(argv) {
  if (argv.length !== 2) fail("usage: research-campaign.mjs validate <campaign.json>");
  const [command, campaignFile] = argv;
  const { campaign } = loadCampaign(campaignFile);
  if (command === "validate") {
    process.stdout.write("valid research campaign\n");
    return;
  }
  fail(`unknown command: ${command}`);
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
    cli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`research validation failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
