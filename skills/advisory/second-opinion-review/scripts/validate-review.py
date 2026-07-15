#!/usr/bin/env python3
"""Validate Claude review structure and bind citations to current repo text."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any


TOP_LEVEL_KEYS = {
    "review_version",
    "scope_summary",
    "findings",
    "evidence_gaps",
    "human_decisions",
    "does_not_prove",
}
FINDING_KEYS = {
    "id",
    "severity",
    "path",
    "line_start",
    "line_end",
    "claim",
    "impact",
    "minimal_fix",
}
SEVERITIES = {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
VALIDATION_KEYS = {"prompt_sha256", "repo_root", "evidence"}
DENIED_EVIDENCE_ROOTS = {".git", ".beads", ".local-lab", "secrets"}
DENIED_EVIDENCE_SUFFIXES = {".key", ".pem", ".p12"}
PRIVATE_KEY_PREFIXES = ("id_rsa", "id_dsa", "id_ecdsa", "id_ed25519")


class ReviewError(Exception):
    pass


def read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ReviewError(f"cannot read JSON {path}: {exc}") from exc


def require_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ReviewError(f"{label} must be an object")
    return value


def require_string(
    value: dict[str, Any], key: str, *, max_length: int | None = None
) -> str:
    raw = value.get(key)
    if not isinstance(raw, str) or not raw.strip():
        raise ReviewError(f"{key} must be a non-empty string")
    if max_length is not None and len(raw) > max_length:
        raise ReviewError(f"{key} must be <= {max_length} characters")
    return raw


def require_list(value: dict[str, Any], key: str) -> list[Any]:
    raw = value.get(key)
    if not isinstance(raw, list):
        raise ReviewError(f"{key} must be an array")
    return raw


def reject_extra_keys(value: dict[str, Any], allowed: set[str], label: str) -> None:
    extra = sorted(set(value) - allowed)
    if extra:
        raise ReviewError(f"{label} has unknown keys: {', '.join(extra)}")


def validate_text_items(items: list[Any], label: str) -> None:
    for index, item in enumerate(items):
        if not isinstance(item, str) or not item.strip():
            raise ReviewError(f"{label}[{index}] must be a non-empty string")


def validate_pair_items(
    items: list[Any], label: str, keys: set[str]
) -> None:
    for index, raw in enumerate(items):
        item = require_object(raw, f"{label}[{index}]")
        reject_extra_keys(item, keys, f"{label}[{index}]")
        for key in keys:
            require_string(item, key)


def evidence_path_denied(relative: Path) -> bool:
    parts = tuple(part.lower() for part in relative.parts)
    name = relative.name.lower()
    return (
        not parts
        or parts[0] in DENIED_EVIDENCE_ROOTS
        or any(part == ".env" or part.startswith(".env.") for part in parts)
        or relative.suffix.lower() in DENIED_EVIDENCE_SUFFIXES
        or name.startswith(PRIVATE_KEY_PREFIXES)
    )


def validate_review(review: dict[str, Any], repo_root: Path) -> list[dict[str, Any]]:
    reject_extra_keys(review, TOP_LEVEL_KEYS, "review")
    if require_string(review, "review_version") != "1":
        raise ReviewError("review_version must be '1'")
    require_string(review, "scope_summary", max_length=300)

    findings = require_list(review, "findings")
    validate_pair_items(
        require_list(review, "evidence_gaps"),
        "evidence_gaps",
        {"what", "requested_proof"},
    )
    validate_pair_items(
        require_list(review, "human_decisions"),
        "human_decisions",
        {"choice", "why_human"},
    )
    does_not_prove = require_list(review, "does_not_prove")
    if not does_not_prove:
        raise ReviewError("does_not_prove must contain at least one boundary")
    validate_text_items(does_not_prove, "does_not_prove")

    seen_ids: set[str] = set()
    evidence: list[dict[str, Any]] = []
    for index, raw in enumerate(findings):
        finding = require_object(raw, f"findings[{index}]")
        reject_extra_keys(finding, FINDING_KEYS, f"findings[{index}]")
        finding_id = require_string(finding, "id")
        if finding_id in seen_ids:
            raise ReviewError(f"duplicate finding id: {finding_id}")
        seen_ids.add(finding_id)

        severity = require_string(finding, "severity")
        if severity not in SEVERITIES:
            raise ReviewError(f"invalid severity for {finding_id}: {severity}")
        for key in ("claim", "impact", "minimal_fix"):
            require_string(finding, key)

        relative = Path(require_string(finding, "path"))
        if relative.is_absolute() or ".." in relative.parts:
            raise ReviewError(f"unsafe evidence path for {finding_id}: {relative}")
        if evidence_path_denied(relative):
            raise ReviewError(f"denied evidence path for {finding_id}: {relative}")

        source = (repo_root / relative).resolve()
        try:
            resolved_relative = source.relative_to(repo_root)
        except ValueError as exc:
            raise ReviewError(f"evidence path escapes repo for {finding_id}") from exc
        if evidence_path_denied(resolved_relative):
            raise ReviewError(
                f"denied resolved evidence path for {finding_id}: {resolved_relative}"
            )
        if not source.is_file():
            raise ReviewError(f"evidence file missing for {finding_id}: {relative}")

        start = finding.get("line_start")
        end = finding.get("line_end")
        if not isinstance(start, int) or isinstance(start, bool) or start < 1:
            raise ReviewError(f"line_start must be a positive integer for {finding_id}")
        if not isinstance(end, int) or isinstance(end, bool) or end < start:
            raise ReviewError(f"invalid line_end for {finding_id}")
        if end - start + 1 > 20:
            raise ReviewError(f"evidence range exceeds 20 lines for {finding_id}")

        lines = source.read_text(encoding="utf-8").splitlines(keepends=True)
        if end > len(lines):
            raise ReviewError(
                f"evidence range exceeds {relative} line count for {finding_id}"
            )
        excerpt = "".join(lines[start - 1 : end]).encode("utf-8")
        evidence.append(
            {
                "finding_id": finding_id,
                "path": relative.as_posix(),
                "line_start": start,
                "line_end": end,
                "text_sha256": hashlib.sha256(excerpt).hexdigest(),
            }
        )

    return evidence


def extract_structured_output(envelope: dict[str, Any]) -> dict[str, Any]:
    if envelope.get("is_error") is True:
        raise ReviewError("Claude envelope reports is_error=true")
    return require_object(envelope.get("structured_output"), "structured_output")


def finalize(args: argparse.Namespace) -> int:
    envelope = require_object(read_json(Path(args.envelope)), "Claude envelope")
    review = extract_structured_output(envelope)
    repo_root = Path.cwd().resolve()
    evidence = validate_review(review, repo_root)
    prompt = Path(args.prompt).read_bytes()
    output = {
        **review,
        "validation": {
            "prompt_sha256": hashlib.sha256(prompt).hexdigest(),
            "repo_root": str(repo_root),
            "evidence": evidence,
        },
    }
    Path(args.output).write_text(
        json.dumps(output, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return 0


def check(args: argparse.Namespace) -> int:
    output = require_object(read_json(Path(args.review)), "review output")
    validation = require_object(output.pop("validation", None), "validation")
    reject_extra_keys(validation, VALIDATION_KEYS, "validation")
    repo_root = Path(require_string(validation, "repo_root")).resolve()
    if repo_root != Path.cwd().resolve():
        raise ReviewError(f"review belongs to a different repo root: {repo_root}")
    prompt_hash = require_string(validation, "prompt_sha256")
    if len(prompt_hash) != 64 or any(
        character not in "0123456789abcdef" for character in prompt_hash
    ):
        raise ReviewError("prompt_sha256 must be a lowercase SHA-256 digest")
    current_prompt_hash = hashlib.sha256(Path(args.prompt).read_bytes()).hexdigest()
    if prompt_hash != current_prompt_hash:
        raise ReviewError("stale prompt hash")
    expected = validate_review(output, repo_root)
    if validation.get("evidence") != expected:
        raise ReviewError("stale evidence hashes")
    print("valid evidence-bounded review")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    finalize_parser = commands.add_parser("finalize")
    finalize_parser.add_argument("envelope")
    finalize_parser.add_argument("prompt")
    finalize_parser.add_argument("output")
    finalize_parser.set_defaults(handler=finalize)
    check_parser = commands.add_parser("check")
    check_parser.add_argument("review")
    check_parser.add_argument("prompt")
    check_parser.set_defaults(handler=check)
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        return int(args.handler(args))
    except (OSError, ReviewError) as exc:
        print(f"review validation failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
