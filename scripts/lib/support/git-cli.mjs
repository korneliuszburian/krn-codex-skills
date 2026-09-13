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

export function commitChangedFiles(root, git, sha) {
  const result = git(root, ["show", "--no-renames", "--name-only", "-z", "--format=", sha]);
  if (!result.ok) return { ok: false, files: [] };
  return { ok: true, files: result.out.split("\0").map((entry) => entry.trim()).filter(Boolean) };
}

export function gitAvailable() {
  try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const GIT_LOG_FORMAT = "--format=%H%x1f%s%x1f%b%x1e";

export function parseGitLogRecords(output) {
  return String(output ?? "")
    .split("\u001e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha, subject, body] = record.split("\u001f");
      return { sha, subject: subject ?? "", body: body ?? "" };
    });
}
