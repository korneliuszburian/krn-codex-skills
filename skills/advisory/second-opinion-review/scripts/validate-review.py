#!/usr/bin/env python3
"""Validate Claude review structure and bind citations to current repo text."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Callable


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
MAX_EVIDENCE_LINES = 20
VALIDATION_KEYS = {"prompt_sha256", "target", "evidence", "normalization"}
VALIDATION_EVIDENCE_KEYS = {
    "finding_id",
    "path",
    "line_start",
    "line_end",
    "file_mode",
    "file_size",
    "file_sha256",
    "text_sha256",
}
GIT_IDENTITY_KEYS = {
    "kind",
    "root",
    "commit",
    "tree",
    "dirty",
    "state_sha256",
}
ARTIFACT_IDENTITY_KEYS = {
    "kind",
    "root",
    "path",
    "content_sha256",
    "mode",
    "size",
}
PREFLIGHT_KEYS = {"prompt_sha256", "target", "evidence_manifest"}
MANIFEST_KINDS = {"file", "missing", "non-file", "symlink"}
FILE_MANIFEST_KEYS = {"kind", "mode", "size", "content_sha256"}
NON_FILE_MANIFEST_KEYS = {"kind"}
MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024
DENIED_EVIDENCE_ROOTS = {".git", ".beads", ".local-lab", "secrets"}
DENIED_EVIDENCE_SUFFIXES = {".key", ".pem", ".p12"}
PRIVATE_KEY_PREFIXES = ("id_rsa", "id_dsa", "id_ecdsa", "id_ed25519")
NORMALIZATION_KEYS = {
    "normalization_version",
    "max_evidence_lines",
    "source_review_sha256",
    "normalized_review_sha256",
    "changes",
}
class ReviewError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "configuration_invalid",
        pointer: str = "",
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.pointer = pointer
        self.retryable = retryable

    def diagnostic(self, command: str) -> dict[str, Any]:
        return {
            "diagnostic_version": "1",
            "command": command,
            "code": self.code,
            "pointer": self.pointer,
            "message": str(self),
            "retryable": self.retryable,
        }


def model_output_error(message: str, pointer: str) -> ReviewError:
    return ReviewError(
        message,
        code="model_output_invalid",
        pointer=pointer,
        retryable=True,
    )


def normalization_error(message: str, pointer: str = "/normalization") -> ReviewError:
    return ReviewError(
        message,
        code="normalization_invalid",
        pointer=pointer,
        retryable=False,
    )


def json_pointer(prefix: str, *parts: str | int) -> str:
    encoded = [str(part).replace("~", "~0").replace("/", "~1") for part in parts]
    suffix = "/".join(encoded)
    if not prefix:
        return f"/{suffix}" if suffix else ""
    return f"{prefix}/{suffix}" if suffix else prefix


def canonical_sha256(value: Any) -> str:
    serialized = json.dumps(
        value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()


def read_json(
    path: Path,
    *,
    malformed_code: str = "configuration_invalid",
    malformed_pointer: str = "",
    malformed_retryable: bool = False,
) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except OSError as exc:
        raise ReviewError(
            f"cannot read JSON {path}: {exc}",
            code="io_error",
            retryable=False,
        ) from exc
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ReviewError(
            f"cannot decode JSON {path}: {exc}",
            code=malformed_code,
            pointer=malformed_pointer,
            retryable=malformed_retryable,
        ) from exc


def write_json(
    path: Path,
    value: Any,
    before_replace: Callable[[], None] | None = None,
) -> None:
    serialized = json.dumps(value, indent=2, ensure_ascii=True) + "\n"
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=".second-opinion-review.",
            suffix=".tmp",
            delete=False,
        ) as temporary:
            temporary.write(serialized)
            temporary.flush()
            os.fsync(temporary.fileno())
            temporary_name = temporary.name
        if before_replace is not None:
            before_replace()
        os.replace(temporary_name, path)
        temporary_name = None
    finally:
        if temporary_name is not None:
            Path(temporary_name).unlink(missing_ok=True)


def require_digest(value: str, label: str) -> str:
    if len(value) != 64 or any(character not in "0123456789abcdef" for character in value):
        raise ReviewError(f"{label} must be a lowercase SHA-256 digest")
    return value


def require_object_id(value: str, label: str) -> str:
    if len(value) not in {40, 64} or any(
        character not in "0123456789abcdef" for character in value
    ):
        raise ReviewError(f"{label} must be a full lowercase Git object id")
    return value


def git_bytes(root: Path, *arguments: str) -> bytes:
    completed = subprocess.run(
        ["git", *arguments],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ReviewError(f"git {' '.join(arguments)} failed: {detail}")
    return completed.stdout


def add_digest_part(digest: Any, label: bytes, value: bytes) -> None:
    digest.update(len(label).to_bytes(8, "big"))
    digest.update(label)
    digest.update(len(value).to_bytes(8, "big"))
    digest.update(value)


def git_state_snapshot(root: Path) -> tuple[str, dict[str, dict[str, Any]]]:
    digest = hashlib.sha256()
    manifest: dict[str, dict[str, Any]] = {}
    staged_paths = git_bytes(root, "ls-files", "--stage", "-z").split(b"\0")
    if any(record.startswith(b"160000 ") for record in staged_paths if record):
        raise ReviewError(
            "Git evidence roots containing submodules are unsupported"
        )
    status = git_bytes(
        root,
        "status",
        "--porcelain=v2",
        "-z",
        "--untracked-files=all",
    )
    staged = git_bytes(
        root,
        "diff",
        "--cached",
        "--binary",
        "--no-ext-diff",
        "--no-textconv",
        "HEAD",
        "--",
    )
    unstaged = git_bytes(
        root,
        "diff",
        "--binary",
        "--no-ext-diff",
        "--no-textconv",
        "HEAD",
        "--",
    )
    paths = git_bytes(
        root,
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
    ).split(b"\0")
    add_digest_part(digest, b"status", status)
    add_digest_part(digest, b"staged", staged)
    add_digest_part(digest, b"unstaged", unstaged)

    root_bytes = os.fsencode(root)
    for relative in sorted({path for path in paths if path}):
        full = os.path.join(root_bytes, relative)
        relative_text = os.fsdecode(relative)
        add_digest_part(digest, b"path", relative)
        try:
            metadata = os.lstat(full)
        except FileNotFoundError:
            add_digest_part(digest, b"kind", b"missing")
            manifest[relative_text] = {"kind": "missing"}
            continue
        add_digest_part(digest, b"mode", str(metadata.st_mode).encode("ascii"))
        if os.path.islink(full):
            target = os.readlink(full)
            add_digest_part(digest, b"symlink", os.fsencode(target))
            manifest[relative_text] = {"kind": "symlink"}
        elif os.path.isfile(full):
            content = hashlib.sha256()
            with open(full, "rb") as source:
                while chunk := source.read(1024 * 1024):
                    content.update(chunk)
            add_digest_part(digest, b"file-sha256", content.digest())
            manifest[relative_text] = {
                "kind": "file",
                "mode": metadata.st_mode,
                "size": metadata.st_size,
                "content_sha256": content.hexdigest(),
            }
        else:
            add_digest_part(digest, b"kind", b"non-file")
            manifest[relative_text] = {"kind": "non-file"}
    return digest.hexdigest(), manifest


def require_current_root(root: Path) -> Path:
    resolved = root.resolve()
    if Path.cwd().resolve() != resolved:
        raise ReviewError(f"run from the declared evidence root: {resolved}")
    return resolved


def observe_git_snapshot(
    root: Path,
) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    root = require_current_root(root)
    top = Path(git_bytes(root, "rev-parse", "--show-toplevel").decode().strip()).resolve()
    if top != root:
        raise ReviewError(f"declared evidence root is not the Git root: {root}")
    commit = git_bytes(root, "rev-parse", "HEAD^{commit}").decode().strip()
    tree = git_bytes(root, "rev-parse", "HEAD^{tree}").decode().strip()
    status = git_bytes(
        root,
        "status",
        "--porcelain=v1",
        "-z",
        "--untracked-files=all",
    )
    state_sha256, manifest = git_state_snapshot(root)
    target = {
        "kind": "git",
        "root": str(root),
        "commit": commit,
        "tree": tree,
        "dirty": "dirty" if status else "clean",
        "state_sha256": state_sha256,
    }
    return target, manifest


def observe_git_identity(root: Path) -> dict[str, str]:
    target, _manifest = observe_git_snapshot(root)
    return target


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def observe_artifact_snapshot(
    path: Path,
) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
    artifact = path.resolve()
    root = require_current_root(artifact.parent)
    metadata = artifact.stat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ReviewError(f"artifact is not a file: {artifact}")
    content_sha256 = file_sha256(artifact)
    target = {
        "kind": "artifact",
        "root": str(root),
        "path": artifact.name,
        "content_sha256": content_sha256,
        "mode": metadata.st_mode,
        "size": metadata.st_size,
    }
    manifest = {
        artifact.name: {
            "kind": "file",
            "mode": metadata.st_mode,
            "size": metadata.st_size,
            "content_sha256": content_sha256,
        }
    }
    return target, manifest


def validate_target(value: Any) -> dict[str, Any]:
    target = require_object(value, "validation.target")
    kind = require_string(target, "kind")
    if kind == "git":
        reject_extra_keys(target, GIT_IDENTITY_KEYS, "validation.target")
        for key in GIT_IDENTITY_KEYS - {"kind"}:
            require_string(target, key)
        require_object_id(target["commit"], "validation.target.commit")
        require_object_id(target["tree"], "validation.target.tree")
        if target["dirty"] not in {"clean", "dirty"}:
            raise ReviewError("validation.target.dirty must be clean or dirty")
        require_digest(target["state_sha256"], "validation.target.state_sha256")
    elif kind == "artifact":
        reject_extra_keys(target, ARTIFACT_IDENTITY_KEYS, "validation.target")
        for key in ("root", "path", "content_sha256"):
            require_string(target, key)
        for key in ("mode", "size"):
            raw = target.get(key)
            if not isinstance(raw, int) or isinstance(raw, bool) or raw < 0:
                raise ReviewError(f"validation.target.{key} must be a non-negative integer")
        relative = Path(target["path"])
        if relative.is_absolute() or len(relative.parts) != 1 or ".." in relative.parts:
            raise ReviewError("validation.target.path must be one root-relative file")
        require_digest(
            target["content_sha256"], "validation.target.content_sha256"
        )
    else:
        raise ReviewError("validation.target.kind must be git or artifact")
    return target


def assert_target_snapshot(
    target: dict[str, Any],
) -> tuple[Path, dict[str, dict[str, Any]]]:
    root = Path(target["root"])
    if target["kind"] == "git":
        observed, manifest = observe_git_snapshot(root)
    else:
        observed, manifest = observe_artifact_snapshot(root / target["path"])
    if observed != target:
        raise ReviewError(
            "fixed evidence target changed since checker preflight",
            code="target_changed",
            pointer="/validation/target",
            retryable=False,
        )
    return root.resolve(), manifest


def validate_preflight(value: Any) -> dict[str, Any]:
    preflight = require_object(value, "checker preflight")
    reject_extra_keys(preflight, PREFLIGHT_KEYS, "checker preflight")
    prompt_sha256 = require_string(preflight, "prompt_sha256")
    require_digest(prompt_sha256, "checker preflight prompt_sha256")
    target = validate_target(preflight.get("target"))
    return {
        "prompt_sha256": prompt_sha256,
        "target": target,
        "evidence_manifest": validate_evidence_manifest(
            preflight.get("evidence_manifest"), target
        ),
    }


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


def reject_extra_keys(value: dict[str, Any], allowed: set[str], label: str) -> None:
    extra = sorted(set(value) - allowed)
    if extra:
        raise ReviewError(f"{label} has unknown keys: {', '.join(extra)}")


def validate_review_contract(
    value: Any,
    *,
    pointer_prefix: str = "",
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if not isinstance(value, dict):
        raise model_output_error("review must be an object", pointer_prefix)
    review = copy.deepcopy(value)
    extra = sorted(set(review) - TOP_LEVEL_KEYS)
    if extra:
        raise model_output_error(
            f"review has unknown keys: {', '.join(extra)}",
            json_pointer(pointer_prefix, extra[0]),
        )

    version_pointer = json_pointer(pointer_prefix, "review_version")
    if review.get("review_version") != "1":
        raise model_output_error("review_version must be '1'", version_pointer)

    scope_pointer = json_pointer(pointer_prefix, "scope_summary")
    scope_summary = review.get("scope_summary")
    if not isinstance(scope_summary, str) or not scope_summary.strip():
        raise model_output_error("scope_summary must be a non-empty string", scope_pointer)
    if len(scope_summary) > 300:
        raise model_output_error(
            "scope_summary must be <= 300 characters",
            scope_pointer,
        )

    findings_pointer = json_pointer(pointer_prefix, "findings")
    findings = review.get("findings")
    if not isinstance(findings, list):
        raise model_output_error("findings must be an array", findings_pointer)

    for key, required_keys in (
        ("evidence_gaps", {"what", "requested_proof"}),
        ("human_decisions", {"choice", "why_human"}),
    ):
        collection_pointer = json_pointer(pointer_prefix, key)
        items = review.get(key)
        if not isinstance(items, list):
            raise model_output_error(f"{key} must be an array", collection_pointer)
        for index, item in enumerate(items):
            item_pointer = json_pointer(collection_pointer, index)
            if not isinstance(item, dict):
                raise model_output_error(
                    f"{key}[{index}] must be an object",
                    item_pointer,
                )
            extra = sorted(set(item) - required_keys)
            if extra:
                raise model_output_error(
                    f"{key}[{index}] has unknown keys: {', '.join(extra)}",
                    json_pointer(item_pointer, extra[0]),
                )
            for required_key in required_keys:
                field = item.get(required_key)
                field_pointer = json_pointer(item_pointer, required_key)
                if not isinstance(field, str) or not field.strip():
                    raise model_output_error(
                        f"{key}[{index}].{required_key} must be a non-empty string",
                        field_pointer,
                    )

    boundaries_pointer = json_pointer(pointer_prefix, "does_not_prove")
    boundaries = review.get("does_not_prove")
    if not isinstance(boundaries, list):
        raise model_output_error(
            "does_not_prove must be an array",
            boundaries_pointer,
        )
    if not boundaries:
        raise model_output_error(
            "does_not_prove must contain at least one boundary",
            boundaries_pointer,
        )
    for index, boundary in enumerate(boundaries):
        boundary_pointer = json_pointer(boundaries_pointer, index)
        if not isinstance(boundary, str) or not boundary.strip():
            raise model_output_error(
                f"does_not_prove[{index}] must be a non-empty string",
                boundary_pointer,
            )

    seen_ids: set[str] = set()
    for index, finding in enumerate(findings):
        finding_pointer = json_pointer(findings_pointer, index)
        if not isinstance(finding, dict):
            raise model_output_error(
                f"findings[{index}] must be an object",
                finding_pointer,
            )
        extra = sorted(set(finding) - FINDING_KEYS)
        if extra:
            raise model_output_error(
                f"findings[{index}] has unknown keys: {', '.join(extra)}",
                json_pointer(finding_pointer, extra[0]),
            )

        finding_id = finding.get("id")
        id_pointer = json_pointer(finding_pointer, "id")
        if not isinstance(finding_id, str) or not finding_id.strip():
            raise model_output_error(
                f"findings[{index}].id must be a non-empty string",
                id_pointer,
            )
        if finding_id in seen_ids:
            raise model_output_error(f"duplicate finding id: {finding_id}", id_pointer)
        seen_ids.add(finding_id)

        severity = finding.get("severity")
        severity_pointer = json_pointer(finding_pointer, "severity")
        if severity not in SEVERITIES:
            raise model_output_error(
                f"invalid severity for {finding_id}: {severity}",
                severity_pointer,
            )
        for key in ("claim", "impact", "minimal_fix"):
            field = finding.get(key)
            field_pointer = json_pointer(finding_pointer, key)
            if not isinstance(field, str) or not field.strip():
                raise model_output_error(
                    f"{key} must be a non-empty string for {finding_id}",
                    field_pointer,
                )

        raw_path = finding.get("path")
        path_pointer = json_pointer(finding_pointer, "path")
        if not isinstance(raw_path, str) or not raw_path.strip():
            raise model_output_error(
                f"path must be a non-empty string for {finding_id}",
                path_pointer,
            )
        relative = Path(raw_path)
        if relative.is_absolute() or not relative.parts or ".." in relative.parts:
            raise model_output_error(
                f"unsafe evidence path for {finding_id}: {relative}",
                path_pointer,
            )
        if evidence_path_denied(relative):
            raise model_output_error(
                f"denied evidence path for {finding_id}: {relative}",
                path_pointer,
            )

        start = finding.get("line_start")
        start_pointer = json_pointer(finding_pointer, "line_start")
        if type(start) is not int or start < 1:
            raise model_output_error(
                f"line_start must be a positive integer for {finding_id}",
                start_pointer,
            )
        end = finding.get("line_end")
        end_pointer = json_pointer(finding_pointer, "line_end")
        if type(end) is not int or end < start:
            raise model_output_error(
                f"line_end must be an integer >= line_start for {finding_id}",
                end_pointer,
            )
        span = end - start + 1
        if span > MAX_EVIDENCE_LINES:
            raise model_output_error(
                (
                    f"evidence range exceeds {MAX_EVIDENCE_LINES} lines for "
                    f"{finding_id}; split the evidence into separately identified "
                    f"findings with at most {MAX_EVIDENCE_LINES} lines each"
                ),
                end_pointer,
            )

    return review, []


def normalization_record(
    source_review: dict[str, Any],
    normalized_review: dict[str, Any],
    changes: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "normalization_version": "1",
        "max_evidence_lines": MAX_EVIDENCE_LINES,
        "source_review_sha256": canonical_sha256(source_review),
        "normalized_review_sha256": canonical_sha256(normalized_review),
        "changes": changes,
    }


def validate_normalization(value: Any, review: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise normalization_error("normalization must be an object")
    extra = sorted(set(value) - NORMALIZATION_KEYS)
    missing = sorted(NORMALIZATION_KEYS - set(value))
    if extra:
        raise normalization_error(
            f"normalization has unknown keys: {', '.join(extra)}",
            json_pointer("/normalization", extra[0]),
        )
    if missing:
        raise normalization_error(
            f"normalization is missing keys: {', '.join(missing)}",
            json_pointer("/normalization", missing[0]),
        )
    if value.get("normalization_version") != "1":
        raise normalization_error(
            "normalization_version must be '1'",
            "/normalization/normalization_version",
        )
    if value.get("max_evidence_lines") != MAX_EVIDENCE_LINES:
        raise normalization_error(
            f"max_evidence_lines must be {MAX_EVIDENCE_LINES}",
            "/normalization/max_evidence_lines",
        )
    for key in ("source_review_sha256", "normalized_review_sha256"):
        raw = value.get(key)
        try:
            require_digest(raw, f"normalization.{key}")
        except (TypeError, ReviewError) as exc:
            raise normalization_error(
                f"normalization.{key} must be a lowercase SHA-256 digest",
                json_pointer("/normalization", key),
            ) from exc
    if value["normalized_review_sha256"] != canonical_sha256(review):
        raise normalization_error(
            "normalization does not match the normalized review",
            "/normalization/normalized_review_sha256",
        )

    changes = value.get("changes")
    if not isinstance(changes, list):
        raise normalization_error(
            "normalization.changes must be an array",
            "/normalization/changes",
        )
    if changes:
        raise normalization_error(
            "normalization must not clip or rewrite checker evidence; request a replacement",
            "/normalization/changes",
        )
    if value["source_review_sha256"] != canonical_sha256(review):
        raise normalization_error(
            "normalization source hash does not match the checker review",
            "/normalization/source_review_sha256",
        )
    return copy.deepcopy(value)


def validate_evidence_manifest(
    value: Any,
    target: dict[str, Any],
) -> dict[str, dict[str, Any]]:
    raw_manifest = require_object(value, "checker preflight evidence_manifest")
    manifest: dict[str, dict[str, Any]] = {}
    for raw_path, raw_entry in raw_manifest.items():
        if not isinstance(raw_path, str) or not raw_path:
            raise ReviewError("evidence manifest paths must be non-empty strings")
        relative = Path(raw_path)
        if relative.is_absolute() or not relative.parts or ".." in relative.parts:
            raise ReviewError(f"unsafe evidence manifest path: {raw_path}")
        normalized_path = relative.as_posix()
        if normalized_path != raw_path:
            raise ReviewError(f"evidence manifest path is not normalized: {raw_path}")

        entry = require_object(raw_entry, f"evidence_manifest[{raw_path}]")
        kind = require_string(entry, "kind")
        if kind not in MANIFEST_KINDS:
            raise ReviewError(f"invalid evidence manifest kind for {raw_path}: {kind}")
        if kind == "file":
            reject_extra_keys(entry, FILE_MANIFEST_KEYS, f"evidence_manifest[{raw_path}]")
            mode = entry.get("mode")
            size = entry.get("size")
            if not isinstance(mode, int) or isinstance(mode, bool) or mode < 0:
                raise ReviewError(f"invalid evidence manifest mode for {raw_path}")
            if not isinstance(size, int) or isinstance(size, bool) or size < 0:
                raise ReviewError(f"invalid evidence manifest size for {raw_path}")
            content_sha256 = require_string(entry, "content_sha256")
            require_digest(
                content_sha256,
                f"evidence_manifest[{raw_path}].content_sha256",
            )
        else:
            reject_extra_keys(
                entry,
                NON_FILE_MANIFEST_KEYS,
                f"evidence_manifest[{raw_path}]",
            )
        manifest[normalized_path] = dict(entry)

    if target["kind"] == "artifact":
        if set(manifest) != {target["path"]}:
            raise ReviewError("artifact evidence manifest must contain only its target")
        artifact_entry = manifest[target["path"]]
        if (
            artifact_entry.get("kind") != "file"
            or artifact_entry.get("content_sha256") != target["content_sha256"]
            or artifact_entry.get("mode") != target["mode"]
            or artifact_entry.get("size") != target["size"]
        ):
            raise ReviewError("artifact evidence manifest does not match its target")
    return manifest


def validate_validation_evidence(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        raise ReviewError("validation.evidence must be an array")
    evidence: list[dict[str, Any]] = []
    for index, raw in enumerate(value):
        item = require_object(raw, f"validation.evidence[{index}]")
        reject_extra_keys(
            item,
            VALIDATION_EVIDENCE_KEYS,
            f"validation.evidence[{index}]",
        )
        for key in ("finding_id", "path"):
            require_string(item, key)
        for key in ("line_start", "line_end", "file_mode", "file_size"):
            number = item.get(key)
            minimum = 1 if key in {"line_start", "line_end"} else 0
            if type(number) is not int or number < minimum:
                raise ReviewError(
                    f"validation.evidence[{index}].{key} must be an integer >= {minimum}"
                )
        if item["line_end"] < item["line_start"]:
            raise ReviewError(
                f"validation.evidence[{index}].line_end precedes line_start"
            )
        for key in ("file_sha256", "text_sha256"):
            require_digest(
                require_string(item, key),
                f"validation.evidence[{index}].{key}",
            )
        evidence.append(dict(item))
    return evidence


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


def read_bounded_evidence(
    repo_root: Path,
    relative: Path,
    finding_id: str,
) -> tuple[bytes, int, str]:
    directory_flags = os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC
    no_follow = os.O_NOFOLLOW
    current_directory = os.open(repo_root, directory_flags)
    file_descriptor: int | None = None
    try:
        for part in relative.parts[:-1]:
            next_directory = os.open(
                part,
                directory_flags | no_follow,
                dir_fd=current_directory,
            )
            os.close(current_directory)
            current_directory = next_directory
        file_descriptor = os.open(
            relative.name,
            os.O_RDONLY | os.O_CLOEXEC | no_follow,
            dir_fd=current_directory,
        )
    except OSError as exc:
        raise ReviewError(
            f"cannot open evidence without following symlinks for {finding_id}: {relative}"
        ) from exc
    finally:
        os.close(current_directory)

    try:
        with os.fdopen(file_descriptor, "rb") as source:
            file_descriptor = None
            metadata = os.fstat(source.fileno())
            if not stat.S_ISREG(metadata.st_mode):
                raise ReviewError(f"evidence is not a regular file for {finding_id}")
            if metadata.st_size > MAX_EVIDENCE_FILE_BYTES:
                raise ReviewError(
                    f"evidence file exceeds {MAX_EVIDENCE_FILE_BYTES} bytes for {finding_id}"
                )
            content = bytearray()
            while len(content) <= MAX_EVIDENCE_FILE_BYTES:
                remaining = MAX_EVIDENCE_FILE_BYTES + 1 - len(content)
                chunk = source.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                content.extend(chunk)
            if len(content) > MAX_EVIDENCE_FILE_BYTES:
                raise ReviewError(
                    f"evidence file exceeds {MAX_EVIDENCE_FILE_BYTES} bytes for {finding_id}"
                )
    finally:
        if file_descriptor is not None:
            os.close(file_descriptor)

    raw = bytes(content)
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ReviewError(f"evidence is not UTF-8 text for {finding_id}") from exc
    return raw, metadata.st_mode, text


def validate_review(
    review: dict[str, Any],
    repo_root: Path,
    allowed_paths: set[str] | None = None,
    expected_manifest: dict[str, dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    review, _changes = validate_review_contract(review)
    findings = review["findings"]
    evidence: list[dict[str, Any]] = []
    for index, finding in enumerate(findings):
        finding_id = finding["id"]
        finding_pointer = json_pointer("/findings", index)
        path_pointer = json_pointer(finding_pointer, "path")
        end_pointer = json_pointer(finding_pointer, "line_end")
        relative = Path(finding["path"])
        if allowed_paths is not None and relative.as_posix() not in allowed_paths:
            raise model_output_error(
                f"finding {finding_id} cites outside the fixed target: {relative}",
                path_pointer,
            )

        start = finding["line_start"]
        end = finding["line_end"]
        relative_text = relative.as_posix()
        expected_entry = (
            expected_manifest.get(relative_text)
            if expected_manifest is not None
            else None
        )
        if expected_manifest is not None and (
            expected_entry is None or expected_entry.get("kind") != "file"
        ):
            raise model_output_error(
                f"finding {finding_id} does not cite a regular file in the fixed target",
                path_pointer,
            )

        try:
            raw_source, source_mode, source_text = read_bounded_evidence(
                repo_root,
                relative,
                finding_id,
            )
        except ReviewError as exc:
            raise model_output_error(str(exc), path_pointer) from exc
        source_sha256 = hashlib.sha256(raw_source).hexdigest()
        if expected_entry is not None and (
            expected_entry["mode"] != source_mode
            or expected_entry["size"] != len(raw_source)
            or expected_entry["content_sha256"] != source_sha256
        ):
            raise ReviewError(
                f"evidence bytes for {finding_id} differ from the fixed target manifest",
                code="target_changed",
                pointer="/validation/target",
                retryable=False,
            )

        lines = source_text.splitlines(keepends=True)
        if end > len(lines):
            raise model_output_error(
                f"evidence range exceeds {relative} line count for {finding_id}",
                end_pointer,
            )
        excerpt = "".join(lines[start - 1 : end]).encode("utf-8")
        evidence.append(
            {
                "finding_id": finding_id,
                "path": relative.as_posix(),
                "line_start": start,
                "line_end": end,
                "file_mode": source_mode,
                "file_size": len(raw_source),
                "file_sha256": source_sha256,
                "text_sha256": hashlib.sha256(excerpt).hexdigest(),
            }
        )

    return evidence


def extract_structured_output(envelope: dict[str, Any]) -> dict[str, Any]:
    if envelope.get("is_error") is True:
        raise model_output_error(
            "Claude envelope reports is_error=true",
            "/is_error",
        )
    structured_output = envelope.get("structured_output")
    if not isinstance(structured_output, dict):
        raise model_output_error(
            "structured_output must be an object",
            "/structured_output",
        )
    return structured_output


def fingerprint_git(args: argparse.Namespace) -> int:
    print(json.dumps(observe_git_identity(Path(args.root)), sort_keys=True))
    return 0


def snapshot_git(args: argparse.Namespace) -> int:
    expected_commit = require_object_id(args.commit, "expected commit")
    expected_tree = require_object_id(args.tree, "expected tree")
    expected_state_sha256 = require_digest(
        args.state_sha256, "expected Git state hash"
    )
    if args.dirty not in {"clean", "dirty"}:
        raise ReviewError("expected dirty state must be clean or dirty")
    observed, manifest = observe_git_snapshot(Path(args.root))
    if observed["commit"] != expected_commit:
        raise ReviewError("Git HEAD does not match the declared commit")
    if observed["tree"] != expected_tree:
        raise ReviewError("Git HEAD tree does not match the declared tree")
    if observed["dirty"] != args.dirty:
        raise ReviewError("Git dirty state does not match the declaration")
    if observed["state_sha256"] != expected_state_sha256:
        raise ReviewError("Git checkout does not match the declared state hash")
    write_json(
        Path(args.output),
        {
            "prompt_sha256": file_sha256(Path(args.prompt)),
            "target": observed,
            "evidence_manifest": manifest,
        },
    )
    return 0


def snapshot_artifact(args: argparse.Namespace) -> int:
    expected = require_digest(args.sha256, "expected artifact hash")
    observed, manifest = observe_artifact_snapshot(Path(args.artifact))
    if observed["content_sha256"] != expected:
        raise ReviewError("artifact does not match the declared SHA-256")
    write_json(
        Path(args.output),
        {
            "prompt_sha256": file_sha256(Path(args.prompt)),
            "target": observed,
            "evidence_manifest": manifest,
        },
    )
    return 0


def normalize(args: argparse.Namespace) -> int:
    envelope_value = read_json(
        Path(args.envelope),
        malformed_code="model_output_invalid",
        malformed_retryable=True,
    )
    if not isinstance(envelope_value, dict):
        raise model_output_error("Claude envelope must be an object", "")
    source_review = extract_structured_output(envelope_value)
    normalized_review, changes = validate_review_contract(
        source_review,
        pointer_prefix="/structured_output",
    )
    normalized_envelope = copy.deepcopy(envelope_value)
    normalized_envelope["structured_output"] = normalized_review
    normalization = normalization_record(source_review, normalized_review, changes)
    envelope_path = Path(args.envelope).resolve()
    normalized_envelope_path = Path(args.normalized_envelope).resolve()
    normalization_path = Path(args.normalization).resolve()
    if normalized_envelope_path == normalization_path:
        raise ReviewError(
            "normalized envelope and normalization outputs must be distinct",
            code="configuration_invalid",
            retryable=False,
        )
    for output_path in (normalized_envelope_path, normalization_path):
        if output_path == envelope_path or output_path.exists() or output_path.is_symlink():
            raise ReviewError(
                f"normalization output must be a new path distinct from the input: {output_path}",
                code="configuration_invalid",
                retryable=False,
            )
    try:
        write_json(normalized_envelope_path, normalized_envelope)
        write_json(normalization_path, normalization)
    except (OSError, UnicodeError):
        normalized_envelope_path.unlink(missing_ok=True)
        normalization_path.unlink(missing_ok=True)
        raise
    return 0


def finalize(args: argparse.Namespace) -> int:
    envelope_value = read_json(
        Path(args.envelope),
        malformed_code="model_output_invalid",
        malformed_retryable=True,
    )
    if not isinstance(envelope_value, dict):
        raise model_output_error("Claude envelope must be an object", "")
    envelope = envelope_value
    review = extract_structured_output(envelope)
    normalization = validate_normalization(
        read_json(Path(args.normalization)),
        review,
    )
    preflight = validate_preflight(read_json(Path(args.identity)))
    target = preflight["target"]
    evidence_manifest = preflight["evidence_manifest"]
    evidence_root, observed_manifest = assert_target_snapshot(target)
    if evidence_manifest != observed_manifest:
        raise ReviewError(
            "fixed evidence manifest changed since checker preflight",
            code="target_changed",
            pointer="/validation/target",
            retryable=False,
        )
    evidence = validate_review(
        review,
        evidence_root,
        set(evidence_manifest),
        expected_manifest=evidence_manifest,
    )
    prompt = Path(args.prompt).read_bytes()
    current_prompt_sha256 = hashlib.sha256(prompt).hexdigest()
    if current_prompt_sha256 != preflight["prompt_sha256"]:
        raise ReviewError(
            "checker prompt changed since preflight",
            code="prompt_changed",
            pointer="/validation/prompt_sha256",
            retryable=False,
        )
    original_prompt = Path(args.original_prompt)
    if file_sha256(original_prompt) != current_prompt_sha256:
        raise ReviewError(
            "original checker prompt changed since preflight",
            code="prompt_changed",
            pointer="/validation/prompt_sha256",
            retryable=False,
        )

    def reassert_publication_inputs() -> None:
        if file_sha256(original_prompt) != current_prompt_sha256:
            raise ReviewError(
                "original checker prompt changed before publication",
                code="prompt_changed",
                pointer="/validation/prompt_sha256",
                retryable=False,
            )
        _root, current_manifest = assert_target_snapshot(target)
        if current_manifest != evidence_manifest:
            raise ReviewError(
                "fixed evidence manifest changed before publication",
                code="target_changed",
                pointer="/validation/target",
                retryable=False,
            )

    output = {
        **review,
        "validation": {
            "prompt_sha256": current_prompt_sha256,
            "target": target,
            "evidence": evidence,
            "normalization": normalization,
        },
    }
    write_json(
        Path(args.output),
        output,
        before_replace=reassert_publication_inputs,
    )
    return 0


def check(args: argparse.Namespace) -> int:
    output = require_object(read_json(Path(args.review)), "review output")
    validation = require_object(output.pop("validation", None), "validation")
    reject_extra_keys(validation, VALIDATION_KEYS, "validation")
    validate_normalization(validation.get("normalization"), output)
    target = validate_target(validation.get("target"))
    evidence_root, current_manifest = assert_target_snapshot(target)
    prompt_hash = require_string(validation, "prompt_sha256")
    require_digest(prompt_hash, "prompt_sha256")
    stored_evidence = validate_validation_evidence(validation.get("evidence"))
    current_prompt_hash = hashlib.sha256(Path(args.prompt).read_bytes()).hexdigest()
    if prompt_hash != current_prompt_hash:
        raise ReviewError(
            "stale prompt hash",
            code="prompt_changed",
            pointer="/validation/prompt_sha256",
            retryable=False,
        )
    expected = validate_review(
        output,
        evidence_root,
        set(current_manifest),
        expected_manifest=current_manifest,
    )
    if stored_evidence != expected:
        raise ReviewError("stale evidence hashes")
    _root, final_manifest = assert_target_snapshot(target)
    if final_manifest != current_manifest:
        raise ReviewError(
            "fixed evidence manifest changed during validation",
            code="target_changed",
            pointer="/validation/target",
            retryable=False,
        )
    print("valid evidence-bounded review")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    commands = parser.add_subparsers(dest="command", required=True)
    fingerprint_parser = commands.add_parser("fingerprint-git")
    fingerprint_parser.add_argument("root")
    fingerprint_parser.set_defaults(handler=fingerprint_git)
    git_parser = commands.add_parser("snapshot-git")
    git_parser.add_argument("root")
    git_parser.add_argument("commit")
    git_parser.add_argument("tree")
    git_parser.add_argument("dirty")
    git_parser.add_argument("state_sha256")
    git_parser.add_argument("prompt")
    git_parser.add_argument("output")
    git_parser.set_defaults(handler=snapshot_git)
    artifact_parser = commands.add_parser("snapshot-artifact")
    artifact_parser.add_argument("artifact")
    artifact_parser.add_argument("sha256")
    artifact_parser.add_argument("prompt")
    artifact_parser.add_argument("output")
    artifact_parser.set_defaults(handler=snapshot_artifact)
    normalize_parser = commands.add_parser("normalize")
    normalize_parser.add_argument("envelope")
    normalize_parser.add_argument("normalized_envelope")
    normalize_parser.add_argument("normalization")
    normalize_parser.add_argument("--diagnostic-json")
    normalize_parser.set_defaults(handler=normalize)
    finalize_parser = commands.add_parser("finalize")
    finalize_parser.add_argument("envelope")
    finalize_parser.add_argument("prompt")
    finalize_parser.add_argument("original_prompt")
    finalize_parser.add_argument("output")
    finalize_parser.add_argument("identity")
    finalize_parser.add_argument("normalization")
    finalize_parser.add_argument("--diagnostic-json")
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
    except (OSError, UnicodeError, ReviewError) as exc:
        error = (
            exc
            if isinstance(exc, ReviewError)
            else ReviewError(
                str(exc),
                code="io_error",
                retryable=False,
            )
        )
        diagnostic_path = getattr(args, "diagnostic_json", None)
        if diagnostic_path:
            try:
                write_json(Path(diagnostic_path), error.diagnostic(args.command))
            except (OSError, UnicodeError) as diagnostic_error:
                print(
                    f"review diagnostic write failed: {diagnostic_error}",
                    file=sys.stderr,
                )
        print(f"review validation failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
