"""Path-aware destructive command policy used by the global Codex hook."""

from __future__ import annotations

import os
from pathlib import Path
import stat


AMBIGUOUS_TARGET_MARKERS = ("$", "`", "*", "?", "[", "]", "{", "}")
DISPOSABLE_DIRECTORY_NAMES = {
    ".cache",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    ".tmp",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    "tmp",
}
PROTECTED_FILE_NAMES = {
    ".env",
    "AGENTS.md",
    "CLAUDE.md",
    "config.toml",
    "hooks.json",
}
PROTECTED_FILE_SUFFIXES = {
    ".db",
    ".duckdb",
    ".key",
    ".mdb",
    ".p12",
    ".pem",
    ".realm",
    ".sqlite",
    ".sqlite3",
}
PROTECTED_DATABASE_SIDECARS = ("-journal", "-shm", "-wal")
MAX_SCAN_ENTRIES = 2_000


def find_repo_root(cwd: Path) -> Path | None:
    current = cwd
    while True:
        if (current / ".git").exists():
            return current
        if current.parent == current:
            return None
        current = current.parent


def path_is_within(path: Path, root: Path) -> bool:
    return path == root or root in path.parents


def path_contains(path: Path, child: Path) -> bool:
    return path == child or path in child.parents


def resolve_target(raw_target: str, cwd: Path) -> Path | None:
    if any(marker in raw_target for marker in AMBIGUOUS_TARGET_MARKERS):
        return None
    expanded = Path(os.path.expanduser(raw_target))
    if not expanded.is_absolute():
        expanded = cwd / expanded
    return expanded.resolve(strict=False)


def is_protected_file(path: Path) -> bool:
    lowered_name = path.name.lower()
    return (
        path.name in PROTECTED_FILE_NAMES
        or path.name.startswith(".env.")
        or path.suffix.lower() in PROTECTED_FILE_SUFFIXES
        or any(lowered_name.endswith(suffix) for suffix in PROTECTED_DATABASE_SIDECARS)
    )


def protected_contents_reason(target: Path) -> str | None:
    if target.name in DISPOSABLE_DIRECTORY_NAMES:
        return None

    try:
        target_mode = target.stat().st_mode
    except FileNotFoundError:
        return None
    except OSError:
        return f"directory {target} could not be inspected safely"
    if not stat.S_ISDIR(target_mode):
        return None

    seen = 0
    scan_errors: list[OSError] = []
    for root, directories, files in os.walk(
        target,
        followlinks=False,
        onerror=scan_errors.append,
    ):
        directories[:] = [
            name
            for name in directories
            if name not in DISPOSABLE_DIRECTORY_NAMES
        ]
        for name in directories:
            seen += 1
            candidate = Path(root) / name
            if name in {".beads", ".git"}:
                return f"directory contains protected state at {candidate}"
        for name in files:
            seen += 1
            candidate = Path(root) / name
            if is_protected_file(candidate):
                return f"directory contains protected file {candidate}"
        if seen > MAX_SCAN_ENTRIES:
            return (
                f"directory scan exceeded {MAX_SCAN_ENTRIES} entries before safety "
                "could be established"
            )
    if scan_errors:
        return f"directory {target} could not be inspected safely"
    return None


def protected_path_reason(target: Path, cwd: Path, recursive: bool) -> str | None:
    home = Path.home().resolve()
    repo_root = find_repo_root(cwd)

    protected_anchors = {
        Path("/"),
        Path("/home"),
        Path("/media"),
        Path("/mnt"),
        Path("/tmp"),
        home,
        home / "coding",
        home / "coding" / "krn",
        home / "coding" / "krn" / "active",
    }
    protected_exact = {
        home / ".agents" / "skills",
        home / ".claude" / "CLAUDE.md",
        home / ".codex" / "AGENTS.md",
        home / ".codex" / "config.toml",
        home / ".codex" / "hooks.json",
        home / ".codex" / "rules",
        home / ".codex" / "skills",
    }
    protected_subtrees = {
        Path("/boot"),
        Path("/dev"),
        Path("/etc"),
        Path("/opt"),
        Path("/proc"),
        Path("/root"),
        Path("/run"),
        Path("/srv"),
        Path("/sys"),
        Path("/usr"),
        Path("/var"),
        home / ".agents",
        home / ".aws",
        home / ".claude",
        home / ".codex",
        home / ".gnupg",
        home / ".kube",
        home / ".ssh",
    }
    if repo_root is not None:
        protected_anchors.add(repo_root)
        protected_exact.update(
            {
                repo_root / ".env",
                repo_root / "AGENTS.md",
                repo_root / "CLAUDE.md",
            }
        )
        protected_subtrees.update({repo_root / ".beads", repo_root / ".git"})

    for protected in protected_anchors | protected_exact:
        if path_contains(target, protected):
            return f"target {target} contains protected path {protected}"

    for protected in protected_subtrees:
        if path_is_within(target, protected) or path_contains(target, protected):
            return f"target {target} overlaps protected path {protected}"

    if target == cwd:
        return f"target {target} is the active working directory"
    if is_protected_file(target):
        return f"target {target} is a protected instruction, secret, key, or database file"
    if (target / ".git").exists():
        return f"target {target} is a Git checkout root"
    if ".git" in target.parts:
        return f"target {target} touches Git metadata"
    if recursive:
        return protected_contents_reason(target)
    return None


def rm_denial_reason(words: tuple[str, ...], cwd: Path) -> str | None:
    try:
        rm_index = words.index("rm")
    except ValueError:
        return None

    recursive = False
    targets: list[str] = []
    options_done = False
    for word in words[rm_index + 1 :]:
        if not options_done and word == "--":
            options_done = True
            continue
        if not options_done and word.startswith("-") and word != "-":
            recursive = (
                recursive
                or word == "--recursive"
                or "r" in word
                or "R" in word
            )
            continue
        targets.append(word)

    for raw_target in targets:
        target = resolve_target(raw_target, cwd)
        if target is None:
            return (
                "rm with an expansion or glob target is blocked; "
                "name one concrete disposable path"
            )
        reason = protected_path_reason(target, cwd, recursive)
        if reason is not None:
            return f"destructive removal blocked: {reason}"
    return None


def git_clean_denial_reason(words: tuple[str, ...]) -> str | None:
    try:
        git_index = words.index("git")
        clean_index = words.index("clean", git_index + 1)
    except ValueError:
        return None

    arguments = words[clean_index + 1 :]
    dry_run = False
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        if argument == "--":
            break
        if argument in {"-e", "--exclude"}:
            index += 2
            continue
        if argument.startswith("--exclude="):
            index += 1
            continue
        if argument.startswith("--d"):
            dry_run = True
            index += 1
            continue
        if argument.startswith("--no-d"):
            dry_run = False
            index += 1
            continue
        if not argument.startswith("-") or argument.startswith("--"):
            index += 1
            continue
        consumes_next = False
        for option_index, option in enumerate(argument[1:]):
            if option == "e":
                consumes_next = option_index == len(argument[1:]) - 1
                break
            if option == "n":
                dry_run = True
        index += 2 if consumes_next else 1
    if not dry_run:
        return (
            "non-dry-run git clean is blocked because it can erase ignored "
            "credentials, databases, and untracked work"
        )
    return None


def direct_destructive_denial_reason(
    words: tuple[str, ...],
    cwd: Path,
) -> str | None:
    return rm_denial_reason(words, cwd) or git_clean_denial_reason(words)
