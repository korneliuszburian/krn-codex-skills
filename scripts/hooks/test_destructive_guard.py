from __future__ import annotations

import json
from pathlib import Path
import sys
import subprocess
import tempfile
import unittest

HOOK = Path(__file__).with_name("krn_pretooluse.py")


class DestructiveGuardSmoke(unittest.TestCase):
    def test_installed_hook_blocks_protected_root_and_allows_disposable_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary) / "repo"
            repo.mkdir()
            (repo / ".git").mkdir()

            def reason(command: str) -> str | None:
                payload = {
                    "hook_event_name": "PreToolUse",
                    "tool_name": "Bash",
                    "cwd": str(repo),
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
                if not result.stdout.strip():
                    return None
                output = json.loads(result.stdout)
                return output["hookSpecificOutput"]["permissionDecisionReason"]

            self.assertIn("destructive removal blocked", reason("rm -rf .") or "")
            self.assertIsNotNone(reason("rm -f .env"))
            self.assertIsNone(reason("rm -rf /tmp/krn-disposable-output"))
            self.assertIsNone(reason("rm -rf build && printf done"))
            self.assertIsNone(reason("git commit -m 'clean runtime residue'"))
            self.assertIn("non-dry-run git clean", reason("git clean -fd") or "")
            self.assertIn(
                "destructive removal blocked",
                reason("rm -rf build && rm -rf .") or "",
            )


if __name__ == "__main__":
    unittest.main()
