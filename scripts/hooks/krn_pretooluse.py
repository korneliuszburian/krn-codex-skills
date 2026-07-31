#!/usr/bin/env python3
"""Global Codex PreToolUse policy for Bash commands."""

from __future__ import annotations

import json
from pathlib import Path
import re
import shlex
import sys
from typing import Any

sys.dont_write_bytecode = True

from destructive_guard import (
    direct_destructive_denial_reason,
    protected_path_reason,
    resolve_target,
)


FORBIDDEN_CAPABILITY = "superpowers"
SAFE_TEXT_COMMANDS = {"echo", "printf"}
DESTRUCTIVE_LITERAL = re.compile(
    r"\brm\b|\bgit\b[^\n;|&]*\bclean\b",
    re.IGNORECASE,
)
SHELL_COMPOSITION = frozenset(";&|<>(){}\n\r$`*?[")


def path_has_forbidden_component(path: Path) -> bool:
    return any(part.lower() == FORBIDDEN_CAPABILITY for part in path.parts)


def references_forbidden_capability(command: str) -> bool:
    return re.search(
        rf"(?<![\w-]){re.escape(FORBIDDEN_CAPABILITY)}(?![\w-])",
        command,
        re.IGNORECASE,
    ) is not None


def without_shell_comments(command: str) -> str:
    parts: list[str] = []
    segment_start = 0
    quote: str | None = None
    index = 0
    while index < len(command):
        character = command[index]
        if quote == "'":
            if character == "'":
                quote = None
            index += 1
            continue
        if quote == '"':
            if character == "\\" and index + 1 < len(command):
                index += 2
                continue
            if character == '"':
                quote = None
            index += 1
            continue
        if character == "\\" and index + 1 < len(command):
            index += 2
            continue
        if character in {"'", '"'}:
            quote = character
            index += 1
            continue
        if character == "#" and (
            index == 0
            or command[index - 1].isspace()
            or command[index - 1] in ";&|()<>"
        ):
            parts.append(command[segment_start:index])
            newline = command.find("\n", index)
            if newline == -1:
                return "".join(parts)
            parts.append("\n")
            index = newline + 1
            segment_start = index
            continue
        index += 1
    parts.append(command[segment_start:])
    return "".join(parts)


def has_shell_composition(command: str) -> bool:
    """Recognize syntax boundaries; never interpret their execution semantics."""

    quote: str | None = None
    index = 0
    while index < len(command):
        character = command[index]
        if quote == "'":
            if character == "'":
                quote = None
            index += 1
            continue
        if quote == '"':
            if character == "\\" and index + 1 < len(command):
                index += 2
                continue
            if character == '"':
                quote = None
            elif character in {"$", "`"}:
                return True
            index += 1
            continue
        if character == "\\" and index + 1 < len(command):
            index += 2
            continue
        if character in {"'", '"'}:
            quote = character
            index += 1
            continue
        if character in SHELL_COMPOSITION:
            return True
        index += 1
    return quote is not None


def static_simple_words(command: str) -> tuple[str, ...] | None:
    if has_shell_composition(command):
        return None
    try:
        words = tuple(shlex.split(command, posix=True))
    except ValueError:
        return None
    return words or None


def is_safe_text(words: tuple[str, ...] | None) -> bool:
    return bool(words and words[0] in SAFE_TEXT_COMMANDS)


def direct_destructive_kind(words: tuple[str, ...]) -> str | None:
    remaining = words[1:] if words[0] == "rtk" else words
    if not remaining:
        return None
    executable = remaining[0]
    if executable == "rm":
        return "rm"
    if executable == "git" and len(remaining) > 1 and remaining[1] == "clean":
        return "git-clean"
    return None


def has_static_destructive_reference(words: tuple[str, ...] | None) -> bool:
    if not words:
        return False
    remaining = words[1:] if words[0] == "rtk" else words
    if not remaining:
        return False
    if remaining[0] == "rm":
        return True
    return remaining[0] == "git" and "clean" in remaining[1:]


def bash_denial_reason(command: str, cwd: Path) -> str | None:
    lexical_text = command.replace("\\\r\n", "").replace("\\\n", "")
    literal_text = without_shell_comments(lexical_text)
    words = static_simple_words(literal_text)
    forbidden = references_forbidden_capability(lexical_text)
    destructive = (
        DESTRUCTIVE_LITERAL.search(lexical_text) is not None
        or has_static_destructive_reference(words)
    )
    if not forbidden and not destructive:
        return None
    if is_safe_text(words):
        return None
    if forbidden:
        return "blocked by the global forbidden-capability policy"

    if words is None or direct_destructive_kind(words) is None:
        return (
            "literal destructive text appears in shell composition or an "
            "unsupported command; rewrite it as one reviewed direct command"
        )
    return direct_destructive_denial_reason(words, cwd)


def emit_denial(reason: str) -> int:
    print(
        json.dumps(
            {
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": reason,
                }
            }
        )
    )
    return 0


def parse_payload(raw: str) -> dict[str, Any]:
    payload = json.loads(raw) if raw.strip() else {}
    if not isinstance(payload, dict):
        raise ValueError("hook payload must be a JSON object")
    return payload


def patch_denial_reason(command: str, cwd: Path) -> str | None:
    path_directives = re.findall(
        r"^\*\*\* (?:(?:Add|Delete|Update) File|Move to): (.+)$",
        command,
        re.MULTILINE,
    )
    for raw_target in path_directives:
        try:
            candidate = Path(raw_target.strip()).expanduser()
            if not candidate.is_absolute():
                candidate = cwd / candidate
        except (OSError, RuntimeError, ValueError):
            return "patch target is not inspectable"
        if path_has_forbidden_component(candidate):
            return "patch target belongs to the quarantined capability"

    deleted_paths = re.findall(r"^\*\*\* Delete File: (.+)$", command, re.MULTILINE)
    for raw_target in deleted_paths:
        target = resolve_target(raw_target.strip(), cwd)
        if target is None:
            return "file deletion target is not inspectable"
        reason = protected_path_reason(target, cwd, recursive=False)
        if reason is not None:
            return f"protected file deletion blocked: {reason}"

    moved_sources: list[str] = []
    current_update: str | None = None
    for line in command.splitlines():
        if line.startswith("*** Update File: "):
            current_update = line.removeprefix("*** Update File: ")
        elif line.startswith(("*** Add File: ", "*** Delete File: ")):
            current_update = None
        elif line.startswith("*** Move to: "):
            if current_update is not None:
                moved_sources.append(current_update)
            current_update = None
        elif line == "*** End Patch":
            current_update = None
    for raw_source in moved_sources:
        source = resolve_target(raw_source.strip(), cwd)
        if source is None:
            return "file move source is not inspectable"
        reason = protected_path_reason(source, cwd, recursive=False)
        if reason is not None:
            return f"protected file move blocked: {reason}"
    return None


def main() -> int:
    try:
        payload = parse_payload(sys.stdin.read())
    except (json.JSONDecodeError, ValueError) as error:
        return emit_denial(f"global PreToolUse policy could not parse hook input: {error}")

    if payload.get("hook_event_name") != "PreToolUse":
        return 0
    tool_name = payload.get("tool_name")
    if tool_name not in {"Bash", "apply_patch"}:
        return 0

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return emit_denial(f"{tool_name} tool input is not inspectable")
    command = tool_input.get("command")
    if not isinstance(command, str) or not command.strip():
        return emit_denial(f"{tool_name} command is missing or not inspectable")

    cwd_value = payload.get("cwd")
    try:
        if cwd_value is None:
            cwd = Path.cwd().resolve()
        elif isinstance(cwd_value, str) and cwd_value:
            cwd = Path(cwd_value).expanduser().resolve(strict=False)
        else:
            return emit_denial("working directory is not inspectable")
    except (OSError, RuntimeError, TypeError, ValueError) as error:
        return emit_denial(f"working directory is not inspectable: {error}")
    if path_has_forbidden_component(cwd):
        return emit_denial(
            "working directory belongs to the quarantined capability"
        )

    if tool_name == "apply_patch":
        patch_reason = patch_denial_reason(command, cwd)
        return emit_denial(patch_reason) if patch_reason is not None else 0

    denial_reason = bash_denial_reason(command, cwd)
    if denial_reason is not None:
        return emit_denial(
            f"{denial_reason}. Use a narrower concrete cleanup path or run the "
            "reviewed destructive action manually outside Codex."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
