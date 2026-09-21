import path from "node:path";

export const TASK_V2_SCHEMA = "krn.frontend-harness.task.v2";
const EVALUATOR_V2_SCHEMA = "krn.frontend-harness.evaluator.v2";
const RESULT_V2_SCHEMA = "krn.frontend-harness.result.v2";
const V2_TRACKS = ["design-transfer", "source-fidelity"];
const V2_AXES = [
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

const RESULT_STATUSES = new Set(["pass", "fail", "error", "inconclusive"]);
const AGGREGATE_KEYS = new Set(["aggregate", "aggregateScore", "overallScore", "weightedAggregate", "weightedScore", "weights"]);

class HarnessContractError extends Error {
  constructor(rule, detail) {
    super(`harness contract refused: ${rule}${detail ? ` (${detail})` : ""}`);
    this.name = "HarnessContractError";
    this.rule = rule;
  }
}

function refuse(rule, detail) {
  throw new HarnessContractError(rule, detail);
}

const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string" ? value.trim() : "";

function uniqueTexts(values, rule) {
  if (!Array.isArray(values)) refuse(rule, "expected an array");
  const normalized = values.map((value) => text(value));
  if (normalized.some((value) => !value) || new Set(normalized).size !== normalized.length) refuse(rule, "values must be non-empty and unique");
  return normalized;
}

function safeRelative(value, rule) {
  const candidate = text(value).replaceAll("\\", "/");
  if (!candidate || path.posix.isAbsolute(candidate)) refuse(rule, String(value ?? ""));
  const normalized = path.posix.normalize(candidate);
  if (normalized === "." || normalized === ".." || normalized.startsWith("../")) refuse(rule, candidate);
  return normalized.replace(/^\.\//, "");
}

function inside(parent, child) {
  return child === parent || child.startsWith(`${parent}/`);
}

function rejectAggregateAuthority(value) {
  if (!object(value)) return;
  for (const key of Object.keys(value)) {
    if (AGGREGATE_KEYS.has(key)) refuse("weighted-aggregate", key);
  }
}

function namedArray(value, rule) {
  if (!Array.isArray(value)) refuse(rule, "expected an array");
  const ids = new Set();
  return value.map((entry, index) => {
    if (!object(entry) || !text(entry.id)) refuse(rule, `entry ${index + 1} has no id`);
    const id = text(entry.id);
    if (ids.has(id)) refuse(rule, `duplicate ${id}`);
    ids.add(id);
    return structuredClone(entry);
  });
}

export function admitV2Task(payload) {
  if (!object(payload) || payload.schema !== TASK_V2_SCHEMA) refuse("unknown-task-version", String(payload?.schema ?? "missing"));
  rejectAggregateAuthority(payload);
  const id = text(payload.id);
  if (!id) refuse("malformed-task", "missing id");
  const track = text(payload.track);
  if (!V2_TRACKS.includes(track)) refuse("malformed-track", track || "missing");
  if (text(payload.check)) refuse("candidate-visible-check", id);

  if (!object(payload.public)) refuse("missing-public-contract", id);
  const workspace = safeRelative(payload.public.workspace, "malformed-public-workspace");
  const requirements = namedArray(payload.public.requirements, "malformed-public-requirements").map((requirement) => {
    if (!text(requirement.statement)) refuse("malformed-public-requirements", `${requirement.id} has no statement`);
    return { ...requirement, id: text(requirement.id), statement: text(requirement.statement) };
  });
  if (requirements.length === 0) refuse("malformed-public-requirements", "at least one requirement is required");
  const requirementIds = new Set(requirements.map((entry) => entry.id));

  if (!object(payload.evaluator) || !text(payload.evaluator.identity)) refuse("missing-evaluator-identity", id);
  const evaluatorWorkspace = safeRelative(payload.evaluator.workspace, "malformed-evaluator-workspace");
  if (inside(workspace, evaluatorWorkspace)) refuse("evaluator-inside-public-workspace", evaluatorWorkspace);

  if (!object(payload.environment) || !text(payload.environment.identity)) refuse("missing-environment-identity", id);
  const environment = structuredClone(payload.environment);
  environment.identity = text(environment.identity);

  const axes = {};
  const assigned = new Set();
  for (const axis of V2_AXES) {
    const contract = payload.axes?.[axis];
    if (!object(contract) || typeof contract.applicable !== "boolean") refuse("missing-axis-applicability", axis);
    if (contract.applicable) {
      const ids = uniqueTexts(contract.requirementIds, "missing-axis-requirements");
      if (ids.length === 0) refuse("missing-axis-requirements", axis);
      for (const requirementId of ids) {
        if (!requirementIds.has(requirementId)) refuse("axis-hidden-requirement", `${axis}:${requirementId}`);
        assigned.add(requirementId);
      }
      axes[axis] = { ...structuredClone(contract), applicable: true, requirementIds: ids };
    } else {
      const reason = text(contract.reason);
      if (!reason) refuse("unjustified-not-applicable", axis);
      axes[axis] = { ...structuredClone(contract), applicable: false, reason };
    }
  }
  const extraAxes = Object.keys(payload.axes ?? {}).filter((axis) => !V2_AXES.includes(axis));
  if (extraAxes.length > 0) refuse("unknown-axis", extraAxes.join(","));
  for (const requirementId of requirementIds) {
    if (!assigned.has(requirementId)) refuse("public-requirement-without-axis", requirementId);
  }

  const viewports = namedArray(payload.viewports, "malformed-viewports");
  const perturbations = namedArray(payload.perturbations, "malformed-perturbations");
  const statePaths = namedArray(payload.statePaths, "malformed-state-paths");
  const evidence = namedArray(payload.evidence, "malformed-evidence").map((entry) => {
    const axis = text(entry.axis);
    if (!V2_AXES.includes(axis) || !axes[axis].applicable) refuse("evidence-axis-not-applicable", `${entry.id}:${axis}`);
    return { ...entry, axis, path: safeRelative(entry.path, "malformed-evidence-path") };
  });

  return {
    schema: TASK_V2_SCHEMA,
    id,
    track,
    prompt: text(payload.prompt),
    public: { ...structuredClone(payload.public), workspace, requirements },
    workspace,
    evaluator: { ...structuredClone(payload.evaluator), identity: text(payload.evaluator.identity), workspace: evaluatorWorkspace },
    environment,
    viewports,
    perturbations,
    statePaths,
    evidence,
    axes,
  };
}

export function admitSealedEvaluator(task, evaluator) {
  if (task?.schema !== TASK_V2_SCHEMA) refuse("evaluator-requires-v2-task", String(task?.id ?? "task"));
  if (!object(evaluator) || evaluator.schema !== EVALUATOR_V2_SCHEMA) refuse("unknown-evaluator-version", String(evaluator?.schema ?? "missing"));
  if (text(evaluator.taskId) !== task.id) refuse("evaluator-task-mismatch", text(evaluator.taskId));
  const requirements = new Set(task.public.requirements.map((entry) => entry.id));
  const assertions = namedArray(evaluator.assertions, "malformed-assertions").map((assertion) => {
    const requirementId = text(assertion.requirementId);
    const track = text(assertion.track);
    const axis = text(assertion.axis);
    if (!requirements.has(requirementId)) refuse("hidden-requirement", `${assertion.id}:${requirementId}`);
    if (track !== task.track) refuse("assertion-track-mismatch", `${assertion.id}:${track}`);
    if (!V2_AXES.includes(axis) || !task.axes[axis].applicable) refuse("assertion-axis-not-applicable", `${assertion.id}:${axis}`);
    if (!task.axes[axis].requirementIds.includes(requirementId)) refuse("assertion-axis-requirement-mismatch", `${assertion.id}:${axis}:${requirementId}`);
    return { ...assertion, id: text(assertion.id), requirementId, track, axis };
  });
  const covered = new Set(assertions.map((entry) => entry.requirementId));
  for (const requirementId of requirements) {
    if (!covered.has(requirementId)) refuse("requirement-without-assertion", requirementId);
  }
  return { ...structuredClone(evaluator), schema: EVALUATOR_V2_SCHEMA, taskId: task.id, assertions };
}

export function admitV2Result(task, result) {
  if (task?.schema !== TASK_V2_SCHEMA) refuse("result-requires-v2-task", String(task?.id ?? "task"));
  if (!object(result) || result.schema !== RESULT_V2_SCHEMA) refuse("unknown-result-version", String(result?.schema ?? "missing"));
  rejectAggregateAuthority(result);
  if (text(result.taskId) !== task.id) refuse("result-task-mismatch", text(result.taskId));
  if (text(result.track) !== task.track) refuse("result-track-mismatch", text(result.track));
  if (text(result.environmentIdentity) !== task.environment.identity) refuse("result-environment-mismatch", text(result.environmentIdentity));

  const axes = {};
  for (const axis of V2_AXES) {
    const contract = task.axes[axis];
    const observed = result.axes?.[axis];
    if (!object(observed)) refuse("missing-result-axis", axis);
    const status = text(observed.status);
    if (contract.applicable) {
      if (status === "not-applicable") refuse("false-result-applicability", axis);
      if (!RESULT_STATUSES.has(status)) refuse("malformed-axis-status", `${axis}:${status || "missing"}`);
      if (!Object.hasOwn(observed, "measurements") || !Array.isArray(observed.measurements)) refuse("missing-axis-measurements", axis);
      if (!Object.hasOwn(observed, "evidence") || !Array.isArray(observed.evidence)) refuse("missing-axis-evidence", axis);
      axes[axis] = { ...structuredClone(observed), status };
    } else {
      if (status !== "not-applicable") refuse("false-result-applicability", axis);
      const reason = text(observed.reason);
      if (!reason) refuse("unjustified-result-not-applicable", axis);
      axes[axis] = { ...structuredClone(observed), status, reason };
    }
  }
  const extraAxes = Object.keys(result.axes ?? {}).filter((axis) => !V2_AXES.includes(axis));
  if (extraAxes.length > 0) refuse("unknown-result-axis", extraAxes.join(","));
  return {
    ...structuredClone(result),
    schema: RESULT_V2_SCHEMA,
    taskId: task.id,
    track: task.track,
    environmentIdentity: task.environment.identity,
    axes,
  };
}
