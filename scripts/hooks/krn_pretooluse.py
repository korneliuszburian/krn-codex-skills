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
    destructive_denial_reason,
    protected_path_reason,
    resolve_target,
)


DYNAMIC_SHELL_TARGET = re.compile(r"[$`*?{}\[\]]")
SHELL_EXECUTABLES = {"bash", "dash", "ksh", "sh", "zsh"}
SHELL_WRAPPERS = {"builtin", "command", "exec", "nohup", "rtk"}
SHELL_COMMAND_OPTIONS = {"--command", "--commands"}
SHELL_VALUE_OPTIONS = {"-O", "-o", "--init-file", "--rcfile"}
PIPELINE_WRAPPER_VALUE_OPTIONS = {
    "doas": {"-a", "-C", "-u"},
    "setsid": set(),
    "stdbuf": {"-e", "-i", "-o", "--error", "--input", "--output"},
    "sudo": {
        "-C", "-D", "-g", "-h", "-p", "-R", "-r", "-T", "-t", "-u",
        "--chdir", "--chroot", "--close-from", "--command-timeout", "--group",
        "--host", "--prompt", "--role", "--type", "--user",
    },
    "time": {"-f", "-o", "--format", "--output"},
}
PIPELINE_OPAQUE_SINKS = {
    ".", "{", "case", "coproc", "for", "function", "if", "select", "source",
    "until", "while",
}
PIPELINE_STDIN_TARGET_COMMANDS = {"rm", "rmdir", "unlink"}
PIPELINE_WRAPPERS = {"!", "doas", "setsid", "stdbuf", "sudo", "time"}
XARGS_VALUE_OPTIONS = {
    "-a", "-d", "-E", "-I", "-J", "-L", "-n", "-P", "-R", "-S", "-s",
    "--arg-file", "--delimiter", "--logical-eof", "--max-args", "--max-chars",
    "--max-lines", "--max-procs", "--process-slot-var", "--replstr",
}
ENV_VALUE_OPTIONS = {"-a", "--argv0", "-C", "--chdir", "-u", "--unset"}
ENV_SPLIT_OPTIONS = {"-S", "--split-string"}
EXEC_VALUE_OPTIONS = {"-a"}
ASSIGNMENT_WORD = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
PLUGIN_COMMANDS = {"plugin", "plugins"}
EXTENSION_COMMANDS = {"extension", "extensions"}
SKILL_COMMANDS = {"skill", "skills"}
CLAUDE_PLUGIN_LOAD_OPTIONS = {"--plugin-dir", "--plugin-url"}
COPILOT_PLUGIN_LOAD_OPTIONS = {"--plugin-dir"}
CODEX_CONFIG_OPTIONS = {"-c", "--config"}
GEMINI_EXTENSION_OPTIONS = {"-e", "--extensions"}
CAPABILITY_ACTIONS = {
    "add", "browse", "details", "enable", "i", "init", "install", "link",
    "list", "marketplace", "new", "tag", "update", "upgrade", "validate",
}
GIT_VALUE_OPTIONS = {
    "-C", "-c", "--config-env", "--git-dir", "--namespace", "--super-prefix",
    "--work-tree",
}


SUPERPOWERS_BLOCKED_MARKERS = (
    "plugin add",
    "codex plugin add",
    "codex plugin marketplace add",
    "plugin install",
    "add-plugin",
    "copilot plugin install",
    "copilot plugin marketplace add",
    "gemini extensions install",
    "gemini extensions update",
    "git clone",
    "curl ",
    "wget ",
    ".codex/superpowers",
    ".codex/plugins/cache/openai-curated/superpowers",
    ".codex/plugins/cache/openai-curated-remote/superpowers",
    ".tmp/plugins/plugins/superpowers",
    "superpowers/skills",
    "superpowers/skill.md",
)


def command_tokens(command: str) -> tuple[str, ...]:
    lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|()")
    lexer.whitespace_split = True
    lexer.commenters = ""
    try:
        return tuple(lexer)
    except ValueError:
        return ()


def without_inactive_shell_comments(command: str) -> str:
    """Remove executable-shell comments while preserving quoted hash data."""

    output: list[str] = []
    quote: str | None = None
    word_start = True
    index = 0
    while index < len(command):
        character = command[index]
        if quote is not None:
            output.append(character)
            if character == "\\" and quote == '"' and index + 1 < len(command):
                index += 1
                output.append(command[index])
            elif character == quote:
                quote = None
            index += 1
            continue
        if character == "\\" and index + 1 < len(command):
            output.extend(command[index:index + 2])
            index += 2
            word_start = False
            continue
        if character in {"'", '"'}:
            quote = character
            output.append(character)
            index += 1
            word_start = False
            continue
        if character == "#" and word_start:
            newline = command.find("\n", index + 1)
            if newline < 0:
                break
            output.append("\n")
            index = newline + 1
            word_start = True
            continue
        output.append(character)
        word_start = character.isspace() or character in ";&|()< >"
        index += 1
    return "".join(output)


def with_unquoted_newline_boundaries(command: str) -> str:
    """Represent executable newlines as command boundaries for shlex."""

    output: list[str] = []
    quote: str | None = None
    index = 0
    while index < len(command):
        character = command[index]
        if quote is not None:
            output.append(character)
            if character == "\\" and quote == '"' and index + 1 < len(command):
                index += 1
                output.append(command[index])
            elif character == quote:
                quote = None
            index += 1
            continue
        if character == "\\" and index + 1 < len(command):
            output.extend(command[index:index + 2])
            index += 2
            continue
        if character in {"'", '"'}:
            quote = character
            output.append(character)
            index += 1
            continue
        output.append(";" if character in "\r\n" else character)
        index += 1
    return "".join(output)


def arithmetic_expression_end(text: str, index: int) -> int:
    parenthesis_depth = 0
    while index < len(text):
        if text[index] == "\\":
            index += 2
            continue
        if text[index] == "(":
            parenthesis_depth += 1
            index += 1
            continue
        if text[index] == ")":
            if parenthesis_depth == 0 and text[index:index + 2] == "))":
                return index + 2
            if parenthesis_depth > 0:
                parenthesis_depth -= 1
        index += 1
    return index


def command_substitution_end(
    text: str,
    index: int,
    *,
    depth: int = 0,
) -> int | None:
    if depth > 8:
        return None
    parenthesis_depth = 0
    quote: str | None = None
    while index < len(text):
        character = text[index]
        if quote is not None:
            if character == "\\" and quote == '"':
                index += 2
                continue
            if character == quote:
                quote = None
            index += 1
            continue
        if character == "\\":
            index += 2
            continue
        if character in {"'", '"'}:
            quote = character
            index += 1
            continue
        if text[index:index + 2] == "$(":
            nested_end = command_substitution_end(
                text,
                index + 2,
                depth=depth + 1,
            )
            if nested_end is None:
                return None
            index = nested_end
            continue
        if character == "(":
            parenthesis_depth += 1
        elif character == ")":
            if parenthesis_depth == 0:
                return index + 1
            parenthesis_depth -= 1
        index += 1
    return None


def backtick_substitution_end(text: str, index: int) -> int | None:
    while index < len(text):
        if text[index] == "\\":
            index += 2
            continue
        if text[index] == "`":
            return index + 1
        index += 1
    return None


def heredoc_expansion_commands(
    body: str,
    *,
    depth: int = 0,
) -> tuple[str, ...] | None:
    if depth > 8:
        return None
    commands: list[str] = []
    index = 0
    while index < len(body):
        if body[index] == "\\" and index + 1 < len(body):
            index += 2
            continue
        if body[index:index + 3] == "$((":
            arithmetic_end = arithmetic_expression_end(body, index + 3)
            arithmetic_body = body[index + 3:max(index + 3, arithmetic_end - 2)]
            nested = heredoc_expansion_commands(
                arithmetic_body,
                depth=depth + 1,
            )
            if nested is None:
                return None
            commands.extend(nested)
            index = arithmetic_end
            continue
        if body[index:index + 2] == "$(":
            end = command_substitution_end(body, index + 2)
            if end is None:
                return None
            commands.append(body[index + 2:end - 1])
            index = end
            continue
        if body[index] == "`":
            end = backtick_substitution_end(body, index + 1)
            if end is None:
                return None
            commands.append(body[index + 1:end - 1])
            index = end
            continue
        index += 1
    return tuple(commands)


def shell_expansion_commands(
    command: str,
    *,
    depth: int = 0,
) -> tuple[str, ...] | None:
    if depth > 8:
        return None
    commands: list[str] = []
    quote: str | None = None
    index = 0
    while index < len(command):
        character = command[index]
        if quote == "'":
            if character == "'":
                quote = None
            index += 1
            continue
        if character == "\\":
            index += 2
            continue
        if character in {"'", '"'}:
            if quote is None:
                quote = character
            elif quote == character:
                quote = None
            index += 1
            continue
        if command[index:index + 3] == "$((":
            arithmetic_end = arithmetic_expression_end(command, index + 3)
            arithmetic_body = command[
                index + 3:max(index + 3, arithmetic_end - 2)
            ]
            nested = shell_expansion_commands(
                arithmetic_body,
                depth=depth + 1,
            )
            if nested is None:
                return None
            commands.extend(nested)
            index = arithmetic_end
            continue
        if command[index:index + 2] == "$(":
            end = command_substitution_end(command, index + 2)
            if end is None:
                return None
            nested_command = command[index + 2:end - 1]
            commands.append(nested_command)
            nested_view, nested_uninspectable = shell_view_without_heredoc_data(
                nested_command
            )
            if nested_uninspectable:
                return None
            nested = shell_expansion_commands(
                nested_view,
                depth=depth + 1,
            )
            if nested is None:
                return None
            commands.extend(nested)
            index = end
            continue
        if character == "`":
            end = backtick_substitution_end(command, index + 1)
            if end is None:
                return None
            nested_command = command[index + 1:end - 1]
            commands.append(nested_command)
            nested_view, nested_uninspectable = shell_view_without_heredoc_data(
                nested_command
            )
            if nested_uninspectable:
                return None
            nested = shell_expansion_commands(
                nested_view,
                depth=depth + 1,
            )
            if nested is None:
                return None
            commands.extend(nested)
            index = end
            continue
        index += 1
    return tuple(commands)


def shell_view_with_expansion_commands(command: str) -> tuple[str, bool]:
    commands = shell_expansion_commands(command)
    if commands is None:
        return command, True
    nested_views: list[str] = []
    uninspectable = False
    for nested in commands:
        nested_view, nested_uninspectable = shell_view_without_heredoc_data(nested)
        nested_views.append(without_inactive_shell_comments(nested_view))
        uninspectable = uninspectable or nested_uninspectable
    suffix = "".join(f";{nested};" for nested in nested_views)
    return command + suffix, uninspectable


def heredoc_declarations(line: str) -> tuple[tuple[str, bool, bool], ...]:
    declarations: list[tuple[str, bool, bool]] = []
    index = 0
    quote: str | None = None
    while index < len(line):
        character = line[index]
        if quote is not None:
            if character == "\\" and quote == '"':
                index += 2
                continue
            if character == quote:
                quote = None
            index += 1
            continue
        if character == "\\":
            index += 2
            continue
        if character in {"'", '"'}:
            quote = character
            index += 1
            continue
        if character == "#" and (
            index == 0 or line[index - 1].isspace() or line[index - 1] in ";&|()<>"
        ):
            break
        if line[index:index + 3] == "$((":
            index = arithmetic_expression_end(line, index + 3)
            continue
        if line[index:index + 2] == "((":
            index = arithmetic_expression_end(line, index + 2)
            continue
        if line[index:index + 2] != "<<" or line[index:index + 3] == "<<<":
            index += 1
            continue
        index += 2
        strip_tabs = line[index:index + 1] == "-"
        if strip_tabs:
            index += 1
        while index < len(line) and line[index] in " \t":
            index += 1
        delimiter: list[str] = []
        delimiter_quote: str | None = None
        quoted_delimiter = False
        while index < len(line):
            character = line[index]
            if delimiter_quote is not None:
                if character == "\\" and delimiter_quote == '"' and index + 1 < len(line):
                    index += 1
                    delimiter.append(line[index])
                elif character == delimiter_quote:
                    delimiter_quote = None
                else:
                    delimiter.append(character)
                index += 1
                continue
            if character in {"'", '"'}:
                quoted_delimiter = True
                delimiter_quote = character
                index += 1
                continue
            if character == "\\" and index + 1 < len(line):
                quoted_delimiter = True
                index += 1
                delimiter.append(line[index])
                index += 1
                continue
            if character.isspace() or character in ";&|()<>":
                break
            delimiter.append(character)
            index += 1
        if delimiter:
            declarations.append(
                ("".join(delimiter), strip_tabs, not quoted_delimiter)
            )
    return tuple(declarations)


def shell_view_without_heredoc_data(command: str) -> tuple[str, bool]:
    """Mask heredoc data and retain commands expanded by unquoted heredocs."""

    lines = command.splitlines(keepends=True)
    output: list[str] = []
    uninspectable_expansion = False
    index = 0
    while index < len(lines):
        line = lines[index]
        output.append(line)
        pending = list(heredoc_declarations(line))
        index += 1
        while pending and index < len(lines):
            delimiter, strip_tabs, expands = pending.pop(0)
            body: list[str] = []
            while index < len(lines):
                body_line = lines[index]
                candidate = body_line.rstrip("\r\n")
                if strip_tabs:
                    candidate = candidate.lstrip("\t")
                output.append("\n" if body_line.endswith(("\n", "\r")) else "")
                index += 1
                if candidate == delimiter:
                    break
                body.append(body_line)
            if expands:
                commands = heredoc_expansion_commands("".join(body))
                if commands is None:
                    uninspectable_expansion = True
                else:
                    output.extend(f"\n{nested}\n" for nested in commands)
    return "".join(output), uninspectable_expansion


def without_heredoc_bodies(command: str) -> str:
    """Mask heredoc data while retaining inspectable executable expansions."""

    return shell_view_without_heredoc_data(command)[0]


def contains_active_process_substitution(
    command: str,
    *,
    depth: int = 0,
) -> bool:
    """Find process substitution in active shell syntax, not quoted data."""

    if depth > 8:
        return True
    command = without_heredoc_bodies(command)

    def scan_command_substitution(index: int) -> tuple[bool, int]:
        end = command_substitution_end(command, index)
        if end is None:
            return True, len(command)
        nested = command[index:end - 1]
        return contains_active_process_substitution(nested, depth=depth + 1), end

    def scan_backtick_substitution(index: int) -> tuple[bool, int]:
        end = backtick_substitution_end(command, index)
        if end is None:
            return True, len(command)
        nested = command[index:end - 1]
        return contains_active_process_substitution(nested, depth=depth + 1), end

    def scan_double_quote(index: int) -> tuple[bool, int]:
        while index < len(command):
            character = command[index]
            if character == "\\":
                index += 2
                continue
            if character == '"':
                return False, index + 1
            if command[index:index + 3] == "$((":
                found, index = scan_arithmetic(index + 3)
                if found:
                    return True, index
                continue
            if character == "$" and command[index + 1:index + 2] == "(":
                found, index = scan_command_substitution(index + 2)
                if found:
                    return True, index
                continue
            if character == "`":
                found, index = scan_backtick_substitution(index + 1)
                if found:
                    return True, index
                continue
            index += 1
        return False, index

    def scan_shell(index: int, terminator: str | None = None) -> tuple[bool, int]:
        parenthesis_depth = 0
        word_start = True
        while index < len(command):
            character = command[index]
            if terminator == "`" and character == "`":
                return False, index + 1
            if terminator == ")" and character == ")":
                if parenthesis_depth == 0:
                    return False, index + 1
                parenthesis_depth -= 1
                index += 1
                word_start = False
                continue
            if character == "\\":
                index += 2
                word_start = False
                continue
            if character == "'":
                closing = command.find("'", index + 1)
                index = len(command) if closing < 0 else closing + 1
                word_start = False
                continue
            if character == '"':
                found, index = scan_double_quote(index + 1)
                if found:
                    return True, index
                word_start = False
                continue
            if character == "#" and word_start:
                newline = command.find("\n", index + 1)
                index = len(command) if newline < 0 else newline + 1
                word_start = True
                continue
            if character in "<>" and command[index + 1:index + 2] == "(":
                return True, index
            if command[index:index + 3] == "$((":
                found, index = scan_arithmetic(index + 3)
                if found:
                    return True, index
                word_start = False
                continue
            if character == "$" and command[index + 1:index + 2] == "(":
                found, index = scan_command_substitution(index + 2)
                if found:
                    return True, index
                word_start = False
                continue
            if character == "`":
                found, index = scan_backtick_substitution(index + 1)
                if found:
                    return True, index
                word_start = False
                continue
            if character == "(":
                parenthesis_depth += 1
            word_start = character.isspace() or character in ";&|()< >"
            index += 1
        return False, index

    def scan_arithmetic(
        index: int,
        arithmetic_depth: int = 0,
    ) -> tuple[bool, int]:
        if arithmetic_depth > 8:
            return True, len(command)
        parenthesis_depth = 0
        while index < len(command):
            character = command[index]
            if character == "\\":
                index += 2
                continue
            if command[index:index + 3] == "$((":
                found, index = scan_arithmetic(
                    index + 3,
                    arithmetic_depth + 1,
                )
                if found:
                    return True, index
                continue
            if character == "$" and command[index + 1:index + 2] == "(":
                found, index = scan_command_substitution(index + 2)
                if found:
                    return True, index
                continue
            if character == "`":
                found, index = scan_backtick_substitution(index + 1)
                if found:
                    return True, index
                continue
            if character == "(":
                parenthesis_depth += 1
                index += 1
                continue
            if character == ")":
                if parenthesis_depth == 0 and command[index:index + 2] == "))":
                    return False, index + 2
                if parenthesis_depth > 0:
                    parenthesis_depth -= 1
            index += 1
        return False, index

    found, _ = scan_shell(0)
    return found


def command_segments(command: str) -> tuple[tuple[str, ...], ...]:
    tokens = command_tokens(command)
    segments: list[tuple[str, ...]] = []
    current: list[str] = []
    for token in tokens:
        if token and all(character in ";&|()" for character in token):
            if current:
                segments.append(tuple(current))
                current = []
            continue
        current.append(token)
    if current:
        segments.append(tuple(current))
    return tuple(segments)


def command_words(segment: tuple[str, ...]) -> tuple[str, ...]:
    words = list(segment)
    while words and ASSIGNMENT_WORD.match(words[0]):
        words.pop(0)
    while words:
        executable = words[0].rsplit("/", 1)[-1].lower()
        if executable == "env":
            words.pop(0)
            while words:
                if ASSIGNMENT_WORD.match(words[0]):
                    words.pop(0)
                    continue
                if words[0] == "--":
                    words.pop(0)
                    break
                if not words[0].startswith("-"):
                    break
                option = words.pop(0)
                option_name, separator, inline_value = option.partition("=")
                attached_name = next(
                    (
                        name
                        for name in (*ENV_VALUE_OPTIONS, *ENV_SPLIT_OPTIONS)
                        if len(name) == 2 and option.startswith(name) and option != name
                    ),
                    None,
                )
                if attached_name is not None:
                    option_name = attached_name
                    separator = "="
                    inline_value = option[len(attached_name):].removeprefix("=")
                if option_name in ENV_SPLIT_OPTIONS:
                    if not separator:
                        if not words:
                            break
                        inline_value = words.pop(0)
                    try:
                        words[:0] = shlex.split(inline_value, posix=True)
                    except ValueError:
                        return ("$UNINSPECTABLE_ENV_SPLIT", *words)
                    continue
                if option_name in ENV_VALUE_OPTIONS and not separator and words:
                    words.pop(0)
            continue
        if executable == "timeout":
            words.pop(0)
            while words and words[0].startswith("-"):
                option = words.pop(0)
                if option in {"-k", "--kill-after", "-s", "--signal"} and words:
                    words.pop(0)
            if words:
                words.pop(0)
            continue
        if executable == "nice":
            words.pop(0)
            while words and words[0].startswith("-"):
                option = words.pop(0)
                if option in {"-n", "--adjustment"} and words:
                    words.pop(0)
            continue
        if executable == "exec":
            words.pop(0)
            while words and words[0].startswith("-"):
                option = words.pop(0)
                option_name = option.split("=", 1)[0]
                if option_name in EXEC_VALUE_OPTIONS and "=" not in option and words:
                    words.pop(0)
            continue
        if executable in SHELL_WRAPPERS:
            words.pop(0)
            while words and words[0].startswith("-"):
                words.pop(0)
            continue
        break
    return tuple(words)


def starts_with(words: tuple[str, ...], prefix: tuple[str, ...]) -> bool:
    return tuple(word.lower() for word in words[: len(prefix)]) == prefix


def strip_leading_options(
    words: tuple[str, ...],
    value_options: set[str],
) -> tuple[str, ...]:
    remaining = list(words)
    while remaining and remaining[0].startswith("-"):
        option = remaining.pop(0)
        if option == "--":
            break
        option_name = option.split("=", 1)[0]
        if option_name in value_options and "=" not in option and remaining:
            remaining.pop(0)
    return tuple(remaining)


def pipeline_command_words(
    segment: tuple[str, ...],
) -> tuple[tuple[str, ...], bool]:
    words = command_words(segment)
    arguments_from_stdin = False
    while words:
        executable = words[0].rsplit("/", 1)[-1].lower()
        if executable in PIPELINE_WRAPPERS:
            words = command_words(
                strip_leading_options(
                    words[1:],
                    PIPELINE_WRAPPER_VALUE_OPTIONS.get(executable, set()),
                )
            )
            continue
        if executable == "xargs":
            arguments_from_stdin = True
            dispatched = strip_leading_options(words[1:], XARGS_VALUE_OPTIONS)
            words = command_words(dispatched) if dispatched else ("echo",)
            continue
        break
    return words, arguments_from_stdin


def pipeline_stdin_targets_sensitive_command(words: tuple[str, ...]) -> bool:
    if not words:
        return True
    if DYNAMIC_SHELL_TARGET.search(words[0]):
        return True
    executable = words[0].rsplit("/", 1)[-1].lower()
    if executable in PIPELINE_STDIN_TARGET_COMMANDS:
        return True
    if mutator_target(words) is not None:
        return True
    selector_options = {
        "claude": CLAUDE_PLUGIN_LOAD_OPTIONS,
        "codex": CODEX_CONFIG_OPTIONS,
        "copilot": COPILOT_PLUGIN_LOAD_OPTIONS,
        "gemini": GEMINI_EXTENSION_OPTIONS,
    }.get(executable, set())
    if any(
        argument.split("=", 1)[0] in selector_options
        for argument in words[1:]
    ):
        return True
    if executable == "git":
        git_arguments = strip_leading_options(words[1:], GIT_VALUE_OPTIONS)
        return starts_with(git_arguments, ("clean",))
    return False


def declared_shell_functions(tokens: tuple[str, ...]) -> set[str]:
    names: set[str] = set()
    for index, token in enumerate(tokens):
        if (
            ASSIGNMENT_WORD.fullmatch(f"{token}=")
            and index + 2 < len(tokens)
            and tokens[index + 1] == "()"
            and tokens[index + 2] == "{"
        ):
            names.add(token)
        if token == "function" and index + 2 < len(tokens):
            candidate = tokens[index + 1]
            brace_index = index + 2 + (tokens[index + 2] == "()")
            if (
                ASSIGNMENT_WORD.fullmatch(f"{candidate}=")
                and brace_index < len(tokens)
                and tokens[brace_index] == "{"
            ):
                names.add(candidate)
    return names


def pipeline_sink_is_uninspectable(
    command: str,
    *,
    depth: int = 0,
) -> bool:
    """Reject opaque program text or executable identity at a pipeline sink."""

    if depth > 8:
        return True
    tokens = command_tokens(command)
    function_names = declared_shell_functions(tokens)
    for segment in command_segments(command):
        words, arguments_from_stdin = pipeline_command_words(segment)
        if (
            arguments_from_stdin
            and pipeline_stdin_targets_sensitive_command(words)
        ):
            return True
        nested = nested_shell_command(words)
        if nested is not None and pipeline_sink_is_uninspectable(
            nested,
            depth=depth + 1,
        ):
            return True
        if words and words[0].rsplit("/", 1)[-1].lower() == "eval":
            evaluated = " ".join(words[1:])
            if evaluated and pipeline_sink_is_uninspectable(
                evaluated,
                depth=depth + 1,
            ):
                return True
    for pipe_index, token in enumerate(tokens):
        if token not in {"|", "|&"}:
            continue
        downstream: list[str] = []
        for candidate in tokens[pipe_index + 1:]:
            if candidate and all(character in ";&|()" for character in candidate):
                break
            downstream.append(candidate)
        words, arguments_from_stdin = pipeline_command_words(tuple(downstream))
        if not words:
            return True
        executable = words[0]
        executable_name = executable.rsplit("/", 1)[-1].lower()
        if (
            DYNAMIC_SHELL_TARGET.search(executable)
            or executable_name in SHELL_EXECUTABLES
            or executable_name in PIPELINE_OPAQUE_SINKS
            or executable in function_names
            or (
                arguments_from_stdin
                and pipeline_stdin_targets_sensitive_command(words)
            )
        ):
            return True
    return False


def shell_program_source_is_uninspectable(
    command: str,
    *,
    depth: int = 0,
) -> bool:
    if depth > 8:
        return True
    for segment in command_segments(command):
        words, _ = pipeline_command_words(segment)
        if not words:
            continue
        executable = words[0].rsplit("/", 1)[-1].lower()
        if executable in {".", "source"}:
            return True
        if executable == "eval":
            evaluated = " ".join(words[1:])
            if DYNAMIC_SHELL_TARGET.search(evaluated):
                return True
            if evaluated and shell_program_source_is_uninspectable(
                evaluated,
                depth=depth + 1,
            ):
                return True
            continue
        if executable not in SHELL_EXECUTABLES:
            continue
        arguments = words[1:]
        if any(argument in {"--help", "--version"} for argument in arguments):
            continue
        no_execute = shell_no_execute(arguments)
        has_inline_command = any(
            argument in SHELL_COMMAND_OPTIONS
            or (
                argument.startswith("-")
                and not argument.startswith("--")
                and "c" in argument[1:]
            )
            for argument in arguments
        )
        if not no_execute and not has_inline_command:
            return True
        if no_execute:
            continue
        nested = nested_shell_command(words)
        if nested is not None:
            if DYNAMIC_SHELL_TARGET.search(nested):
                return True
            if shell_program_source_is_uninspectable(
                nested,
                depth=depth + 1,
            ):
                return True
    return False


def dynamic_executable_is_uninspectable(command: str) -> bool:
    for segment in command_segments(command):
        words, _ = pipeline_command_words(segment)
        if words and DYNAMIC_SHELL_TARGET.search(words[0]):
            return True
    return False


def shell_no_execute(arguments: tuple[str, ...]) -> bool:
    return any(
        argument == "--noexec"
        or (
            argument.startswith("-")
            and not argument.startswith("--")
            and "n" in argument[1:]
        )
        for argument in arguments
    )


def nested_destructive_denial_reason(
    command: str,
    cwd: Path,
    *,
    depth: int = 0,
) -> str | None:
    """Inspect actual eval or nested-shell program text for destructive work."""

    if depth > 8:
        return "nested shell command is too deep to inspect safely"
    for segment in command_segments(command):
        words, _ = pipeline_command_words(segment)
        if not words:
            continue
        executable = words[0].rsplit("/", 1)[-1].lower()
        if executable in SHELL_EXECUTABLES and shell_no_execute(words[1:]):
            continue
        nested = nested_shell_command(words)
        if executable == "eval":
            nested = " ".join(words[1:])
        if not nested or DYNAMIC_SHELL_TARGET.search(nested):
            continue
        reason = destructive_denial_reason(nested, cwd)
        if reason is not None:
            return reason
        reason = nested_destructive_denial_reason(
            nested,
            cwd,
            depth=depth + 1,
        )
        if reason is not None:
            return reason
    return None


def option_values(
    arguments: tuple[str, ...],
    option_names: set[str],
    *,
    consume_array: bool = False,
) -> tuple[str, ...]:
    values: list[str] = []
    index = 0
    while index < len(arguments):
        option_name, separator, inline_value = arguments[index].partition("=")
        short_option = next(
            (
                name
                for name in option_names
                if name.startswith("-")
                and not name.startswith("--")
                and arguments[index].startswith(name)
                and arguments[index] != name
            ),
            None,
        )
        if short_option is not None:
            values.append(arguments[index][len(short_option):].removeprefix("="))
        elif option_name in option_names:
            if separator:
                values.append(inline_value)
            elif index + 1 < len(arguments):
                if consume_array:
                    while (
                        index + 1 < len(arguments)
                        and not arguments[index + 1].startswith("-")
                    ):
                        index += 1
                        values.append(arguments[index])
                else:
                    values.append(arguments[index + 1])
                    index += 1
        index += 1
    return tuple(values)


def arguments_after_command(
    arguments: tuple[str, ...],
    commands: set[str],
) -> tuple[str, ...]:
    for index, argument in enumerate(arguments):
        if argument.lower() in commands:
            return arguments[index + 1:]
    return ()


def mutator_target(words: tuple[str, ...]) -> tuple[str, ...] | None:
    if not words:
        return None
    executable = words[0].rsplit("/", 1)[-1].lower()
    arguments = words[1:]
    if (
        executable in {"claude", "codex", "copilot", "gemini"}
        or DYNAMIC_SHELL_TARGET.search(words[0])
    ) and any(DYNAMIC_SHELL_TARGET.search(argument) for argument in arguments):
        if any(argument.lower() in CAPABILITY_ACTIONS for argument in arguments):
            return arguments
    if executable == "claude":
        load_targets = option_values(arguments, CLAUDE_PLUGIN_LOAD_OPTIONS)
        plugin_targets = arguments_after_command(arguments, PLUGIN_COMMANDS)
        if load_targets or plugin_targets:
            return (*load_targets, *plugin_targets)
    if executable == "codex" or DYNAMIC_SHELL_TARGET.search(words[0]):
        config_targets = option_values(arguments, CODEX_CONFIG_OPTIONS)
        plugin_targets = arguments_after_command(arguments, {"plugin"})
        if config_targets or plugin_targets:
            return (*config_targets, *plugin_targets)
    if executable == "copilot":
        load_targets = option_values(arguments, COPILOT_PLUGIN_LOAD_OPTIONS)
        capability_targets = arguments_after_command(
            arguments,
            PLUGIN_COMMANDS | SKILL_COMMANDS,
        )
        if load_targets or capability_targets:
            return (*load_targets, *capability_targets)
    if executable == "gemini":
        selector_targets = option_values(
            arguments,
            GEMINI_EXTENSION_OPTIONS,
            consume_array=True,
        )
        capability_targets = arguments_after_command(
            arguments,
            EXTENSION_COMMANDS | SKILL_COMMANDS,
        )
        if selector_targets or capability_targets:
            return (*selector_targets, *capability_targets)
    if executable == "add-plugin":
        return arguments
    if executable == "git":
        git_arguments = strip_leading_options(arguments, GIT_VALUE_OPTIONS)
        if starts_with(git_arguments, ("clone",)):
            return git_arguments[1:]
    if executable in {"curl", "wget"}:
        return arguments
    return None


def nested_shell_command(words: tuple[str, ...]) -> str | None:
    if not words:
        return None
    executable = words[0].rsplit("/", 1)[-1].lower()
    if executable not in SHELL_EXECUTABLES:
        return None
    index = 1
    while index < len(words):
        argument = words[index]
        if argument == "--":
            return None
        option_name = argument.split("=", 1)[0]
        if option_name in SHELL_VALUE_OPTIONS:
            index += 1 if "=" in argument else 2
            continue
        if argument in SHELL_COMMAND_OPTIONS:
            return words[index + 1] if index + 1 < len(words) else None
        if argument.startswith("--"):
            index += 1
            continue
        if argument.startswith(("-O", "-o")) and len(argument) > 2:
            index += 1
            continue
        if argument.startswith("-") and not argument.startswith("--"):
            if "c" in argument[1:]:
                return words[index + 1] if index + 1 < len(words) else None
            index += 1
            continue
        return None
    return None


def target_is_forbidden(target: str, cwd: Path) -> bool:
    if "superpowers" in target.lower():
        return True
    try:
        candidate = Path(target).expanduser()
        resolved = candidate if candidate.is_absolute() else cwd / candidate
        return "superpowers" in str(resolved.resolve(strict=False)).lower()
    except (OSError, RuntimeError, ValueError):
        return True


def directory_transition(
    words: tuple[str, ...],
    cwd: Path | None,
) -> tuple[bool, Path | None]:
    if not words:
        return False, cwd
    executable = words[0].rsplit("/", 1)[-1].lower()
    if executable == "popd":
        return True, None
    if executable not in {"cd", "pushd"}:
        return False, cwd
    if cwd is None:
        return True, None

    arguments = list(words[1:])
    while arguments and arguments[0].startswith("-") and arguments[0] != "-":
        if arguments.pop(0) == "--":
            break
    if not arguments:
        return True, Path.home().resolve() if executable == "cd" else None
    target = arguments[0]
    if target == "-" or DYNAMIC_SHELL_TARGET.search(target):
        return True, None
    try:
        candidate = Path(target).expanduser()
        if not candidate.is_absolute():
            candidate = cwd / candidate
        return True, candidate.resolve(strict=False)
    except (OSError, RuntimeError, ValueError):
        return True, None


def command_is_forbidden(
    command: str,
    cwd: Path | None,
    *,
    depth: int = 0,
) -> bool:
    if depth > 8:
        return True
    active_cwd = cwd
    for segment in command_segments(command):
        words = command_words(segment)
        if not words:
            continue
        normalized = " ".join(words).lower()
        if any(
            "/" in marker and marker in normalized
            for marker in SUPERPOWERS_BLOCKED_MARKERS
        ):
            return True
        changed_directory, active_cwd = directory_transition(words, active_cwd)
        if changed_directory and active_cwd is not None:
            if target_is_forbidden(".", active_cwd):
                return True
        target = mutator_target(words)
        if target is not None:
            if DYNAMIC_SHELL_TARGET.search(words[0]) or any(
                DYNAMIC_SHELL_TARGET.search(word) for word in (*segment, *target)
            ):
                return True
            if active_cwd is None:
                return True
            if any(
                target_is_forbidden(word, active_cwd)
                for word in (*segment, *target)
            ):
                return True
        for index in range(1, len(segment)):
            embedded_words = tuple(segment[index:])
            changed_directory, embedded_cwd = directory_transition(
                embedded_words,
                active_cwd,
            )
            if changed_directory:
                active_cwd = embedded_cwd
                if active_cwd is not None and target_is_forbidden(".", active_cwd):
                    return True
            embedded_target = mutator_target(embedded_words)
            if embedded_target is None:
                embedded_nested = nested_shell_command(embedded_words)
                if embedded_nested is not None and command_is_forbidden(
                    embedded_nested,
                    active_cwd,
                    depth=depth + 1,
                ):
                    return True
                if embedded_words[0].rsplit("/", 1)[-1].lower() == "eval":
                    evaluated = " ".join(embedded_words[1:])
                    if DYNAMIC_SHELL_TARGET.search(evaluated):
                        return True
                    if evaluated and command_is_forbidden(
                        evaluated,
                        active_cwd,
                        depth=depth + 1,
                    ):
                        return True
            else:
                if any(
                    DYNAMIC_SHELL_TARGET.search(word)
                    for word in (*segment, *embedded_target)
                ):
                    return True
                if active_cwd is None:
                    return True
                if any(
                    target_is_forbidden(word, active_cwd)
                    for word in (*segment, *embedded_target)
                ):
                    return True
        if words[0].rsplit("/", 1)[-1].lower() == "eval":
            evaluated = " ".join(words[1:])
            if DYNAMIC_SHELL_TARGET.search(evaluated):
                return True
            if evaluated and command_is_forbidden(
                evaluated,
                active_cwd,
                depth=depth + 1,
            ):
                return True
        nested = nested_shell_command(words)
        if nested is not None and command_is_forbidden(
            nested,
            active_cwd,
            depth=depth + 1,
        ):
            return True
    return False


def blocks_superpowers(command: str, cwd: Path, *, dynamic_targets: bool = True) -> bool:
    if dynamic_targets:
        shell_command = re.sub(r"\\\r?\n", "", command)
        forbidden_name = "super" + "powers"
        if forbidden_name in shell_command.lower() or any(
            forbidden_name in word.lower()
            for segment in command_segments(shell_command)
            for word in segment
        ):
            return True
        return command_is_forbidden(shell_command, cwd)
    lowered = command.lower()
    return "superpowers" in lowered and any(
        marker in lowered for marker in SUPERPOWERS_BLOCKED_MARKERS
    )


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
    deleted_paths = re.findall(r"^\*\*\* Delete File: (.+)$", command, re.MULTILINE)
    for raw_target in deleted_paths:
        target = resolve_target(raw_target.strip(), cwd)
        if target is None:
            return "file deletion target is not inspectable"
        reason = protected_path_reason(target, cwd, recursive=False)
        if reason is not None:
            return f"protected file deletion blocked: {reason}"
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
    cwd = (
        Path(cwd_value).expanduser().resolve(strict=False)
        if isinstance(cwd_value, str) and cwd_value
        else Path.cwd().resolve()
    )
    logical_command = (
        re.sub(r"\\\r?\n", "", command)
        if tool_name == "Bash"
        else command
    )
    shell_view, heredoc_expansion_is_uninspectable = (
        shell_view_without_heredoc_data(logical_command)
        if tool_name == "Bash"
        else (logical_command, False)
    )
    inspected_command = (
        without_inactive_shell_comments(shell_view)
        if tool_name == "Bash"
        else shell_view
    )
    inspected_command, shell_expansion_is_uninspectable = (
        shell_view_with_expansion_commands(inspected_command)
        if tool_name == "Bash"
        else (inspected_command, False)
    )
    if tool_name == "Bash":
        inspected_command = with_unquoted_newline_boundaries(inspected_command)
    if blocks_superpowers(
        inspected_command,
        cwd,
        dynamic_targets=tool_name == "Bash",
    ):
        return emit_denial("blocked by the global forbidden-capability policy")
    if tool_name == "Bash" and (
        heredoc_expansion_is_uninspectable
        or shell_expansion_is_uninspectable
        or contains_active_process_substitution(logical_command)
        or pipeline_sink_is_uninspectable(inspected_command)
        or shell_program_source_is_uninspectable(inspected_command)
        or dynamic_executable_is_uninspectable(inspected_command)
    ):
        return emit_denial(
            "shell program source or external command data is not inspectable"
        )

    if tool_name == "apply_patch":
        patch_reason = patch_denial_reason(command, cwd)
        return emit_denial(patch_reason) if patch_reason is not None else 0

    destructive_reason = destructive_denial_reason(inspected_command, cwd)
    if destructive_reason is None:
        destructive_reason = nested_destructive_denial_reason(inspected_command, cwd)
    if destructive_reason is not None:
        return emit_denial(
            f"{destructive_reason}. Use a narrower concrete cleanup path or run the "
            "reviewed destructive action manually outside Codex."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
