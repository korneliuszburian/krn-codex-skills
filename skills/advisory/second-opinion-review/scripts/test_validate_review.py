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

    def test_accepts_exactly_twenty_evidence_lines(self):
        (self.root / "a.txt").write_text(
            "".join(f"line {number}\n" for number in range(1, 21)),
            encoding="utf-8",
        )
        manifest = {"a.txt": self._manifest("a.txt")}
        review = self._review("a.txt")
        review["findings"][0]["line_end"] = vr.MAX_EVIDENCE_LINES
        normalized_review, changes = vr.validate_review_contract(
            review,
            pointer_prefix="/structured_output",
        )
        self.assertEqual(normalized_review, review)
        self.assertEqual(changes, [])
        evidence = vr.validate_review(
            review,
            self.root,
            {"a.txt"},
            expected_manifest=manifest,
        )
        self.assertEqual(evidence[0]["line_end"], vr.MAX_EVIDENCE_LINES)


class NormalizeReviewTests(unittest.TestCase):
    def setUp(self) -> None:
        self.sandbox = Path(tempfile.mkdtemp())
        self.evidence_root = self.sandbox / "evidence"
        self.pass_root = self.sandbox / "pass"
        self.evidence_root.mkdir()
        self.pass_root.mkdir()

    def tearDown(self) -> None:
        shutil.rmtree(self.sandbox, ignore_errors=True)

    def _review(self, *, start: int = 1, end: int = 1) -> dict:
        return {
            "review_version": "1",
            "scope_summary": "bounded scope",
            "findings": [
                {
                    "id": "F3",
                    "severity": "LOW",
                    "path": "artifact.md",
                    "line_start": start,
                    "line_end": end,
                    "claim": "claim",
                    "impact": "impact",
                    "minimal_fix": "fix",
                }
            ],
            "evidence_gaps": [],
            "human_decisions": [],
            "does_not_prove": ["advisory only"],
        }

    def _write_json(self, path: Path, value: object) -> None:
        path.write_text(json.dumps(value) + "\n", encoding="utf-8")

    def _run(self, *arguments: str, cwd: Path | None = None) -> subprocess.CompletedProcess:
        return subprocess.run(
            [sys.executable, str(VR_SCRIPT), *map(str, arguments)],
            cwd=cwd or self.sandbox,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_rejects_twenty_one_lines_with_a_split_diagnostic(self):
        envelope = self.pass_root / "envelope.json"
        normalized_envelope = self.pass_root / "normalized-envelope.json"
        normalization_path = self.pass_root / "normalization.json"
        diagnostic = self.pass_root / "diagnostic.json"
        self._write_json(
            envelope,
            {"is_error": False, "structured_output": self._review(end=21)},
        )

        result = self._run(
            "normalize",
            envelope,
            normalized_envelope,
            normalization_path,
            "--diagnostic-json",
            diagnostic,
        )
        self.assertEqual(result.returncode, 1)
        self.assertFalse(normalized_envelope.exists())
        self.assertFalse(normalization_path.exists())
        diagnostic_value = json.loads(diagnostic.read_text(encoding="utf-8"))
        self.assertEqual(
            diagnostic_value["pointer"],
            "/structured_output/findings/0/line_end",
        )
        self.assertEqual(diagnostic_value["code"], "model_output_invalid")
        self.assertTrue(diagnostic_value["retryable"])
        self.assertIn("split the evidence", diagnostic_value["message"])
        self.assertIn("at most 20 lines each", diagnostic_value["message"])

    def test_unrepairable_model_range_writes_retryable_pointer_diagnostic(self):
        envelope = self.pass_root / "invalid-envelope.json"
        normalized_envelope = self.pass_root / "normalized-envelope.json"
        normalization_path = self.pass_root / "normalization.json"
        diagnostic = self.pass_root / "diagnostic.json"
        self._write_json(
            envelope,
            {"structured_output": self._review(start=0, end=1)},
        )

        result = self._run(
            "normalize",
            envelope,
            normalized_envelope,
            normalization_path,
            "--diagnostic-json",
            diagnostic,
        )
        self.assertEqual(result.returncode, 1)
        self.assertFalse(normalized_envelope.exists())
        self.assertFalse(normalization_path.exists())
        self.assertEqual(
            json.loads(diagnostic.read_text(encoding="utf-8")),
            {
                "diagnostic_version": "1",
                "command": "normalize",
                "code": "model_output_invalid",
                "pointer": "/structured_output/findings/0/line_start",
                "message": "line_start must be a positive integer for F3",
                "retryable": True,
            },
        )

    def test_contract_errors_point_to_finding_fields_and_proof_boundary(self):
        cases = (
            (
                "path",
                lambda review: review["findings"][0].__setitem__("path", "../escape"),
                "/structured_output/findings/0/path",
            ),
            (
                "line_end",
                lambda review: review["findings"][0].__setitem__("line_end", 0),
                "/structured_output/findings/0/line_end",
            ),
            (
                "does_not_prove",
                lambda review: review.__setitem__("does_not_prove", []),
                "/structured_output/does_not_prove",
            ),
        )
        for label, mutate, expected_pointer in cases:
            with self.subTest(label=label):
                review = self._review()
                mutate(review)
                with self.assertRaises(ReviewError) as raised:
                    vr.validate_review_contract(
                        review,
                        pointer_prefix="/structured_output",
                    )
                self.assertEqual(raised.exception.pointer, expected_pointer)
                self.assertTrue(raised.exception.retryable)


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
