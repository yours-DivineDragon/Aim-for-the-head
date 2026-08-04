#!/usr/bin/env python3
"""Portable state machine for evidence-driven security goals."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Tuple


SCHEMA_VERSION = 1
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
COVERAGE_DIMENSIONS = (
    "source-read",
    "attack-surface",
    "trust-boundary",
    "state-invariant",
    "runtime-corpus",
    "config-build",
    "historical-family",
    "falsification",
)
COVERAGE_STATES = ("uninspected", "inspected", "tested", "blocked")
EVIDENCE_GATES = (
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
CORE_GATES = frozenset(
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
ALLOWED_WAIVABLE_GATES = frozenset(("negative-control", "duplicate-check"))
ALLOWED_OMITTED_GATES = frozenset(("duplicate-check", "human-review"))
ALWAYS_REQUIRED_GATES = CORE_GATES | frozenset(("negative-control",))
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


def contract_errors(contract: Mapping[str, Any]) -> List[str]:
    errors: List[str] = []
    if contract.get("schema_version") != SCHEMA_VERSION:
        errors.append(f"contract.schema_version must be {SCHEMA_VERSION}")
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
    required_gates = nested(contract, "evidence_requirements", "required_gates")
    if not nonempty_strings(required_gates):
        errors.append("evidence_requirements.required_gates must be non-empty")
        required_gates = []
    unknown_gates = sorted(set(required_gates) - set(EVIDENCE_GATES))
    if unknown_gates:
        errors.append("unknown required gates: " + ", ".join(unknown_gates))
    if len(required_gates) != len(set(required_gates)):
        errors.append("required_gates must not contain duplicates")
    missing_always_required = sorted(ALWAYS_REQUIRED_GATES - set(required_gates))
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
    unaccounted = sorted(set(EVIDENCE_GATES) - set(required_gates) - set(omitted))
    if unaccounted:
        errors.append("gates require an explicit requirement or omission: " + ", ".join(unaccounted))
    waiver_policy = nested(contract, "evidence_requirements", "waiver_policy")
    if not isinstance(waiver_policy, str) or not waiver_policy.strip():
        errors.append("evidence_requirements.waiver_policy must be non-empty")
    novelty = contract.get("novelty_policy")
    if not isinstance(novelty, str) or not novelty.strip():
        errors.append("novelty_policy must be non-empty")
    budget = contract.get("budget")
    if not isinstance(budget, dict):
        errors.append("budget must be an object")
    else:
        bounds = (budget.get("deadline"), budget.get("max_experiments"), budget.get("max_hours"))
        if not any(value not in (None, "") for value in bounds):
            errors.append("budget must define deadline, max_experiments, or max_hours")
        for key in ("max_experiments", "max_hours"):
            value = budget.get(key)
            if value is not None and (
                isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0
            ):
                errors.append(f"budget.{key} must be positive or null")
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
    if contains_placeholder(contract):
        errors.append(f"contract still contains {PLACEHOLDER} placeholders")
    return errors


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


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


def integrity_errors(root: Path) -> List[str]:
    errors: List[str] = []
    state = load_json(root / "state.json")
    events = load_jsonl(root / "events.jsonl")
    candidates = load_jsonl(root / "candidates.jsonl")
    coverage = load_json(root / "coverage.json")
    records = coverage.get("records")
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
    return errors


def append_event(
    root: Path,
    state: Dict[str, Any],
    kind: str,
    summary: str,
    evidence: Sequence[str],
    hypothesis: Optional[str] = None,
    classification: Optional[str] = None,
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
    }
    if hypothesis:
        record["hypothesis"] = hypothesis
    if classification:
        record["classification"] = classification
    append_jsonl(root / "events.jsonl", record)
    state["event_count"] = sequence
    state["updated_at"] = record["timestamp"]
    return record


def initial_contract(target: str, mode: str, objective: str) -> Dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
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
        },
        "evidence_requirements": {
            "required_gates": list(EVIDENCE_GATES),
            "waivable_gates": ["negative-control"],
            "omitted_gates": {},
            "waiver_policy": (
                "Authorize an inapplicable gate before activation and record equivalent evidence."
            ),
        },
        "novelty_policy": PLACEHOLDER,
        "budget": {"deadline": None, "max_experiments": 50, "max_hours": None},
        "stop": {
            "finding_count": 1,
            "exhaustion_obligations": [
                "Complete the prioritized surface queue",
                "Record all coverage dimensions",
                "Report residual risks and untested surfaces",
            ],
            "blocked_rule": (
                "Name the exact missing input, permission, dependency, or environment and its unlock."
            ),
        },
        "outputs": {
            "state_dir": ".",
            "evidence_dir": "artifacts",
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

## Security invariants
- Invariant: {PLACEHOLDER}
  - Why it matters: {PLACEHOLDER}
  - Expected enforcement points: {PLACEHOLDER}
  - Observable counterexample: {PLACEHOLDER}

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
- Safe reproduction oracle: {PLACEHOLDER}
- Release-like configuration: {PLACEHOLDER}
- Negative control: {PLACEHOLDER}
- Independent reproduction: {PLACEHOLDER}

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
        coverage = load_json(root / "coverage.json")
        records = coverage.get("records") if isinstance(coverage.get("records"), list) else []
        if not records:
            errors.append("non-finding outcome requires coverage records")
        if outcome == "exhausted":
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
            missing_dimensions = sorted(set(COVERAGE_DIMENSIONS) - represented_dimensions)
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
        "gates": gates,
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
    )
    state["status"] = "completed"
    state["outcome"] = args.outcome
    state["terminal"] = terminal
    state["updated_at"] = timestamp
    atomic_write_json(root / "state.json", state)
    print(json.dumps(terminal, indent=2))


def command_status(args: argparse.Namespace) -> None:
    root = state_dir(args.directory)
    ensure_integrity(root)
    state = load_json(root / "state.json")
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
    summary = {
        "directory": str(root),
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

    status_parser = commands.add_parser("status", help="summarize durable state")
    status_parser.add_argument("--dir", dest="directory", required=True)
    status_parser.set_defaults(function=command_status)
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.function(args)
    except GoalStateError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
