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

    def test_public_hook_keeps_rtk_optional_when_it_is_unavailable(self) -> None:
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

    def test_public_hook_accepts_normal_rtk_nonzero_outcomes(self) -> None:
        for command, expect_rewrite in (
            ("rtk pwd", False),
            ("git status --short", True),
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
                if expect_rewrite:
                    output = json.loads(result.stdout)
                    self.assertEqual(
                        output["hookSpecificOutput"]["permissionDecision"],
                        "allow",
                    )
                    self.assertEqual(
                        output["hookSpecificOutput"]["updatedInput"]["command"],
                        "rtk git status --short",
                    )
                else:
                    self.assertEqual(result.stdout, "")


if __name__ == "__main__":
    unittest.main()
