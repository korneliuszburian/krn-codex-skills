from __future__ import annotations

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parent))

from destructive_guard import destructive_denial_reason


HOOK = Path(__file__).with_name("krn_pretooluse.py")


class DestructiveGuardTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.repo = self.root / "repo"
        self.repo.mkdir()
        (self.repo / ".git").mkdir()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def reason(self, command: str, cwd: Path | None = None) -> str | None:
        return destructive_denial_reason(command, cwd or self.repo)

    def test_blocks_repository_root_and_metadata(self) -> None:
        self.assertIn("destructive removal blocked", self.reason("rtk rm -rf .") or "")
        self.assertIn(".git", self.reason("rm -rf .git/objects") or "")

    def test_blocks_instruction_secret_and_database_files(self) -> None:
        for name in (
            "AGENTS.md",
            "CLAUDE.md",
            ".env",
            ".env.local",
            "state.duckdb",
            "state.db-wal",
        ):
            with self.subTest(name=name):
                self.assertIsNotNone(self.reason(f"rtk rm -f {name}"))

    def test_blocks_system_and_credential_subtrees(self) -> None:
        self.assertIn("/etc", self.reason("rm -f /etc/passwd") or "")
        ssh_file = Path.home() / ".ssh" / "known_hosts"
        self.assertIn(".ssh", self.reason(f"rm -f {ssh_file}") or "")

    def test_mount_anchor_blocks_root_but_allows_narrow_descendant(self) -> None:
        self.assertIn("/mnt", self.reason("rm -rf /mnt") or "")
        self.assertIsNone(
            self.reason("rm -rf /mnt/krn-hook-test/disposable-output")
        )
        self.assertIn(
            "protected instruction",
            self.reason("rm -f /mnt/krn-hook-test/disposable-output/.env") or "",
        )

    def test_blocks_directory_containing_database(self) -> None:
        state = self.repo / "runtime-state"
        state.mkdir()
        (state / "live.sqlite3").write_bytes(b"fixture")
        self.assertIn("protected file", self.reason("rm -rf runtime-state") or "")

    def test_blocks_forced_git_clean_glob_and_nested_shell(self) -> None:
        self.assertIn("forced git clean", self.reason("rtk git clean -fdx") or "")
        self.assertIn("expansion or glob", self.reason("rm -rf *") or "")
        self.assertIn("expansion or glob", self.reason('rm -f "$TARGET"') or "")
        self.assertIn(
            "destructive removal blocked",
            self.reason("bash -lc 'rtk rm -rf .'") or "",
        )
        self.assertIn(
            "shell substitution",
            self.reason("echo $(rm -rf .)") or "",
        )

    def test_allows_dry_run_git_clean(self) -> None:
        self.assertIsNone(self.reason("rtk git clean -ndx"))

    def test_allows_concrete_disposable_cleanup(self) -> None:
        for name in ("node_modules", "dist", ".cache", "fixture-output"):
            target = self.repo / name
            target.mkdir()
            if name == "fixture-output":
                (target / "result.txt").write_text("fixture", encoding="utf-8")
            with self.subTest(name=name):
                self.assertIsNone(self.reason(f"rtk rm -rf {name}"))

    def test_public_hook_emits_supported_deny_shape(self) -> None:
        payload = {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "cwd": str(self.repo),
            "tool_input": {"command": "rtk rm -rf ."},
        }
        result = subprocess.run(
            [str(HOOK)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(
            output["hookSpecificOutput"]["permissionDecision"],
            "deny",
        )

    def test_public_hook_blocks_protected_apply_patch_deletion(self) -> None:
        payload = {
            "hook_event_name": "PreToolUse",
            "tool_name": "apply_patch",
            "cwd": str(self.repo),
            "tool_input": {"command": "*** Begin Patch\n*** Delete File: AGENTS.md\n*** End Patch"},
        }
        result = subprocess.run(
            [str(HOOK)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_public_hook_denies_forbidden_capability_shell_marker(self) -> None:
        blocked_command = "codex plugin add " + "super" + "powers"
        payload = {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "cwd": str(self.repo),
            "tool_input": {"command": blocked_command},
        }
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        output = json.loads(result.stdout)
        self.assertEqual(output["hookSpecificOutput"]["permissionDecision"], "deny")
        self.assertIn(
            "forbidden-capability",
            output["hookSpecificOutput"]["permissionDecisionReason"],
        )

    def test_public_hook_blocks_quoted_and_dynamic_capability_names(self) -> None:
        install = bytes(
            (99, 111, 100, 101, 120, 32, 112, 108, 117, 103, 105, 110, 32, 97, 100, 100, 32)
        ).decode()
        fetch = bytes((99, 117, 114, 108, 32)).decode()
        capability = bytes(
            (115, 117, 112, 101, 114, 112, 111, 119, 101, 114, 115)
        ).decode()
        quoted = capability[:5] + '\"\"' + capability[5:]
        escaped = capability[:5] + "\\" + capability[5:]
        ansi_quoted = capability[:5] + "$'\\x70'" + capability[6:]
        command_substitution = capability[:5] + "$(printf p)" + capability[6:]
        parameter_expansion = capability[:5] + "${x}" + capability[6:]
        dynamic_mutator = "x=d; co${x}ex plugin add " + capability
        combined_dynamic = (
            "x=d; y=p; co${x}ex plugin add "
            + capability[:5]
            + "${y}"
            + capability[6:]
        )
        blocked_commands = (
            install + quoted,
            install + escaped,
            "bash -lc '" + install + quoted + "'",
            install + ansi_quoted,
            install + command_substitution,
            "x=p; " + install + parameter_expansion,
            "x=p; " + fetch + parameter_expansion,
            dynamic_mutator,
            combined_dynamic,
            "timeout 60 " + install + capability,
            "rtk " + install + capability,
            "nice -n 5 " + install + capability,
            "codex --strict-config plugin add " + capability,
            "codex -c foo=bar plugin add " + capability,
            "codex plugin -c foo=bar add " + capability,
            "git -C /tmp clone https://example.invalid/" + capability,
            "claude --safe-mode plugin install " + capability,
            "claude plugins install " + capability,
            "claude plugin i " + capability,
            "claude plugin enable " + capability,
            "claude --plugin-url https://example.invalid/" + capability + ".zip",
            "claude --plugin-dir /tmp/" + capability,
            "claude --plugin-url https://example.invalid/safe.zip plugin enable "
            + capability,
            "claude plugin marketplace add https://example.invalid/" + capability,
            "claude plugin marketplace update " + capability,
            "claude plugin marketplace add --scope user --sparse plugins "
            + "https://example.invalid/"
            + capability,
            "claude plugin marketplace add --sparse "
            + capability
            + " --scope user https://example.invalid/safe",
            "claude plugin tag /tmp/" + capability,
            "claude plugin init " + capability,
            "claude plugin new " + capability,
            "copilot --no-color plugin install " + capability,
            "copilot --plugin-dir /tmp/" + capability + " plugin list",
            "copilot plugin update " + capability,
            "copilot plugin marketplace update " + capability,
            "copilot plugin marketplace browse " + capability,
            "gemini extension install https://example.invalid/" + capability,
            "gemini --debug extensions install https://example.invalid/" + capability,
            "gemini extensions enable " + capability,
            "gemini extensions link /tmp/" + capability,
            "gemini extensions validate /tmp/" + capability,
            "gemini -e " + capability,
            "gemini -e safe " + capability,
            "gemini -e" + capability,
            "codex -c 'plugins.\"" + capability + "@openai-curated\".enabled=true'",
            "codex -c'plugins.\"" + capability + "@openai-curated\".enabled=true'",
            "codex plugin marketplace upgrade " + capability,
            "cd /tmp/" + capability + " && claude --plugin-dir .",
            "pushd /tmp/" + capability + " && claude --plugin-dir .",
            "bash --norc -c 'copilot plugin install " + capability + "'",
            "bash --rcfile /dev/null -c 'gemini extension install "
            + "https://example.invalid/"
            + capability
            + "'",
            "zsh -ocorrect -c 'copilot plugin install " + capability + "'",
            "env -u UNUSED copilot plugin install " + capability,
            "exec -a helper copilot plugin install " + capability,
            "env -S 'copilot plugin install " + capability + "'",
            "env -C /tmp/" + capability + " copilot plugin list",
            "eval 'copilot plugin install " + capability + "'",
            "bash -c \"eval 'copilot plugin install " + capability + "'\"",
            "if true; then copilot plugin install " + capability + "; fi",
            "time copilot plugin install " + capability,
            "! copilot plugin install " + capability,
            "sudo copilot plugin install " + capability,
            "xargs copilot plugin install " + capability,
            "sudo bash --norc -c 'copilot plugin install " + capability + "'",
            "time eval 'copilot plugin install " + capability + "'",
            "printf '%s\\n' 'plugin install "
            + capability
            + "' | xargs -n 3 copilot",
            "printf '%s\\n' 'copilot plugin install " + capability + "' | sh",
            "copilot plugin install "
            + capability[:5]
            + "\\\n"
            + capability[5:],
            'if true; then cd "$Q"; fi; claude --plugin-dir .',
            'if true; then cd "$Q"; else cd /tmp; fi; claude --plugin-dir .',
            'copilot "$FAMILY" install "$CAPABILITY"',
            'claude "$FAMILY" validate "$CAPABILITY_PATH"',
            'gemini "$FAMILY" install "$CAPABILITY_URL"',
            'codex "$FAMILY" add "$CAPABILITY"',
        )
        for blocked_command in blocked_commands:
            with self.subTest(command=blocked_command):
                payload = {
                    "hook_event_name": "PreToolUse",
                    "tool_name": "Bash",
                    "cwd": str(self.repo),
                    "tool_input": {"command": blocked_command},
                }
                result = subprocess.run(
                    [sys.executable, str(HOOK)],
                    input=json.dumps(payload),
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                output = json.loads(result.stdout)
                self.assertEqual(
                    output["hookSpecificOutput"]["permissionDecision"],
                    "deny",
                )
                self.assertIn(
                    "forbidden-capability",
                    output["hookSpecificOutput"]["permissionDecisionReason"],
                )

    def test_public_hook_blocks_uninspectable_pipeline_sinks(self) -> None:
        blocked_commands = (
            "printf 'codex plugin add super%s\\n' powers | sh",
            "printf 'rm -rf %s\\n' . | sh",
            "printf 'echo safe\\n' | env -i bash",
            'SHELL=sh; printf \'codex plugin add super%s\\n\' powers | "$SHELL"',
            'SHELL=sh; printf \'rm -rf %s\\n\' . | "$SHELL"',
            "consumer() { sh; }; printf 'rm -rf %s\\n' . | consumer",
            "printf 'rm -rf %s\\n' . | { sh; }",
            "printf 'codex plugin add super%s\\n' powers | . /dev/stdin",
            "printf 'codex plugin add super%s\\n' powers | source /dev/stdin",
            "printf 'codex plugin add super%s\\0' powers | xargs -0 sh -c",
            "printf '%s\\0' -c 'rm -rf /tmp/krn-pipeline-probe' | xargs -0 sh",
            "printf '%s\\n' .git | xargs rm -rf",
            "printf 'super%s\\n' powers | xargs -n 1 codex plugin add",
            "printf 'super%s\\n' powers | xargs claude --plugin-dir",
            "printf 'super%s\\n' powers | xargs copilot --plugin-dir",
            "printf 'super%s\\n' powers | xargs gemini -e",
            "printf 'plugins.super%s.enabled=true\\n' powers | xargs codex -c",
            "printf 'echo safe\\n' | time -p sh",
        )
        for blocked_command in blocked_commands:
            with self.subTest(command=blocked_command):
                payload = {
                    "hook_event_name": "PreToolUse",
                    "tool_name": "Bash",
                    "cwd": str(self.repo),
                    "tool_input": {"command": blocked_command},
                }
                result = subprocess.run(
                    [sys.executable, str(HOOK)],
                    input=json.dumps(payload),
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                output = json.loads(result.stdout)
                self.assertEqual(
                    output["hookSpecificOutput"]["permissionDecision"],
                    "deny",
                )
                self.assertIn(
                    "pipeline sink",
                    output["hookSpecificOutput"]["permissionDecisionReason"],
                )

    def test_public_hook_resolves_claude_targets_against_payload_cwd(self) -> None:
        capability = bytes(
            (115, 117, 112, 101, 114, 112, 111, 119, 101, 114, 115)
        ).decode()
        quarantined_cwd = self.root / capability
        for blocked_command in (
            "claude --plugin-dir .",
            "claude plugin validate .",
            "claude plugin tag --dry-run",
            "copilot skill add .",
            "gemini skills install .",
            "gemini skills link .",
            "gemini skills enable .",
        ):
            with self.subTest(command=blocked_command):
                payload = {
                    "hook_event_name": "PreToolUse",
                    "tool_name": "Bash",
                    "cwd": str(quarantined_cwd),
                    "tool_input": {"command": blocked_command},
                }
                result = subprocess.run(
                    [sys.executable, str(HOOK)],
                    input=json.dumps(payload),
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                output = json.loads(result.stdout)
                self.assertEqual(
                    output["hookSpecificOutput"]["permissionDecision"],
                    "deny",
                )

    def test_public_hook_needs_no_external_proxy(self) -> None:
        payload = {
            "hook_event_name": "PreToolUse",
            "tool_name": "Bash",
            "cwd": str(self.repo),
            "tool_input": {"command": "echo safe"},
        }
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            check=False,
            env={**os.environ, "PATH": ""},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, "")

    def test_public_hook_allows_benign_command_unmodified(self) -> None:
        for command in (
            "rtk pwd",
            "git status --short",
            "echo safe",
            "printf '%s\\n' 'curl $URL'",
            "copilot --no-color plugin list",
            "gemini --debug extensions list",
            "codex -c model=o3 --version",
            "claude --plugin-dir /tmp/safe plugin list",
            "cd /tmp && claude --plugin-dir .",
            "env -u UNUSED copilot plugin list",
            "exec -a helper copilot plugin list",
            "eval 'echo safe'",
            "if true; then echo safe; fi",
            "printf '%s\\n' safe | xargs -n 1 echo",
            "printf 'bash\\n' | grep bash",
            "printf 'bash\\n' | time -p grep bash",
            'copilot -p "$PROMPT"',
            'claude -p "$PROMPT"',
        ):
            with self.subTest(command=command):
                payload = {
                    "hook_event_name": "PreToolUse",
                    "tool_name": "Bash",
                    "cwd": str(self.repo),
                    "tool_input": {"command": command},
                }
                result = subprocess.run(
                    [sys.executable, str(HOOK)],
                    input=json.dumps(payload),
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(
                    result.stdout,
                    "",
                    "a benign command is allowed without modification or emitted decision",
                )


if __name__ == "__main__":
    unittest.main()
