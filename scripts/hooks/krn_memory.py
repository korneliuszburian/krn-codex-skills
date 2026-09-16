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
import sys

CONTINUING_STATES = {"ACTIVE", "BLOCKED", "DEFERRED", "NEEDS_REVIEW"}

MANAGED_START = "<!-- krn-agent-workflow:start -->"
INSTRUCTION_FILES = ("AGENTS.md", "CLAUDE.md")
ONBOARDING_SIGNAL = (
    "KRN onboarding: this work tree carries agent instructions without the KRN "
    "managed contract. Run `krn-codex repo inspect --root .` for a read-only "
    "report; adoption stays explicit-only."
)


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


def field(text: str, label: str) -> str | None:
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(f"{label}:"):
            return stripped[len(label) + 1 :].strip()
    return None


def containers(cwd: Path) -> list[Path]:
    base = cwd / ".krn" / "runs" / "delivery-loop"
    try:
        if not base.is_dir():
            return []
    except OSError:
        return []
    found = []
    try:
        for entry in sorted(base.iterdir()):
            if not entry.is_dir():
                continue
            state = entry / "state.md"
            try:
                if state.is_file():
                    found.append(state)
            except OSError:
                continue
    except OSError:
        return []
    return found


def bounded(path: Path, cwd: Path) -> bool:
    try:
        real = path.resolve()
        root = cwd.resolve()
    except OSError:
        return False
    return real == root or str(real).startswith(f"{root}{os.sep}")


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

        notes = []
        for state in containers(cwd):
            if not bounded(state, cwd):
                continue
            try:
                text = state.read_text(encoding="utf-8")
            except (OSError, UnicodeError):
                continue
            outcome = (field(text, "Outcome state") or "").strip().upper()
            if outcome not in CONTINUING_STATES:
                continue
            next_action = field(text, "Next bounded owner and action") or "unspecified"
            blockers = field(text, "Open unknowns and blockers with owners") or "none"
            acceptance = field(text, "Outcome and observable acceptance") or "unspecified"
            if event == "PreCompact":
                write_boundary(state, outcome, acceptance, next_action, blockers)
            notes.append(
                f"Capsule {state.relative_to(cwd)} [{outcome}]\n"
                f"  acceptance: {acceptance}\n"
                f"  next bounded action: {next_action}\n"
                f"  blockers: {blockers}"
            )

        if not notes:
            signal = adoption_signal(cwd) if event == "SessionStart" else None
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
