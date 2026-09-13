import { execFileSync } from "node:child_process";

export function runGit(repo, args) {
  try {
    return {
      ok: true,
      out: execFileSync("git", ["-C", repo, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: 512 * 1024 * 1024,
      }).trim(),
    };
  } catch {
    return { ok: false, out: "" };
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
