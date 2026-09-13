import { execFileSync } from "node:child_process";

export function runGit(repo, args) {
  const raw = runGitRaw(repo, args);
  return raw.ok ? { ...raw, out: raw.out.trim() } : raw;
}

export function runGitRaw(repo, args) {
  try {
    return {
      ok: true,
      out: execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 512 * 1024 * 1024,
      }),
    };
  } catch (error) {
    return { ok: false, out: "", status: error?.status ?? null, signal: error?.signal ?? null, errorCode: error?.code ?? null };
  }
}

export function gitText(repo, args) {
  const result = runGit(repo, args);
  return result.ok ? result.out : "";
}

export function gitAvailable() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
