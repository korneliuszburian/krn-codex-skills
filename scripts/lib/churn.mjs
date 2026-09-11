export function churnHot({ root, git, sha, files, days = 90, min = 2 }) {
  if (files.length === 0) return [];
  const args = ["log", `--since=${days} days ago`, "--name-only", "-z", "--format=", `${sha}^`, "--", ...files];
  let out = git(root, args);
  if (!out.ok) out = git(root, ["log", `--since=${days} days ago`, "--name-only", "-z", "--format=", sha, "--", ...files]);
  if (!out.ok) return [];
  const counts = new Map();
  for (const entry of out.out.split("\0")) {
    if (files.includes(entry)) counts.set(entry, (counts.get(entry) ?? 0) + 1);
  }
  return files.filter((file) => (counts.get(file) ?? 0) >= min);
}
