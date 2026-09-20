import { runProcess } from "./proc.mjs";

const asGitResult = (result) => ({
  ok: result.ok,
  out: result.out,
  stderr: result.err,
  status: result.status,
  signal: result.signal,
  errorCode: result.errorCode,
});

export function runGit(repo, args) {
  const raw = runGitRaw(repo, args);
  // `-z` output is an exact, unquoted record list; trimming it would corrupt
  // path names with leading/trailing whitespace.
  return raw.ok ? { ...raw, out: Array.isArray(args) && args.includes("-z") ? raw.out : raw.out.trim() } : raw;
}

export function runGitRaw(repo, args) {
  return asGitResult(runProcess("git", ["-C", repo, ...args]));
}

export function runGitInput(repo, args, input) {
  return asGitResult(runProcess("git", ["-C", repo, ...args], { input, stdio: ["pipe", "pipe", "pipe"] }));
}

export function gitText(repo, args) {
  const result = runGit(repo, args);
  return result.ok ? result.out : "";
}

export function gitTopLevel(repo) {
  const result = runGit(repo, ["rev-parse", "--show-toplevel"]);
  return result.ok && result.out ? result.out : "";
}

export function commitChangedFiles(root, git, sha) {
  const result = git(root, ["show", "--no-renames", "--name-only", "-z", "--format=", sha]);
  if (!result.ok) return { ok: false, files: [] };
  return { ok: true, files: result.out.split("\0").filter((entry) => entry !== "") };
}

export function gitAvailable() {
  return runProcess("git", ["--version"], { stdio: "ignore" }).ok;
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
