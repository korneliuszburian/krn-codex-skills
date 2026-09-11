export function churnHot({ root, git, sha, files, days = 90, min = 2 }) {
  const hot = [];
  for (const file of files) {
    const count = git(root, ["rev-list", "--count", `--since=${days} days ago`, `${sha}^`, "--", file]);
    if (count.ok && Number(count.out) >= min) hot.push(file);
  }
  return hot;
}
