export const EXIT_CODES = Object.freeze({ USAGE: 64, SOURCE: 65, CORRUPT: 66, COLLISION: 73 });

export function toLine(value) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return [value.rule, value.detail].filter(Boolean).join(": ") || "unknown";
  return String(value);
}

export function renderDiagnostics(report = {}) {
  return {
    errors: (report.errors ?? []).map(toLine),
    warnings: (report.warnings ?? []).map(toLine),
  };
}

export function fail(message, code = 1) {
  const error = new Error(message);
  error.exitCode = code;
  throw error;
}
