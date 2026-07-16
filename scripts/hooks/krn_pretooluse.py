#!/usr/bin/env python3
"""Global Codex PreToolUse policy for Bash commands."""

from __future__ import annotations

import json
from pathlib import Path
import re
import sys
from typing import Any

sys.dont_write_bytecode = True

from destructive_guard import (
    destructive_denial_reason,
    protected_path_reason,
    resolve_target,
)


SUPERPOWERS_BLOCKED_MARKERS = (
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


def blocks_superpowers(command: str) -> bool:
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

    if blocks_superpowers(command):
        return emit_denial("blocked by the global forbidden-capability policy")

    cwd_value = payload.get("cwd")
    cwd = (
        Path(cwd_value).expanduser().resolve(strict=False)
        if isinstance(cwd_value, str) and cwd_value
        else Path.cwd().resolve()
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
