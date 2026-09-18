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
import re
import sys

CONTINUING_STATES = {"ACTIVE", "BLOCKED", "DEFERRED", "NEEDS_REVIEW"}

MANAGED_START = "<!-- krn-agent-workflow:start -->"
INSTRUCTION_FILES = ("AGENTS.md", "CLAUDE.md")
ONBOARDING_SIGNAL = (
    "KRN onboarding: this work tree carries agent instructions without the KRN "
    "managed contract. Run `krn repo inspect --root .` for a read-only "
    "report; adoption stays explicit-only."
)

TICKET_START = "<krn-ticket>"
TICKET_END = "</krn-ticket>"
QUEUE_DIRS = (".scratch", ".krn/tickets")
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


def markdown_files(base: Path) -> list[Path]:
    try:
        if not base.is_dir():
            return []
        return sorted(path for path in base.rglob("*.md") if path.is_file())
    except OSError:
        return []


def ticket_fields(text: str) -> dict[str, str] | None:
    start = text.find(TICKET_START)
    end = text.find(TICKET_END)
    if start == -1 or end == -1 or end < start:
        return None
    fields: dict[str, str] = {}
    for line in text[start + len(TICKET_START) : end].splitlines():
        match = re.match(r"^([A-Za-z][A-Za-z ()-]*):\s*(.*)$", line.strip())
        if match:
            fields[match.group(1)] = match.group(2).strip()
    return fields


def blocker_ids(value: str | None) -> list[str]:
    raw = (value or "").strip()
    if not raw or raw.lower() == "none":
        return []
    return [entry.strip() for entry in raw.split(",") if entry.strip()]


def ready_ids(root: Path) -> list[str]:
    """The frontier: ready tickets whose blockers all resolve to a done ticket."""
    discovered: dict[str, dict[str, str]] = {}
    for relative in QUEUE_DIRS:
        for path in markdown_files(root / relative):
            try:
                text = path.read_text(encoding="utf-8")
            except (OSError, UnicodeError):
                continue
            if TICKET_START not in text:
                continue
            fields = ticket_fields(text)
            if fields and fields.get("Id"):
                discovered[fields["Id"]] = fields
    done = {tid for tid, field_map in discovered.items() if field_map.get("Status", "").lower() == "done"}
    ready = [
        tid
        for tid, field_map in discovered.items()
        if field_map.get("Status", "").lower() == "ready"
        and all(blocker in done for blocker in blocker_ids(field_map.get("Blocked by")))
    ]
    return sorted(ready)


def has_continuing(cwd: Path) -> bool:
    for state in containers(cwd):
        if not bounded(state, cwd):
            continue
        try:
            text = state.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            continue
        outcome = (field(text, "Outcome state") or "").strip().upper()
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
