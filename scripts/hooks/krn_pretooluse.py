#!/usr/bin/env python3
"""Global Codex PreToolUse policy for Bash commands.

Best-effort heuristic policy, not a sandbox boundary. It models literal
`rm`/`git clean`/`git restore`, shell redirection, a fixed writer set, and simple shell
composition, but does not interpret arbitrary interpreters (`python -c`,
`node -e`, `perl -e`) or track runtime filesystem state. Do not rely on it
to make an untrusted-root destructive command safe.
"""

from __future__ import annotations

import json
import os
from pathlib import Path, PurePosixPath
import re
import shlex
import sys
from typing import Any

sys.dont_write_bytecode = True

from destructive_guard import (
    direct_destructive_denial_reason,
    find_repo_root,
    is_protected_file,
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


COMMAND_WRAPPERS = {
    "builtin", "busybox", "command", "doas", "env", "exec", "ionice", "nice",
    "nohup", "rtk", "setsid", "stdbuf", "sudo", "time", "timeout",
}
SHELL_INTERPRETERS = {"sh", "bash", "dash", "zsh", "ash", "ksh"}
WRITER_EXECUTABLES = {
    "chmod", "chown", "cp", "install", "ln", "mv", "rsync", "sed", "tee",
    "truncate",
}
MUTATING_EXECUTABLES = WRITER_EXECUTABLES - {"sed"}
SED_IN_PLACE = re.compile(
    r"(?:^|\s)(?:--in-place(?:=\S*)?|-[A-Za-z]*i[A-Za-z]*)(?=\s|$)"
)
SUBCOMMAND_SPLIT = re.compile(r"&&|\|\||;|\n")
WRAPPER_VALUE_FLAGS = {
    "env": {"-u", "--unset", "-C", "--chdir", "-S", "--split-string"},
    "sudo": {"-u", "--user", "-g", "--group", "-p", "--prompt", "-C", "--close-from", "-h", "--host", "-r", "--role", "-t", "--type", "-D", "--chdir"},
    "nice": {"-n", "--adjustment"},
    "ionice": {"-c", "--class", "-n", "--classdata", "-p", "--pid"},
    "timeout": {"-s", "--signal", "-k", "--kill-after"},
    "stdbuf": {"-i", "--input", "-o", "--output", "-e", "--error"},
    "time": {"-f", "--format", "-o", "--output"},
    "doas": {"-u", "-C"},
}
ASSIGNMENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
EXPANSION_OR_GLOB = re.compile(r"[*?\[]|\$\(|\$\{|\$[A-Za-z_]|`")


def strip_wrappers(words: tuple[str, ...]) -> tuple[str, ...]:
    tokens = list(words)

    def drop_assignments(items: list[str]) -> list[str]:
        while items and ASSIGNMENT.match(items[0]):
            items = items[1:]
        return items

    tokens = drop_assignments(tokens)
    while tokens and executable_name(tokens[0]) in COMMAND_WRAPPERS:
        wrapper = executable_name(tokens[0])
        tokens = drop_assignments(tokens[1:])
        value_flags = WRAPPER_VALUE_FLAGS.get(wrapper, set())
        while tokens:
            token = tokens[0]
            if token in value_flags:
                tokens = tokens[2:] if len(tokens) > 1 else tokens[1:]
                tokens = drop_assignments(tokens)
                continue
            if token.startswith("-") or ASSIGNMENT.match(token) or (wrapper == "rtk" and token == "proxy"):
                tokens = tokens[1:]
                continue
            break
        if wrapper == "timeout" and tokens and re.match(r"^\d+(?:\.\d+)?[smhd]?$", tokens[0]):
            tokens = tokens[1:]
        tokens = drop_assignments(tokens)
    return tuple(tokens)


def pipe_segments(command: str) -> list[str]:
    segments: list[str] = []
    quote: str | None = None
    start = 0
    index = 0
    while index < len(command):
        character = command[index]
        if quote:
            if quote == '"' and character == "\\" and index + 1 < len(command):
                index += 2
                continue
            if character == quote:
                quote = None
            index += 1
            continue
        if character in {"'", '"'}:
            quote = character
            index += 1
            continue
        if character == "\\" and index + 1 < len(command):
            index += 2
            continue
        if character == "|":
            if (index + 1 < len(command) and command[index + 1] == "|") or (
                index > 0 and command[index - 1] == "|"
            ):
                index += 1
                continue
            segments.append(command[start:index].strip())
            index += 1
            start = index
            continue
        index += 1
    segments.append(command[start:].strip())
    return [segment for segment in segments if segment]
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
    """Split a chain only when its shell operators are literal ``&&`` or ``||``.

    The hook still refuses pipes, redirects, substitutions, globs, and other
    shell composition.  Allowing a concrete ``&&``/``||`` chain lets normal
    cleanup such as ``rm -rf build && npm run check`` or a read-only probe
    guarded by ``... || true`` proceed while every segment is checked
    independently.  A lone ``|``, ``;``, or redirect still returns ``None``.
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
        if character == "|":
            if index + 1 >= len(command) or command[index + 1] != "|":
                return None
            segment = command[segment_start:index].strip()
            if not segment:
                return None
            segments.append(segment)
            index += 2
            segment_start = index
            continue
        if character in {";", "<", ">", "(", ")", "{", "}", "\n", "\r", "$", "`", "*", "?", "["}:
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
    if not words:
        return None
    remaining = words[1:] if words[0] == "rtk" else words
    if not remaining:
        return None
    executable = executable_name(remaining[0])
    if executable == "rm":
        return "rm"
    if executable == "git" and len(remaining) > 1 and remaining[1] == "clean":
        return "git-clean"
    if executable == "git" and len(remaining) > 1 and remaining[1] == "restore":
        return "git-restore"
    return None


def direct_restore_denial_reason(words: tuple[str, ...], cwd: Path) -> str | None:
    """Admit only named, existing repository files; reject expanding pathspecs."""

    arguments = list(words[2:])
    while arguments and arguments[0].startswith("-") and arguments[0] != "--":
        option = arguments.pop(0)
        if option in {"--source", "-s"}:
            if not arguments or arguments.pop(0) != "HEAD":
                return "git restore source must be HEAD"
        elif option not in {"--source=HEAD", "--worktree", "-W", "--staged", "-S"}:
            return "git restore option is outside the direct-file policy"
    if arguments and arguments[0] == "--":
        arguments.pop(0)
    if not arguments or any(argument.startswith(("-", ":")) for argument in arguments):
        return "git restore needs a direct list of concrete file paths"
    root = find_repo_root(cwd)
    if root is None:
        return "git restore needs an inspectable repository root"
    for raw_target in arguments:
        target = resolve_target(raw_target, cwd)
        if target is None or root not in target.parents or not target.is_file():
            return f"git restore target is not one concrete repository file: {raw_target}"
        reason = protected_path_reason(target, cwd, recursive=False)
        if reason is not None:
            return f"git restore of a protected path is blocked: {reason}"
    return None


def has_lexical_git_restore(command: str) -> bool:
    """Catch restore forms whose glob or composition defeats the simple parser."""

    for match in re.finditer(r"\$\(([^()]*)\)", command):
        if has_lexical_git_restore(match.group(1)):
            return True
    for pipe in pipe_segments(command):
        for segment in SUBCOMMAND_SPLIT.split(pipe):
            try:
                words = strip_wrappers(tuple(shlex.split(segment, posix=True)))
            except ValueError:
                continue
            if (
                words
                and executable_name(words[0]) == "git"
                and "restore" in words[1:]
                and git_static_risk(words[1:])
            ):
                return True
    return False


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
        if token == "checkout" and ("--" in rest or "-f" in rest or "--force" in rest or "." in rest):
            return True
        if token == "switch" and "--discard-changes" in rest:
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
        if token == "update-ref" and "-d" in rest:
            return True
        if token == "reflog" and "expire" in rest:
            return True
        if token == "filter-branch":
            return True
        if token == "gc" and any(option.startswith("--prune") for option in rest):
            return True
        if token == "stash" and any(option in {"clear", "drop"} for option in rest):
            return True
        if token == "worktree" and "remove" in rest:
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


def naive_writer_head(segment: str) -> str:
    tokens = segment.strip().split()
    index = 0
    while index < len(tokens) and executable_name(tokens[index]) in COMMAND_WRAPPERS:
        index += 1
    return executable_name(tokens[index]) if index < len(tokens) else ""


def naive_writer_reason(segment: str, cwd: Path) -> str | None:
    """Inspect every sub-command of a segment that composition made unreadable.

    A pipeline or a chain hides composition from the static parser, so the
    segment is split on its operators and each sub-command is judged on its own
    head: parseable sub-commands are checked against the protected-path policy,
    and unreadable ones fail closed only for genuinely mutating executables.
    ``sed`` is mutating only with a literal in-place flag; ``sed -n`` reads.
    """

    for subcommand in SUBCOMMAND_SPLIT.split(segment):
        words = static_simple_words(subcommand)
        if words is not None:
            reason = write_target_denial_reason(strip_wrappers(words), cwd)
            if reason is not None:
                return reason
            continue
        head = naive_writer_head(subcommand)
        if head in MUTATING_EXECUTABLES or (
            head == "sed" and SED_IN_PLACE.search(subcommand)
        ):
            return (
                "writer command contains an expansion or glob target; "
                "name one concrete path"
            )
    return None


def pipe_writer_reason(command: str, cwd: Path) -> str | None:
    for segment in pipe_segments(command):
        words = static_simple_words(segment)
        if words is None:
            reason = naive_writer_reason(segment, cwd)
            if reason is not None:
                return reason
            continue
        if not words:
            continue
        reason = write_target_denial_reason(strip_wrappers(words), cwd)
        if reason is not None:
            return reason
    return None


def cd_target(segment: str, cwd: Path) -> Path | None:
    words = static_simple_words(segment)
    if not words or executable_name(words[0]) != "cd":
        return None
    if len(words) < 2:
        return None
    return resolve_target(words[1], cwd)


DEPLOY_ENV_SETTING_KEYS = frozenset(
    {
        "DEPLOY_HOST",
        "DEPLOY_PORT",
        "DEPLOY_USER",
        "DEPLOY_PATH",
        "DEPLOY_KNOWN_HOSTS",
        "SSH_DEV_USER",
    }
)
DEV_ENV_SOURCES = frozenset({". ./.env", ". .env"})
DEV_SSHPASS_EXPORT = 'export SSHPASS="$SSH_DEV_PASSWORD"'
SSHPASS_EXPORT = re.compile(r'^export SSHPASS="\$\{?SSH_DEV_PASSWORD\}?"$')
DEV_PUT = re.compile(r"^put\s+(\S+)\s+(\S+)$")
DEV_PATH_ESCAPE = re.compile(r"[*?\[\]{}$`]")
REMOTE_TARGET = re.compile(
    r"^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+:"
)
WHOLE_TREE_DEPLOY = re.compile(
    r"\bftp-kr\b|(?<![A-Za-z0-9])(?:upload|clean)[ _-]?all(?![A-Za-z0-9])",
    re.IGNORECASE,
)
SFTP_MENTION = re.compile(r"(?<![\w-])sftp(?![\w-])")
REMOTE_TRANSPORT_HEADS = frozenset({"ssh", "sshpass", "scp", "sftp", "rsync"})
MAX_DEV_BATCH_BYTES = 64 * 1024


def read_deploy_settings(root: Path) -> dict[str, str] | None:
    try:
        text = (root / ".env").read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None
    settings: dict[str, str] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, _, raw = stripped.partition("=")
        key = key.strip()
        if key not in DEPLOY_ENV_SETTING_KEYS:
            continue
        value = raw.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
            value = value[1:-1]
        settings[key] = value
    return settings


def dev_deploy_target(cwd: Path) -> dict[str, Any] | None:
    root = find_repo_root(cwd)
    if root is None:
        return None
    settings = read_deploy_settings(root)
    if settings is None:
        return None
    host = settings.get("DEPLOY_HOST", "")
    port = settings.get("DEPLOY_PORT", "")
    user = settings.get("DEPLOY_USER") or settings.get("SSH_DEV_USER", "")
    deploy_path = settings.get("DEPLOY_PATH", "").rstrip("/")
    known_hosts = settings.get("DEPLOY_KNOWN_HOSTS", "")
    if not host or DEV_PATH_ESCAPE.search(host):
        return None
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        return None
    if not user or DEV_PATH_ESCAPE.search(user):
        return None
    if not deploy_path.startswith("/") or ".." in deploy_path.split("/"):
        return None
    return {
        "root": root,
        "host": host,
        "port": port,
        "user": user,
        "deploy_path": deploy_path,
        "known_hosts": known_hosts,
    }


def known_hosts_pins(path: Path, host: str, port: str) -> bool:
    try:
        text = path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return False
    expected = host if port == "22" else f"[{host}]:{port}"
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or stripped.startswith("|"):
            continue
        names = stripped.split()[0].split(",")
        if expected in names:
            return True
    return False


def split_single_heredoc(command: str) -> tuple[str, str | None, str | None]:
    """Return (header, body, error) for exactly one quoted sftp heredoc.

    Only a single-quoted delimiter is admitted because the batch must never
    pass through shell expansion; the unreadable forms are reported instead of
    interpreted.
    """

    quote: str | None = None
    start: int | None = None
    end_token: int | None = None
    marker = ""
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
        if character == "<" and index + 1 < len(command) and command[index + 1] == "<":
            if start is not None:
                return "", None, "multiple heredocs are unsupported"
            if index + 2 < len(command) and command[index + 2] == "<":
                return "", None, "herestrings are unsupported"
            cursor = index + 2
            if cursor < len(command) and command[cursor] == "-":
                return "", None, "tab-stripping heredocs are unsupported"
            while cursor < len(command) and command[cursor] in " \t":
                cursor += 1
            if cursor >= len(command) or command[cursor] != "'":
                return "", None, "the sftp batch requires one single-quoted heredoc delimiter"
            cursor += 1
            marker_start = cursor
            while cursor < len(command) and command[cursor] != "'":
                cursor += 1
            if cursor >= len(command):
                return "", None, "the heredoc delimiter is unterminated"
            marker = command[marker_start:cursor]
            if not marker:
                return "", None, "the heredoc delimiter is empty"
            start = index
            end_token = cursor + 1
            index = end_token
            continue
        index += 1
    if start is None or end_token is None:
        return command, None, None
    newline = command.find("\n", end_token)
    if newline == -1:
        return "", None, "the heredoc body must start on the next line"
    body_lines: list[str] = []
    cursor = newline + 1
    while cursor <= len(command):
        line_end = command.find("\n", cursor)
        if line_end == -1:
            line_end = len(command)
        line = command[cursor:line_end].rstrip("\r")
        if line == marker:
            trailing = command[line_end:]
            if trailing.strip():
                return "", None, "commands after the sftp batch are unsupported"
            header = command[:start] + command[end_token:newline]
            return header, "\n".join(body_lines), None
        body_lines.append(line)
        if line_end >= len(command):
            break
        cursor = line_end + 1
    return "", None, "the heredoc body is unterminated"


def segment_mentions_sftp(segment: str) -> bool:
    words = static_simple_words(segment)
    if words is not None:
        return "sftp" in words
    return SFTP_MENTION.search(segment) is not None


def dev_sftp_transport(
    words: tuple[str, ...],
) -> tuple[dict[str, str | None], bool, str | None]:
    if words and executable_name(words[0]) == "sshpass":
        if len(words) < 3 or words[1] != "-e" or executable_name(words[2]) != "sftp":
            return {}, False, "sshpass must pass the secret through SSHPASS with -e before sftp"
        rest = list(words[3:])
        sshpass = True
    elif words and executable_name(words[0]) == "sftp":
        rest = list(words[1:])
        sshpass = False
    else:
        return {}, False, "sftp must run directly or through sshpass -e"

    port: str | None = None
    known_hosts: str | None = None
    strict: str | None = None
    batch: str | None = None
    seen_options: set[str] = set()
    seen_flags: set[str] = set()
    positionals: list[str] = []
    index = 0
    while index < len(rest):
        token = rest[index]
        if token == "-P":
            if token in seen_flags:
                return {}, sshpass, "duplicate sftp -P options are blocked"
            seen_flags.add(token)
            if index + 1 >= len(rest):
                return {}, sshpass, "sftp -P needs one concrete DEV port"
            port = rest[index + 1]
            index += 2
            continue
        if token == "-o":
            if index + 1 >= len(rest):
                return {}, sshpass, "sftp -o needs one key=value option"
            option = rest[index + 1]
            key, separator, value = option.partition("=")
            if not separator:
                return {}, sshpass, "sftp -o options must be key=value pairs"
            lowered = key.lower()
            if lowered in seen_options:
                return {}, sshpass, "duplicate sftp options are blocked"
            seen_options.add(lowered)
            index += 2
            if lowered == "stricthostkeychecking":
                strict = value.lower()
            elif lowered == "userknownhostsfile":
                known_hosts = value
            elif lowered == "connecttimeout":
                if not value.isdigit():
                    return {}, sshpass, "sftp ConnectTimeout must be a number of seconds"
            else:
                return {}, sshpass, "sftp options outside the DEV upload policy are blocked"
            continue
        if token == "-b":
            if token in seen_flags:
                return {}, sshpass, "duplicate sftp -b options are blocked"
            seen_flags.add(token)
            if index + 1 >= len(rest):
                return {}, sshpass, "sftp -b needs one concrete batch file or -"
            batch = rest[index + 1]
            index += 2
            continue
        if token.startswith("-"):
            return {}, sshpass, "sftp flags outside the DEV upload policy are blocked"
        positionals.append(token)
        index += 1
    if len(positionals) != 1:
        return {}, sshpass, "sftp needs exactly one user@host argument"
    return (
        {
            "port": port,
            "known_hosts": known_hosts,
            "strict": strict,
            "batch": batch,
            "identity": positionals[0],
        },
        sshpass,
        None,
    )


def dev_sftp_destination(
    transport: dict[str, str | None],
    target: dict[str, Any],
) -> str | None:
    if transport["port"] != target["port"]:
        return "the sftp port is not the configured DEV port"
    if transport["strict"] != "yes":
        return "sftp must verify the host key with StrictHostKeyChecking=yes"
    known = transport["known_hosts"]
    if not known or DEV_PATH_ESCAPE.search(known):
        return "sftp must name one concrete UserKnownHostsFile"
    known_path = Path(known)
    if not known_path.is_absolute() or not known_path.is_file():
        return "the named known_hosts file must exist as one concrete path"
    configured = target.get("known_hosts", "")
    if configured and Path(configured).is_absolute() and known_path.resolve() != Path(configured).resolve():
        return "the sftp host key file is not the configured DEPLOY_KNOWN_HOSTS"
    identity = transport["identity"] or ""
    user, separator, host = identity.rpartition("@")
    if not separator or user != target["user"]:
        return "the sftp user is not the configured DEV user"
    if not known_hosts_pins(known_path, host, target["port"]):
        return f"the named known_hosts file does not pin {host}"
    if host != target["host"]:
        return "the sftp host is not the configured DEV host"
    return None


def dev_batch_decision(
    batch_text: str,
    cwd: Path,
    target: dict[str, Any],
) -> tuple[str, str | None]:
    if len(batch_text.encode("utf-8", errors="replace")) > MAX_DEV_BATCH_BYTES:
        return "deny", "the sftp put list is too large"
    root = target["root"]
    deploy_root = PurePosixPath(target["deploy_path"])
    puts = 0
    for raw_line in batch_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        match = DEV_PUT.fullmatch(line)
        if match is None:
            return (
                "deny",
                "the sftp batch allows only put of named files; other verbs, "
                "options, globs, and recursion are blocked",
            )
        local_raw, remote_raw = match.groups()
        if DEV_PATH_ESCAPE.search(local_raw) or DEV_PATH_ESCAPE.search(remote_raw):
            return "deny", "put paths must be concrete; globs, braces, and expansions are blocked"
        if ".." in Path(local_raw).parts:
            return "deny", "put paths must not contain .. segments"
        local = Path(local_raw)
        if not local.is_absolute():
            local = cwd / local
        try:
            local = local.resolve()
        except OSError:
            return "deny", "the put source cannot be inspected"
        if not local.is_file():
            return "deny", "the put source must be one existing file"
        try:
            relative = local.relative_to(root)
        except ValueError:
            return "deny", "the put source must be one file inside the repository"
        if ".git" in relative.parts:
            return "deny", "the put source must not be Git metadata"
        if is_protected_file(local):
            return "deny", "the put source must not be a protected instruction, secret, key, or database file"
        remote = PurePosixPath(remote_raw)
        if not remote.is_absolute() or ".." in remote.parts or remote_raw.endswith("/"):
            return "deny", "the put destination must be one concrete absolute file path"
        if remote == deploy_root or deploy_root not in remote.parents:
            return "deny", "the put destination is outside the configured DEV tree"
        if not str(remote).endswith("/" + relative.as_posix()):
            return "deny", "the put destination must mirror the repository-relative source under the DEV tree"
        puts += 1
    if puts == 0:
        return "deny", "the sftp batch needs at least one put of a named file"
    return "allow", None


def dev_deploy_decision(command: str, cwd: Path) -> tuple[str, str | None]:
    """Classify one command as the sanctioned DEV sftp upload or a denial.

    ``pass`` means no DEV sftp policy applies and the ordinary destructive-path
    policy decides. The admitted form is the only remote transfer the hook
    allows: one sshpass -e (or key-only) sftp invocation on the configured DEV
    host, port, user, and host pin, uploading a finite put list under the
    repository's DEV tree. The hook never executes the command to resolve
    variables; every path and flag must already be concrete.
    """

    words = static_simple_words(command)
    if words is not None and (is_safe_text(words) or is_safe_inspection(words)):
        return "pass", None
    header, body, heredoc_error = split_single_heredoc(command)
    if heredoc_error is not None:
        if SFTP_MENTION.search(command):
            return "deny", f"the DEV sftp upload is blocked: {heredoc_error}"
        return "pass", None
    segments = [segment.strip() for segment in re.split(r"&&|\|\||;|\n", header) if segment.strip()]
    sftp_indexes = [
        index for index, segment in enumerate(segments) if segment_mentions_sftp(segment)
    ]
    if not sftp_indexes:
        return "pass", None
    if len(sftp_indexes) != 1:
        return "deny", "exactly one sftp invocation per command is allowed"
    sftp_index = sftp_indexes[0]
    if sftp_index != len(segments) - 1:
        return "deny", "the sftp invocation must be the last command segment"
    target = dev_deploy_target(cwd)
    if target is None:
        return "deny", "no DEV deployment target is declared in this repository; sftp upload is blocked"
    prologue = segments[:sftp_index]
    sftp_words = static_simple_words(segments[sftp_index])
    if sftp_words is None:
        return "deny", "the sftp transport must be one concrete command without expansion"
    transport, sshpass, reason = dev_sftp_transport(sftp_words)
    if reason is not None:
        return "deny", reason
    if sshpass:
        expected = ["set +x", "set -a", ". ./.env", "set +a", DEV_SSHPASS_EXPORT]
        normalized = [". ./.env" if segment in DEV_ENV_SOURCES else segment for segment in prologue]
        if normalized != expected:
            return (
                "deny",
                'sshpass upload must source ./.env, export SSHPASS="$SSH_DEV_PASSWORD", '
                "and disable tracing",
            )
    elif prologue:
        return "deny", "the key-only sftp form takes no shell prologue"
    if not (target["root"] / ".env").is_file():
        return "deny", "the DEV deployment environment file is absent"
    reason = dev_sftp_destination(transport, target)
    if reason is not None:
        return "deny", reason
    batch = transport["batch"]
    if body is None:
        if not batch or batch == "-":
            return "deny", "sftp upload must name an explicit put list"
        if DEV_PATH_ESCAPE.search(batch) or ".." in Path(batch).parts:
            return "deny", "the sftp batch file must be one concrete path"
        batch_path = Path(batch)
        if not batch_path.is_absolute():
            batch_path = cwd / batch_path
        try:
            batch_path = batch_path.resolve()
        except OSError:
            return "deny", "the sftp batch file cannot be inspected"
        if not batch_path.is_file() or is_protected_file(batch_path):
            return "deny", "the sftp batch file must be one existing unprotected file"
        try:
            batch_text = batch_path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return "deny", "the sftp batch file cannot be read"
    else:
        if batch not in {None, "-"}:
            return "deny", "the sftp batch must come from either the heredoc or -b, not both"
        batch_text = body
    return dev_batch_decision(batch_text, cwd, target)


def remote_transfer_denial_reason(command: str, cwd: Path) -> str | None:
    """Block deployment-wide transfers while the DEV put list is the one exception."""

    words = static_simple_words(command)
    if words is not None and (is_safe_text(words) or is_safe_inspection(words)):
        return None
    piped = pipe_segments(command)
    heads: list[str] = []
    for segment in piped:
        segment_words = static_simple_words(segment)
        if segment_words is None:
            heads.append(naive_writer_head(segment))
            continue
        effective = strip_wrappers(segment_words)
        heads.append(executable_name(effective[0]) if effective else "")
    for index, head in enumerate(heads):
        if head == "tar" and index + 1 < len(heads) and heads[index + 1] in REMOTE_TRANSPORT_HEADS:
            return "streaming a tar archive to a remote host is blocked; use the explicit DEV sftp put list"
    for segment in piped:
        for subcommand in SUBCOMMAND_SPLIT.split(segment):
            sub_words = static_simple_words(subcommand)
            if sub_words is None:
                if WHOLE_TREE_DEPLOY.search(subcommand):
                    return "whole-workspace deployment commands are blocked; use the explicit DEV sftp put list"
                continue
            effective = strip_wrappers(sub_words)
            if not effective:
                continue
            head = executable_name(effective[0])
            if WHOLE_TREE_DEPLOY.search(subcommand):
                return "whole-workspace deployment commands are blocked; use the explicit DEV sftp put list"
            if head in {"rsync", "scp"} and any(
                REMOTE_TARGET.match(argument)
                for argument in effective[1:]
                if not argument.startswith("-")
            ):
                return "remote copy or sync deployment is blocked; use the explicit DEV sftp put list"
    return None


def bash_denial_reason(command: str, cwd: Path) -> str | None:
    lexical_text = command.replace("\\\r\n", "").replace("\\\n", "")
    literal_text = without_shell_comments(lexical_text)
    deploy_state, deploy_reason = dev_deploy_decision(literal_text, cwd)
    if deploy_state == "deny":
        return deploy_reason
    if deploy_state == "allow":
        if references_forbidden_capability(lexical_text):
            return "blocked by the global forbidden-capability policy"
        return None
    transfer_reason = remote_transfer_denial_reason(literal_text, cwd)
    if transfer_reason is not None:
        return transfer_reason
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
    effective = strip_wrappers(words) if words is not None else None
    if effective:
        executable = executable_name(effective[0])
        if executable in SHELL_INTERPRETERS:
            for position, argument in enumerate(effective[1:], start=1):
                if argument == "-c" or re.fullmatch(r"-[a-zA-Z]*c", argument):
                    script_index = position + 1
                    if script_index < len(effective) and effective[script_index] == "--":
                        script_index += 1
                    if script_index < len(effective):
                        return bash_denial_reason(effective[script_index], cwd)
                    break
        if executable == "eval" and len(effective) >= 2:
            return bash_denial_reason(" ".join(effective[1:]), cwd)
    forbidden = references_forbidden_capability(lexical_text)
    literal_risk = (
        DESTRUCTIVE_LITERAL.search(literal_text) is not None
        or SYSTEM_DESTRUCTIVE.search(literal_text) is not None
        or (effective is None and has_lexical_git_restore(literal_text))
    )
    if effective and executable_name(effective[0]) == "git":
        # A commit message may contain words such as "clean" or "rm". The
        # parsed git argv, not arbitrary message text, decides whether this is
        # the destructive `git clean` command.
        literal_risk = False
    destructive = (
        literal_risk
        or has_static_destructive_reference(effective)
    )
    if not forbidden and not destructive:
        writer = (
            write_target_denial_reason(effective, cwd)
            if effective
            else pipe_writer_reason(literal_text, cwd)
        )
        return redirection_denial_reason(literal_text, cwd) or writer
    if is_safe_text(effective):
        return None
    if forbidden:
        return "blocked by the global forbidden-capability policy"
    if is_safe_inspection(effective):
        return None

    kind = direct_destructive_kind(effective) if effective else None
    if kind is None:
        if EXPANSION_OR_GLOB.search(literal_text):
            return (
                "destructive command with an expansion or glob target is blocked; "
                "name one concrete path"
            )
        return (
            "literal destructive text appears in shell composition or an "
            "unsupported command; rewrite it as one reviewed direct command"
        )
    if kind == "git-restore":
        return direct_restore_denial_reason(effective, cwd)
    return direct_destructive_denial_reason(effective, cwd)


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

    # The repository's own instruction file is maintained by the session that
    # owns the repository, so the sanctioned edit path may update it; deleting
    # it, moving another file onto it, shell writers, and the installed global
    # instruction files stay denied (see the sh-105 decision).
    repo_root = find_repo_root(cwd)
    repo_instructions = {repo_root / "AGENTS.md", repo_root / "CLAUDE.md"} if repo_root is not None else set()
    write_paths = re.findall(r"^\*\*\* (?:Add|Update) File: (.+)$", command, re.MULTILINE)
    for raw_target in write_paths:
        target = resolve_target(raw_target.strip(), cwd)
        if target is None:
            return "file write target is not inspectable"
        if target in repo_instructions:
            continue
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
    moved_destinations: list[str] = []
    current_update: str | None = None
    for line in command.splitlines():
        if line.startswith("*** Update File: "):
            current_update = line.removeprefix("*** Update File: ")
        elif line.startswith(("*** Add File: ", "*** Delete File: ")):
            current_update = None
        elif line.startswith("*** Move to: "):
            moved_destinations.append(line.removeprefix("*** Move to: "))
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
    for raw_destination in moved_destinations:
        destination = resolve_target(raw_destination.strip(), cwd)
        if destination is None:
            return "file move destination is not inspectable"
        reason = protected_path_reason(destination, cwd, recursive=False)
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
        return emit_denial(denial_reason)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
