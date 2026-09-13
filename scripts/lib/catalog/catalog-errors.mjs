export const HARD_QUARANTINE_FAMILIES = Object.freeze(["superpowers"]);

export class ConfigReconcileError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "ConfigReconcileError";
    this.code = options.code ?? "CONFIG_RECONCILE_ERROR";
    this.target = options.target;
  }
}

export class ConcurrentConfigChangeError extends ConfigReconcileError {
  constructor(message = "Codex config changed after the plan was created") {
    super(message, { code: "CONFIG_CONCURRENT_CHANGE" });
    this.name = "ConcurrentConfigChangeError";
  }
}

export class QuarantineViolationError extends ConfigReconcileError {
  constructor(target) {
    super(`Hard-quarantined capability cannot be enabled: ${target}`, {
      code: "CONFIG_QUARANTINE_VIOLATION",
      target,
    });
    this.name = "QuarantineViolationError";
  }
}
