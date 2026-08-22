from __future__ import annotations

import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parent))

from destructive_guard import direct_destructive_denial_reason


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
        return direct_destructive_denial_reason(
            tuple(shlex.split(command, posix=True)),
            cwd or self.repo,
        )

    def hook_reason(
        self,
        command: str,
        *,
        tool_name: str = "Bash",
        cwd: str | Path | None = None,
    ) -> str | None:
        payload = {
            "hook_event_name": "PreToolUse",
            "tool_name": tool_name,
            "cwd": str(cwd if cwd is not None else self.repo),
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
        if not result.stdout:
            return None
        return json.loads(result.stdout)["hookSpecificOutput"][
            "permissionDecisionReason"
        ]

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

    def test_blocks_non_dry_git_clean_and_ambiguous_rm_targets(self) -> None:
        self.assertIn(
            "non-dry-run git clean",
            self.reason("rtk git clean -fdx") or "",
        )
        self.assertIn(
            "non-dry-run git clean",
            self.reason("git clean -dx") or "",
        )
        self.assertIn(
            "non-dry-run git clean",
            self.reason("git clean -n --no-dry-run") or "",
        )
        self.assertIn(
            "non-dry-run git clean",
            self.reason("git clean -n --no-dry -fdx") or "",
        )
        self.assertIn(
            "non-dry-run git clean",
            self.reason("git clean -n --no-dr -fdx") or "",
        )
        self.assertIn(
            "non-dry-run git clean",
            self.reason("git clean -f -e --dry-run") or "",
        )
        self.assertIn(
            "non-dry-run git clean",
            self.reason("git clean -f --exclude --dry-run") or "",
        )
        self.assertIn("expansion or glob", self.reason("rm -rf *") or "")
        self.assertIn("expansion or glob", self.reason('rm -f "$TARGET"') or "")

    def test_allows_dry_run_git_clean(self) -> None:
        self.assertIsNone(self.reason("rtk git clean -ndx"))
        self.assertIsNone(self.reason("git clean --dry-run"))
        self.assertIsNone(self.reason("git clean --d -fdx"))
        self.assertIsNone(self.reason("git clean -n -e generated"))
        self.assertIsNone(self.reason("git clean -e generated -n"))

    def test_allows_concrete_disposable_cleanup(self) -> None:
        for name in ("node_modules", "dist", ".cache", "fixture-output"):
            target = self.repo / name
            target.mkdir()
            if name == "fixture-output":
                (target / "result.txt").write_text("fixture", encoding="utf-8")
            with self.subTest(name=name):
                self.assertIsNone(self.reason(f"rtk rm -rf {name}"))

    def test_allows_concrete_tmp_cleanup_but_protects_tmp_root(self) -> None:
        self.assertIsNone(self.reason("rtk rm -f /tmp/concrete-fixture"))
        self.assertIsNone(self.reason("rtk rm -rf /tmp/concrete-fixture-dir"))
        self.assertIn("temporary root", self.reason("rtk rm -rf /tmp") or "")
        self.assertIn("protected path /", self.reason("rtk rm -rf /tmp/..") or "")

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

        move_patch = (
            "*** Begin Patch\n"
            "*** Update File: AGENTS.md\n"
            "*** Move to: moved.md\n"
            "@@\n"
            " unchanged\n"
            "*** End Patch"
        )
        self.assertIn(
            "protected file move blocked",
            self.hook_reason(move_patch, tool_name="apply_patch") or "",
        )

    def test_public_hook_denies_forbidden_capability_shell_marker(self) -> None:
        blocked_command = "codex plugin add " + "super" + "powers"
        self.assertIn(
            "forbidden-capability",
            self.hook_reason(blocked_command) or "",
        )

    def test_public_hook_denies_literal_risk_in_opaque_composition(self) -> None:
        capability = bytes(
            (115, 117, 112, 101, 114, 112, 111, 119, 101, 114, 115)
        ).decode()
        commands = (
            "bash <<'EOF' <&0\nrm -rf /\nEOF",
            "true <&1; printf '%s\\n' 'rm -rf /' | sh",
            "printf '%s\\n' 'rm -rf /' | { true; sh; }",
            "{ true; sh; } <<'EOF'\nrm -rf /\nEOF",
            "exec 3<<< 'rm -rf /'; sh <&3",
            "printf '%s\\n' 'rm -rf /' | bash -c 'source /dev/stdin'",
            "GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=clean.requireForce "
            "GIT_CONFIG_VALUE_0=false git clean -dx",
            "git -c clean.requireForce=false clean -dx",
            "git -C . clean -fdx",
            "git --no-pager clean -fdx",
            "rtk git -C . clean -fdx",
            "'git' clean -fdx",
            "git 'clean' -fdx",
            "GIT clean -dx",
            "RM -rf /",
            "echo safe # comment\nrm -rf /",
            "echo safe # comment\ngit clean -fdx",
            "rm -rf \\\n/",
            "git clean -n \\\n--no-dry-run",
            "eval x\\\n#notcomment; rm -rf /",
            "sed 's/^# //' <<'EOF' | sh\n# rm -rf /\nEOF",
            "/tmp/echo 'rm -rf /'",
            "/tmp/printf '%s\\n' 'git clean -fdx'",
            f"grep -rf .codex/{capability}/patterns README.md",
            f"sed -nf .codex/{capability}/script README.md",
            f"cat <<'EOF' | xargs touch\n# .codex/{capability}/note\nEOF",
        )
        for command in commands:
            with self.subTest(command=command):
                self.assertIsNotNone(self.hook_reason(command))

    def test_public_hook_allows_only_explicit_safe_literal_text(self) -> None:
        capability = bytes(
            (115, 117, 112, 101, 114, 112, 111, 119, 101, 114, 115)
        ).decode()
        for command in (
            "echo 'rm -rf /'",
            "printf '%s\\n' 'git clean -fdx'",
            "rg -n 'rm|git clean|tmp' README.md",
            "git status --short -- 'rm-not-a-command'",
            f"echo {capability}",
            "printf 'echo safe\\n' | sh",
            "rm -rf node_modules",
            "git clean -ndx",
            "rm -rf node_modules # ordinary cleanup",
            "git clean -ndx # preview",
            "sed -n '1,5p' README.md",
            "rm -rf \\\nnode_modules",
            "git clean -n \\\n-dx",
        ):
            with self.subTest(command=command):
                self.assertIsNone(self.hook_reason(command))

        for command in (
            "echo 'rm -rf /' > note",
            "bash -n -c 'rm -rf /'",
            "echo $(printf safe) rm -rf /",
            "/usr/bin/echo 'rm -rf /'",
            "rg -n 'rm' README.md | sh",
            "find . -name '*.tmp' -exec rm -f {} +",
            "sed -i 's/rm/safe/' README.md",
            "sed -i.bak 's/rm/safe/' README.md",
            "sed --in-place=backup 's/rm/safe/' README.md",
        ):
            with self.subTest(command=command):
                self.assertIsNotNone(self.hook_reason(command))

    def test_public_hook_blocks_quarantined_paths_without_scanning_patch_text(
        self,
    ) -> None:
        capability = bytes(
            (115, 117, 112, 101, 114, 112, 111, 119, 101, 114, 115)
        ).decode()
        for directive in (
            f"*** Add File: .codex/{capability}/note.md",
            f"*** Update File: .codex/{capability}/note.md",
            f"*** Move to: .codex/{capability}/note.md",
        ):
            patch = f"*** Begin Patch\n{directive}\n+x\n*** End Patch"
            with self.subTest(directive=directive):
                self.assertIn(
                    "quarantined capability",
                    self.hook_reason(patch, tool_name="apply_patch") or "",
                )

        safe_patch = (
            "*** Begin Patch\n"
            "*** Update File: notes.md\n"
            "@@\n"
            f"+the word {capability} is inert patch content\n"
            "*** End Patch"
        )
        self.assertIsNone(
            self.hook_reason(safe_patch, tool_name="apply_patch")
        )
        self.assertIn(
            "working directory belongs",
            self.hook_reason(
                "echo safe",
                cwd=self.root / capability / "fixture",
            )
            or "",
        )
        self.assertIn(
            "working directory is not inspectable",
            self.hook_reason("echo safe", cwd="") or "",
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
        for command in ("rtk pwd", "git status --short", "echo safe"):
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
