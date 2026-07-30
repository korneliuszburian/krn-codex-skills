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


def pipeline_command_words(segment: tuple[str, ...]) -> tuple[str, ...]:
    words = command_words(segment)
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
            dispatched = strip_leading_options(words[1:], XARGS_VALUE_OPTIONS)
            words = command_words(dispatched) if dispatched else ("echo",)
            continue
        break
    return words


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


def pipeline_sink_is_uninspectable(command: str) -> bool:
    """Reject opaque program text or executable identity at a pipeline sink."""

    tokens = command_tokens(command)
    function_names = declared_shell_functions(tokens)
    for pipe_index, token in enumerate(tokens):
        if token not in {"|", "|&"}:
            continue
        downstream: list[str] = []
        for candidate in tokens[pipe_index + 1:]:
            if candidate and all(character in ";&|()" for character in candidate):
                break
            downstream.append(candidate)
        words = pipeline_command_words(tuple(downstream))
        if not words:
            return True
        executable = words[0]
        executable_name = executable.rsplit("/", 1)[-1].lower()
        if (
            DYNAMIC_SHELL_TARGET.search(executable)
            or executable_name in SHELL_EXECUTABLES
            or executable_name in PIPELINE_OPAQUE_SINKS
            or executable in function_names
        ):
            return True
    return False


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
    if blocks_superpowers(command, cwd, dynamic_targets=tool_name == "Bash"):
        return emit_denial("blocked by the global forbidden-capability policy")
    if tool_name == "Bash" and pipeline_sink_is_uninspectable(command):
        return emit_denial(
            "pipeline sink executable or program text is not inspectable"
        )

    if tool_name == "apply_patch":
        patch_reason = patch_denial_reason(command, cwd)
        return emit_denial(patch_reason) if patch_reason is not None else 0

    destructive_reason = destructive_denial_reason(command, cwd)
    if destructive_reason is not None:
        return emit_denial(
            f"{destructive_reason}. Use a narrower concrete cleanup path or run the "
            "reviewed destructive action manually outside Codex."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
