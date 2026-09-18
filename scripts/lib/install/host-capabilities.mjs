import { spawnSync } from "node:child_process";

const PROBES = {
  bwrap: () => probeCommand("bwrap", ["--version"]),
  gitChild: () => probeCommand("git", ["--version"]),
};

const ALL_CAPABILITIES = Object.keys(PROBES);

export const FLOW_CAPABILITIES = {
  seal: ["gitChild"],
};

function probeCommand(command, args) {
  try {
    const result = spawnSync(command, args, { encoding: "utf8", timeout: 10000 });
    return !result.error && result.status === 0;
  } catch {
    return false;
  }
}

export function hostCapabilities(probes = PROBES) {
  return Object.fromEntries(
    Object.entries(probes).map(([name, probe]) => [name, probe() === true]),
  );
}

export function missingCapabilities(capabilities, required = ALL_CAPABILITIES) {
  return required.filter((name) => capabilities?.[name] !== true);
}

export function capabilitySkip(capabilities = hostCapabilities(), required = ALL_CAPABILITIES) {
  const missing = missingCapabilities(capabilities, required);
  return missing.length > 0 ? `not-applicable: ${missing.join(", ")}` : false;
}
