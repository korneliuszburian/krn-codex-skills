export function churnHot({ root, git, sha, files, days = 90, min = 2 }) {
  if (files.length === 0) return [];
  const committed = git(root, ["show", "-s", "--format=%ct", sha]);
  const epoch = committed.ok ? Number(committed.out.trim()) : NaN;
  const window = Number.isFinite(epoch) ? `--since=@${Math.max(0, epoch - days * 86400)}` : `--since=${days} days ago`;
  const args = ["log", window, "--name-only", "-z", "--format=", `${sha}^`, "--", ...files];
  let out = git(root, args);
  if (!out.ok) out = git(root, ["log", window, "--name-only", "-z", "--format=", sha, "--", ...files]);
  if (!out.ok) return [];
  const counts = new Map();
  for (const entry of out.out.split("\0")) {
    if (files.includes(entry)) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return files.filter((file) => (counts.get(file) ?? 0) >= min);
}
