const WINDOW_DAYS = 90;
const MIN_TOUCHES = 2;

export function churnHot({ root, git, sha, files }) {
  if (files.length === 0) return [];
  const committed = git(root, ["show", "-s", "--format=%ct", sha]);
  const epoch = committed.ok ? Number(committed.out.trim()) : NaN;
  const window = Number.isFinite(epoch) ? `--since=@${Math.max(0, epoch - WINDOW_DAYS * 86400)}` : `--since=${WINDOW_DAYS} days ago`;
  const args = ["log", window, "--name-only", "-z", "--format=", `${sha}^`, "--", ...files];
  let out = git(root, args);
  if (!out.ok) out = git(root, ["log", window, "--name-only", "-z", "--format=", sha, "--", ...files]);
  if (!out.ok) return [];
  const counts = new Map();
  for (const entry of out.out.split("\0")) {
    if (files.includes(entry)) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return files.filter((file) => (counts.get(file) ?? 0) >= MIN_TOUCHES);
}
