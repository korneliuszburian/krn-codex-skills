export const AUTHORIZED_FAMILIES = Object.freeze([
  Object.freeze({ family: "deepseek", transport: "opencode", model: "deepseek-v4.1-flash" }),
  Object.freeze({ family: "luna", transport: "codex", model: "gpt-5.6-luna" }),
]);

const PROVIDER_TRANSPORT = Object.freeze({ "opencode-go": "opencode", codex: "codex" });

export const transportFromProvider = (provider) =>
  PROVIDER_TRANSPORT[typeof provider === "string" ? provider.trim() : ""] ?? "";

export const parseServedLine = (line) => {
  const text = typeof line === "string" ? line : "";
  const provider = /providerID=(\S+)/.exec(text)?.[1] ?? "";
  const served_model = /modelID=(\S+)/.exec(text)?.[1] ?? "";
  return { transport: transportFromProvider(provider), provider, served_model };
};

export const parseServedModel = (line) => parseServedLine(line).served_model;

export const normalizeFlag = (value) => {
  if (value === true || value === false) return value;
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (text === "no" || text === "false") return false;
  if (text === "yes" || text === "true") return true;
  return undefined;
};

export const recordFromRun = ({ line, designation, isolation } = {}) => {
  const parsed = parseServedLine(line);
  return { transport: parsed.transport, provider: parsed.provider, served_model: parsed.served_model, designation, isolation };
};

const authorized = (record) => {
  const transport = typeof record?.transport === "string" ? record.transport.trim() : "";
  const model = typeof record?.served_model === "string" ? record.served_model.trim() : "";
  return AUTHORIZED_FAMILIES.find((entry) => entry.transport === transport && entry.model === model) ?? null;
};

export const familyOf = (record) => authorized(record)?.family ?? null;

export const admissibilityErrors = (record) => {
  if (!record || typeof record !== "object") return ["record is not an object"];
  const errors = [];
  const transport = typeof record.transport === "string" ? record.transport.trim() : "";
  const model = typeof record.served_model === "string" ? record.served_model.trim() : "";
  if (!transport) errors.push("missing transport");
  if (!model) errors.push("missing served_model");
  if (transport && model && !authorized(record)) errors.push(`unauthorized family/transport: ${transport}/${model}`);
  if (record.designation !== "calibration" && record.designation !== "confirmation") {
    errors.push("designation must be calibration or confirmation");
  }
  const isolation = record.isolation;
  if (normalizeFlag(isolation?.ok) !== true) errors.push("isolation evidence missing ok=true");
  if (normalizeFlag(isolation?.sentinel_leak) !== false) errors.push("isolation sentinel_leak must be false");
  if (normalizeFlag(isolation?.model_mismatch) !== false) errors.push("isolation model_mismatch must be false");
  return errors;
};

export const isAdmissible = (record) => admissibilityErrors(record).length === 0;

export const partitionAdmissible = (records) => {
  const admissible = [];
  const rejected = [];
  for (const record of Array.isArray(records) ? records : []) {
    const errors = admissibilityErrors(record);
    if (errors.length === 0) admissible.push(record);
    else rejected.push({ record, errors });
  }
  return { admissible, rejected };
};
