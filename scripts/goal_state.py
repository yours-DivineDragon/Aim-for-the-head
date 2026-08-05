#!/usr/bin/env python3
"""Portable state machine for evidence-driven security goals."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import sys
import tempfile
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Mapping, Optional, Sequence, Set, Tuple

try:
    import fcntl
except ImportError:  # pragma: no cover - exercised only on non-POSIX hosts
    fcntl = None  # type: ignore[assignment]

try:
    import msvcrt
except ImportError:  # pragma: no cover - exercised only on non-Windows hosts
    msvcrt = None  # type: ignore[assignment]


SCHEMA_VERSION = 1
WORKFLOW_VERSION = 2
EVIDENCE_ATTESTATION_VERSION = 1
EVIDENCE_LOCATIONS_FILE = "evidence-locations.jsonl"
LOCK_FILE = ".goal-state.lock"
EXPERIMENT_EVENT_KINDS = frozenset(("experiment", "tool-failure"))
MODES = ("discovery", "variant", "invariant", "differential", "validation")
LIFECYCLE_STATES = ("draft", "active", "paused", "blocked", "completed")
TERMINAL_OUTCOMES = ("validated", "exhausted", "budget-limited", "blocked")
CANDIDATE_STATES = ("lead", "rejected", "validated")
EVENT_KINDS = (
    "mapping",
    "hypothesis",
    "experiment",
    "observation",
    "rejection",
    "pivot",
    "tool-failure",
    "review",
    "note",
    "transition",
    "terminal",
)
CLASSIFICATIONS = (
    "supports",
    "contradicts",
    "negative",
    "inconclusive",
    "tool-failure",
)
LEGACY_COVERAGE_DIMENSIONS = (
    "source-read",
    "attack-surface",
    "trust-boundary",
    "state-invariant",
    "runtime-corpus",
    "config-build",
    "historical-family",
    "falsification",
)
DEEP_HUNT_DIMENSIONS = (
    "business-invariant",
    "consumer-propagation",
    "boundary-arithmetic",
    "external-semantics",
    "sequence-interleaving",
    "exploit-composition",
    "economic-closure",
)
COVERAGE_DIMENSIONS = LEGACY_COVERAGE_DIMENSIONS + DEEP_HUNT_DIMENSIONS
COVERAGE_STATES = ("uninspected", "inspected", "tested", "blocked")
LEGACY_EVIDENCE_GATES = (
    "attacker-control",
    "reachability",
    "defense-analysis",
    "security-impact",
    "realistic-configuration",
    "safe-reproduction",
    "release-reproduction",
    "negative-control",
    "independent-reproduction",
    "duplicate-check",
    "human-review",
)
DEEP_REVIEW_GATES = ("downstream-impact", "composition-review")
EVIDENCE_GATES = LEGACY_EVIDENCE_GATES + DEEP_REVIEW_GATES
LEGACY_CORE_GATES = frozenset(
    (
        "attacker-control",
        "reachability",
        "defense-analysis",
        "security-impact",
        "realistic-configuration",
        "safe-reproduction",
        "release-reproduction",
        "independent-reproduction",
    )
)
CORE_GATES = LEGACY_CORE_GATES | frozenset(DEEP_REVIEW_GATES)
ALLOWED_WAIVABLE_GATES = frozenset(("negative-control", "duplicate-check"))
ALLOWED_OMITTED_GATES = frozenset(("duplicate-check", "human-review"))
ALWAYS_REQUIRED_GATES = CORE_GATES | frozenset(("negative-control",))
LEGACY_ALWAYS_REQUIRED_GATES = LEGACY_CORE_GATES | frozenset(("negative-control",))
DEFAULT_MANDATORY_PASSES = {
    "business-invariant": [
        "business-flow-and-state-machine-model",
        "asset-liability-conservation-ledger",
    ],
    "consumer-propagation": ["mutable-value-to-downstream-consumer-map"],
    "boundary-arithmetic": ["rounding-unit-and-zero-boundaries"],
    "external-semantics": ["interface-promise-versus-runtime-delta-matrix"],
    "sequence-interleaving": ["callback-and-action-sequence-matrix"],
    "exploit-composition": ["primitive-join-graph"],
    "economic-closure": ["funding-repayment-profit-and-system-loss-ledger"],
}
PLACEHOLDER = "[REPLACE]"
REQUIRED_FILES = (
    "contract.json",
    "state.json",
    "events.jsonl",
    "candidates.jsonl",
    "coverage.json",
    "THREAT_MODEL.md",
    "GOAL.md",
)
GOAL_HEADINGS = (
    "# Goal",
    "## Outcome",
    "## Mode",
    "## Target and scope",
    "## Threat model",
    "## Acceptance evidence",
    "## Non-success",
    "## Budget and stop",
    "## Deliverables",
)
THREAT_MODEL_HEADINGS = (
    "# Threat model",
    "## Target",
    "## Assets and security properties",
    "## Adversary",
    "## Trust boundaries and effects",
    "## Security invariants",
    "## Operating assumptions",
)


class GoalStateError(Exception):
    """A user-correctable state or command error."""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def atomic_write_json(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=str(path.parent))
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
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


def append_jsonl(path: Path, value: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    line = json.dumps(value, sort_keys=True, separators=(",", ":"))
    with path.open("a", encoding="utf-8") as stream:
        stream.write(line + "\n")
        stream.flush()
        os.fsync(stream.fileno())


def load_json(path: Path) -> Dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as stream:
            value = json.load(stream)
    except FileNotFoundError as exc:
        raise GoalStateError(f"missing required file: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GoalStateError(f"invalid JSON in {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise GoalStateError(f"expected a JSON object in {path}")
    return value


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise GoalStateError(f"missing required file: {path}") from exc
    records: List[Dict[str, Any]] = []
    for number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise GoalStateError(f"invalid JSON in {path} line {number}: {exc}") from exc
        if not isinstance(value, dict):
            raise GoalStateError(f"expected an object in {path} line {number}")
        records.append(value)
    return records


def state_dir(raw_path: str, require_initialized: bool = True) -> Path:
    root = Path(raw_path).expanduser().resolve()
    if require_initialized:
        if not root.is_dir():
            raise GoalStateError(f"state directory does not exist: {root}")
        missing = [name for name in REQUIRED_FILES if not (root / name).is_file()]
        if missing:
            raise GoalStateError("state directory is incomplete; missing: " + ", ".join(missing))
    return root


@contextmanager
def state_lock(raw_path: str, *, initialize: bool, exclusive: bool) -> Iterator[None]:
    """Serialize one complete helper command against a state directory."""
    root = Path(raw_path).expanduser().resolve()
    if initialize:
        root.parent.mkdir(parents=True, exist_ok=True)
        lock_path = root.parent / f".{root.name}.goal-state.lock"
    else:
        if not root.is_dir():
            raise GoalStateError(f"state directory does not exist: {root}")
        lock_path = root / LOCK_FILE
    flags = (
        os.O_RDWR
        | os.O_CREAT
        | getattr(os, "O_BINARY", 0)
        | getattr(os, "O_NOFOLLOW", 0)
    )
    try:
        descriptor = os.open(lock_path, flags, 0o600)
    except OSError as exc:
        raise GoalStateError(f"cannot open state lock {lock_path}: {exc.strerror}") from exc
    with os.fdopen(descriptor, "r+b") as stream:
        if fcntl is not None:
            operation = fcntl.LOCK_EX if exclusive else fcntl.LOCK_SH
            fcntl.flock(stream.fileno(), operation)
            try:
                yield
            finally:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)
            return
        if msvcrt is not None:  # pragma: no cover - Windows fallback
            stream.seek(0, os.SEEK_END)
            if stream.tell() == 0:
                stream.write(b"\0")
                stream.flush()
            stream.seek(0)
            msvcrt.locking(stream.fileno(), msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            return
        raise GoalStateError("this platform does not provide advisory file locking")


def contains_placeholder(value: Any) -> bool:
    if isinstance(value, str):
        return PLACEHOLDER in value
    if isinstance(value, list):
        return any(contains_placeholder(item) for item in value)
    if isinstance(value, dict):
        return any(contains_placeholder(item) for item in value.values())
    return False


def nonempty_strings(value: Any) -> bool:
    return (
        isinstance(value, list)
        and bool(value)
        and all(isinstance(item, str) and bool(item.strip()) for item in value)
    )


def nested(data: Mapping[str, Any], *keys: str) -> Any:
    value: Any = data
    for key in keys:
        if not isinstance(value, dict) or key not in value:
            return None
        value = value[key]
    return value


def workflow_version(contract: Mapping[str, Any]) -> int:
    value = contract.get("workflow_version", 1)
    return value if isinstance(value, int) and not isinstance(value, bool) else -1


def gates_for_contract(contract: Mapping[str, Any]) -> Tuple[str, ...]:
    if workflow_version(contract) >= WORKFLOW_VERSION:
        return EVIDENCE_GATES
    return LEGACY_EVIDENCE_GATES


def required_gates_for_contract(contract: Mapping[str, Any]) -> frozenset[str]:
    if workflow_version(contract) >= WORKFLOW_VERSION:
        return ALWAYS_REQUIRED_GATES
    return LEGACY_ALWAYS_REQUIRED_GATES


def coverage_dimensions_for_contract(contract: Mapping[str, Any]) -> Tuple[str, ...]:
    if workflow_version(contract) >= WORKFLOW_VERSION:
        return COVERAGE_DIMENSIONS
    return LEGACY_COVERAGE_DIMENSIONS


def mandatory_passes(contract: Mapping[str, Any]) -> Dict[str, List[str]]:
    value = nested(contract, "search_requirements", "mandatory_passes")
    if not isinstance(value, dict):
        return {}
    result: Dict[str, List[str]] = {}
    for dimension, items in value.items():
        if isinstance(dimension, str) and nonempty_strings(items):
            result[dimension] = list(items)
    return result


def sharing_groups(
    contract: Mapping[str, Any], *, kind: str
) -> List[Set[str]]:
    if kind == "gate":
        raw = nested(
            contract,
            "evidence_requirements",
            "allowed_gate_evidence_sharing",
        )
        member_field = "gates"
    else:
        raw = nested(
            contract,
            "search_requirements",
            "allowed_pass_evidence_sharing",
        )
        member_field = "passes"
    if not isinstance(raw, list):
        return []
    groups: List[Set[str]] = []
    for item in raw:
        if isinstance(item, dict) and nonempty_strings(item.get(member_field)):
            groups.append(set(item[member_field]))
    return groups


def sharing_policy_errors(
    raw: Any,
    *,
    label: str,
    member_field: str,
    allowed: Set[str],
) -> List[str]:
    if raw is None:
        return []
    if not isinstance(raw, list):
        return [f"{label} must be a list"]
    errors: List[str] = []
    seen: Set[Tuple[str, ...]] = set()
    for index, item in enumerate(raw, start=1):
        item_label = f"{label} entry {index}"
        if not isinstance(item, dict):
            errors.append(f"{item_label} must be an object")
            continue
        members = item.get(member_field)
        if not nonempty_strings(members) or len(members) < 2:
            errors.append(f"{item_label}.{member_field} must contain at least two names")
            continue
        if len(members) != len(set(members)):
            errors.append(f"{item_label}.{member_field} must not contain duplicates")
        unknown = sorted(set(members) - allowed)
        if unknown:
            errors.append(f"{item_label} has unknown names: " + ", ".join(unknown))
        reason = item.get("reason")
        if not isinstance(reason, str) or not reason.strip():
            errors.append(f"{item_label}.reason must be non-empty")
        identity = tuple(sorted(set(members)))
        if identity in seen:
            errors.append(f"{item_label} duplicates an earlier sharing group")
        seen.add(identity)
    return errors


def parse_utc_timestamp(value: Any, label: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise GoalStateError(f"{label} must be an ISO-8601 timestamp")
    normalized = value.strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise GoalStateError(f"{label} must be an ISO-8601 timestamp") from exc
    if parsed.tzinfo is None:
        raise GoalStateError(f"{label} must include a timezone")
    return parsed.astimezone(timezone.utc)


def contract_errors(contract: Mapping[str, Any]) -> List[str]:
    errors: List[str] = []
    if contract.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"contract.schema_version must be {SCHEMA_VERSION}")
    version = workflow_version(contract)
    if version not in (1, WORKFLOW_VERSION):
        errors.append(f"contract.workflow_version must be 1 or {WORKFLOW_VERSION}")
    if contract.get("mode") not in MODES:
        errors.append("contract.mode is invalid")
    if not isinstance(contract.get("objective"), str) or not contract["objective"].strip():
        errors.append("contract.objective must be non-empty")
    if nested(contract, "authorization", "confirmed") is not True:
        errors.append("authorization.confirmed must be true")
    authorization_basis = nested(contract, "authorization", "basis")
    if not isinstance(authorization_basis, str) or not authorization_basis.strip():
        errors.append("authorization.basis must be a non-empty string")
    target_path = nested(contract, "target", "path")
    revision = nested(contract, "target", "revision")
    if not isinstance(target_path, str) or not target_path.strip():
        errors.append("target.path must be non-empty")
    if not isinstance(revision, str) or not revision.strip():
        errors.append("target.revision must be non-empty")
    if not nonempty_strings(nested(contract, "target", "include")):
        errors.append("target.include must contain at least one item")
    excludes = nested(contract, "target", "exclude")
    if not isinstance(excludes, list) or not all(isinstance(item, str) for item in excludes):
        errors.append("target.exclude must be a list of strings")
    for field in ("success_conditions", "non_success_conditions"):
        if not nonempty_strings(contract.get(field)):
            errors.append(f"{field} must contain at least one item")
    for field in (
        "attacker_capabilities",
        "attacker_non_capabilities",
        "assets",
        "trust_boundaries",
        "security_invariants",
        "required_impact",
        "realistic_configurations",
    ):
        if not nonempty_strings(nested(contract, "threat_model", field)):
            errors.append(f"threat_model.{field} must contain at least one item")
    if version >= WORKFLOW_VERSION:
        for field in (
            "business_flows",
            "accounting_invariants",
            "external_semantic_assumptions",
            "attacker_funding_sources",
        ):
            if not nonempty_strings(nested(contract, "threat_model", field)):
                errors.append(f"threat_model.{field} must contain at least one item")
    required_gates = nested(contract, "evidence_requirements", "required_gates")
    if not nonempty_strings(required_gates):
        errors.append("evidence_requirements.required_gates must be non-empty")
        required_gates = []
    available_gates = set(gates_for_contract(contract))
    unknown_gates = sorted(set(required_gates) - available_gates)
    if unknown_gates:
        errors.append("unknown required gates: " + ", ".join(unknown_gates))
    if len(required_gates) != len(set(required_gates)):
        errors.append("required_gates must not contain duplicates")
    missing_always_required = sorted(required_gates_for_contract(contract) - set(required_gates))
    if missing_always_required:
        errors.append(
            "required_gates omits non-optional gates: " + ", ".join(missing_always_required)
        )
    waivable = nested(contract, "evidence_requirements", "waivable_gates")
    if not isinstance(waivable, list) or not all(isinstance(item, str) for item in waivable):
        errors.append("evidence_requirements.waivable_gates must be a list of strings")
        waivable = []
    if len(waivable) != len(set(waivable)):
        errors.append("waivable_gates must not contain duplicates")
    invalid_waivers = sorted(set(waivable) - ALLOWED_WAIVABLE_GATES)
    if invalid_waivers:
        errors.append("gates may not be waived: " + ", ".join(invalid_waivers))
    if not set(waivable).issubset(set(required_gates)):
        errors.append("waivable_gates must be a subset of required_gates")
    omitted = nested(contract, "evidence_requirements", "omitted_gates")
    if not isinstance(omitted, dict) or not all(
        isinstance(key, str) and isinstance(value, str) and bool(value.strip())
        for key, value in (omitted.items() if isinstance(omitted, dict) else [])
    ):
        errors.append("evidence_requirements.omitted_gates must map gate names to reasons")
        omitted = {}
    invalid_omissions = sorted(set(omitted) - ALLOWED_OMITTED_GATES)
    if invalid_omissions:
        errors.append("gates may not be omitted: " + ", ".join(invalid_omissions))
    overlap = sorted(set(required_gates) & set(omitted))
    if overlap:
        errors.append("gates cannot be both required and omitted: " + ", ".join(overlap))
    unaccounted = sorted(available_gates - set(required_gates) - set(omitted))
    if unaccounted:
        errors.append("gates require an explicit requirement or omission: " + ", ".join(unaccounted))
    waiver_policy = nested(contract, "evidence_requirements", "waiver_policy")
    if not isinstance(waiver_policy, str) or not waiver_policy.strip():
        errors.append("evidence_requirements.waiver_policy must be non-empty")
    errors.extend(
        sharing_policy_errors(
            nested(
                contract,
                "evidence_requirements",
                "allowed_gate_evidence_sharing",
            ),
            label="evidence_requirements.allowed_gate_evidence_sharing",
            member_field="gates",
            allowed=available_gates,
        )
    )
    novelty = contract.get("novelty_policy")
    if not isinstance(novelty, str) or not novelty.strip():
        errors.append("novelty_policy must be non-empty")
    if version >= WORKFLOW_VERSION:
        search = contract.get("search_requirements")
        if not isinstance(search, dict):
            errors.append("search_requirements must be an object")
        else:
            raw_passes = search.get("mandatory_passes")
            if not isinstance(raw_passes, dict) or not raw_passes:
                errors.append("search_requirements.mandatory_passes must be a non-empty object")
                raw_passes = {}
            invalid_passes = sorted(set(raw_passes) - set(DEEP_HUNT_DIMENSIONS))
            if invalid_passes:
                errors.append("unknown mandatory passes: " + ", ".join(invalid_passes))
            missing_passes = sorted(set(DEEP_HUNT_DIMENSIONS) - set(raw_passes))
            if missing_passes:
                errors.append("mandatory passes omitted: " + ", ".join(missing_passes))
            for dimension, items in raw_passes.items():
                if dimension in DEEP_HUNT_DIMENSIONS and not nonempty_strings(items):
                    errors.append(
                        f"search_requirements.mandatory_passes.{dimension} must contain items"
                    )
                elif (
                    isinstance(items, list)
                    and all(isinstance(item, str) for item in items)
                    and len(items) != len(set(items))
                ):
                    errors.append(
                        f"search_requirements.mandatory_passes.{dimension} has duplicates"
                    )
            for field in ("primitive_escalation_policy", "impact_priority_policy"):
                value = search.get(field)
                if not isinstance(value, str) or not value.strip():
                    errors.append(f"search_requirements.{field} must be non-empty")
            pass_names = {
                f"{dimension}/{item}"
                for dimension, items in raw_passes.items()
                if isinstance(dimension, str) and isinstance(items, list)
                for item in items
                if isinstance(item, str)
            }
            errors.extend(
                sharing_policy_errors(
                    search.get("allowed_pass_evidence_sharing"),
                    label="search_requirements.allowed_pass_evidence_sharing",
                    member_field="passes",
                    allowed=pass_names,
                )
            )
    budget = contract.get("budget")
    if not isinstance(budget, dict):
        errors.append("budget must be an object")
    else:
        bounds = (budget.get("deadline"), budget.get("max_experiments"), budget.get("max_hours"))
        if not any(value not in (None, "") for value in bounds):
            errors.append("budget must define deadline, max_experiments, or max_hours")
        experiments = budget.get("max_experiments")
        if experiments is not None and (
            isinstance(experiments, bool)
            or not isinstance(experiments, int)
            or experiments <= 0
        ):
            errors.append("budget.max_experiments must be a positive integer or null")
        hours = budget.get("max_hours")
        if hours is not None and (
            isinstance(hours, bool) or not isinstance(hours, (int, float)) or hours <= 0
        ):
            errors.append("budget.max_hours must be positive or null")
        deadline = budget.get("deadline")
        if deadline not in (None, ""):
            try:
                parse_utc_timestamp(deadline, "budget.deadline")
            except GoalStateError as exc:
                errors.append(str(exc))
    count = nested(contract, "stop", "finding_count")
    if not isinstance(count, int) or isinstance(count, bool) or count < 1:
        errors.append("stop.finding_count must be a positive integer")
    if not nonempty_strings(nested(contract, "stop", "exhaustion_obligations")):
        errors.append("stop.exhaustion_obligations must contain at least one item")
    blocked_rule = nested(contract, "stop", "blocked_rule")
    if not isinstance(blocked_rule, str) or not blocked_rule.strip():
        errors.append("stop.blocked_rule must be non-empty")
    for field in ("state_dir", "evidence_dir", "report"):
        value = nested(contract, "outputs", field)
        if not isinstance(value, str) or not value.strip():
            errors.append(f"outputs.{field} must be non-empty")
    roots = nested(contract, "outputs", "evidence_roots")
    if roots is not None and not nonempty_strings(roots):
        errors.append("outputs.evidence_roots must contain non-empty paths when declared")
    elif isinstance(roots, list):
        escaping = [
            value
            for value in roots
            if not Path(value).is_absolute() and ".." in Path(value).parts
        ]
        if escaping:
            errors.append(
                "relative outputs.evidence_roots may not escape the state parent: "
                + ", ".join(escaping)
            )
    if contains_placeholder(contract):
        errors.append(f"contract still contains {PLACEHOLDER} placeholders")
    return errors


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def evidence_path(root: Path, raw_path: str) -> Path:
    """Resolve an evidence reference against the directory containing state."""
    candidate = Path(raw_path).expanduser()
    if not candidate.is_absolute():
        candidate = root.parent / candidate
    return Path(os.path.abspath(candidate))


def configured_evidence_roots(root: Path) -> List[Path]:
    """Return lexical roots frozen by the contract, defaulting to the state parent."""
    contract = load_json(root / "contract.json")
    declared = nested(contract, "outputs", "evidence_roots")
    values = declared if nonempty_strings(declared) else ["."]
    roots: List[Path] = []
    for raw in values:
        candidate = Path(raw).expanduser()
        if not candidate.is_absolute():
            candidate = root.parent / candidate
        roots.append(Path(os.path.abspath(candidate)))
    return roots


def path_is_within(path: Path, parent: Path) -> bool:
    try:
        return os.path.commonpath((str(path), str(parent))) == str(parent)
    except ValueError:
        return False


def evidence_root_for_path(root: Path, path: Path) -> Path:
    """Choose the narrowest declared root and reject symlink escapes."""
    eligible = [item for item in configured_evidence_roots(root) if path_is_within(path, item)]
    if not eligible:
        raise GoalStateError(
            "evidence artifact is outside the contract's allowed evidence roots: " + str(path)
        )
    allowed = max(eligible, key=lambda item: len(item.parts))
    if allowed.is_symlink():
        raise GoalStateError(f"declared evidence root may not be a symlink: {allowed}")
    try:
        resolved_allowed = allowed.resolve(strict=True)
    except FileNotFoundError as exc:
        raise GoalStateError(f"declared evidence root does not exist: {allowed}") from exc
    if not resolved_allowed.is_dir():
        raise GoalStateError(f"declared evidence root is not a directory: {allowed}")
    resolved_path = Path(os.path.realpath(path))
    if not path_is_within(resolved_path, resolved_allowed):
        raise GoalStateError(
            f"evidence artifact escapes its declared root through a symlink: {path}"
        )
    return allowed


def open_evidence_descriptor(path: Path, allowed_root: Path, raw_path: str) -> int:
    """Open an evidence file after rejecting every symlinked path component."""
    relative = path.relative_to(allowed_root)
    current = allowed_root
    for part in relative.parts:
        current = current / part
        try:
            metadata = os.lstat(current)
        except FileNotFoundError as exc:
            raise GoalStateError(f"evidence artifact does not exist: {raw_path}") from exc
        if stat.S_ISLNK(metadata.st_mode):
            raise GoalStateError(
                f"evidence artifact path contains a symlink component: {raw_path}"
            )
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0)
    try:
        return os.open(path, flags)
    except FileNotFoundError as exc:
        raise GoalStateError(f"evidence artifact does not exist: {raw_path}") from exc
    except OSError as exc:
        raise GoalStateError(f"cannot open evidence artifact {raw_path!r}: {exc.strerror}") from exc


def evidence_attestation(root: Path, raw_path: str) -> Dict[str, Any]:
    """Contain, open, stat, and hash one non-empty regular evidence file."""
    if not isinstance(raw_path, str) or not raw_path.strip():
        raise GoalStateError("evidence paths must be non-empty strings")
    path = evidence_path(root, raw_path)
    allowed_root = evidence_root_for_path(root, path)
    descriptor = open_evidence_descriptor(path, allowed_root, raw_path)
    try:
        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise GoalStateError(f"evidence artifact is not a regular file: {raw_path}")
        if before.st_size < 1:
            raise GoalStateError(f"evidence artifact is empty: {raw_path}")
        digest = hashlib.sha256()
        while True:
            chunk = os.read(descriptor, 65536)
            if not chunk:
                break
            digest.update(chunk)
        after = os.fstat(descriptor)
        identity_before = (
            before.st_dev,
            before.st_ino,
            before.st_size,
            before.st_mtime_ns,
        )
        identity_after = (
            after.st_dev,
            after.st_ino,
            after.st_size,
            after.st_mtime_ns,
        )
        if identity_before != identity_after:
            raise GoalStateError(f"evidence artifact changed while hashing: {raw_path}")
    finally:
        os.close(descriptor)
    try:
        location = str(path.relative_to(root.parent))
        base = "state-parent"
    except ValueError:
        location = str(path)
        base = "absolute"
    return {
        "version": EVIDENCE_ATTESTATION_VERSION,
        "path": raw_path,
        "base": base,
        "location": location,
        "sha256": digest.hexdigest(),
        "size": after.st_size,
        "mode": f"{stat.S_IMODE(after.st_mode):04o}",
        "mtime_ns": after.st_mtime_ns,
    }


def evidence_attestations(root: Path, paths: Sequence[str]) -> List[Dict[str, Any]]:
    return [evidence_attestation(root, path) for path in paths]


def load_evidence_locations(root: Path) -> List[Dict[str, Any]]:
    path = root / EVIDENCE_LOCATIONS_FILE
    return load_jsonl(path) if path.exists() else []


def evidence_identity(attestation: Mapping[str, Any]) -> Tuple[Any, Any]:
    return attestation.get("sha256"), attestation.get("size")


def relocation_index(root: Path) -> Dict[Tuple[Any, Any], Mapping[str, Any]]:
    latest: Dict[Tuple[Any, Any], Mapping[str, Any]] = {}
    for record in load_evidence_locations(root):
        latest[(record.get("sha256"), record.get("size"))] = record
    return latest


def evidence_attestation_errors(
    root: Path,
    paths: Any,
    attestations: Any,
    label: str,
    relocations: Optional[Mapping[Tuple[Any, Any], Mapping[str, Any]]] = None,
) -> List[str]:
    """Re-stat and re-hash recorded evidence, returning durable integrity errors."""
    if not isinstance(paths, list) or not all(isinstance(item, str) for item in paths):
        return []
    if not paths:
        if attestations not in (None, []):
            return [f"{label} has attestations without evidence"]
        return []
    if not isinstance(attestations, list) or len(attestations) != len(paths):
        return [f"{label} lacks one attestation per evidence artifact"]
    errors: List[str] = []
    for index, (raw_path, recorded) in enumerate(zip(paths, attestations), start=1):
        item_label = f"{label} evidence {index} ({raw_path})"
        if not isinstance(recorded, dict):
            errors.append(f"{item_label} has an invalid attestation")
            continue
        location_map = relocations if relocations is not None else relocation_index(root)
        relocation = location_map.get(evidence_identity(recorded))
        current_path = relocation.get("to_path") if isinstance(relocation, dict) else raw_path
        if not isinstance(current_path, str) or not current_path.strip():
            errors.append(f"{item_label} has an invalid relocation path")
            continue
        try:
            current = evidence_attestation(root, current_path)
        except GoalStateError as exc:
            errors.append(f"{item_label}: {exc}")
            continue
        fields = ("version", "sha256", "size")
        if relocation is None:
            fields += ("path", "base", "location")
        for field in fields:
            if recorded.get(field) != current[field]:
                errors.append(f"{item_label} attestation mismatch: {field}")
    return errors


def gate_attestation_errors(
    root: Path,
    gates: Any,
    attestations: Any,
    label: str,
    relocations: Optional[Mapping[Tuple[Any, Any], Mapping[str, Any]]] = None,
) -> List[str]:
    if not isinstance(gates, dict):
        return []
    if not all(isinstance(path, str) and path.strip() for path in gates.values()):
        return []
    if not gates:
        if attestations not in (None, {}):
            return [f"{label} has gate attestations without gate evidence"]
        return []
    if not isinstance(attestations, dict) or set(attestations) != set(gates):
        return [f"{label} lacks one attestation per gate evidence artifact"]
    errors: List[str] = []
    for gate, raw_path in sorted(gates.items()):
        errors.extend(
            evidence_attestation_errors(
                root,
                [raw_path],
                [attestations.get(gate)],
                f"{label} gate {gate}",
                relocations,
            )
        )
    return errors


def evidence_location_errors(root: Path) -> List[str]:
    records = load_evidence_locations(root)
    errors = sequence_errors(records, "evidence location")
    if not records:
        return errors
    known_paths: Dict[Tuple[Any, Any], Set[Any]] = {}
    for attestation in recorded_evidence_attestations(root):
        known_paths.setdefault(evidence_identity(attestation), set()).add(attestation.get("path"))
    for position, record in enumerate(records, start=1):
        label = f"evidence location record {position}"
        if record.get("schema_version") != SCHEMA_VERSION:
            errors.append(f"{label} has an invalid schema_version")
        if not isinstance(record.get("sha256"), str) or len(record["sha256"]) != 64:
            errors.append(f"{label} has an invalid sha256")
        if not isinstance(record.get("size"), int) or record.get("size", 0) < 1:
            errors.append(f"{label} has an invalid size")
        for field in ("from_path", "to_path", "reason"):
            if not isinstance(record.get(field), str) or not record[field].strip():
                errors.append(f"{label}.{field} must be non-empty")
        target = record.get("to_attestation")
        if not isinstance(target, dict):
            errors.append(f"{label} lacks to_attestation")
        elif evidence_identity(target) != (record.get("sha256"), record.get("size")):
            errors.append(f"{label} target identity does not match its preserved identity")
        identity = (record.get("sha256"), record.get("size"))
        paths = known_paths.get(identity)
        if not paths:
            errors.append(f"{label} does not refer to a recorded evidence identity")
        elif record.get("from_path") not in paths:
            errors.append(f"{label}.from_path is not a current recorded location")
        else:
            paths.clear()
            paths.add(record.get("to_path"))
    return errors


def recorded_evidence_attestations(root: Path) -> List[Mapping[str, Any]]:
    result: List[Mapping[str, Any]] = []
    for record in load_jsonl(root / "events.jsonl"):
        values = record.get("evidence_attestations")
        if isinstance(values, list):
            result.extend(item for item in values if isinstance(item, dict))
    for record in load_jsonl(root / "candidates.jsonl"):
        values = record.get("evidence_attestations")
        if isinstance(values, list):
            result.extend(item for item in values if isinstance(item, dict))
        gates = record.get("gate_attestations")
        if isinstance(gates, dict):
            result.extend(item for item in gates.values() if isinstance(item, dict))
    coverage = load_json(root / "coverage.json")
    records = coverage.get("records")
    if isinstance(records, list):
        for record in records:
            values = record.get("evidence_attestations") if isinstance(record, dict) else None
            if isinstance(values, list):
                result.extend(item for item in values if isinstance(item, dict))
    state = load_json(root / "state.json")
    terminal = state.get("terminal")
    if isinstance(terminal, dict):
        values = terminal.get("evidence_attestations")
        if isinstance(values, list):
            result.extend(item for item in values if isinstance(item, dict))
    return result


def activation_fingerprint(root: Path) -> Dict[str, str]:
    return {
        "contract_sha256": file_sha256(root / "contract.json"),
        "goal_sha256": file_sha256(root / "GOAL.md"),
    }


def markdown_errors(path: Path, required_headings: Sequence[str]) -> List[str]:
    contents = path.read_text(encoding="utf-8")
    errors: List[str] = []
    if PLACEHOLDER in contents:
        errors.append(f"{path.name} still contains {PLACEHOLDER} placeholders")
    if len(contents.strip()) < 200:
        errors.append(f"{path.name} is too short to be a completed contract artifact")
    for heading in required_headings:
        if heading not in contents:
            errors.append(f"{path.name} is missing heading: {heading}")
    return errors


def activation_errors(root: Path) -> List[str]:
    contract = load_json(root / "contract.json")
    errors = integrity_errors(root) + contract_errors(contract)
    errors.extend(markdown_errors(root / "GOAL.md", GOAL_HEADINGS))
    errors.extend(markdown_errors(root / "THREAT_MODEL.md", THREAT_MODEL_HEADINGS))
    state = load_json(root / "state.json")
    prior = state.get("activation_fingerprint")
    if prior and prior != activation_fingerprint(root):
        errors.append("the activated contract or GOAL.md changed; start a new goal directory")
    return errors


def latest_candidates(records: Sequence[Mapping[str, Any]]) -> Dict[str, Mapping[str, Any]]:
    latest: Dict[str, Mapping[str, Any]] = {}
    for record in records:
        candidate_id = record.get("id")
        if isinstance(candidate_id, str):
            latest[candidate_id] = record
    return latest


def current_coverage(records: Sequence[Mapping[str, Any]]) -> Dict[Tuple[str, str], Mapping[str, Any]]:
    current: Dict[Tuple[str, str], Mapping[str, Any]] = {}
    for record in records:
        dimension = record.get("dimension")
        item = record.get("item")
        if isinstance(dimension, str) and isinstance(item, str):
            current[(dimension, item)] = record
    return current


def shared_digest_errors(
    evidence_by_name: Mapping[str, Set[str]],
    allowed_groups: Sequence[Set[str]],
    label: str,
) -> List[str]:
    owners: Dict[str, Set[str]] = {}
    for name, digests in evidence_by_name.items():
        for digest in digests:
            owners.setdefault(digest, set()).add(name)
    errors: List[str] = []
    for digest, names in sorted(owners.items()):
        if len(names) < 2:
            continue
        if any(names.issubset(group) for group in allowed_groups):
            continue
        errors.append(
            f"{label} reuse one artifact digest {digest}: " + ", ".join(sorted(names))
        )
    return errors


def mandatory_pass_errors(
    contract: Mapping[str, Any], records: Sequence[Mapping[str, Any]]
) -> List[str]:
    if workflow_version(contract) < WORKFLOW_VERSION:
        return []
    current = current_coverage(records)
    errors: List[str] = []
    evidence_by_pass: Dict[str, Set[str]] = {}
    for dimension, items in mandatory_passes(contract).items():
        for item in items:
            pass_name = f"{dimension}/{item}"
            record = current.get((dimension, item))
            if record is None:
                errors.append(f"mandatory hunt pass is unrecorded: {pass_name}")
                continue
            if record.get("status") != "tested":
                errors.append(
                    f"mandatory hunt pass is not tested: {pass_name} "
                    f"({record.get('status')})"
                )
            if not nonempty_strings(record.get("evidence")):
                errors.append(f"mandatory hunt pass lacks evidence: {pass_name}")
            attestations = record.get("evidence_attestations")
            if isinstance(attestations, list):
                evidence_by_pass[pass_name] = {
                    value.get("sha256")
                    for value in attestations
                    if isinstance(value, dict) and isinstance(value.get("sha256"), str)
                }
    errors.extend(
        shared_digest_errors(
            evidence_by_pass,
            sharing_groups(contract, kind="pass"),
            "mandatory hunt passes",
        )
    )
    return errors


def sequence_errors(records: Sequence[Mapping[str, Any]], label: str) -> List[str]:
    errors: List[str] = []
    for expected, record in enumerate(records, start=1):
        if record.get("schema_version") != SCHEMA_VERSION:
            errors.append(f"{label} record {expected} has an invalid schema_version")
        if record.get("sequence") != expected:
            errors.append(
                f"{label} record {expected} has sequence {record.get('sequence')!r}; expected {expected}"
            )
    return errors


def integrity_errors(root: Path, *, verify_evidence: bool = True) -> List[str]:
    errors: List[str] = []
    state = load_json(root / "state.json")
    events = load_jsonl(root / "events.jsonl")
    candidates = load_jsonl(root / "candidates.jsonl")
    coverage = load_json(root / "coverage.json")
    records = coverage.get("records")
    relocations = relocation_index(root)
    errors.extend(evidence_location_errors(root))
    if state.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"state.schema_version must be {SCHEMA_VERSION}")
    if state.get("status") not in LIFECYCLE_STATES:
        errors.append("state.status is invalid")
    if state.get("status") == "completed":
        if state.get("outcome") not in TERMINAL_OUTCOMES or not isinstance(
            state.get("terminal"), dict
        ):
            errors.append("completed state requires a valid outcome and terminal object")
    elif state.get("outcome") is not None or state.get("terminal") is not None:
        errors.append("non-completed state may not have an outcome or terminal object")
    if state.get("activation_fingerprint") is not None and not isinstance(
        state.get("activation_fingerprint"), dict
    ):
        errors.append("state.activation_fingerprint must be null or an object")
    elif state.get("activation_fingerprint") is not None:
        try:
            if state.get("activation_fingerprint") != activation_fingerprint(root):
                errors.append(
                    "the activated contract or GOAL.md changed; start a new goal directory"
                )
        except FileNotFoundError:
            pass
    activated_at = state.get("activated_at")
    if activated_at is not None:
        try:
            parse_utc_timestamp(activated_at, "state.activated_at")
        except GoalStateError as exc:
            errors.append(str(exc))
    errors.extend(sequence_errors(events, "event"))
    errors.extend(sequence_errors(candidates, "candidate"))
    if coverage.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"coverage.schema_version must be {SCHEMA_VERSION}")
    if not isinstance(records, list):
        errors.append("coverage.records must be a list")
        records = []
    errors.extend(sequence_errors(records, "coverage"))
    counters = (
        ("event_count", len(events)),
        ("candidate_revision_count", len(candidates)),
        ("coverage_revision_count", len(records)),
    )
    for field, expected in counters:
        if state.get(field) != expected:
            errors.append(f"state.{field} is {state.get(field)!r}; expected {expected}")
    revisions: Dict[str, int] = {}
    for position, record in enumerate(candidates, start=1):
        candidate_id = record.get("id")
        if not isinstance(candidate_id, str) or not candidate_id.strip():
            errors.append(f"candidate record {position} has an invalid id")
            continue
        expected_revision = revisions.get(candidate_id, 0) + 1
        if record.get("revision") != expected_revision:
            errors.append(
                f"candidate {candidate_id} revision is {record.get('revision')!r}; "
                f"expected {expected_revision}"
            )
        revisions[candidate_id] = expected_revision
        if record.get("status") not in CANDIDATE_STATES:
            errors.append(f"candidate {candidate_id} has an invalid status")
        if not nonempty_strings(record.get("evidence")):
            errors.append(f"candidate {candidate_id} revision {expected_revision} lacks evidence")
        if verify_evidence:
            errors.extend(
                evidence_attestation_errors(
                    root,
                    record.get("evidence"),
                    record.get("evidence_attestations"),
                    f"candidate {candidate_id} revision {expected_revision}",
                    relocations,
                )
            )
        gates = record.get("gates")
        waivers = record.get("waivers")
        if not isinstance(gates, dict) or not isinstance(waivers, dict):
            errors.append(f"candidate {candidate_id} has invalid gate metadata")
        else:
            invalid_gate_names = sorted((set(gates) | set(waivers)) - set(EVIDENCE_GATES))
            if invalid_gate_names:
                errors.append(
                    f"candidate {candidate_id} has unknown gates: " + ", ".join(invalid_gate_names)
                )
            if not all(isinstance(value, str) and value.strip() for value in gates.values()):
                errors.append(f"candidate {candidate_id} has empty gate evidence")
            if not all(isinstance(value, str) and value.strip() for value in waivers.values()):
                errors.append(f"candidate {candidate_id} has empty waiver reasons")
            if verify_evidence:
                errors.extend(
                    gate_attestation_errors(
                        root,
                        gates,
                        record.get("gate_attestations"),
                        f"candidate {candidate_id} revision {expected_revision}",
                        relocations,
                    )
                )
    for position, record in enumerate(events, start=1):
        if record.get("kind") not in EVENT_KINDS:
            errors.append(f"event record {position} has an invalid kind")
        if not isinstance(record.get("summary"), str) or not record["summary"].strip():
            errors.append(f"event record {position} has an empty summary")
        evidence = record.get("evidence")
        if not isinstance(evidence, list) or not all(isinstance(item, str) for item in evidence):
            errors.append(f"event record {position} has invalid evidence")
            evidence = []
        if record.get("kind") in (
            "experiment",
            "observation",
            "rejection",
            "tool-failure",
            "review",
        ) and not evidence:
            errors.append(f"event record {position} requires evidence")
        if record.get("kind") == "experiment" and record.get("classification") not in CLASSIFICATIONS:
            errors.append(f"experiment event {position} requires a classification")
        if record.get("kind") == "tool-failure" and record.get("classification") != "tool-failure":
            errors.append(f"tool-failure event {position} has the wrong classification")
        if verify_evidence:
            errors.extend(
                evidence_attestation_errors(
                    root,
                    evidence,
                    record.get("evidence_attestations"),
                    f"event record {position}",
                    relocations,
                )
            )
    for position, record in enumerate(records, start=1):
        if record.get("dimension") not in COVERAGE_DIMENSIONS:
            errors.append(f"coverage record {position} has an invalid dimension")
        if record.get("status") not in COVERAGE_STATES:
            errors.append(f"coverage record {position} has an invalid status")
        if not isinstance(record.get("item"), str) or not record["item"].strip():
            errors.append(f"coverage record {position} has an invalid item")
        evidence = record.get("evidence")
        if not isinstance(evidence, list) or not all(isinstance(item, str) for item in evidence):
            errors.append(f"coverage record {position} has invalid evidence")
            evidence = []
        if record.get("status") in ("inspected", "tested") and not evidence:
            errors.append(f"coverage record {position} requires evidence")
        if verify_evidence:
            errors.extend(
                evidence_attestation_errors(
                    root,
                    evidence,
                    record.get("evidence_attestations"),
                    f"coverage record {position}",
                    relocations,
                )
            )
    terminal = state.get("terminal")
    if verify_evidence and isinstance(terminal, dict):
        errors.extend(
            evidence_attestation_errors(
                root,
                terminal.get("evidence"),
                terminal.get("evidence_attestations"),
                "terminal record",
                relocations,
            )
        )
    return errors


def ensure_integrity(root: Path) -> None:
    errors = integrity_errors(root)
    if errors:
        raise GoalStateError("state integrity check failed: " + "; ".join(errors))


def parse_assignments(values: Sequence[str], label: str) -> Dict[str, str]:
    result: Dict[str, str] = {}
    for value in values:
        if "=" not in value:
            raise GoalStateError(f"{label} must use NAME=EVIDENCE_OR_REASON: {value!r}")
        name, detail = value.split("=", 1)
        name = name.strip()
        detail = detail.strip()
        if name not in EVIDENCE_GATES:
            raise GoalStateError(f"unknown evidence gate in {label}: {name}")
        if not detail:
            raise GoalStateError(f"{label} detail must not be empty for {name}")
        if name in result:
            raise GoalStateError(f"duplicate {label} entry for {name}")
        result[name] = detail
    return result


def validate_candidate_record(
    record: Mapping[str, Any], contract: Mapping[str, Any]
) -> List[str]:
    if record.get("status") != "validated":
        return ["candidate is not in validated state"]
    gates = record.get("gates") if isinstance(record.get("gates"), dict) else {}
    waivers = record.get("waivers") if isinstance(record.get("waivers"), dict) else {}
    required = set(nested(contract, "evidence_requirements", "required_gates") or [])
    allowed_waivers = set(nested(contract, "evidence_requirements", "waivable_gates") or [])
    errors: List[str] = []
    for gate in sorted(required):
        if gate in gates and isinstance(gates[gate], str) and gates[gate].strip():
            continue
        if (
            gate in allowed_waivers
            and gate in waivers
            and isinstance(waivers[gate], str)
            and waivers[gate].strip()
        ):
            continue
        errors.append(f"validated candidate is missing required gate: {gate}")
    unexpected_waivers = sorted(set(waivers) - allowed_waivers)
    if unexpected_waivers:
        errors.append("candidate uses unauthorized waivers: " + ", ".join(unexpected_waivers))
    attestations = record.get("gate_attestations")
    if isinstance(attestations, dict):
        evidence_by_gate = {
            gate: {value.get("sha256")}
            for gate, value in attestations.items()
            if isinstance(value, dict) and isinstance(value.get("sha256"), str)
        }
        errors.extend(
            shared_digest_errors(
                evidence_by_gate,
                sharing_groups(contract, kind="gate"),
                "validated candidate gates",
            )
        )
    return errors


def append_event(
    root: Path,
    state: Dict[str, Any],
    kind: str,
    summary: str,
    evidence: Sequence[str],
    hypothesis: Optional[str] = None,
    classification: Optional[str] = None,
    attestations: Optional[Sequence[Mapping[str, Any]]] = None,
) -> Dict[str, Any]:
    records = load_jsonl(root / "events.jsonl")
    if state.get("event_count") != len(records):
        raise GoalStateError("event counter does not match append-only history")
    sequence = len(records) + 1
    record: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "sequence": sequence,
        "timestamp": utc_now(),
        "kind": kind,
        "summary": summary,
        "evidence": list(evidence),
        "evidence_attestations": (
            [dict(item) for item in attestations]
            if attestations is not None
            else evidence_attestations(root, evidence)
        ),
    }
    if hypothesis:
        record["hypothesis"] = hypothesis
    if classification:
        record["classification"] = classification
    append_jsonl(root / "events.jsonl", record)
    state["event_count"] = sequence
    state["updated_at"] = record["timestamp"]
    return record


def budget_status(
    root: Path,
    state: Mapping[str, Any],
    contract: Mapping[str, Any],
    *,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    budget = contract.get("budget") if isinstance(contract.get("budget"), dict) else {}
    current = now or datetime.now(timezone.utc)
    events = load_jsonl(root / "events.jsonl")
    experiments = sum(1 for record in events if record.get("kind") in EXPERIMENT_EVENT_KINDS)
    maximum = budget.get("max_experiments")
    reached: List[str] = []
    if isinstance(maximum, (int, float)) and not isinstance(maximum, bool):
        if experiments >= maximum:
            reached.append("max_experiments")
    deadline = budget.get("deadline")
    if deadline not in (None, ""):
        try:
            if current >= parse_utc_timestamp(deadline, "budget.deadline"):
                reached.append("deadline")
        except GoalStateError:
            pass
    activated_at = state.get("activated_at")
    if activated_at is None and state.get("activation_fingerprint") is not None:
        for record in events:
            if record.get("kind") == "transition" and "-> active:" in str(
                record.get("summary", "")
            ):
                activated_at = record.get("timestamp")
                break
    elapsed_hours: Optional[float] = None
    if activated_at is not None:
        try:
            activated = parse_utc_timestamp(activated_at, "state.activated_at")
            elapsed_hours = max(0.0, (current - activated).total_seconds() / 3600)
        except GoalStateError:
            pass
    max_hours = budget.get("max_hours")
    if (
        isinstance(max_hours, (int, float))
        and not isinstance(max_hours, bool)
        and elapsed_hours is not None
        and elapsed_hours >= max_hours
    ):
        reached.append("max_hours")
    return {
        "experiments_used": experiments,
        "max_experiments": maximum,
        "activated_at": activated_at,
        "elapsed_hours": elapsed_hours,
        "max_hours": max_hours,
        "deadline": deadline,
        "reached": reached,
    }


def ensure_experiment_budget(root: Path, state: Mapping[str, Any]) -> None:
    contract = load_json(root / "contract.json")
    status = budget_status(root, state, contract)
    if status["reached"]:
        raise GoalStateError(
            "experiment budget is already reached: " + ", ".join(status["reached"])
        )


def initial_contract(target: str, mode: str, objective: str) -> Dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "workflow_version": WORKFLOW_VERSION,
        "created_at": utc_now(),
        "authorization": {"confirmed": False, "basis": PLACEHOLDER},
        "target": {
            "path": target,
            "revision": PLACEHOLDER,
            "include": [target],
            "exclude": [],
        },
        "mode": mode,
        "objective": objective,
        "success_conditions": [PLACEHOLDER],
        "non_success_conditions": [PLACEHOLDER],
        "threat_model": {
            "attacker_capabilities": [PLACEHOLDER],
            "attacker_non_capabilities": [PLACEHOLDER],
            "assets": [PLACEHOLDER],
            "trust_boundaries": [PLACEHOLDER],
            "security_invariants": [PLACEHOLDER],
            "required_impact": [PLACEHOLDER],
            "realistic_configurations": [PLACEHOLDER],
            "business_flows": [PLACEHOLDER],
            "accounting_invariants": [PLACEHOLDER],
            "external_semantic_assumptions": [PLACEHOLDER],
            "attacker_funding_sources": [PLACEHOLDER],
        },
        "evidence_requirements": {
            "required_gates": list(EVIDENCE_GATES),
            "waivable_gates": ["negative-control"],
            "omitted_gates": {},
            "allowed_gate_evidence_sharing": [],
            "waiver_policy": (
                "Authorize an inapplicable gate before activation and record equivalent evidence."
            ),
        },
        "novelty_policy": PLACEHOLDER,
        "search_requirements": {
            "mandatory_passes": DEFAULT_MANDATORY_PASSES,
            "allowed_pass_evidence_sharing": [],
            "primitive_escalation_policy": (
                "Trace every manipulable value through all direct consumers and test joins with "
                "other supported primitives before closing the primitive or its surface."
            ),
            "impact_priority_policy": (
                "When the objective prefers the highest-impact result, complete the mandatory "
                "composition and economic-closure passes before treating a lower-impact finding "
                "as terminal."
            ),
        },
        "budget": {"deadline": None, "max_experiments": 50, "max_hours": None},
        "stop": {
            "finding_count": 1,
            "exhaustion_obligations": [
                "Complete the prioritized surface queue",
                "Record all coverage dimensions",
                "Complete every mandatory deep-hunt pass",
                "Resolve every supported primitive-to-consumer and primitive-to-primitive join",
                "Report residual risks and untested surfaces",
            ],
            "blocked_rule": (
                "Name the exact missing input, permission, dependency, or environment and its unlock."
            ),
        },
        "outputs": {
            "state_dir": ".",
            "evidence_dir": "artifacts",
            "evidence_roots": ["."],
            "report": "RESULT.md",
        },
    }


def threat_model_template(target: str) -> str:
    return f"""# Threat model

## Target
- Repository and revision: {target} at {PLACEHOLDER}
- Included components: {PLACEHOLDER}
- Excluded components: {PLACEHOLDER}
- Release-like configurations: {PLACEHOLDER}

## Assets and security properties
- Assets: {PLACEHOLDER}
- Business flows and intended value movement: {PLACEHOLDER}
- Accounting identities and solvency/conservation properties: {PLACEHOLDER}
- Confidentiality properties: {PLACEHOLDER}
- Integrity properties: {PLACEHOLDER}
- Availability properties: {PLACEHOLDER}
- Authorization or isolation properties: {PLACEHOLDER}

## Adversary
- Attacker capabilities: {PLACEHOLDER}
- Attacker-controlled inputs: {PLACEHOLDER}
- Attacker starting position: {PLACEHOLDER}
- Explicit non-capabilities: {PLACEHOLDER}

## Trust boundaries and effects
- Trust boundaries: {PLACEHOLDER}
- Privilege transitions: {PLACEHOLDER}
- Dangerous sinks or effects: {PLACEHOLDER}
- External dependencies: {PLACEHOLDER}
- External semantic promises versus assumptions: {PLACEHOLDER}

## Security invariants
- Invariant: {PLACEHOLDER}
  - Why it matters: {PLACEHOLDER}
  - Expected enforcement points: {PLACEHOLDER}
  - Observable counterexample: {PLACEHOLDER}
- Downstream consumers of attacker-mutable values: {PLACEHOLDER}
- Candidate primitive joins and atomic funding sources: {PLACEHOLDER}

## Operating assumptions
- Deployment defaults: {PLACEHOLDER}
- Feature flags and optional components: {PLACEHOLDER}
- Required secrets, privileges, or user interaction: {PLACEHOLDER}
- Assumptions that still need verification: {PLACEHOLDER}
"""


def goal_template(target: str, mode: str, objective: str) -> str:
    return f"""# Goal

## Outcome
{objective}

## Mode
{mode}

## Target and scope
- Target: {target}
- Revision: {PLACEHOLDER}
- Included: {PLACEHOLDER}
- Excluded: {PLACEHOLDER}
- Proof-safety constraints: {PLACEHOLDER}

## Threat model
- Attacker capabilities: {PLACEHOLDER}
- Attacker non-capabilities: {PLACEHOLDER}
- Required asset or boundary crossed: {PLACEHOLDER}

## Acceptance evidence
- Required gates: see contract.json
- Mandatory deep-hunt passes: see contract.json
- Safe reproduction oracle: {PLACEHOLDER}
- Release-like configuration: {PLACEHOLDER}
- Negative control: {PLACEHOLDER}
- Independent reproduction: {PLACEHOLDER}
- Downstream impact and composition review: {PLACEHOLDER}

## Non-success
- {PLACEHOLDER}

## Budget and stop
- Finding count: 1
- Budget: {PLACEHOLDER}
- Exhaustion obligations: see contract.json
- Blocked rule: see contract.json

## Deliverables
- State: {PLACEHOLDER}
- Evidence: {PLACEHOLDER}
- Report: {PLACEHOLDER}
"""


def command_init(args: argparse.Namespace) -> None:
    root = state_dir(args.directory, require_initialized=False)
    if root.exists() and not root.is_dir():
        raise GoalStateError(f"state path exists and is not a directory: {root}")
    if root.exists() and any(root.iterdir()):
        raise GoalStateError(f"refusing to initialize non-empty directory: {root}")
    root.mkdir(parents=True, exist_ok=True)
    timestamp = utc_now()
    contract = initial_contract(args.target, args.mode, args.objective)
    state = {
        "schema_version": SCHEMA_VERSION,
        "created_at": timestamp,
        "updated_at": timestamp,
        "status": "draft",
        "outcome": None,
        "activation_fingerprint": None,
        "activated_at": None,
        "event_count": 0,
        "candidate_revision_count": 0,
        "coverage_revision_count": 0,
        "terminal": None,
    }
    coverage = {"schema_version": SCHEMA_VERSION, "updated_at": timestamp, "records": []}
    atomic_write_json(root / "contract.json", contract)
    atomic_write_json(root / "state.json", state)
    atomic_write_json(root / "coverage.json", coverage)
    (root / "events.jsonl").touch(exist_ok=False)
    (root / "candidates.jsonl").touch(exist_ok=False)
    (root / EVIDENCE_LOCATIONS_FILE).touch(exist_ok=False)
    (root / "THREAT_MODEL.md").write_text(threat_model_template(args.target), encoding="utf-8")
    (root / "GOAL.md").write_text(
        goal_template(args.target, args.mode, args.objective), encoding="utf-8"
    )
    print(json.dumps({"initialized": str(root), "status": "draft"}, indent=2))


def terminal_payload_errors(
    root: Path,
    state: Mapping[str, Any],
    contract: Mapping[str, Any],
    terminal: Mapping[str, Any],
) -> List[str]:
    errors: List[str] = []
    outcome = terminal.get("outcome")
    if outcome not in TERMINAL_OUTCOMES:
        return ["terminal.outcome is invalid"]
    reason = terminal.get("reason")
    if not isinstance(reason, str) or not reason.strip():
        errors.append("terminal.reason must be non-empty")
    if not nonempty_strings(terminal.get("evidence")):
        errors.append("terminal.evidence must contain at least one artifact")
    if state.get("activation_fingerprint") is None:
        errors.append("terminal outcome requires a previously activated contract")
    allowed_from_states = {
        "validated": {"active"},
        "exhausted": {"active"},
        "budget-limited": {"active", "paused"},
        "blocked": {"blocked"},
    }
    from_status = terminal.get("from_status")
    if from_status not in allowed_from_states[outcome]:
        expected = ", ".join(sorted(allowed_from_states[outcome]))
        errors.append(f"{outcome} may finish only from: {expected}")
    candidates = latest_candidates(load_jsonl(root / "candidates.jsonl"))
    coverage = load_json(root / "coverage.json")
    coverage_records = (
        coverage.get("records") if isinstance(coverage.get("records"), list) else []
    )
    validated_count = sum(
        1 for value in candidates.values() if value.get("status") == "validated"
    )
    required_count = nested(contract, "stop", "finding_count") or 1
    if outcome == "validated":
        candidate_id = terminal.get("candidate_id")
        if candidate_id not in candidates:
            errors.append("terminal validated candidate does not exist")
        else:
            errors.extend(validate_candidate_record(candidates[candidate_id], contract))
        if validated_count < required_count:
            errors.append(
                f"only {validated_count} candidates are validated; contract requires {required_count}"
            )
        errors.extend(mandatory_pass_errors(contract, coverage_records))
    else:
        if terminal.get("candidate_id") is not None:
            errors.append("non-validated outcome may not select a candidate_id")
        if validated_count >= required_count:
            errors.append(
                "the contract finding count is already validated; use the validated outcome"
            )
    if outcome in ("exhausted", "budget-limited"):
        if not nonempty_strings(terminal.get("residual_risks")):
            errors.append("non-finding outcome requires residual_risks")
        substantive_events = [
            record
            for record in load_jsonl(root / "events.jsonl")
            if record.get("kind") not in ("transition", "terminal")
        ]
        if not substantive_events:
            errors.append("non-finding outcome requires a substantive hunt event")
        records = coverage_records
        if not records:
            errors.append("non-finding outcome requires coverage records")
        if outcome == "budget-limited":
            reached = budget_status(root, state, contract)["reached"]
            if not reached:
                errors.append(
                    "budget-limited outcome requires a declared deadline, experiment, "
                    "or hour bound to be reached"
                )
        if outcome == "exhausted":
            errors.extend(mandatory_pass_errors(contract, records))
            open_items = [
                f"{dimension}/{item}"
                for (dimension, item), record in current_coverage(records).items()
                if record.get("status") in ("uninspected", "blocked")
            ]
            if open_items:
                errors.append("exhausted outcome has open coverage items: " + ", ".join(open_items))
            represented_dimensions = {
                dimension for dimension, _item in current_coverage(records)
            }
            missing_dimensions = sorted(
                set(coverage_dimensions_for_contract(contract)) - represented_dimensions
            )
            if missing_dimensions:
                errors.append(
                    "exhausted outcome has unaccounted coverage dimensions: "
                    + ", ".join(missing_dimensions)
                )
            leads = sorted(
                candidate_id
                for candidate_id, record in candidates.items()
                if record.get("status") == "lead"
            )
            if leads:
                errors.append("exhausted outcome has unresolved candidate leads: " + ", ".join(leads))
            required_obligations = set(nested(contract, "stop", "exhaustion_obligations") or [])
            recorded_obligations = terminal.get("obligations")
            if not nonempty_strings(recorded_obligations):
                errors.append("exhausted outcome requires obligation attestations")
            elif set(recorded_obligations) != required_obligations:
                errors.append("terminal obligations must exactly match contract exhaustion obligations")
    elif outcome == "blocked":
        unlock = terminal.get("unlock")
        if not isinstance(unlock, str) or not unlock.strip():
            errors.append("blocked outcome requires an exact unlock")
    return errors


def terminal_errors(root: Path) -> List[str]:
    errors = activation_errors(root)
    state = load_json(root / "state.json")
    contract = load_json(root / "contract.json")
    if state.get("status") != "completed":
        errors.append("state.status must be completed")
    outcome = state.get("outcome")
    if outcome not in TERMINAL_OUTCOMES:
        errors.append("state.outcome is invalid")
        return errors
    terminal = state.get("terminal")
    if not isinstance(terminal, dict):
        errors.append("state.terminal must be an object")
        return errors
    if terminal.get("outcome") != outcome:
        errors.append("terminal.outcome must match state.outcome")
    errors.extend(terminal_payload_errors(root, state, contract, terminal))
    return errors


def command_check(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    errors = activation_errors(root) if args.phase == "activation" else terminal_errors(root)
    if errors:
        print(json.dumps({"phase": args.phase, "valid": False, "errors": errors}, indent=2))
        raise GoalStateError(f"{args.phase} check failed with {len(errors)} error(s)")
    print(json.dumps({"phase": args.phase, "valid": True, "errors": []}, indent=2))


def command_transition(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    ensure_integrity(root)
    state = load_json(root / "state.json")
    if not args.reason.strip():
        raise GoalStateError("transition reason must be non-empty")
    current = state.get("status")
    if current == "completed":
        raise GoalStateError("a completed goal cannot transition")
    allowed = {
        "draft": {"active", "blocked"},
        "active": {"paused", "blocked"},
        "paused": {"active", "blocked"},
        "blocked": {"active", "paused"},
    }
    if args.status not in allowed.get(str(current), set()):
        raise GoalStateError(f"invalid transition: {current} -> {args.status}")
    if args.status == "active":
        errors = activation_errors(root)
        if errors:
            raise GoalStateError("cannot activate: " + "; ".join(errors))
        fingerprint = activation_fingerprint(root)
        if state.get("activation_fingerprint") is None:
            state["activation_fingerprint"] = fingerprint
        elif state["activation_fingerprint"] != fingerprint:
            raise GoalStateError("the activated contract changed; start a new goal directory")
        state["blocker"] = None
    elif args.status == "blocked":
        state["blocker"] = {"reason": args.reason, "recorded_at": utc_now()}
    record = append_event(
        root,
        state,
        "transition",
        f"{current} -> {args.status}: {args.reason}",
        [],
    )
    if args.status == "active" and state.get("activated_at") is None:
        state["activated_at"] = record["timestamp"]
    state["status"] = args.status
    atomic_write_json(root / "state.json", state)
    print(json.dumps({"transition": record, "status": args.status}, indent=2))


def command_event(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    ensure_integrity(root)
    state = load_json(root / "state.json")
    if state.get("status") == "completed":
        raise GoalStateError("cannot append events to a completed goal")
    if not args.summary.strip():
        raise GoalStateError("event summary must be non-empty")
    active_only = ("experiment", "observation", "rejection", "pivot", "tool-failure", "review")
    if args.kind in active_only and state.get("status") != "active":
        raise GoalStateError(f"{args.kind} events require an active goal")
    if args.kind in EXPERIMENT_EVENT_KINDS:
        ensure_experiment_budget(root, state)
    evidence = args.evidence or []
    if args.kind in ("experiment", "observation", "rejection", "tool-failure", "review") and not evidence:
        raise GoalStateError(f"{args.kind} events require at least one --evidence artifact")
    if args.kind == "experiment" and not args.classification:
        raise GoalStateError("experiment events require --classification")
    if args.kind == "tool-failure" and args.classification != "tool-failure":
        raise GoalStateError("tool-failure events require --classification tool-failure")
    record = append_event(
        root,
        state,
        args.kind,
        args.summary,
        evidence,
        args.hypothesis,
        args.classification,
    )
    atomic_write_json(root / "state.json", state)
    print(json.dumps(record, indent=2))


def command_coverage(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    ensure_integrity(root)
    state = load_json(root / "state.json")
    if state.get("status") == "completed":
        raise GoalStateError("cannot update coverage on a completed goal")
    if not args.item.strip():
        raise GoalStateError("coverage item must be non-empty")
    evidence = args.evidence or []
    if args.status in ("inspected", "tested") and not evidence:
        raise GoalStateError(f"coverage status {args.status} requires --evidence")
    if args.status == "blocked" and not (args.note or evidence):
        raise GoalStateError("blocked coverage requires --note or --evidence")
    coverage = load_json(root / "coverage.json")
    records = coverage.get("records")
    if not isinstance(records, list):
        raise GoalStateError("coverage.records must be a list")
    sequence = len(records) + 1
    record = {
        "schema_version": SCHEMA_VERSION,
        "sequence": sequence,
        "timestamp": utc_now(),
        "dimension": args.dimension,
        "item": args.item,
        "status": args.status,
        "evidence": evidence,
        "evidence_attestations": evidence_attestations(root, evidence),
        "note": args.note or "",
    }
    records.append(record)
    coverage["updated_at"] = record["timestamp"]
    state["coverage_revision_count"] = sequence
    state["updated_at"] = record["timestamp"]
    atomic_write_json(root / "coverage.json", coverage)
    atomic_write_json(root / "state.json", state)
    print(json.dumps(record, indent=2))


def command_candidate(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    ensure_integrity(root)
    state = load_json(root / "state.json")
    if state.get("status") != "active" or state.get("activation_fingerprint") is None:
        raise GoalStateError("candidate revisions require an active, validated contract")
    activation_issues = activation_errors(root)
    if activation_issues:
        raise GoalStateError("candidate contract is invalid or changed: " + "; ".join(activation_issues))
    if not args.title.strip() or not args.summary.strip():
        raise GoalStateError("candidate title and summary must be non-empty")
    if not args.candidate_id.strip():
        raise GoalStateError("candidate id must be non-empty")
    if not args.evidence:
        raise GoalStateError("candidate revisions require at least one --evidence artifact")
    contract = load_json(root / "contract.json")
    gates = parse_assignments(args.gate or [], "--gate")
    waivers = parse_assignments(args.waiver or [], "--waiver")
    overlap = sorted(set(gates) & set(waivers))
    if overlap:
        raise GoalStateError("a gate cannot both pass and be waived: " + ", ".join(overlap))
    if args.status == "rejected" and not args.failed_gate:
        raise GoalStateError("rejected candidates require --failed-gate")
    if args.status != "rejected" and args.failed_gate:
        raise GoalStateError("--failed-gate is valid only with rejected status")
    candidate_records = load_jsonl(root / "candidates.jsonl")
    previous = latest_candidates(candidate_records).get(args.candidate_id)
    revision = int(previous.get("revision", 0)) + 1 if previous else 1
    sequence = len(candidate_records) + 1
    record: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "sequence": sequence,
        "timestamp": utc_now(),
        "id": args.candidate_id,
        "revision": revision,
        "status": args.status,
        "title": args.title,
        "summary": args.summary,
        "evidence": args.evidence or [],
        "evidence_attestations": evidence_attestations(root, args.evidence or []),
        "gates": gates,
        "gate_attestations": {
            gate: evidence_attestation(root, path) for gate, path in gates.items()
        },
        "waivers": waivers,
        "failed_gate": args.failed_gate,
    }
    if args.status == "validated":
        errors = validate_candidate_record(record, contract)
        if errors:
            raise GoalStateError("; ".join(errors))
    append_jsonl(root / "candidates.jsonl", record)
    state["candidate_revision_count"] = sequence
    state["updated_at"] = record["timestamp"]
    atomic_write_json(root / "state.json", state)
    print(json.dumps(record, indent=2))


def command_finish(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    ensure_integrity(root)
    state = load_json(root / "state.json")
    if state.get("status") == "completed":
        raise GoalStateError("goal is already completed")
    contract = load_json(root / "contract.json")
    activation_issues = activation_errors(root)
    if activation_issues:
        raise GoalStateError("cannot finish: " + "; ".join(activation_issues))
    timestamp = utc_now()
    terminal = {
        "outcome": args.outcome,
        "reason": args.reason,
        "from_status": state.get("status"),
        "candidate_id": args.candidate_id,
        "evidence": args.evidence or [],
        "evidence_attestations": evidence_attestations(root, args.evidence or []),
        "residual_risks": args.residual_risk or [],
        "obligations": args.obligation or [],
        "unlock": args.unlock,
        "completed_at": timestamp,
    }
    errors = terminal_payload_errors(root, state, contract, terminal)
    if errors:
        raise GoalStateError("cannot finish: " + "; ".join(errors))
    append_event(
        root,
        state,
        "terminal",
        f"{args.outcome}: {args.reason}",
        terminal["evidence"],
        attestations=terminal["evidence_attestations"],
    )
    state["status"] = "completed"
    state["outcome"] = args.outcome
    state["terminal"] = terminal
    state["updated_at"] = timestamp
    atomic_write_json(root / "state.json", state)
    print(json.dumps(terminal, indent=2))


def command_relocate(args: argparse.Namespace) -> None:
    """Append a content-preserving location update without rewriting history."""
    root = state_dir(args.directory)
    structural = integrity_errors(root, verify_evidence=False)
    if structural:
        raise GoalStateError("state structural check failed: " + "; ".join(structural))
    if not args.reason.strip():
        raise GoalStateError("relocation reason must be non-empty")
    relocations = relocation_index(root)
    matches: Dict[Tuple[Any, Any], Mapping[str, Any]] = {}
    for attestation in recorded_evidence_attestations(root):
        identity = evidence_identity(attestation)
        latest = relocations.get(identity)
        current_path = (
            latest.get("to_path") if isinstance(latest, dict) else attestation.get("path")
        )
        if args.from_path != current_path:
            continue
        if args.sha256 and attestation.get("sha256") != args.sha256:
            continue
        matches[identity] = attestation
    if not matches:
        raise GoalStateError("no recorded evidence identity matches --from")
    if len(matches) > 1:
        raise GoalStateError("--from matches multiple historical identities; select one with --sha256")
    (identity, original), = matches.items()
    target = evidence_attestation(root, args.to_path)
    if evidence_identity(target) != identity:
        raise GoalStateError(
            "relocated evidence bytes do not match the original SHA-256 and size"
        )
    records = load_evidence_locations(root)
    record = {
        "schema_version": SCHEMA_VERSION,
        "sequence": len(records) + 1,
        "timestamp": utc_now(),
        "sha256": original.get("sha256"),
        "size": original.get("size"),
        "from_path": args.from_path,
        "to_path": args.to_path,
        "to_attestation": target,
        "reason": args.reason,
    }
    append_jsonl(root / EVIDENCE_LOCATIONS_FILE, record)
    print(json.dumps(record, indent=2))


def command_status(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    structural_errors = integrity_errors(root, verify_evidence=False)
    if structural_errors:
        raise GoalStateError("state structural check failed: " + "; ".join(structural_errors))
    evidence_errors = integrity_errors(root, verify_evidence=True)
    state = load_json(root / "state.json")
    contract = load_json(root / "contract.json")
    candidates = latest_candidates(load_jsonl(root / "candidates.jsonl"))
    coverage_data = load_json(root / "coverage.json")
    records = coverage_data.get("records") if isinstance(coverage_data.get("records"), list) else []
    coverage_summary: Dict[str, Dict[str, int]] = {}
    for record in current_coverage(records).values():
        dimension = str(record.get("dimension"))
        status = str(record.get("status"))
        coverage_summary.setdefault(dimension, {})[status] = (
            coverage_summary.setdefault(dimension, {}).get(status, 0) + 1
        )
    events = load_jsonl(root / "events.jsonl")
    current = current_coverage(records)
    pass_summary = {
        f"{dimension}/{item}": (
            current[(dimension, item)].get("status")
            if (dimension, item) in current
            else "unrecorded"
        )
        for dimension, items in mandatory_passes(contract).items()
        for item in items
    }
    summary = {
        "directory": str(root),
        "workflow_version": workflow_version(contract),
        "status": state.get("status"),
        "outcome": state.get("outcome"),
        "counts": {
            "events": len(events),
            "candidate_revisions": int(state.get("candidate_revision_count", 0)),
            "coverage_revisions": int(state.get("coverage_revision_count", 0)),
        },
        "candidates": {
            candidate_id: {
                "revision": record.get("revision"),
                "status": record.get("status"),
                "title": record.get("title"),
            }
            for candidate_id, record in sorted(candidates.items())
        },
        "coverage": coverage_summary,
        "mandatory_passes": pass_summary,
        "budget": budget_status(root, state, contract),
        "evidence_integrity": {
            "valid": not evidence_errors,
            "errors": evidence_errors,
            "relocations": len(load_evidence_locations(root)),
        },
        "last_event": events[-1] if events else None,
        "terminal": state.get("terminal"),
    }
    print(json.dumps(summary, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Track a portable evidence-driven security goal without external dependencies."
    )
    commands = parser.add_subparsers(dest="command", required=True)

    init_parser = commands.add_parser("init", help="initialize a new goal directory")
    init_parser.add_argument("--dir", dest="directory", required=True)
    init_parser.add_argument("--target", required=True)
    init_parser.add_argument("--mode", choices=MODES, required=True)
    init_parser.add_argument("--objective", required=True)
    init_parser.set_defaults(function=command_init)

    check_parser = commands.add_parser("check", help="validate activation or terminal state")
    check_parser.add_argument("--dir", dest="directory", required=True)
    check_parser.add_argument("--phase", choices=("activation", "terminal"), required=True)
    check_parser.set_defaults(function=command_check)

    transition_parser = commands.add_parser("transition", help="change lifecycle state")
    transition_parser.add_argument("--dir", dest="directory", required=True)
    transition_parser.add_argument("--status", choices=("active", "paused", "blocked"), required=True)
    transition_parser.add_argument("--reason", required=True)
    transition_parser.set_defaults(function=command_transition)

    event_parser = commands.add_parser("event", help="append a hunt event")
    event_parser.add_argument("--dir", dest="directory", required=True)
    event_parser.add_argument("--kind", choices=EVENT_KINDS[:-2], required=True)
    event_parser.add_argument("--summary", required=True)
    event_parser.add_argument("--hypothesis")
    event_parser.add_argument("--classification", choices=CLASSIFICATIONS)
    event_parser.add_argument("--evidence", action="append", default=[])
    event_parser.set_defaults(function=command_event)

    coverage_parser = commands.add_parser("coverage", help="append a coverage observation")
    coverage_parser.add_argument("--dir", dest="directory", required=True)
    coverage_parser.add_argument("--dimension", choices=COVERAGE_DIMENSIONS, required=True)
    coverage_parser.add_argument("--item", required=True)
    coverage_parser.add_argument("--status", choices=COVERAGE_STATES, required=True)
    coverage_parser.add_argument("--evidence", action="append", default=[])
    coverage_parser.add_argument("--note")
    coverage_parser.set_defaults(function=command_coverage)

    candidate_parser = commands.add_parser("candidate", help="append a candidate revision")
    candidate_parser.add_argument("--dir", dest="directory", required=True)
    candidate_parser.add_argument("--id", dest="candidate_id", required=True)
    candidate_parser.add_argument("--status", choices=CANDIDATE_STATES, required=True)
    candidate_parser.add_argument("--title", required=True)
    candidate_parser.add_argument("--summary", required=True)
    candidate_parser.add_argument("--evidence", action="append", default=[])
    candidate_parser.add_argument(
        "--gate", action="append", default=[], metavar="NAME=EVIDENCE"
    )
    candidate_parser.add_argument(
        "--waiver", action="append", default=[], metavar="NAME=REASON"
    )
    candidate_parser.add_argument("--failed-gate", choices=EVIDENCE_GATES)
    candidate_parser.set_defaults(function=command_candidate)

    finish_parser = commands.add_parser("finish", help="write a checked terminal outcome")
    finish_parser.add_argument("--dir", dest="directory", required=True)
    finish_parser.add_argument("--outcome", choices=TERMINAL_OUTCOMES, required=True)
    finish_parser.add_argument("--reason", required=True)
    finish_parser.add_argument("--candidate-id")
    finish_parser.add_argument("--evidence", action="append", default=[])
    finish_parser.add_argument("--residual-risk", action="append", default=[])
    finish_parser.add_argument("--obligation", action="append", default=[])
    finish_parser.add_argument("--unlock")
    finish_parser.set_defaults(function=command_finish)

    relocate_parser = commands.add_parser(
        "relocate", help="record a content-preserving evidence path change"
    )
    relocate_parser.add_argument("--dir", dest="directory", required=True)
    relocate_parser.add_argument("--from", dest="from_path", required=True)
    relocate_parser.add_argument("--to", dest="to_path", required=True)
    relocate_parser.add_argument("--sha256")
    relocate_parser.add_argument("--reason", required=True)
    relocate_parser.set_defaults(function=command_relocate)

    status_parser = commands.add_parser("status", help="summarize durable state")
    status_parser.add_argument("--dir", dest="directory", required=True)
    status_parser.set_defaults(function=command_status)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        with state_lock(
            args.directory,
            initialize=args.command == "init",
            exclusive=args.command not in ("check", "status"),
        ):
            args.function(args)
    except GoalStateError as exc:
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
