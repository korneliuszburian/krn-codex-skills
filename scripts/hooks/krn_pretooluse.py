#!/usr/bin/env python3
"""Global Codex PreToolUse policy for Bash commands."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shlex
import sys
from typing import Any

sys.dont_write_bytecode = True

from destructive_guard import (
    direct_destructive_denial_reason,
    protected_path_reason,
    redirection_denial_reason,
    resolve_target,
    write_target_denial_reason,
)


FORBIDDEN_CAPABILITY = "superpowers"
SAFE_TEXT_COMMANDS = {"echo", "printf"}
SAFE_INSPECTION_COMMANDS = {
    "cat",
    "cut",
    "diff",
    "du",
    "file",
    "find",
    "grep",
    "head",
    "ls",
    "pwd",
    "rg",
    "stat",
    "tail",
    "wc",
}
SAFE_GIT_INSPECTION_SUBCOMMANDS = {
    "diff",
    "log",
    "ls-files",
    "rev-parse",
    "show",
    "status",
}
DESTRUCTIVE_LITERAL = re.compile(
    r"\brm\b|\bgit\b[^\n;|&]*\bclean\b",
    re.IGNORECASE,
)
SYSTEM_DESTRUCTIVE = re.compile(
    r"\bmkfs(?:\.[a-z0-9]+)?\b"
    r"|\bwipefs\b"
    r"|\bshred\b"
    r"|\bdd\b[^\n;|&]*\bof="
    r"|\brmtree\b"
    r"|\btruncate\b[^\n;|&]*\s-s\s*0\b"
    r"|\|[^\n;|&]*(?:\$\{IFS\}|\$IFS|\s)*(?:(?:env|sudo|command)\s+)*(?:/[\w./-]+/)*(?:ba|d|z|a|k)?sh(?:\s|$)",
    re.IGNORECASE,
)


def executable_name(token: str) -> str:
    return os.path.basename(token)
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


def split_safe_and_chain(command: str) -> tuple[str, ...] | None:
    """Split a chain only when its sole shell operator is literal ``&&``.

    The hook still refuses pipes, redirects, substitutions, globs, and other
    shell composition.  Allowing a concrete ``&&`` chain lets normal cleanup
    such as ``rm -rf build && npm run check`` proceed while every destructive
    segment is checked independently.
    """

    segments: list[str] = []
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
            elif character in {"$", "`"}:
                return None
            index += 1
            continue
        if character == "\\" and index + 1 < len(command):
            index += 2
            continue
        if character in {"'", '"'}:
            quote = character
            index += 1
            continue
        if character == "&":
            if index + 1 >= len(command) or command[index + 1] != "&":
                return None
            segment = command[segment_start:index].strip()
            if not segment:
                return None
            segments.append(segment)
            index += 2
            segment_start = index
            continue
        if character in {";", "|", "<", ">", "(", ")", "{", "}", "\n", "\r", "$", "`", "*", "?", "["}:
            return None
        index += 1
    if quote is not None:
        return None
    final = command[segment_start:].strip()
    if not final:
        return None
    segments.append(final)
    return tuple(segments)


def is_safe_text(words: tuple[str, ...] | None) -> bool:
    return bool(words and executable_name(words[0]) in SAFE_TEXT_COMMANDS)


def is_safe_inspection(words: tuple[str, ...] | None) -> bool:
    """Allow literal-risk words in simple read-only inspection commands.

    This does not interpret shell syntax.  Commands with composition are
    already excluded by ``static_simple_words``.  The explicit exclusions
    keep write-capable inspection tools such as ``find -exec`` out of this
    exception.
    """

    if not words:
        return False
    remaining = words[1:] if words[0] == "rtk" else words
    if not remaining:
        return False
    executable = executable_name(remaining[0])
    arguments = remaining[1:]
    if executable in SAFE_INSPECTION_COMMANDS:
        if executable == "rg" and any(
            argument == "--pre"
            or argument.startswith("--pre=")
            or argument == "--hostname-bin"
            or argument.startswith("--hostname-bin=")
            for argument in arguments
        ):
            return False
        if executable == "find" and any(
            argument in {"-delete", "-exec", "-execdir", "-ok", "-okdir"}
            or argument.startswith(("-exec=", "-execdir=", "-ok=", "-okdir="))
            or argument == "-fls"
            or argument.startswith(("-fls", "-fprint", "-fprintf"))
            for argument in arguments
        ):
            return False
        return True
    if executable == "git":
        if not arguments or arguments[0] not in SAFE_GIT_INSPECTION_SUBCOMMANDS:
            return False
        return not any(
            argument in {"-o", "--output"}
            or argument.startswith(("--output=", "-o"))
            for argument in arguments[1:]
        )
    return False


def direct_destructive_kind(words: tuple[str, ...]) -> str | None:
    remaining = words[1:] if words[0] == "rtk" else words
    if not remaining:
        return None
    executable = executable_name(remaining[0])
    if executable == "rm":
        return "rm"
    if executable == "git" and len(remaining) > 1 and remaining[1] == "clean":
        return "git-clean"
    return None


def alias_is_risky(value: str) -> bool:
    value = value.lstrip()
    if value.startswith("!"):
        return True
    try:
        tokens = tuple(shlex.split(value, posix=True))
    except ValueError:
        return True
    return bool(tokens) and git_static_risk(tokens)


def git_static_risk(args: tuple[str, ...]) -> bool:
    value_options = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--attr-source", "--config-env"}
    index = 0
    while index < len(args):
        token = args[index]
        if token in value_options:
            if token == "-c" and index + 1 < len(args):
                assignment = args[index + 1].split("=", 1)
                if len(assignment) == 2 and assignment[0].startswith("alias."):
                    return alias_is_risky(assignment[1])
            index += 2
            continue
        if token.startswith("-"):
            index += 1
            continue
        rest = args[index + 1 :]
        if token in {"clean", "rm"}:
            return True
        if token == "reset" and "--hard" in rest:
            return True
        if token == "checkout" and ("--" in rest or "-f" in rest or "--force" in rest):
            return True
        if token == "restore" and not (
            any(option in {"--staged", "-S"} for option in rest)
            and not any(option in {"--worktree", "-W"} for option in rest)
        ):
            return True
        if token == "push" and any(
            option in {"--force", "-f"} or option.startswith("--force") for option in rest
        ):
            return True
        return False
    return False


def has_static_destructive_reference(words: tuple[str, ...] | None) -> bool:
    if not words:
        return False
    remaining = words[1:] if words[0] == "rtk" else words
    if not remaining:
        return False
    executable = executable_name(remaining[0])
    if executable == "rm":
        return True
    if executable == "find":
        return any(
            argument in {"-delete", "-exec", "-execdir", "-ok", "-okdir", "-fls"}
            or argument.startswith(("-exec=", "-execdir=", "-ok=", "-okdir=", "-fls", "-fprint", "-fprintf"))
            for argument in remaining[1:]
        )
    if executable != "git":
        return False
    return git_static_risk(remaining[1:])


def cd_target(segment: str, cwd: Path) -> Path | None:
    words = static_simple_words(segment)
    if not words or executable_name(words[0]) != "cd":
        return None
    if len(words) < 2:
        return None
    return resolve_target(words[1], cwd)


def bash_denial_reason(command: str, cwd: Path) -> str | None:
    lexical_text = command.replace("\\\r\n", "").replace("\\\n", "")
    literal_text = without_shell_comments(lexical_text)
    chain = split_safe_and_chain(literal_text)
    if chain is not None and len(chain) > 1:
        active_cwd = cwd
        for segment in chain:
            reason = bash_denial_reason(segment, active_cwd)
            if reason is not None:
                return reason
            active_cwd = cd_target(segment, active_cwd) or active_cwd
        return None
    words = static_simple_words(literal_text)
    forbidden = references_forbidden_capability(lexical_text)
    literal_risk = (
        DESTRUCTIVE_LITERAL.search(literal_text) is not None
        or SYSTEM_DESTRUCTIVE.search(literal_text) is not None
    )
    if words is not None and words and executable_name(words[0]) == "git":
        # A commit message may contain words such as "clean" or "rm". The
        # parsed git argv, not arbitrary message text, decides whether this is
        # the destructive `git clean` command.
        literal_risk = False
    destructive = (
        literal_risk
        or has_static_destructive_reference(words)
    )
    if not forbidden and not destructive:
        return redirection_denial_reason(literal_text, cwd) or write_target_denial_reason(words, cwd)
    if is_safe_text(words):
        return None
    if forbidden:
        return "blocked by the global forbidden-capability policy"
    if is_safe_inspection(words):
        return None

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

    write_paths = re.findall(r"^\*\*\* (?:Add|Update) File: (.+)$", command, re.MULTILINE)
    for raw_target in write_paths:
        target = resolve_target(raw_target.strip(), cwd)
        if target is None:
            return "file write target is not inspectable"
        reason = protected_path_reason(target, cwd, recursive=False)
        if reason is not None:
            return f"protected file write blocked: {reason}"

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
