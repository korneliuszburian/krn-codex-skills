import { spawnSync } from "node:child_process";

// One owner for running a child process and normalizing its outcome: exit
// status, signal, captured output, and the spawn error. Callers that need a
// different stream policy pass one; the two CLI shims use `spawnInherit` so the
// child owns the terminal.
export function runProcess(command, args = [], {
  cwd,
  env,
  input,
  timeout = 600_000,
  encoding = "utf8",
  maxBuffer = 512 * 1024 * 1024,
  stdio,
  killSignal = "SIGKILL",
} = {}) {
  // A supplied `input` needs a writable stdin; otherwise stdin is closed so a
  // child can never block waiting on the terminal.
  const streamPolicy = stdio ?? (input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"]);
  const result = spawnSync(command, args, { cwd, env, input, timeout, encoding, maxBuffer, stdio: streamPolicy, killSignal });
  const error = result.error ?? null;
  return {
    ok: error === null && result.status === 0,
    // `out` stays raw so a caller may ask for a Buffer (`encoding: null`) and
    // read binary stdout such as a tar archive.
    out: result.stdout ?? "",
    err: result.stderr ?? "",
    status: result.status ?? null,
    signal: result.signal ?? null,
    errorCode: error?.code ?? null,
    errorMessage: error?.message ?? null,
  };
}

export function spawnInherit(command, args = [], { cwd, env } = {}) {
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  return {
    status: result.status ?? null,
    signal: result.signal ?? null,
    errorCode: result.error?.code ?? null,
  };
}
