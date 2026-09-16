import fs from "node:fs";

const TRANSIENT_CODES = new Set(["EBUSY", "EMFILE", "ENFILE", "ENOTEMPTY", "EPERM"]);

export function removeTree(target, {
  remover = fs.rmSync,
  maxRetries = 10,
  retryDelay = 50,
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return remover(target, { recursive: true, force: true, maxRetries, retryDelay });
    } catch (error) {
      if (attempt >= maxRetries || !TRANSIENT_CODES.has(error?.code)) throw error;
    }
  }
}
