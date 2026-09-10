from __future__ import annotations

from pathlib import Path
import shlex
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).parent))

from destructive_guard import direct_destructive_denial_reason


class DestructiveGuardSmoke(unittest.TestCase):
    def test_blocks_protected_root_and_allows_disposable_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary) / "repo"
            repo.mkdir()
            (repo / ".git").mkdir()

            def reason(command: str) -> str | None:
                return direct_destructive_denial_reason(
                    tuple(shlex.split(command)), repo
                )

            self.assertIn("destructive removal blocked", reason("rm -rf .") or "")
            self.assertIsNotNone(reason("rm -f .env"))
            self.assertIsNone(reason("rm -rf /tmp/krn-disposable-output"))


if __name__ == "__main__":
    unittest.main()
