import { runProcess } from "../kernel/proc.mjs";

const PROBES = {
  bwrap: () => probeCommand("bwrap", ["--version"]),
  gitChild: () => probeCommand("git", ["--version"]),
};

const ALL_CAPABILITIES = Object.keys(PROBES);

export const FLOW_CAPABILITIES = {
  seal: ["gitChild"],
};

function probeCommand(command, args) {
  return runProcess(command, args, { timeout: 10000 }).ok;
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
