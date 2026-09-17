import { spawnSync } from "node:child_process";

const PROBES = {
  bwrap: () => probeCommand("bwrap", ["--version"]),
  gitChild: () => probeCommand("git", ["--version"]),
};

const REQUIRED = Object.keys(PROBES);

function probeCommand(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 10000 });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

export function hostCapabilities() {
  return Object.fromEntries(
    Object.entries(PROBES).map(([name, probe]) => [name, probe() === true]),
  );
}

function missingCapabilities(capabilities) {
  return REQUIRED.filter((name) => capabilities?.[name] !== true);
}

export function capabilitySkip(capabilities = hostCapabilities()) {
  const missing = missingCapabilities(capabilities);
  return missing.length > 0 ? `not-applicable: ${missing.join(", ")}` : false;
}
