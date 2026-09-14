export const AUTHORIZED_FAMILIES = Object.freeze([
  Object.freeze({ family: "deepseek", transport: "opencode", model: "opencode-go/deepseek-v4.1-flash" }),
  Object.freeze({ family: "luna", transport: "codex", model: "gpt-5.6-luna" }),
]);

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
  if (!isolation || isolation.ok !== true) errors.push("isolation evidence missing ok=true");
  if (isolation?.sentinel_leak !== false) errors.push("isolation sentinel_leak must be false");
  if (isolation?.model_mismatch !== false) errors.push("isolation model_mismatch must be false");
  return errors;
};

export const isAdmissible = (record) => admissibilityErrors(record).length === 0;
