#!/usr/bin/env python3
"""Pre-seal coverage and ordered-publication checks for security benchmarks."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, Dict, List, Mapping, Optional, Sequence, Set, Tuple


SCHEMA_VERSION = 1
STAGES = ("sealed", "submission", "reveal", "scoring")
DISPOSITIONS = ("registered-unit", "patched-safe", "negative-control")
BASE_REQUIRED = (
    "PUBLIC_INVARIANTS.json",
    "SOURCE_MANIFEST.json",
    "SCORING_RULES.json",
    "sealed/PRESEAL_ATTESTATION.json",
    "sealed/commitment.json",
    "sealed/private-bundle.tar.enc",
)
STAGE_REQUIRED = {
    "sealed": (),
    "submission": (
        "submission/submission.json",
        "publication-receipts/sealed.json",
    ),
    "reveal": (
        "reviews/consensus.json",
        "reveal/key.txt",
        "reveal/invariant-coverage.json",
        "reveal/units.json",
        "publication-receipts/submission.json",
    ),
    "scoring": (
        "scoring/final-score.json",
        "publication-receipts/reveal.json",
    ),
}
FUTURE_PREFIXES = {
    "sealed": ("submission/", "reviews/", "reveal/", "scoring/", "publication-receipts/"),
    "submission": ("reviews/", "reveal/", "scoring/"),
    "reveal": ("scoring/",),
    "scoring": (),
}
STAGE_ALLOWED_ADDITIONS = {
    "submission": ("submission/", "publication-receipts/sealed.json"),
    "reveal": ("reviews/", "reveal/", "publication-receipts/submission.json"),
    "scoring": ("scoring/", "publication-receipts/reveal.json"),
}
BASE_ALLOWED_PATHS = (
    "target/",
    "PUBLIC_INVARIANTS.json",
    "SOURCE_MANIFEST.json",
    "SCORING_RULES.json",
    "sealed/PRESEAL_ATTESTATION.json",
    "sealed/commitment.json",
    "sealed/private-bundle.tar.enc",
)
IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]*$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")


class ProtocolError(Exception):
    """A benchmark input or publication-state error."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
        "utf-8"
    )


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def json_sha256(value: Any) -> str:
    return sha256_bytes(canonical_json(value))


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, indent=2, sort_keys=True)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    except Exception:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def load_json(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as stream:
            value = json.load(stream)
    except FileNotFoundError as exc:
        raise ProtocolError(f"missing JSON file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ProtocolError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ProtocolError(f"expected a JSON object in {path}")
    return value


def contained_path(root: Path, raw_path: str) -> Path:
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = root / candidate
    lexical = Path(os.path.abspath(candidate))
    try:
        if os.path.commonpath((str(lexical), str(root))) != str(root):
            raise ProtocolError(f"path escapes the pre-seal root: {raw_path}")
    except ValueError as exc:
        raise ProtocolError(f"path escapes the pre-seal root: {raw_path}") from exc
    current = root
    for part in lexical.relative_to(root).parts:
        current = current / part
        try:
            metadata = os.lstat(current)
        except FileNotFoundError as exc:
            raise ProtocolError(f"evidence artifact does not exist: {raw_path}") from exc
        if stat.S_ISLNK(metadata.st_mode):
            raise ProtocolError(f"evidence path contains a symlink: {raw_path}")
    resolved = lexical.resolve(strict=True)
    if os.path.commonpath((str(resolved), str(root))) != str(root):
        raise ProtocolError(f"evidence path escapes through a symlink: {raw_path}")
    return lexical


def evidence_digest(root: Path, raw_path: str) -> Dict[str, Any]:
    path = contained_path(root, raw_path)
    metadata = path.stat()
    if not stat.S_ISREG(metadata.st_mode):
        raise ProtocolError(f"evidence artifact is not a regular file: {raw_path}")
    if metadata.st_size < 1:
        raise ProtocolError(f"evidence artifact is empty: {raw_path}")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return {"sha256": digest.hexdigest(), "size": metadata.st_size}


def object_list(value: Mapping[str, Any], field: str, label: str) -> List[Mapping[str, Any]]:
    raw = value.get(field)
    if not isinstance(raw, list) or not raw or not all(isinstance(item, dict) for item in raw):
        raise ProtocolError(f"{label}.{field} must be a non-empty list of objects")
    return raw


def unique_ids(records: Sequence[Mapping[str, Any]], label: str) -> Tuple[List[str], List[str]]:
    errors: List[str] = []
    values: List[str] = []
    for index, record in enumerate(records, start=1):
        value = record.get("id")
        if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
            errors.append(f"{label} record {index} has an invalid id")
            continue
        values.append(value)
    duplicates = sorted({value for value in values if values.count(value) > 1})
    if duplicates:
        errors.append(f"{label} ids are duplicated: " + ", ".join(duplicates))
    return values, errors


def validate_preseal(
    root: Path,
    invariants: Mapping[str, Any],
    units: Mapping[str, Any],
    matrix: Mapping[str, Any],
) -> Dict[str, Any]:
    errors: List[str] = []
    for label, value in (("invariants", invariants), ("units", units), ("matrix", matrix)):
        if value.get("schema_version") != SCHEMA_VERSION:
            errors.append(f"{label}.schema_version must be {SCHEMA_VERSION}")
    invariant_records = object_list(invariants, "invariants", "invariants")
    unit_records = object_list(units, "units", "units")
    rows = object_list(matrix, "rows", "matrix")
    invariant_ids, invariant_errors = unique_ids(invariant_records, "invariant")
    unit_ids, unit_errors = unique_ids(unit_records, "unit")
    errors.extend(invariant_errors)
    errors.extend(unit_errors)
    for record in invariant_records:
        statement = record.get("statement")
        if not isinstance(statement, str) or not statement.strip():
            errors.append(f"invariant {record.get('id')} has an empty statement")
    total_weight = 0.0
    for record in unit_records:
        weight = record.get("weight")
        if (
            isinstance(weight, bool)
            or not isinstance(weight, (int, float))
            or not math.isfinite(float(weight))
            or weight <= 0
        ):
            errors.append(f"unit {record.get('id')} has an invalid weight")
        else:
            total_weight += float(weight)
    if abs(total_weight - 100.0) > 1e-9:
        errors.append(f"unit weights total {total_weight:g}; expected 100")

    rows_by_invariant: Dict[str, List[int]] = {}
    unit_owners: Dict[str, List[str]] = {}
    evidence: List[Dict[str, Any]] = []
    dispositions: Dict[str, int] = {name: 0 for name in DISPOSITIONS}
    for index, row in enumerate(rows, start=1):
        invariant_id = row.get("invariant_id")
        if not isinstance(invariant_id, str) or invariant_id not in set(invariant_ids):
            errors.append(f"matrix row {index} has an unknown invariant_id")
            continue
        rows_by_invariant.setdefault(invariant_id, []).append(index)
        disposition = row.get("disposition")
        if disposition not in DISPOSITIONS:
            errors.append(f"matrix row {index} has an invalid disposition")
            continue
        dispositions[disposition] += 1
        reason = row.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            errors.append(f"matrix row {index} requires a non-empty reason")
        mapped_units = row.get("unit_ids", [])
        if not isinstance(mapped_units, list) or not all(
            isinstance(item, str) for item in mapped_units
        ):
            errors.append(f"matrix row {index}.unit_ids must be a list of strings")
            mapped_units = []
        if disposition == "registered-unit" and not mapped_units:
            errors.append(f"matrix row {index} registered-unit disposition requires unit_ids")
        if disposition != "registered-unit" and mapped_units:
            errors.append(f"matrix row {index} {disposition} disposition may not map units")
        for unit_id in mapped_units:
            if unit_id not in set(unit_ids):
                errors.append(f"matrix row {index} references unknown unit: {unit_id}")
            else:
                unit_owners.setdefault(unit_id, []).append(invariant_id)
        raw_evidence = row.get("evidence", [])
        if not isinstance(raw_evidence, list) or not all(
            isinstance(item, str) and item.strip() for item in raw_evidence
        ):
            errors.append(f"matrix row {index}.evidence must be a list of paths")
            raw_evidence = []
        if not raw_evidence:
            errors.append(f"matrix row {index} {disposition} disposition requires evidence")
        for path in raw_evidence:
            try:
                evidence.append(evidence_digest(root, path))
            except ProtocolError as exc:
                errors.append(f"matrix row {index}: {exc}")

    for invariant_id in invariant_ids:
        owners = rows_by_invariant.get(invariant_id, [])
        if not owners:
            errors.append(f"public invariant is unmapped: {invariant_id}")
        elif len(owners) > 1:
            errors.append(f"public invariant has multiple matrix rows: {invariant_id}")
    for unit_id in unit_ids:
        owners = unit_owners.get(unit_id, [])
        if not owners:
            errors.append(f"scored unit has no public invariant: {unit_id}")
        elif len(owners) > 1:
            errors.append(f"scored unit maps to multiple public invariants: {unit_id}")
    if errors:
        raise ProtocolError("pre-seal coverage check failed: " + "; ".join(errors))

    evidence_identities = sorted(
        ((item["sha256"], item["size"]) for item in evidence), key=lambda item: (item[0], item[1])
    )
    return {
        "schema_version": SCHEMA_VERSION,
        "valid": True,
        "generated_at": utc_now(),
        "counts": {
            "public_invariants": len(invariant_ids),
            "scored_units": len(unit_ids),
            "matrix_rows": len(rows),
            "evidence_artifacts": len(evidence),
            "dispositions": dispositions,
        },
        "unit_weight_total": total_weight,
        "hashes": {
            "public_invariants_canonical_sha256": json_sha256(invariants),
            "units_canonical_sha256": json_sha256(units),
            "invariant_matrix_canonical_sha256": json_sha256(matrix),
            "evidence_aggregate_sha256": sha256_bytes(canonical_json(evidence_identities)),
        },
    }


def command_preseal(args: argparse.Namespace) -> None:
    root = Path(args.root).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ProtocolError(f"pre-seal root is not a directory: {root}")
    invariants = load_json(contained_path(root, args.invariants))
    units = load_json(contained_path(root, args.units))
    matrix = load_json(contained_path(root, args.matrix))
    attestation = validate_preseal(root, invariants, units, matrix)
    output = Path(args.output).expanduser().resolve()
    atomic_write_json(output, attestation)
    print(json.dumps(attestation, indent=2, sort_keys=True))


def run_git(repository: Path, arguments: Sequence[str], *, check: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        ["git", "-C", str(repository), *arguments],
        text=True,
        capture_output=True,
        check=False,
    )
    if check and completed.returncode != 0:
        detail = completed.stderr.strip() or completed.stdout.strip()
        raise ProtocolError(f"git {' '.join(arguments)} failed: {detail}")
    return completed


def validate_benchmark_root(raw: str) -> str:
    path = PurePosixPath(raw)
    if path.is_absolute() or not path.parts or ".." in path.parts:
        raise ProtocolError("--benchmark-root must be a repository-relative path")
    return str(path).rstrip("/")


def validate_ref_prefix(raw: str) -> str:
    if not raw or raw.startswith("/") or raw.endswith("/") or ".." in raw:
        raise ProtocolError("--ref-prefix must be a normalized remote branch prefix")
    if not re.fullmatch(r"[A-Za-z0-9._/-]+", raw):
        raise ProtocolError("--ref-prefix contains invalid characters")
    return raw


def expected_ref(remote: str, prefix: str, stage: str) -> str:
    return f"refs/remotes/{remote}/{prefix}/{stage}"


def expected_remote_ref(prefix: str, stage: str) -> str:
    return f"refs/heads/{prefix}/{stage}"


def live_remote_refs(repository: Path, remote: str, prefix: str) -> Dict[str, str]:
    completed = run_git(
        repository,
        ("ls-remote", "--heads", remote, f"refs/heads/{prefix}/*"),
    )
    refs: Dict[str, str] = {}
    for line in completed.stdout.splitlines():
        fields = line.split()
        if len(fields) != 2 or not re.fullmatch(r"[0-9a-f]{40,64}", fields[0]):
            raise ProtocolError("git ls-remote returned malformed output")
        refs[fields[1]] = fields[0]
    return refs


def resolve_ref(repository: Path, ref: str) -> Optional[str]:
    completed = run_git(repository, ("rev-parse", "--verify", f"{ref}^{{commit}}"), check=False)
    return completed.stdout.strip() if completed.returncode == 0 else None


def tree_sha(repository: Path, commit: str) -> str:
    return run_git(repository, ("rev-parse", f"{commit}^{{tree}}")).stdout.strip()


def tree_files(repository: Path, commit: str, benchmark_root: str) -> List[str]:
    output = run_git(
        repository,
        ("ls-tree", "-r", "--name-only", commit, "--", benchmark_root),
    ).stdout.splitlines()
    prefix = benchmark_root + "/"
    return [path[len(prefix) :] for path in output if path.startswith(prefix)]


def git_file_bytes(repository: Path, commit: str, benchmark_root: str, relative: str) -> bytes:
    spec = f"{commit}:{benchmark_root}/{relative}"
    completed = subprocess.run(
        ["git", "-C", str(repository), "show", spec],
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ProtocolError(f"cannot read {relative} at {commit}: {detail}")
    return completed.stdout


def git_file_mode(repository: Path, commit: str, benchmark_root: str, relative: str) -> str:
    repository_path = f"{benchmark_root}/{relative}"
    output = run_git(
        repository,
        ("ls-tree", commit, "--", repository_path),
    ).stdout.strip()
    header, separator, _listed_path = output.partition("\t")
    fields = header.split()
    if not separator or len(fields) != 3 or fields[1] != "blob":
        raise ProtocolError(f"target path is not a regular Git blob: {relative}")
    return fields[0]


def git_json(repository: Path, commit: str, benchmark_root: str, relative: str) -> Dict[str, Any]:
    raw = git_file_bytes(repository, commit, benchmark_root, relative)
    try:
        value = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProtocolError(f"invalid JSON at {commit}:{benchmark_root}/{relative}") from exc
    if not isinstance(value, dict):
        raise ProtocolError(f"expected JSON object at {commit}:{benchmark_root}/{relative}")
    return value


def cumulative_required(stage: str) -> Set[str]:
    result = set(BASE_REQUIRED)
    for current in STAGES[: STAGES.index(stage) + 1]:
        result.update(STAGE_REQUIRED[current])
    return result


def validate_stage_layout(
    repository: Path,
    commit: str,
    benchmark_root: str,
    stage: str,
) -> None:
    files = tree_files(repository, commit, benchmark_root)
    missing = sorted(cumulative_required(stage) - set(files))
    if missing:
        raise ProtocolError(f"{stage} commit lacks required paths: " + ", ".join(missing))
    if not any(path.startswith("target/") for path in files):
        raise ProtocolError(f"{stage} commit must contain at least one target/ file")
    forbidden = sorted(
        path for path in files if any(path.startswith(prefix) for prefix in FUTURE_PREFIXES[stage])
    )
    if forbidden:
        raise ProtocolError(f"{stage} commit contains future-stage paths: " + ", ".join(forbidden))
    allowed_rules = list(BASE_ALLOWED_PATHS)
    for current in STAGES[1 : STAGES.index(stage) + 1]:
        allowed_rules.extend(STAGE_ALLOWED_ADDITIONS[current])
    unexpected = sorted(
        path
        for path in files
        if not any(
            path.startswith(rule) if rule.endswith("/") else path == rule
            for rule in allowed_rules
        )
    )
    if unexpected:
        raise ProtocolError(f"{stage} commit contains undeclared paths: " + ", ".join(unexpected))


def validate_stage_delta(
    repository: Path,
    previous_commit: str,
    current_commit: str,
    benchmark_root: str,
    stage: str,
) -> None:
    completed = subprocess.run(
        [
            "git",
            "-C",
            str(repository),
            "diff",
            "--name-status",
            "--no-renames",
            "-z",
            previous_commit,
            current_commit,
            "--",
            benchmark_root,
        ],
        capture_output=True,
        check=False,
    )
    if completed.returncode != 0:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise ProtocolError(f"cannot compare the {stage} stage tree: {detail}")
    fields = completed.stdout.split(b"\0")
    if fields and fields[-1] == b"":
        fields.pop()
    if len(fields) % 2:
        raise ProtocolError(f"cannot parse the {stage} stage tree delta")
    root_prefix = benchmark_root + "/"
    allowed = STAGE_ALLOWED_ADDITIONS[stage]
    violations: List[str] = []
    for index in range(0, len(fields), 2):
        status_code = fields[index].decode("ascii", errors="replace")
        repository_path = fields[index + 1].decode("utf-8", errors="surrogateescape")
        if not repository_path.startswith(root_prefix):
            violations.append(repository_path)
            continue
        relative = repository_path[len(root_prefix) :]
        allowed_addition = any(
            relative.startswith(rule) if rule.endswith("/") else relative == rule
            for rule in allowed
        )
        if status_code != "A" or not allowed_addition:
            violations.append(f"{status_code}:{relative}")
    if violations:
        raise ProtocolError(
            f"{stage} commit modifies frozen or out-of-stage paths: "
            + ", ".join(violations)
        )


def validate_sealed_commit(repository: Path, commit: str, benchmark_root: str) -> None:
    attestation_raw = git_file_bytes(
        repository, commit, benchmark_root, "sealed/PRESEAL_ATTESTATION.json"
    )
    attestation = git_json(
        repository, commit, benchmark_root, "sealed/PRESEAL_ATTESTATION.json"
    )
    commitment = git_json(repository, commit, benchmark_root, "sealed/commitment.json")
    invariants = git_json(repository, commit, benchmark_root, "PUBLIC_INVARIANTS.json")
    source_manifest = git_json(repository, commit, benchmark_root, "SOURCE_MANIFEST.json")
    scoring_rules = git_json(repository, commit, benchmark_root, "SCORING_RULES.json")
    ciphertext = git_file_bytes(
        repository, commit, benchmark_root, "sealed/private-bundle.tar.enc"
    )
    if attestation.get("schema_version") != SCHEMA_VERSION or attestation.get("valid") is not True:
        raise ProtocolError("sealed PRESEAL_ATTESTATION.json is not valid")
    parse_receipt_timestamp(attestation.get("generated_at"), "pre-seal generated_at")
    if commitment.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError("sealed commitment schema_version is invalid")
    if source_manifest.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError("sealed source manifest schema_version is invalid")
    if scoring_rules.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError("sealed scoring rules schema_version is invalid")
    if invariants.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError("sealed public invariants schema_version is invalid")
    if not ciphertext:
        raise ProtocolError("sealed ciphertext is empty")
    invariant_records = object_list(invariants, "invariants", "public invariants")
    invariant_ids, invariant_errors = unique_ids(invariant_records, "public invariant")
    for invariant in invariant_records:
        if not isinstance(invariant.get("statement"), str) or not invariant["statement"].strip():
            invariant_errors.append(f"public invariant {invariant.get('id')} has an empty statement")
    if invariant_errors:
        raise ProtocolError("sealed public invariants are invalid: " + "; ".join(invariant_errors))
    manifest_records = object_list(source_manifest, "files", "source manifest")
    manifest_paths: List[str] = []
    for index, record in enumerate(manifest_records, start=1):
        path = record.get("path")
        digest = record.get("sha256")
        if not isinstance(path, str):
            raise ProtocolError(f"source manifest record {index} has an invalid path")
        pure_path = PurePosixPath(path)
        if (
            pure_path.is_absolute()
            or str(pure_path) != path
            or not path.startswith("target/")
            or ".." in pure_path.parts
        ):
            raise ProtocolError(f"source manifest record {index} has an invalid path")
        if not isinstance(digest, str) or not SHA256.fullmatch(digest):
            raise ProtocolError(f"source manifest record {index} has an invalid sha256")
        if path in manifest_paths:
            raise ProtocolError(f"source manifest path is duplicated: {path}")
        manifest_paths.append(path)
        if git_file_mode(repository, commit, benchmark_root, path) not in ("100644", "100755"):
            raise ProtocolError(f"source manifest target is not a regular file: {path}")
        raw = git_file_bytes(repository, commit, benchmark_root, path)
        if sha256_bytes(raw) != digest:
            raise ProtocolError(f"source manifest digest mismatch: {path}")
    target_paths = sorted(
        path for path in tree_files(repository, commit, benchmark_root) if path.startswith("target/")
    )
    if sorted(manifest_paths) != target_paths:
        missing_from_manifest = sorted(set(target_paths) - set(manifest_paths))
        absent_from_target = sorted(set(manifest_paths) - set(target_paths))
        detail = []
        if missing_from_manifest:
            detail.append("unlisted=" + ",".join(missing_from_manifest))
        if absent_from_target:
            detail.append("absent=" + ",".join(absent_from_target))
        raise ProtocolError("source manifest coverage mismatch: " + "; ".join(detail))
    hashes = attestation.get("hashes")
    if not isinstance(hashes, dict):
        raise ProtocolError("sealed pre-seal attestation lacks hashes")
    for field in (
        "public_invariants_canonical_sha256",
        "units_canonical_sha256",
        "invariant_matrix_canonical_sha256",
        "evidence_aggregate_sha256",
    ):
        if not isinstance(hashes.get(field), str) or not SHA256.fullmatch(hashes[field]):
            raise ProtocolError(f"sealed pre-seal attestation has an invalid hash: {field}")
    if hashes["public_invariants_canonical_sha256"] != json_sha256(invariants):
        raise ProtocolError("sealed pre-seal attestation does not bind the public invariants")
    counts = attestation.get("counts")
    if not isinstance(counts, dict):
        raise ProtocolError("sealed pre-seal attestation lacks counts")
    integer_counts = ("public_invariants", "scored_units", "matrix_rows", "evidence_artifacts")
    if any(
        isinstance(counts.get(field), bool)
        or not isinstance(counts.get(field), int)
        or counts[field] < 1
        for field in integer_counts
    ):
        raise ProtocolError("sealed pre-seal attestation has invalid counts")
    if counts["public_invariants"] != len(invariant_ids):
        raise ProtocolError("sealed pre-seal invariant count does not match the public list")
    if counts["matrix_rows"] != counts["public_invariants"]:
        raise ProtocolError("sealed pre-seal matrix row count is incomplete")
    if counts["evidence_artifacts"] < counts["matrix_rows"]:
        raise ProtocolError("sealed pre-seal evidence count is incomplete")
    dispositions = counts.get("dispositions")
    if not isinstance(dispositions, dict) or set(dispositions) != set(DISPOSITIONS):
        raise ProtocolError("sealed pre-seal disposition counts are invalid")
    if any(
        isinstance(dispositions[field], bool)
        or not isinstance(dispositions[field], int)
        or dispositions[field] < 0
        for field in DISPOSITIONS
    ) or sum(dispositions.values()) != counts["matrix_rows"]:
        raise ProtocolError("sealed pre-seal disposition totals are invalid")
    weight_total = attestation.get("unit_weight_total")
    if (
        isinstance(weight_total, bool)
        or not isinstance(weight_total, (int, float))
        or not math.isfinite(float(weight_total))
        or abs(float(weight_total) - 100.0) > 1e-9
    ):
        raise ProtocolError("sealed pre-seal unit weights do not total 100")
    expected = {
        "ciphertext_sha256": sha256_bytes(ciphertext),
        "preseal_attestation_sha256": sha256_bytes(attestation_raw),
        "invariant_matrix_sha256": hashes.get("invariant_matrix_canonical_sha256"),
        "public_invariants_sha256": json_sha256(invariants),
        "source_manifest_sha256": json_sha256(source_manifest),
        "scoring_rules_sha256": json_sha256(scoring_rules),
    }
    for field, value in expected.items():
        if not isinstance(value, str) or not SHA256.fullmatch(value):
            raise ProtocolError(f"sealed commitment source is invalid for {field}")
        if commitment.get(field) != value:
            raise ProtocolError(f"sealed commitment mismatch: {field}")


def validate_reveal_commit(repository: Path, commit: str, benchmark_root: str) -> None:
    attestation = git_json(
        repository, commit, benchmark_root, "sealed/PRESEAL_ATTESTATION.json"
    )
    hashes = attestation["hashes"]
    units = git_json(repository, commit, benchmark_root, "reveal/units.json")
    matrix = git_json(repository, commit, benchmark_root, "reveal/invariant-coverage.json")
    if units.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError("revealed units schema_version is invalid")
    if matrix.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError("revealed invariant matrix schema_version is invalid")
    if json_sha256(units) != hashes["units_canonical_sha256"]:
        raise ProtocolError("revealed units do not match the pre-seal commitment")
    if json_sha256(matrix) != hashes["invariant_matrix_canonical_sha256"]:
        raise ProtocolError("revealed invariant matrix does not match the pre-seal commitment")
    unit_records = object_list(units, "units", "revealed units")
    rows = object_list(matrix, "rows", "revealed invariant matrix")
    if len(unit_records) != attestation["counts"]["scored_units"]:
        raise ProtocolError("revealed unit count does not match the pre-seal attestation")
    if len(rows) != attestation["counts"]["matrix_rows"]:
        raise ProtocolError("revealed matrix count does not match the pre-seal attestation")


def parse_receipt_timestamp(value: Any, label: str = "publication receipt checked_at") -> None:
    if not isinstance(value, str):
        raise ProtocolError(f"{label} is invalid")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProtocolError(f"{label} is invalid") from exc
    if parsed.tzinfo is None:
        raise ProtocolError(f"{label} must include a timezone")


def validate_previous_receipt(
    repository: Path,
    stage_commit: str,
    benchmark_root: str,
    benchmark_id: str,
    remote: str,
    prefix: str,
    previous_stage: str,
    commits: Mapping[str, str],
) -> None:
    relative = f"publication-receipts/{previous_stage}.json"
    receipt = git_json(repository, stage_commit, benchmark_root, relative)
    if receipt.get("schema_version") != SCHEMA_VERSION:
        raise ProtocolError(f"{relative} schema_version is invalid")
    expected_values = {
        "benchmark_id": benchmark_id,
        "stage": previous_stage,
        "commit_sha": commits[previous_stage],
        "tree_sha": tree_sha(repository, commits[previous_stage]),
        "ref": expected_ref(remote, prefix, previous_stage),
        "later_stage_refs_absent": list(STAGES[STAGES.index(previous_stage) + 1 :]),
        "verified_stage_count": STAGES.index(previous_stage) + 1,
        "commit_chain_sha256": json_sha256(
            [
                {"stage": stage, "commit_sha": commits[stage]}
                for stage in STAGES[: STAGES.index(previous_stage) + 1]
            ]
        ),
    }
    for field, value in expected_values.items():
        if receipt.get(field) != value:
            raise ProtocolError(f"{relative} mismatch: {field}")
    parse_receipt_timestamp(receipt.get("checked_at"))
    previous_index = STAGES.index(previous_stage) - 1
    if previous_index < 0:
        expected_previous_hash = None
    else:
        earlier = STAGES[previous_index]
        earlier_raw = git_file_bytes(
            repository,
            stage_commit,
            benchmark_root,
            f"publication-receipts/{earlier}.json",
        )
        expected_previous_hash = sha256_bytes(earlier_raw)
    if receipt.get("previous_receipt_sha256") != expected_previous_hash:
        raise ProtocolError(f"{relative} mismatch: previous_receipt_sha256")


def publication_receipt(
    repository: Path,
    benchmark_root: str,
    benchmark_id: str,
    remote: str,
    prefix: str,
    through: str,
    commits: Mapping[str, str],
) -> Dict[str, Any]:
    index = STAGES.index(through)
    previous_hash: Optional[str] = None
    if index > 0:
        prior = STAGES[index - 1]
        raw = git_file_bytes(
            repository,
            commits[through],
            benchmark_root,
            f"publication-receipts/{prior}.json",
        )
        previous_hash = sha256_bytes(raw)
    chain = [{"stage": stage, "commit_sha": commits[stage]} for stage in STAGES[: index + 1]]
    return {
        "schema_version": SCHEMA_VERSION,
        "benchmark_id": benchmark_id,
        "stage": through,
        "commit_sha": commits[through],
        "tree_sha": tree_sha(repository, commits[through]),
        "ref": expected_ref(remote, prefix, through),
        "checked_at": utc_now(),
        "later_stage_refs_absent": list(STAGES[index + 1 :]),
        "verified_stage_count": index + 1,
        "previous_receipt_sha256": previous_hash,
        "commit_chain_sha256": json_sha256(chain),
    }


def command_publication(args: argparse.Namespace) -> None:
    repository = Path(args.repository).expanduser().resolve(strict=True)
    if not (repository / ".git").exists():
        raise ProtocolError(f"repository is not a Git worktree: {repository}")
    benchmark_root = validate_benchmark_root(args.benchmark_root)
    prefix = validate_ref_prefix(args.ref_prefix)
    if not re.fullmatch(r"[A-Za-z0-9._-]+", args.remote):
        raise ProtocolError("--remote must name a configured Git remote")
    if not IDENTIFIER.fullmatch(args.benchmark_id):
        raise ProtocolError("--benchmark-id is invalid")
    through_index = STAGES.index(args.through)
    remote_refs = live_remote_refs(repository, args.remote, prefix)
    commits: Dict[str, str] = {}
    for stage in STAGES[: through_index + 1]:
        ref = expected_ref(args.remote, prefix, stage)
        commit = resolve_ref(repository, ref)
        if commit is None:
            raise ProtocolError(f"published stage ref is missing: {ref}")
        remote_ref = expected_remote_ref(prefix, stage)
        if remote_refs.get(remote_ref) != commit:
            raise ProtocolError(
                f"live remote ref does not match the fetched stage: {remote_ref}"
            )
        commits[stage] = commit
    for stage in STAGES[through_index + 1 :]:
        ref = expected_ref(args.remote, prefix, stage)
        remote_ref = expected_remote_ref(prefix, stage)
        if resolve_ref(repository, ref) is not None or remote_ref in remote_refs:
            raise ProtocolError(f"future stage ref already exists: {remote_ref}")
    if len(set(commits.values())) != len(commits):
        raise ProtocolError("publication stages must use distinct commits")
    for previous, current in zip(STAGES, STAGES[1:]):
        if current not in commits:
            break
        ancestry = run_git(
            repository,
            ("rev-list", "--parents", "-n", "1", commits[current]),
        ).stdout.split()
        if len(ancestry) != 2 or ancestry[1] != commits[previous]:
            raise ProtocolError(f"{current} commit must be a direct child of {previous}")
        validate_stage_delta(
            repository,
            commits[previous],
            commits[current],
            benchmark_root,
            current,
        )
    for stage in STAGES[: through_index + 1]:
        validate_stage_layout(repository, commits[stage], benchmark_root, stage)
        if stage == "sealed":
            validate_sealed_commit(repository, commits[stage], benchmark_root)
        if stage == "reveal":
            validate_reveal_commit(repository, commits[stage], benchmark_root)
        stage_index = STAGES.index(stage)
        if stage_index > 0:
            validate_previous_receipt(
                repository,
                commits[stage],
                benchmark_root,
                args.benchmark_id,
                args.remote,
                prefix,
                STAGES[stage_index - 1],
                commits,
            )
    receipt = publication_receipt(
        repository,
        benchmark_root,
        args.benchmark_id,
        args.remote,
        prefix,
        args.through,
        commits,
    )
    if args.output:
        atomic_write_json(Path(args.output).expanduser().resolve(), receipt)
    print(json.dumps(receipt, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Check private invariant coverage before sealing and ordered public stages after push."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    preseal = commands.add_parser("preseal", help="validate invariant-to-unit coverage before sealing")
    preseal.add_argument("--root", required=True)
    preseal.add_argument("--invariants", required=True)
    preseal.add_argument("--units", required=True)
    preseal.add_argument("--matrix", required=True)
    preseal.add_argument("--output", required=True)
    preseal.set_defaults(function=command_preseal)

    publication = commands.add_parser(
        "publication", help="verify ordered remote stage refs and emit the next receipt"
    )
    publication.add_argument("--repository", required=True)
    publication.add_argument("--benchmark-root", required=True)
    publication.add_argument("--benchmark-id", required=True)
    publication.add_argument("--remote", default="origin")
    publication.add_argument("--ref-prefix", required=True)
    publication.add_argument("--through", choices=STAGES, required=True)
    publication.add_argument("--output")
    publication.set_defaults(function=command_publication)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.function(args)
    except ProtocolError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except BrokenPipeError:
        try:
            sys.stdout.close()
        except BrokenPipeError:
            pass
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
