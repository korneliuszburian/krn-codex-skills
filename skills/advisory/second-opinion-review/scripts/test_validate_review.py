from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

VR_SCRIPT = Path(__file__).with_name("validate-review.py")
_spec = importlib.util.spec_from_file_location("validate_review", VR_SCRIPT)
vr = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(vr)
ReviewError = vr.ReviewError


class EvidencePathDeniedTests(unittest.TestCase):
    def test_denies_secret_shaped_paths(self):
        for raw in (
            ".env",
            ".env.local",
            ".env.production",
            "id_rsa",
            "id_ed25519",
            "deploy.key",
            "cert.pem",
            "store.p12",
            ".git/HEAD",
            ".beads/issues.jsonl",
            ".local-lab/note.md",
            "secrets/agent.yaml",
        ):
            self.assertTrue(vr.evidence_path_denied(Path(raw)), raw)

    def test_allows_normal_repository_paths(self):
        for raw in ("src/main.py", "README.md", "docs/guide.md", "package.json"):
            self.assertFalse(vr.evidence_path_denied(Path(raw)), raw)


class ReadBoundedEvidenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def test_refuses_a_symlinked_evidence_file(self):
        target = self.root / "real.txt"
        target.write_text("content\n", encoding="utf-8")
        (self.root / "link.txt").symlink_to(target)
        with self.assertRaises(ReviewError):
            vr.read_bounded_evidence(self.root, Path("link.txt"), "f1")

    def test_reads_a_regular_evidence_file(self):
        (self.root / "file.txt").write_text("hello\n", encoding="utf-8")
        raw, _mode, text = vr.read_bounded_evidence(self.root, Path("file.txt"), "f1")
        self.assertEqual(text, "hello\n")
        self.assertEqual(raw, b"hello\n")


class ValidateReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp())

    def tearDown(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)

    def _manifest(self, name: str) -> dict:
        path = self.root / name
        stat = path.stat()
        return {
            "kind": "file",
            "mode": stat.st_mode,
            "size": stat.st_size,
            "content_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }

    def _review(self, path: str, finding_id: str = "f1") -> dict:
        return {
            "review_version": "1",
            "scope_summary": "bounded scope",
            "findings": [
                {
                    "id": finding_id,
                    "severity": "LOW",
                    "path": path,
                    "line_start": 1,
                    "line_end": 1,
                    "claim": "claim",
                    "impact": "impact",
                    "minimal_fix": "fix",
                }
            ],
            "evidence_gaps": [],
            "human_decisions": [],
            "does_not_prove": ["advisory only"],
        }

    def test_binds_a_citation_to_the_fixed_file_bytes(self):
        (self.root / "a.txt").write_text("line1\n", encoding="utf-8")
        manifest = {"a.txt": self._manifest("a.txt")}
        evidence = vr.validate_review(
            self._review("a.txt"),
            self.root,
            {"a.txt"},
            expected_manifest=manifest,
        )
        self.assertEqual(len(evidence), 1)
        self.assertEqual(evidence[0]["finding_id"], "f1")
        self.assertEqual(evidence[0]["file_sha256"], manifest["a.txt"]["content_sha256"])

    def test_rejects_a_duplicate_finding_id(self):
        (self.root / "a.txt").write_text("line1\n", encoding="utf-8")
        manifest = {"a.txt": self._manifest("a.txt")}
        review = self._review("a.txt")
        review["findings"].append(dict(review["findings"][0]))
        with self.assertRaises(ReviewError):
            vr.validate_review(review, self.root, {"a.txt"}, expected_manifest=manifest)

    def test_rejects_a_denied_evidence_path(self):
        (self.root / ".env").write_text("SECRET=1\n", encoding="utf-8")
        with self.assertRaises(ReviewError):
            vr.validate_review(self._review(".env"), self.root, {".env"})


class GitTamperDetectionTests(unittest.TestCase):
    def _fingerprint(self, repo: Path) -> dict:
        result = subprocess.run(
            [sys.executable, str(VR_SCRIPT), "fingerprint-git", str(repo)],
            cwd=repo,
            capture_output=True,
            text=True,
            check=True,
        )
        return json.loads(result.stdout)

    def test_state_snapshot_changes_when_a_tracked_file_is_modified(self):
        repo = Path(tempfile.mkdtemp())
        try:
            for args in (
                ["git", "init", "-q"],
                ["git", "config", "user.email", "t@example.invalid"],
                ["git", "config", "user.name", "tamper-test"],
            ):
                subprocess.run(args, cwd=repo, check=True)
            (repo / "a.txt").write_text("one\n", encoding="utf-8")
            subprocess.run(["git", "add", "-A"], cwd=repo, check=True)
            subprocess.run(["git", "commit", "-qm", "init"], cwd=repo, check=True)

            before = self._fingerprint(repo)["state_sha256"]
            (repo / "a.txt").write_text("two\n", encoding="utf-8")  # tamper
            after = self._fingerprint(repo)["state_sha256"]
            self.assertNotEqual(before, after, "git state hash must react to a tracked-file change")
        finally:
            shutil.rmtree(repo, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
