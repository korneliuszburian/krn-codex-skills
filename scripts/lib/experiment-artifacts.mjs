import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*-v\d+$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GIT_OBJECT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const STATUS_RANK = new Map([
  ["planned", 0], ["approved", 1], ["running", 2],
  ["executed", 3], ["graded", 4], ["decided", 5], ["abandoned", 5],
]);
const RETENTIONS = new Set(["full", "capsule-only"]);
const EPISTEMIC_STATUSES = new Set([
  "preregistered", "exploratory-backfill", "external-evidence",
]);
const VISIBILITIES = new Set(["reviewer", "coordinator", "raw"]);
const ROLES = new Set([
  "protocol", "schedule", "model-config", "grader-config", "rubric",
  "allocation-commitment", "allocation-reveal", "stopping-rule", "amendment",
  "reviewer-approval", "primary-results", "grades", "telemetry", "summary",
  "decision", "reviewer-verdict", "supporting-evidence",
]);
const FROZEN_INPUT_ROLES = new Set([
  "protocol", "schedule", "model-config", "grader-config", "rubric",
  "allocation-commitment", "stopping-rule",
]);
const GRADED_IMMUTABLE_ROLES = new Set([
  ...FROZEN_INPUT_ROLES, "reviewer-approval", "primary-results", "grades", "telemetry",
]);
const FULL_BASE_ROLES = [
  "protocol", "schedule", "model-config", "grader-config", "rubric",
  "allocation-commitment", "stopping-rule",
];
const REQUIRED_FULL_ROLES = {
  planned: FULL_BASE_ROLES,
  approved: [...FULL_BASE_ROLES, "reviewer-approval"],
  running: [...FULL_BASE_ROLES, "reviewer-approval"],
  executed: [...FULL_BASE_ROLES, "reviewer-approval", "primary-results", "telemetry"],
  graded: [...FULL_BASE_ROLES, "reviewer-approval", "primary-results", "telemetry", "grades"],
  decided: [
    ...FULL_BASE_ROLES, "reviewer-approval", "primary-results", "grades", "telemetry",
    "allocation-reveal", "summary", "decision", "reviewer-verdict",
  ],
  abandoned: ["protocol", "decision", "reviewer-verdict"],
};
const CAPSULE_TERMINAL_ROLES = ["protocol", "summary", "decision", "reviewer-verdict"];
const PHASES = ["preregistration", "execution", "grading", "decision"];
const REQUIRED_PHASES = {
  planned: [], approved: ["preregistration"], running: ["preregistration"],
  executed: ["preregistration", "execution"],
  graded: ["preregistration", "execution", "grading"],
  decided: PHASES, abandoned: [],
};
const FORBIDDEN_PATH = /(?:^|\/)(?:\.env(?:\.|$)|auth\.json$|credentials?(?:\.|$)|id_(?:rsa|ed25519)(?:\.|$)|[^/]+\.(?:pem|key)$|(?:home|codex[-_]?home|runtime(?:[-_]state)?|node_modules|cache|\.cache|\.codex|\.local|\.npm|\.pnpm-store|\.yarn|\.bun|state)(?:\/|$)|[^/]+\.(?:sqlite|db)(?:3)?(?:-(?:wal|shm))?$)/i;
const SECRET_RULES = [
  ["private-key", /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/],
  ["openai-key", /\bsk-[A-Za-z0-9_-]{20,}\b/],
  ["github-token", /\b(?:ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ["aws-access-key", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ["bearer-token", /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/i],
  ["secret-json-value", /"(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)"\s*:\s*"(?!(?:\[?REDACTED\]?|<redacted>)")[^"]{8,}"/i],
];
const MAX_ARTIFACT_BYTES = 5 * 1024 * 1024;
const MAX_EXPERIMENT_BYTES = 50 * 1024 * 1024;

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function safeRelativePath(value) {
  return typeof value === "string" && Boolean(value) && value === value.trim() &&
    !path.isAbsolute(value) && !value.includes("\\") &&
    !value.split("/").includes("..") && value !== "manifest.json";
}

function filesUnder(directory, root = directory, results = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute).split(path.sep).join("/");
    if (entry.isSymbolicLink()) results.push({ absolute, relative, type: "symlink" });
    else if (entry.isDirectory()) filesUnder(absolute, root, results);
    else if (entry.isFile()) {
      results.push({ absolute, relative, type: fs.lstatSync(absolute).nlink > 1 ? "hardlink" : "file" });
    } else results.push({ absolute, relative, type: "special" });
  }
  return results;
}

function parseJson(file, errors, label) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    errors.push(`${label}: invalid JSON (${error.message})`);
    return null;
  }
}

function scanExceptions(manifest, errors, label) {
  const exceptions = new Map();
  for (const [index, exception] of (manifest.content_scan_exceptions ?? []).entries()) {
    const exceptionLabel = `${label}: content_scan_exception ${index + 1}`;
    if (!safeRelativePath(exception?.path)) {
      errors.push(`${exceptionLabel} has unsafe path ${exception?.path}`);
      continue;
    }
    if (!SECRET_RULES.some(([rule]) => rule === exception.rule)) {
      errors.push(`${exceptionLabel} has unsupported rule ${exception.rule}`);
    }
    if (!SHA256_PATTERN.test(exception.artifact_sha256 ?? "")) {
      errors.push(`${exceptionLabel} artifact_sha256 must be 64 lowercase hex characters`);
    }
    for (const field of ["reason", "reviewer"]) {
      if (typeof exception?.[field] !== "string" || !exception[field].trim()) {
        errors.push(`${exceptionLabel} ${field} must be a non-empty string`);
      }
    }
    exceptions.set(`${exception.path}\0${exception.rule}\0${exception.artifact_sha256}`, true);
  }
  return exceptions;
}

function secretFindings(file, relative, exceptions) {
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) return ["binary-content"];
  const content = buffer.toString("utf8");
  const artifactSha = sha256(file);
  return SECRET_RULES.flatMap(([rule, pattern]) => {
    if (!pattern.test(content)) return [];
    return exceptions.has(`${relative}\0${rule}\0${artifactSha}`) ? [] : [rule];
  });
}

function validatePhaseHistory(manifest, errors, label) {
  const history = manifest.phase_history;
  if (!Array.isArray(history)) {
    errors.push(`${label}: phase_history must be an array`);
    return;
  }
  const phases = [];
  for (const [index, record] of history.entries()) {
    const recordLabel = `${label}: phase_history ${index + 1}`;
    if (!PHASES.includes(record?.phase)) {
      errors.push(`${recordLabel} has unsupported phase ${record?.phase}`);
      continue;
    }
    phases.push(record.phase);
    for (const field of ["base_commit", "reviewed_commit"]) {
      if (!GIT_OBJECT_PATTERN.test(record?.[field] ?? "")) {
        errors.push(`${recordLabel} ${field} must be a full Git object id`);
      }
    }
    if (typeof record?.reviewer !== "string" || !record.reviewer.trim()) {
      errors.push(`${recordLabel} reviewer must be a non-empty string`);
    }
    if (!new Set(["approved", "accepted", "changes-requested", "rejected"]).has(record?.verdict)) {
      errors.push(`${recordLabel} has unsupported verdict ${record?.verdict}`);
    }
    if (typeof record?.reviewed_at !== "string" || Number.isNaN(Date.parse(record.reviewed_at))) {
      errors.push(`${recordLabel} reviewed_at must be an ISO timestamp`);
    }
  }
  for (let index = 1; index < phases.length; index += 1) {
    if (PHASES.indexOf(phases[index]) <= PHASES.indexOf(phases[index - 1])) {
      errors.push(`${label}: phase_history must be strictly monotonic`);
      break;
    }
  }
  if (manifest.retention === "full") {
    const required = REQUIRED_PHASES[manifest.status] ?? [];
    const abandonedPrefix = manifest.status === "abandoned" &&
      phases.every((phase, index) => phase === PHASES[index]);
    if (!abandonedPrefix && phases.join(",") !== required.join(",")) {
      errors.push(`${label}: status ${manifest.status} requires phase history ${required.join(",") || "empty"}`);
    }
    for (const record of history) {
      if (["changes-requested", "rejected"].includes(record?.verdict)) {
        errors.push(`${label}: current full phase history cannot end a gate with ${record.verdict}`);
      }
    }
  }
}

function validateOwnership(manifest, errors, label) {
  const ownership = manifest.ownership;
  for (const field of [
    "lifecycle_owner", "decision_owner", "manifest_writer",
    "grading_owner", "reveal_owner", "merge_owner",
  ]) {
    if (typeof ownership?.[field] !== "string" || !ownership[field].trim()) {
      errors.push(`${label}: ownership.${field} must be a non-empty string`);
    }
  }
  if (ownership?.lifecycle_owner !== "delivery-loop") {
    errors.push(`${label}: ownership.lifecycle_owner must be delivery-loop`);
  }
}

function validateManifest(directory, errors, trackedFiles, stagedFiles, repositoryRoot) {
  const id = path.basename(directory);
  const label = `evals/experiments/${id}`;
  const manifestPath = path.join(directory, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    errors.push(`${label}: missing manifest.json`);
    return { artifacts: 0 };
  }
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink > 1) {
    errors.push(`${label}/manifest.json: must be a regular single-link file`);
    return { artifacts: 0 };
  }
  if (trackedFiles && !trackedFiles.has(path.resolve(manifestPath))) {
    errors.push(`${label}/manifest.json: must be tracked or staged in Git`);
  }
  if (stagedFiles && (!stagedFiles.has(path.resolve(manifestPath)) || !gitStagedContentMatches(repositoryRoot, manifestPath))) {
    errors.push(`${label}/manifest.json: working tree bytes differ from staged Git bytes`);
  }
  const manifest = parseJson(manifestPath, errors, `${label}/manifest.json`);
  if (!manifest) return { artifacts: 0 };

  if (manifest.schema_version !== 2) errors.push(`${label}: schema_version must be 2`);
  if (!ID_PATTERN.test(id) || manifest.experiment_id !== id) {
    errors.push(`${label}: directory and experiment_id must match yyyy-mm-dd-slug-vN`);
  }
  if (!STATUS_RANK.has(manifest.status)) errors.push(`${label}: unsupported status ${manifest.status}`);
  if (!RETENTIONS.has(manifest.retention)) errors.push(`${label}: retention must be full or capsule-only`);
  if (!EPISTEMIC_STATUSES.has(manifest.epistemic_status)) {
    errors.push(`${label}: unsupported epistemic_status ${manifest.epistemic_status}`);
  }
  if (manifest.retention === "full" && manifest.epistemic_status !== "preregistered") {
    errors.push(`${label}: full retention requires preregistered epistemic_status`);
  }
  if (manifest.retention === "capsule-only" &&
      (!new Set(["decided", "abandoned"]).has(manifest.status) || manifest.epistemic_status === "preregistered")) {
    errors.push(`${label}: capsule-only must be terminal and explicitly exploratory/external`);
  }
  for (const field of ["owner", "reviewer"]) {
    if (typeof manifest[field] !== "string" || !manifest[field].trim()) {
      errors.push(`${label}: ${field} must be a non-empty string`);
    }
  }
  validateOwnership(manifest, errors, label);
  validatePhaseHistory(manifest, errors, label);
  if (!GIT_OBJECT_PATTERN.test(manifest.target?.base_commit ?? "")) {
    errors.push(`${label}: target.base_commit must be a full Git object id`);
  }
  if (!GIT_OBJECT_PATTERN.test(manifest.target?.head ?? "")) {
    errors.push(`${label}: target.head must be a full Git object id`);
  }
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    errors.push(`${label}: artifacts must be a non-empty array`);
    return { artifacts: 0 };
  }

  if (manifest.retention === "capsule-only" && (!Array.isArray(manifest.omissions) || manifest.omissions.length === 0)) {
    errors.push(`${label}: capsule-only retention requires explicit omissions`);
  }
  if (manifest.retention === "full" && Array.isArray(manifest.omissions) && manifest.omissions.length > 0) {
    errors.push(`${label}: full retention cannot declare omitted artifacts`);
  }
  for (const [index, omission] of (manifest.omissions ?? []).entries()) {
    const omissionLabel = `${label}: omission ${index + 1}`;
    for (const field of ["class", "reason", "reason_code", "source_pointer"]) {
      if (typeof omission?.[field] !== "string" || !omission[field].trim()) {
        errors.push(`${omissionLabel} ${field} must be a non-empty string`);
      }
    }
    if (!Array.isArray(omission?.omitted_roles) || omission.omitted_roles.length === 0) {
      errors.push(`${omissionLabel} omitted_roles must be a non-empty array`);
    }
    if (!Number.isSafeInteger(omission?.omitted_count) || omission.omitted_count < 1) {
      errors.push(`${omissionLabel} omitted_count must be a positive integer`);
    }
    if (!SHA256_PATTERN.test(omission?.aggregate_sha256 ?? "")) {
      errors.push(`${omissionLabel} aggregate_sha256 must be 64 lowercase hex characters`);
    }
  }

  const exceptions = scanExceptions(manifest, errors, label);
  const seenPaths = new Set();
  const roles = new Set();
  let totalBytes = 0;
  for (const [index, artifact] of manifest.artifacts.entries()) {
    const artifactLabel = `${label}: artifact ${index + 1}`;
    if (!safeRelativePath(artifact?.path)) {
      errors.push(`${artifactLabel} has unsafe path ${artifact?.path}`);
      continue;
    }
    if (seenPaths.has(artifact.path)) {
      errors.push(`${label}: duplicate artifact path ${artifact.path}`);
      continue;
    }
    seenPaths.add(artifact.path);
    if (FORBIDDEN_PATH.test(artifact.path)) {
      errors.push(`${label}: forbidden secret/runtime artifact path ${artifact.path}`);
    }
    if (!ROLES.has(artifact.role)) errors.push(`${artifactLabel} has unsupported role ${artifact.role}`);
    else roles.add(artifact.role);
    if (!VISIBILITIES.has(artifact.visibility)) {
      errors.push(`${artifactLabel} has unsupported visibility ${artifact.visibility}`);
    }
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) {
      errors.push(`${artifactLabel} bytes must be a non-negative integer`);
    }
    if (!SHA256_PATTERN.test(artifact.sha256 ?? "")) {
      errors.push(`${artifactLabel} sha256 must be 64 lowercase hex characters`);
    }

    const absolute = path.resolve(directory, artifact.path);
    if (!absolute.startsWith(`${path.resolve(directory)}${path.sep}`)) {
      errors.push(`${artifactLabel} escapes the experiment directory`);
      continue;
    }
    if (!fs.existsSync(absolute)) {
      errors.push(`${label}: missing artifact ${artifact.path}`);
      continue;
    }
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
      errors.push(`${label}: artifact ${artifact.path} must be a regular single-link file`);
      continue;
    }
    if (trackedFiles && !trackedFiles.has(absolute)) {
      errors.push(`${label}: artifact ${artifact.path} must be tracked or staged in Git`);
    }
    if (stagedFiles && (!stagedFiles.has(absolute) || !gitStagedContentMatches(repositoryRoot, absolute))) {
      errors.push(`${label}: working tree bytes differ from staged Git bytes for ${artifact.path}`);
    }
    totalBytes += stat.size;
    if (stat.size !== artifact.bytes) errors.push(`${label}: byte count mismatch for ${artifact.path}`);
    if (stat.size > MAX_ARTIFACT_BYTES) errors.push(`${label}: artifact ${artifact.path} exceeds 5 MiB`);
    if (SHA256_PATTERN.test(artifact.sha256 ?? "") && sha256(absolute) !== artifact.sha256) {
      errors.push(`${label}: SHA-256 mismatch for ${artifact.path}`);
    }
    for (const finding of secretFindings(absolute, artifact.path, exceptions)) {
      errors.push(`${label}: content scan ${finding} in ${artifact.path}`);
    }
  }
  if (totalBytes > MAX_EXPERIMENT_BYTES) errors.push(`${label}: manifested artifacts exceed 50 MiB`);

  const actualEntries = filesUnder(directory).filter(({ relative }) => relative !== "manifest.json");
  for (const entry of actualEntries) {
    if (entry.type !== "file") errors.push(`${label}: ${entry.relative} is a forbidden ${entry.type}`);
    else if (!seenPaths.has(entry.relative)) errors.push(`${label}: unmanifested file ${entry.relative}`);
  }
  for (const artifactPath of seenPaths) {
    if (!actualEntries.some(({ relative, type }) => relative === artifactPath && type === "file")) {
      errors.push(`${label}: manifest path is not a discovered regular file ${artifactPath}`);
    }
  }

  let required = manifest.retention === "capsule-only"
    ? CAPSULE_TERMINAL_ROLES : REQUIRED_FULL_ROLES[manifest.status] ?? [];
  let allowed = new Set(required);
  if (manifest.retention === "full" && manifest.status === "abandoned") {
    const phases = (manifest.phase_history ?? []).map((record) => record.phase);
    allowed = new Set(["protocol", "decision", "reviewer-verdict"]);
    if (phases.includes("preregistration")) allowed.add("schedule");
    if (phases.includes("execution")) {
      for (const role of ["model-config", "grader-config", "rubric", "allocation-commitment", "stopping-rule", "reviewer-approval", "primary-results", "telemetry"]) allowed.add(role);
    }
    if (phases.includes("grading")) allowed.add("grades");
    if (phases.includes("decision")) {
      for (const role of ["allocation-reveal", "summary"]) allowed.add(role);
    }
    if (!phases.includes("grading")) allowed.add("amendment");
    required = [...allowed].filter((role) => role !== "amendment");
  }
  if (manifest.retention === "capsule-only") allowed = new Set([...required, "supporting-evidence"]);
  if (["planned", "approved", "running", "executed"].includes(manifest.status)) allowed.add("amendment");
  for (const role of roles) {
    if (!allowed.has(role)) errors.push(`${label}: role ${role} is not allowed in status ${manifest.status}`);
  }
  for (const role of required) {
    if (!roles.has(role)) errors.push(`${label}: status ${manifest.status} requires role ${role}`);
  }
  if (new Set(["decided", "abandoned"]).has(manifest.status)) {
    if (!new Set(["adopt", "revise", "reject", "defer", "abandoned"]).has(manifest.decision?.disposition)) {
      errors.push(`${label}: terminal status requires a supported decision.disposition`);
    }
    if (typeof manifest.decision?.scope !== "string" || !manifest.decision.scope.trim()) {
      errors.push(`${label}: terminal status requires decision.scope`);
    }
  }
  return { artifacts: manifest.artifacts.length };
}

export function gitTrackedFiles(repositoryRoot, experimentsRoot) {
  const relativeRoot = path.relative(repositoryRoot, experimentsRoot);
  const result = spawnSync("git", ["ls-files", "--cached", "-z", "--", relativeRoot], {
    cwd: repositoryRoot, encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`git ls-files failed: ${result.stderr.trim()}`);
  return new Set(result.stdout.split("\0").filter(Boolean).map((file) => path.resolve(repositoryRoot, file)));
}

export function gitStagedFiles(repositoryRoot, experimentsRoot) {
  return gitTrackedFiles(repositoryRoot, experimentsRoot);
}

export function gitStagedContentMatches(repositoryRoot, file) {
  const relative = path.relative(repositoryRoot, file).split(path.sep).join("/");
  const result = spawnSync("git", ["show", `:${relative}`], {
    cwd: repositoryRoot,
    encoding: null,
  });
  if (result.status !== 0) return false;
  return sha256Buffer(result.stdout) === sha256(file);
}

export function validateExperimentTree(experimentsRoot, { trackedFiles = null, stagedFiles = null, repositoryRoot = null } = {}) {
  const errors = [];
  let experimentCount = 0;
  let artifactCount = 0;
  if (!fs.existsSync(experimentsRoot)) return { errors, experimentCount, artifactCount };
  for (const entry of fs.readdirSync(experimentsRoot, { withFileTypes: true })) {
    if (entry.name === "README.md") continue;
    const absolute = path.join(experimentsRoot, entry.name);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      errors.push(`evals/experiments/${entry.name}: only experiment directories are allowed`);
      continue;
    }
    experimentCount += 1;
    artifactCount += validateManifest(absolute, errors, trackedFiles, stagedFiles, repositoryRoot).artifacts;
  }
  return { errors, experimentCount, artifactCount };
}

function roleHashes(manifest, roles) {
  return new Map(manifest.artifacts
    .filter((artifact) => roles.has(artifact.role))
    .map((artifact) => [`${artifact.role}\0${artifact.path}`, artifact.sha256]));
}

function assertFrozen(previous, next) {
  const previousRank = STATUS_RANK.get(previous.status);
  const nextRank = STATUS_RANK.get(next.status);
  if (nextRank < previousRank) throw new Error(`status cannot move backward from ${previous.status} to ${next.status}`);
  if (new Set(["decided", "abandoned"]).has(previous.status)) {
    throw new Error(`terminal experiment ${previous.status} cannot be resealed`);
  }
  const frozenRoles = previousRank >= STATUS_RANK.get("executed")
    ? GRADED_IMMUTABLE_ROLES
    : previousRank >= STATUS_RANK.get("approved") ? FROZEN_INPUT_ROLES : new Set();
  const before = roleHashes(previous, frozenRoles);
  const after = roleHashes(next, frozenRoles);
  if (JSON.stringify([...before.keys()].sort()) !== JSON.stringify([...after.keys()].sort())) {
    throw new Error("frozen artifact set changed");
  }
  for (const [key, value] of before) {
    if (after.get(key) !== value) throw new Error(`frozen artifact changed: ${key.replace("\0", " ")}`);
  }
  if (previousRank >= STATUS_RANK.get("approved") &&
      JSON.stringify(previous.content_scan_exceptions ?? []) !== JSON.stringify(next.content_scan_exceptions ?? [])) {
    throw new Error("frozen content_scan_exceptions changed");
  }
}

export function sealExperiment(directory, { previousManifest = null, repositoryRoot = null, stagedFiles = null } = {}) {
  const manifestPath = path.join(directory, "manifest.json");
  const manifestStat = fs.lstatSync(manifestPath);
  if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.nlink > 1) {
    throw new Error("manifest.json must be a regular single-link file before seal");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const planned = new Map((manifest.artifacts ?? []).map((artifact) => [artifact.path, artifact]));
  const entries = filesUnder(directory).filter(({ relative }) => relative !== "manifest.json");
  for (const entry of entries) {
    if (entry.type !== "file") throw new Error(`${entry.relative} is a forbidden ${entry.type}`);
    if (!planned.has(entry.relative)) throw new Error(`unmanifested file ${entry.relative}`);
    if (stagedFiles && (!stagedFiles.has(path.resolve(entry.absolute)) || !gitStagedContentMatches(repositoryRoot, entry.absolute))) {
      throw new Error(`working tree bytes differ from staged Git bytes for ${entry.relative}`);
    }
  }
  for (const artifactPath of planned.keys()) {
    if (!entries.some(({ relative }) => relative === artifactPath)) {
      throw new Error(`missing planned artifact ${artifactPath}`);
    }
  }
  const exceptionErrors = [];
  const exceptions = scanExceptions(manifest, exceptionErrors, `evals/experiments/${path.basename(directory)}`);
  if (exceptionErrors.length) throw new Error(exceptionErrors.join("; "));
  manifest.artifacts = [...planned.values()].map((artifact) => {
    const file = path.join(directory, artifact.path);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
      throw new Error(`${artifact.path} must be a regular single-link file`);
    }
    const findings = secretFindings(file, artifact.path, exceptions);
    if (findings.length) throw new Error(`content scan ${findings.join(",")} in ${artifact.path}`);
    return { ...artifact, bytes: stat.size, sha256: sha256(file) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (previousManifest) assertFrozen(previousManifest, manifest);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  return { artifacts: manifest.artifacts.length, manifestSha256: sha256(manifestPath) };
}
