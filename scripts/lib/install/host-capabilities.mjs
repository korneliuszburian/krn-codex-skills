import { runProcess } from "../kernel/proc.mjs";

const PROBES = {
  bwrap: () => probeCommand("bwrap", ["--version"]),
  gitChild: () => probeCommand("git", ["--version"]),
};

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

export function missingCapabilities(capabilities, required) {
  return required.filter((name) => capabilities?.[name] !== true);
}

export function capabilitySkip(capabilities, required) {
  const missing = missingCapabilities(capabilities, required);
  return missing.length > 0 ? `not-applicable: ${missing.join(", ")}` : false;
}
