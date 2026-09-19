#!/usr/bin/env python3
"""Global Codex memory-boundary hook for SessionStart and PreCompact.

SessionStart: a fresh session gets the continuing outcome capsule's brief as
`additionalContext`, so it resumes the bounded action without being told to read
the file. When no capsule continues, SessionStart may emit one advisory
onboarding line for a work tree that carries agent instructions without the KRN
managed contract. PreCompact: the host is about to summarize history, so the
hook also writes a `boundary.md` next to each continuing capsule, materializing
the memory layer on disk. It never blocks a session, never adopts anything, and
never signals on PreCompact: any error exits 0.
"""

from __future__ import annotations

import datetime
import json
import os
from pathlib import Path
import subprocess
import sys

CONTINUING_STATES = {"ACTIVE", "BLOCKED", "DEFERRED", "NEEDS_REVIEW"}

MANAGED_START = "<!-- krn-agent-workflow:start -->"
INSTRUCTION_FILES = ("AGENTS.md", "CLAUDE.md")
ONBOARDING_SIGNAL = (
    "KRN onboarding: this work tree carries agent instructions without the KRN "
    "managed contract. Run `krn repo inspect --root .` for a read-only "
    "report; adoption stays explicit-only."
)

CLAIM_COMMAND = "krn ticket claim --root . --id <id>"


def worktree_root(cwd: Path) -> Path | None:
    """Return the work-tree root for cwd, or None outside a repository."""
    current = cwd
    while True:
        marker = current / ".git"
        try:
            if marker.is_dir() or marker.is_file():
                return current
        except OSError:
            return None
        parent = current.parent
        if parent == current:
            return None
        current = parent


def adoption_signal(cwd: Path) -> str | None:
    """One advisory line when a work tree has instructions but no managed block.

    Precision over coverage: a plain directory, a work tree without an
    instruction file, or an adopted repository returns None, and the signal only
    names the read-only report; it never adopts anything.
    """
    root = worktree_root(cwd)
    if root is None:
        return None
    for name in INSTRUCTION_FILES:
        candidate = root / name
        try:
            if not candidate.is_file():
                continue
            text = candidate.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        if MANAGED_START in text:
            return None
        return ONBOARDING_SIGNAL
    return None


def krn_command() -> list[str]:
    """The CLI that owns the ABI parsers, resolved beside the hook or on PATH.

    The installed hook is a symlink into the release tree, so its real path
    locates the release's `scripts/krn.mjs`; a host without one falls back to
    the installed `krn` bin. The hook never parses the envelope itself.
    """
    candidate = Path(__file__).resolve().parents[2] / "scripts" / "krn.mjs"
    if candidate.is_file():
        return ["node", str(candidate)]
    return ["krn"]


def krn_json(args: list[str]) -> object | None:
    try:
        result = subprocess.run(
            [*krn_command(), *args, "--json"],
            capture_output=True,
            text=True,
            timeout=20,
        )
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout)
    except ValueError:
        return None


def capsule_fields(state: Path) -> dict:
    data = krn_json(["state", "fields", "--file", str(state)])
    return data if isinstance(data, dict) else {}


def resolved(path: Path) -> Path | None:
    try:
        return Path(os.path.realpath(path))
    except OSError:
        return None


def bounded(path: Path, root: Path) -> bool:
    real = resolved(path)
    real_root = resolved(root)
    if real is None or real_root is None:
        return False
    return real == real_root or str(real).startswith(f"{real_root}{os.sep}")


def containers(root: Path) -> list[Path]:
    """Deduplicated, contained capsule state files under the work-tree root.

    Enumerates delivery-loop entries including symlinks, resolves each entry and
    its state.md with realpath, refuses anything escaping the repository root,
    and keeps exactly one state file per resolved directory (the real directory
    wins over a symlink alias). Any error yields no candidates.
    """
    base = root / ".krn" / "runs" / "delivery-loop"
    try:
        if not base.is_dir():
            return []
        entries = sorted(base.iterdir())
    except OSError:
        return []
    chosen: dict[str, Path] = {}
    order: list[str] = []
    for entry in entries:
        try:
            if not entry.is_dir():
                continue
        except OSError:
            continue
        real = resolved(entry)
        if real is None or not bounded(real, root):
            continue
        state = entry / "state.md"
        try:
            if not state.is_file():
                continue
        except OSError:
            continue
        real_state = resolved(state)
        if real_state is None or not bounded(real_state, root):
            continue
        key = str(real)
        if key not in chosen:
            chosen[key] = state
            order.append(key)
            continue
        try:
            if chosen[key].parent.is_symlink() and not entry.is_symlink():
                chosen[key] = state
        except OSError:
            continue
    return [chosen[key] for key in order]


def managed_root(cwd: Path) -> Path | None:
    """The work-tree root when its instructions carry the KRN managed block."""
    root = worktree_root(cwd)
    if root is None:
        return None
    for name in INSTRUCTION_FILES:
        candidate = root / name
        try:
            if not candidate.is_file():
                continue
            text = candidate.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        if MANAGED_START in text:
            return root
    return None


def ready_ids(root: Path) -> list[str]:
    """The frontier, delegated to the ticket owner via `krn ticket next`."""
    data = krn_json(["ticket", "next", "--root", str(root)])
    frontier = data.get("frontier") if isinstance(data, dict) else None
    if not isinstance(frontier, list):
        return []
    return [entry for entry in frontier if isinstance(entry, str)]


def has_continuing(cwd: Path) -> bool:
    root = worktree_root(cwd) or cwd
    for state in containers(root):
        outcome = (capsule_fields(state).get("Outcome state") or "").strip().upper()
        if outcome in CONTINUING_STATES:
            return True
    return False


def queue_brief(cwd: Path) -> str | None:
    """One bounded line naming the ready frontier, only in a managed tree."""
    if has_continuing(cwd):
        return None
    root = managed_root(cwd)
    if root is None:
        return None
    ids = ready_ids(root)
    if not ids:
        return None
    return f"KRN ready queue: {', '.join(ids[:3])}. Claim one with `{CLAIM_COMMAND}`."


def write_boundary(state: Path, outcome: str, acceptance: str, next_action: str, blockers: str) -> None:
    """Materialize the continuation brief on disk at the boundary."""
    try:
        stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        (state.parent / "boundary.md").write_text(
            "\n".join([
                "# Boundary (auto, written by the PreCompact hook)",
                f"compacted_at: {stamp}",
                f"capsule: {state.name}",
                f"outcome: {outcome}",
                f"acceptance: {acceptance}",
                f"next bounded action: {next_action}",
                f"blockers: {blockers}",
                "",
            ]),
            encoding="utf-8",
        )
    except OSError:
        pass


def main() -> int:
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        event = payload.get("hook_event_name")
        if event not in {"SessionStart", "PreCompact"}:
            return 0
        cwd_value = payload.get("cwd")
        cwd = Path(cwd_value).expanduser() if isinstance(cwd_value, str) and cwd_value else Path.cwd()
        if not cwd.is_dir():
            return 0

        root = worktree_root(cwd) or cwd
        notes = []
        for state in containers(root):
            fields = capsule_fields(state)
            outcome = (fields.get("Outcome state") or "").strip().upper()
            if outcome not in CONTINUING_STATES:
                continue
            next_action = fields.get("Next bounded owner and action") or "unspecified"
            blockers = fields.get("Open unknowns and blockers with owners") or "none"
            acceptance = fields.get("Outcome and observable acceptance") or "unspecified"
            if event == "PreCompact":
                write_boundary(state, outcome, acceptance, next_action, blockers)
            notes.append(
                f"Capsule {state.relative_to(root)} [{outcome}]\n"
                f"  acceptance: {acceptance}\n"
                f"  next bounded action: {next_action}\n"
                f"  blockers: {blockers}"
            )

        if not notes:
            signal = queue_brief(cwd) if event == "SessionStart" else None
            if signal is None and event == "SessionStart":
                signal = adoption_signal(cwd)
            if signal:
                print(json.dumps({
                    "hookSpecificOutput": {
                        "hookEventName": event,
                        "additionalContext": signal,
                    }
                }))
            return 0

        context = (
            "KRN memory layer. Read the outcome capsule(s) below and continue from "
            "the recorded next action; do not restart completed work.\n\n"
            + "\n\n".join(notes)
        )
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": context,
            }
        }))
        return 0
    except Exception:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
