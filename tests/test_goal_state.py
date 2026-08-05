import hashlib
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPOSITORY_ROOT / "scripts" / "goal_state.py"
DEFAULT_GATES = (
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
    "downstream-impact",
    "composition-review",
)
EXHAUSTION_OBLIGATIONS = (
    "Complete the prioritized surface queue",
    "Record all coverage dimensions",
    "Complete every mandatory deep-hunt pass",
    "Resolve every supported primitive-to-consumer and primitive-to-primitive join",
    "Report residual risks and untested surfaces",
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
    "business-invariant",
    "consumer-propagation",
    "boundary-arithmetic",
    "external-semantics",
    "sequence-interleaving",
    "exploit-composition",
    "economic-closure",
)
MANDATORY_PASSES = {
    "business-invariant": (
        "business-flow-and-state-machine-model",
        "asset-liability-conservation-ledger",
    ),
    "consumer-propagation": ("mutable-value-to-downstream-consumer-map",),
    "boundary-arithmetic": ("rounding-unit-and-zero-boundaries",),
    "external-semantics": ("interface-promise-versus-runtime-delta-matrix",),
    "sequence-interleaving": ("callback-and-action-sequence-matrix",),
    "exploit-composition": ("primitive-join-graph",),
    "economic-closure": ("funding-repayment-profit-and-system-loss-ledger",),
}


class GoalStateTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "hunt"

    def run_cli(self, *arguments, expected=0):
        self.materialize_evidence_arguments(arguments)
        completed = subprocess.run(
            [sys.executable, str(SCRIPT), *map(str, arguments)],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(
            completed.returncode,
            expected,
            msg=f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}",
        )
        return completed

    def materialize_evidence_arguments(self, arguments):
        """Create ordinary relative-path fixtures used by lifecycle tests."""
        paths = []
        for index, argument in enumerate(arguments[:-1]):
            if argument == "--evidence":
                paths.append(str(arguments[index + 1]))
            elif argument == "--gate" and "=" in str(arguments[index + 1]):
                paths.append(str(arguments[index + 1]).split("=", 1)[1])
        for raw_path in paths:
            path = Path(raw_path)
            if path.is_absolute():
                continue
            artifact = self.root.parent / path
            artifact.parent.mkdir(parents=True, exist_ok=True)
            if not artifact.exists():
                artifact.write_text(f"fixture evidence for {raw_path}\n", encoding="utf-8")

    def initialize(self, mode="discovery"):
        return self.run_cli(
            "init",
            "--dir",
            self.root,
            "--target",
            ".",
            "--mode",
            mode,
            "--objective",
            "Find exactly one authorized vulnerability",
        )

    def complete_contract(self):
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["authorization"] = {
            "confirmed": True,
            "basis": "The local fixture is owned by the test",
        }
        contract["target"]["revision"] = "fixture-commit"
        contract["success_conditions"] = ["One candidate passes every required gate"]
        contract["non_success_conditions"] = ["A crash without impact does not count"]
        contract["threat_model"] = {
            "attacker_capabilities": ["Submit an archive through the public import API"],
            "attacker_non_capabilities": ["Cannot write directly to the server filesystem"],
            "assets": ["Files outside the import directory"],
            "trust_boundaries": ["Archive bytes to privileged filesystem writes"],
            "security_invariants": ["Archive entries remain inside the import directory"],
            "required_impact": ["Unauthorized filesystem write"],
            "realistic_configurations": ["Default release build"],
            "business_flows": ["User archive becomes files below an import root"],
            "accounting_invariants": ["Every output path remains rooted below import"],
            "external_semantic_assumptions": ["Filesystem path resolution is canonical"],
            "attacker_funding_sources": ["No funding is required for this fixture"],
        }
        contract["novelty_policy"] = "Check duplicates after the trigger is stable"
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        for name in ("GOAL.md", "THREAT_MODEL.md"):
            path = self.root / name
            path.write_text(
                path.read_text(encoding="utf-8").replace("[REPLACE]", "documented"),
                encoding="utf-8",
            )

    def activate(self):
        self.complete_contract()
        self.run_cli("check", "--dir", self.root, "--phase", "activation")
        self.run_cli(
            "transition",
            "--dir",
            self.root,
            "--status",
            "active",
            "--reason",
            "Contract approved",
        )

    def candidate_gate_arguments(self):
        result = []
        for gate in DEFAULT_GATES:
            result.extend(("--gate", f"{gate}=artifacts/{gate}.txt"))
        return result

    def exhaustion_obligation_arguments(self):
        result = []
        for obligation in EXHAUSTION_OBLIGATIONS:
            result.extend(("--obligation", obligation))
        return result

    def complete_mandatory_passes(self):
        for dimension, items in MANDATORY_PASSES.items():
            for item in items:
                self.run_cli(
                    "coverage",
                    "--dir",
                    self.root,
                    "--dimension",
                    dimension,
                    "--item",
                    item,
                    "--status",
                    "tested",
                    "--evidence",
                    f"artifacts/{dimension}-{item}.md",
                )

    def test_init_scaffolds_and_refuses_overwrite(self):
        self.initialize()
        expected = {
            "contract.json",
            "state.json",
            "events.jsonl",
            "candidates.jsonl",
            "coverage.json",
            "evidence-locations.jsonl",
            "THREAT_MODEL.md",
            "GOAL.md",
        }
        self.assertEqual({path.name for path in self.root.iterdir()}, expected)
        self.run_cli("check", "--dir", self.root, "--phase", "activation", expected=2)
        self.run_cli(
            "init",
            "--dir",
            self.root,
            "--target",
            ".",
            "--mode",
            "discovery",
            "--objective",
            "overwrite",
            expected=2,
        )

    def test_activation_freezes_contract_and_goal(self):
        self.initialize()
        self.activate()
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["objective"] = "Changed after activation"
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        result = self.run_cli(
            "check", "--dir", self.root, "--phase", "activation", expected=2
        )
        self.assertIn("changed", result.stdout)

    def test_validated_lifecycle_and_append_only_candidate_revisions(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--hypothesis",
            "H-001",
            "--summary",
            "The crafted entry reaches the filesystem sink",
            "--classification",
            "supports",
            "--evidence",
            "artifacts/trace.log",
        )
        self.run_cli(
            "coverage",
            "--dir",
            self.root,
            "--dimension",
            "trust-boundary",
            "--item",
            "archive-to-filesystem",
            "--status",
            "tested",
            "--evidence",
            "artifacts/trace.log",
        )
        base_candidate = (
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-001",
            "--title",
            "Archive extraction crosses its destination boundary",
            "--summary",
            "A crafted entry writes outside the import directory",
            "--evidence",
            "artifacts/reproduction.log",
        )
        self.run_cli(*base_candidate, "--status", "lead")
        self.run_cli(
            *base_candidate,
            "--status",
            "validated",
            *self.candidate_gate_arguments(),
        )
        candidates = [
            json.loads(line)
            for line in (self.root / "candidates.jsonl").read_text(encoding="utf-8").splitlines()
        ]
        self.assertEqual([record["revision"] for record in candidates], [1, 2])
        finish = (
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "validated",
            "--candidate-id",
            "C-001",
            "--reason",
            "Every required gate passed",
            "--evidence",
            "findings/C-001.md",
        )
        incomplete = self.run_cli(*finish, expected=2)
        self.assertIn("mandatory hunt pass", incomplete.stderr)
        self.complete_mandatory_passes()
        self.run_cli(*finish)
        self.run_cli("check", "--dir", self.root, "--phase", "terminal")
        status = json.loads(self.run_cli("status", "--dir", self.root).stdout)
        self.assertEqual(status["status"], "completed")
        self.assertEqual(status["outcome"], "validated")
        self.assertEqual(status["workflow_version"], 2)
        self.assertEqual(set(status["mandatory_passes"].values()), {"tested"})
        self.assertEqual(status["candidates"]["C-001"]["revision"], 2)

    def test_validated_candidate_rejects_missing_gate(self):
        self.initialize()
        self.activate()
        result = self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-001",
            "--status",
            "validated",
            "--title",
            "Incomplete candidate",
            "--summary",
            "The report lacks independent evidence",
            "--evidence",
            "artifacts/claim.txt",
            "--gate",
            "attacker-control=artifacts/source.txt",
            expected=2,
        )
        self.assertIn("missing required gate", result.stderr)
        self.assertEqual((self.root / "candidates.jsonl").read_text(encoding="utf-8"), "")

    def test_exhaustion_requires_closed_coverage(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "hypothesis",
            "--summary",
            "Queued the archive boundary",
        )
        coverage_command = (
            "coverage",
            "--dir",
            self.root,
            "--dimension",
            "attack-surface",
            "--item",
            "archive-import",
        )
        self.run_cli(*coverage_command, "--status", "uninspected")
        finish_command = (
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "exhausted",
            "--reason",
            "The bounded queue was completed",
            "--evidence",
            "reports/non-finding.md",
            "--residual-risk",
            "Dependencies were outside scope",
            *self.exhaustion_obligation_arguments(),
        )
        self.run_cli(*finish_command, expected=2)
        self.run_cli(
            *coverage_command,
            "--status",
            "tested",
            "--evidence",
            "artifacts/archive-import.log",
        )
        for dimension in COVERAGE_DIMENSIONS:
            if dimension == "attack-surface" or dimension in MANDATORY_PASSES:
                continue
            self.run_cli(
                "coverage",
                "--dir",
                self.root,
                "--dimension",
                dimension,
                "--item",
                f"bounded-{dimension}-assessment",
                "--status",
                "tested",
                "--evidence",
                f"artifacts/{dimension}.log",
            )
        self.complete_mandatory_passes()
        self.run_cli(*finish_command)
        self.run_cli("check", "--dir", self.root, "--phase", "terminal")

    def test_budget_limited_preserves_open_coverage_and_residual_risk(self):
        self.initialize()
        self.complete_contract()
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["budget"]["max_experiments"] = 1
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        self.run_cli("check", "--dir", self.root, "--phase", "activation")
        self.run_cli(
            "transition",
            "--dir",
            self.root,
            "--status",
            "active",
            "--reason",
            "Contract approved",
        )
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "Tested a parser state hypothesis",
            "--classification",
            "inconclusive",
            "--evidence",
            "artifacts/parser-state.log",
        )
        result = self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "A second experiment exceeds the frozen budget",
            "--classification",
            "inconclusive",
            "--evidence",
            "artifacts/parser-state-2.log",
            expected=2,
        )
        self.assertIn("experiment budget is already reached", result.stderr)
        self.run_cli(
            "coverage",
            "--dir",
            self.root,
            "--dimension",
            "state-invariant",
            "--item",
            "parser-recovery",
            "--status",
            "uninspected",
        )
        self.run_cli(
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "budget-limited",
            "--reason",
            "The experiment budget ended",
            "--evidence",
            "reports/budget.md",
            "--residual-risk",
            "Parser recovery remains untested",
        )
        self.run_cli("check", "--dir", self.root, "--phase", "terminal")

    def test_budget_limited_rejects_an_unreached_bound(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "hypothesis",
            "--summary",
            "A bounded hypothesis remains open",
        )
        self.run_cli(
            "coverage",
            "--dir",
            self.root,
            "--dimension",
            "state-invariant",
            "--item",
            "parser-recovery",
            "--status",
            "uninspected",
        )
        result = self.run_cli(
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "budget-limited",
            "--reason",
            "The declared budget has not ended",
            "--evidence",
            "reports/premature-budget.md",
            "--residual-risk",
            "Parser recovery remains untested",
            expected=2,
        )
        self.assertIn("requires a declared deadline", result.stderr)

    def test_blocked_outcome_requires_exact_unlock(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "transition",
            "--dir",
            self.root,
            "--status",
            "blocked",
            "--reason",
            "The release dependency is unavailable",
        )
        command = (
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "blocked",
            "--reason",
            "The release dependency is unavailable",
            "--evidence",
            "artifacts/build-error.log",
        )
        self.run_cli(*command, expected=2)
        self.run_cli(*command, "--unlock", "Provide the private release dependency archive")
        self.run_cli("check", "--dir", self.root, "--phase", "terminal")

    def test_unactivated_goal_cannot_create_candidate_or_finish(self):
        self.initialize()
        self.complete_contract()
        self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-001",
            "--status",
            "validated",
            "--title",
            "Unactivated candidate",
            "--summary",
            "This must not enter history",
            "--evidence",
            "artifacts/claim.txt",
            *self.candidate_gate_arguments(),
            expected=2,
        )
        self.run_cli(
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "validated",
            "--candidate-id",
            "C-001",
            "--reason",
            "Should fail",
            "--evidence",
            "findings/C-001.md",
            expected=2,
        )
        state = json.loads((self.root / "state.json").read_text(encoding="utf-8"))
        self.assertEqual(state["status"], "draft")
        self.assertIsNone(state["activation_fingerprint"])

    def test_empty_authorization_and_stub_markdown_fail_activation(self):
        self.initialize()
        self.complete_contract()
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["authorization"]["basis"] = ""
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        (self.root / "GOAL.md").write_text("x\n", encoding="utf-8")
        (self.root / "THREAT_MODEL.md").write_text("x\n", encoding="utf-8")
        result = self.run_cli(
            "check", "--dir", self.root, "--phase", "activation", expected=2
        )
        self.assertIn("authorization.basis", result.stdout)
        self.assertIn("missing heading", result.stdout)

    def test_required_gates_cannot_be_silently_removed(self):
        self.initialize()
        self.complete_contract()
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["evidence_requirements"]["required_gates"] = [
            "attacker-control",
            "reachability",
            "defense-analysis",
            "security-impact",
            "realistic-configuration",
            "safe-reproduction",
            "release-reproduction",
        ]
        contract["evidence_requirements"]["waivable_gates"] = []
        contract["evidence_requirements"].pop("waiver_policy")
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        result = self.run_cli(
            "check", "--dir", self.root, "--phase", "activation", expected=2
        )
        self.assertIn("non-optional gates", result.stdout)
        self.assertIn("explicit requirement or omission", result.stdout)
        self.assertIn("waiver_policy", result.stdout)

    def test_v2_contract_cannot_drop_a_mandatory_deep_hunt_pass(self):
        self.initialize()
        self.complete_contract()
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        del contract["search_requirements"]["mandatory_passes"]["exploit-composition"]
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        result = self.run_cli(
            "check", "--dir", self.root, "--phase", "activation", expected=2
        )
        self.assertIn("mandatory passes omitted: exploit-composition", result.stdout)

    def test_legacy_workflow_contract_remains_checkable(self):
        self.initialize()
        self.complete_contract()
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        contract["workflow_version"] = 1
        del contract["search_requirements"]
        for field in (
            "business_flows",
            "accounting_invariants",
            "external_semantic_assumptions",
            "attacker_funding_sources",
        ):
            del contract["threat_model"][field]
        for gate in ("downstream-impact", "composition-review"):
            contract["evidence_requirements"]["required_gates"].remove(gate)
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        self.run_cli("check", "--dir", self.root, "--phase", "activation")
        self.run_cli(
            "transition",
            "--dir",
            self.root,
            "--status",
            "active",
            "--reason",
            "Legacy contract approved",
        )
        gate_arguments = []
        for gate in DEFAULT_GATES[:-2]:
            gate_arguments.extend(("--gate", f"{gate}=artifacts/{gate}.txt"))
        self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-LEGACY",
            "--status",
            "validated",
            "--title",
            "Legacy validated candidate",
            "--summary",
            "The legacy gate set remains valid",
            "--evidence",
            "artifacts/reproduction.log",
            *gate_arguments,
        )
        self.run_cli(
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "validated",
            "--candidate-id",
            "C-LEGACY",
            "--reason",
            "Legacy validation passed",
            "--evidence",
            "reports/legacy.md",
        )
        self.run_cli("check", "--dir", self.root, "--phase", "terminal")

    def test_optional_gates_require_explicit_omission_reasons(self):
        self.initialize(mode="validation")
        self.complete_contract()
        contract_path = self.root / "contract.json"
        contract = json.loads(contract_path.read_text(encoding="utf-8"))
        for gate in ("duplicate-check", "human-review"):
            contract["evidence_requirements"]["required_gates"].remove(gate)
        contract["evidence_requirements"]["omitted_gates"] = {
            "duplicate-check": "The contract validates a known alert and makes no novelty claim",
            "human-review": "This is an internal technical result that remains unreviewed",
        }
        contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
        self.run_cli("check", "--dir", self.root, "--phase", "activation")

    def test_pre_authorized_negative_control_waiver_is_recorded(self):
        self.initialize()
        self.activate()
        gate_arguments = []
        for gate in DEFAULT_GATES:
            if gate != "negative-control":
                gate_arguments.extend(("--gate", f"{gate}=artifacts/{gate}.txt"))
        self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-001",
            "--status",
            "validated",
            "--title",
            "Candidate with an authorized comparator exception",
            "--summary",
            "Equivalent discriminating evidence is recorded",
            "--evidence",
            "artifacts/reproduction.log",
            *gate_arguments,
            "--waiver",
            "negative-control=No comparator exists; artifacts/differential-proof.txt is equivalent",
        )
        record = json.loads(
            (self.root / "candidates.jsonl").read_text(encoding="utf-8").splitlines()[0]
        )
        self.assertIn("negative-control", record["waivers"])

    def test_exhaustion_rejects_completed_finding_count(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "hypothesis",
            "--summary",
            "Tested one bounded hypothesis",
        )
        self.run_cli(
            "coverage",
            "--dir",
            self.root,
            "--dimension",
            "source-read",
            "--item",
            "archive.py",
            "--status",
            "tested",
            "--evidence",
            "artifacts/archive.log",
        )
        self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-001",
            "--status",
            "validated",
            "--title",
            "Validated boundary crossing",
            "--summary",
            "Every configured gate passed",
            "--evidence",
            "artifacts/reproduction.log",
            *self.candidate_gate_arguments(),
        )
        result = self.run_cli(
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "exhausted",
            "--reason",
            "Incorrect non-finding",
            "--evidence",
            "reports/non-finding.md",
            "--residual-risk",
            "Dependencies remain",
            *self.exhaustion_obligation_arguments(),
            expected=2,
        )
        self.assertIn("use the validated outcome", result.stderr)
        state = json.loads((self.root / "state.json").read_text(encoding="utf-8"))
        self.assertEqual(state["status"], "active")

    def test_forged_candidate_revision_breaks_integrity(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-001",
            "--status",
            "lead",
            "--title",
            "Lead",
            "--summary",
            "Needs testing",
            "--evidence",
            "artifacts/lead.txt",
        )
        candidate_path = self.root / "candidates.jsonl"
        forged = json.loads(candidate_path.read_text(encoding="utf-8").splitlines()[0])
        forged.update({"sequence": 999, "revision": 1, "status": "validated"})
        with candidate_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(forged) + "\n")
        result = self.run_cli("status", "--dir", self.root, expected=2)
        self.assertIn("structural check failed", result.stderr)

    def test_failed_finish_does_not_mutate_lifecycle(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "transition",
            "--dir",
            self.root,
            "--status",
            "blocked",
            "--reason",
            "Dependency unavailable",
        )
        base = (
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "blocked",
            "--evidence",
            "artifacts/build-error.log",
            "--unlock",
            "Provide the dependency archive",
        )
        self.run_cli(*base, "--reason", "", expected=2)
        state = json.loads((self.root / "state.json").read_text(encoding="utf-8"))
        self.assertEqual(state["status"], "blocked")
        self.assertIsNone(state["outcome"])
        self.run_cli(*base, "--reason", "Dependency blocks the release build")
        self.run_cli("check", "--dir", self.root, "--phase", "terminal")

    def test_experiments_and_inspected_coverage_require_evidence(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "An experiment without an artifact",
            expected=2,
        )
        self.run_cli(
            "coverage",
            "--dir",
            self.root,
            "--dimension",
            "source-read",
            "--item",
            "parser.py",
            "--status",
            "inspected",
            expected=2,
        )

    def test_missing_candidate_gate_and_mandatory_pass_artifacts_are_rejected(self):
        self.initialize()
        self.activate()
        missing = self.root.parent / "does-not-exist" / "artifact.txt"
        result = self.run_cli(
            "coverage",
            "--dir",
            self.root,
            "--dimension",
            "exploit-composition",
            "--item",
            "primitive-join-graph",
            "--status",
            "tested",
            "--evidence",
            missing,
            expected=2,
        )
        self.assertIn("evidence artifact does not exist", result.stderr)

        gate_arguments = []
        for gate in DEFAULT_GATES:
            gate_arguments.extend(("--gate", f"{gate}={missing}"))
        result = self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-FAKE",
            "--status",
            "validated",
            "--title",
            "Fake-path candidate",
            "--summary",
            "Every gate cites a nonexistent file",
            "--evidence",
            "artifacts/reproduction.log",
            *gate_arguments,
            expected=2,
        )
        self.assertIn("evidence artifact does not exist", result.stderr)
        self.assertEqual((self.root / "candidates.jsonl").read_text(encoding="utf-8"), "")

    def test_evidence_is_attested_and_terminal_check_detects_mutation(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "transition",
            "--dir",
            self.root,
            "--status",
            "blocked",
            "--reason",
            "A release dependency is unavailable",
        )
        evidence = "reports/blocker.md"
        self.run_cli(
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "blocked",
            "--reason",
            "A release dependency is unavailable",
            "--evidence",
            evidence,
            "--unlock",
            "Provide the release dependency archive",
        )
        self.run_cli("check", "--dir", self.root, "--phase", "terminal")
        state = json.loads((self.root / "state.json").read_text(encoding="utf-8"))
        attestation = state["terminal"]["evidence_attestations"][0]
        artifact = self.root.parent / evidence
        self.assertEqual(attestation["size"], artifact.stat().st_size)
        self.assertEqual(
            attestation["sha256"], hashlib.sha256(artifact.read_bytes()).hexdigest()
        )

        artifact.write_text("mutated after completion\n", encoding="utf-8")
        result = self.run_cli(
            "check", "--dir", self.root, "--phase", "terminal", expected=2
        )
        self.assertIn("attestation mismatch: sha256", result.stdout)

    def test_unattested_existing_evidence_fails_closed(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "A recorded experiment must carry its evidence attestation",
            "--classification",
            "supports",
            "--evidence",
            "artifacts/experiment.log",
        )
        event_path = self.root / "events.jsonl"
        records = [json.loads(line) for line in event_path.read_text().splitlines()]
        records[-1].pop("evidence_attestations")
        event_path.write_text(
            "".join(json.dumps(record) + "\n" for record in records), encoding="utf-8"
        )
        result = self.run_cli("status", "--dir", self.root)
        status = json.loads(result.stdout)
        self.assertFalse(status["evidence_integrity"]["valid"])
        self.assertIn(
            "lacks one attestation per evidence artifact",
            status["evidence_integrity"]["errors"][0],
        )
        mutation = self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "note",
            "--summary",
            "Mutations still fail closed",
            expected=2,
        )
        self.assertIn("integrity check failed", mutation.stderr)

    def test_symlink_is_not_accepted_as_evidence(self):
        self.initialize()
        self.activate()
        artifact_dir = self.root.parent / "artifacts"
        artifact_dir.mkdir(exist_ok=True)
        target = artifact_dir / "target.log"
        target.write_text("real bytes\n", encoding="utf-8")
        link = artifact_dir / "link.log"
        link.symlink_to(target)
        result = self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "A symlink must not stand in for preserved evidence",
            "--classification",
            "supports",
            "--evidence",
            link,
            expected=2,
        )
        self.assertIn("symlink component", result.stderr)

    def test_empty_evidence_is_rejected(self):
        self.initialize()
        self.activate()
        artifact = self.root.parent / "artifacts" / "empty.log"
        artifact.parent.mkdir(exist_ok=True)
        artifact.touch()
        result = self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "An empty file cannot prove an experiment",
            "--classification",
            "supports",
            "--evidence",
            "artifacts/empty.log",
            expected=2,
        )
        self.assertIn("evidence artifact is empty", result.stderr)

    def test_symlinked_parent_and_outside_root_are_rejected(self):
        self.initialize()
        self.activate()
        real = self.root.parent / "real-artifacts"
        real.mkdir()
        (real / "run.log").write_text("preserved output\n", encoding="utf-8")
        link = self.root.parent / "linked-artifacts"
        link.symlink_to(real, target_is_directory=True)
        result = self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "A symlinked parent must not bypass containment",
            "--classification",
            "supports",
            "--evidence",
            "linked-artifacts/run.log",
            expected=2,
        )
        self.assertIn("symlink component", result.stderr)

        with tempfile.TemporaryDirectory() as external_raw:
            external = Path(external_raw) / "outside.log"
            external.write_text("outside the frozen root\n", encoding="utf-8")
            result = self.run_cli(
                "event",
                "--dir",
                self.root,
                "--kind",
                "experiment",
                "--summary",
                "An undeclared absolute root must be rejected",
                "--classification",
                "supports",
                "--evidence",
                external,
                expected=2,
            )
            self.assertIn("outside the contract's allowed evidence roots", result.stderr)

    def test_an_absolute_evidence_root_must_be_declared_before_activation(self):
        self.initialize()
        self.complete_contract()
        with tempfile.TemporaryDirectory() as external_raw:
            external_root = Path(external_raw)
            evidence = external_root / "approved.log"
            evidence.write_text("approved external evidence root\n", encoding="utf-8")
            contract_path = self.root / "contract.json"
            contract = json.loads(contract_path.read_text(encoding="utf-8"))
            contract["outputs"]["evidence_roots"].append(str(external_root))
            contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
            self.run_cli("check", "--dir", self.root, "--phase", "activation")
            self.run_cli(
                "transition",
                "--dir",
                self.root,
                "--status",
                "active",
                "--reason",
                "Contract and external root approved",
            )
            self.run_cli(
                "event",
                "--dir",
                self.root,
                "--kind",
                "experiment",
                "--summary",
                "Use evidence from the predeclared absolute root",
                "--classification",
                "supports",
                "--evidence",
                evidence,
            )
            status = json.loads(self.run_cli("status", "--dir", self.root).stdout)
            self.assertTrue(status["evidence_integrity"]["valid"])

    def test_duplicate_gate_digests_require_a_preactivated_exception(self):
        self.initialize()
        self.activate()
        repeated = []
        for gate in DEFAULT_GATES:
            repeated.extend(("--gate", f"{gate}=artifacts/shared.log"))
        result = self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-SHARED",
            "--status",
            "validated",
            "--title",
            "One file for every claim",
            "--summary",
            "This candidate must not pass distinct evidence gates",
            "--evidence",
            "artifacts/report.md",
            *repeated,
            expected=2,
        )
        self.assertIn("reuse one artifact digest", result.stderr)

        second_root = Path(self.temporary.name) / "shared-exception"
        original_root = self.root
        self.root = second_root
        try:
            self.initialize()
            self.complete_contract()
            contract_path = self.root / "contract.json"
            contract = json.loads(contract_path.read_text(encoding="utf-8"))
            contract["evidence_requirements"]["allowed_gate_evidence_sharing"] = [
                {
                    "gates": ["attacker-control", "reachability"],
                    "reason": "One trace proves the caller-controlled entry and its reachability",
                }
            ]
            contract_path.write_text(json.dumps(contract, indent=2) + "\n", encoding="utf-8")
            self.run_cli("check", "--dir", self.root, "--phase", "activation")
            self.run_cli(
                "transition",
                "--dir",
                self.root,
                "--status",
                "active",
                "--reason",
                "Contract approved",
            )
            gates = []
            for gate in DEFAULT_GATES:
                path = (
                    "artifacts/entry-trace.log"
                    if gate in ("attacker-control", "reachability")
                    else f"artifacts/{gate}.log"
                )
                gates.extend(("--gate", f"{gate}={path}"))
            self.run_cli(
                "candidate",
                "--dir",
                self.root,
                "--id",
                "C-DECLARED",
                "--status",
                "validated",
                "--title",
                "Declared evidence sharing",
                "--summary",
                "Only the predeclared pair shares a trace",
                "--evidence",
                "artifacts/report.md",
                *gates,
            )
        finally:
            self.root = original_root

    def test_mandatory_passes_require_distinct_artifact_digests(self):
        self.initialize()
        self.activate()
        self.run_cli(
            "candidate",
            "--dir",
            self.root,
            "--id",
            "C-001",
            "--status",
            "validated",
            "--title",
            "Complete candidate",
            "--summary",
            "Every candidate gate has distinct evidence",
            "--evidence",
            "artifacts/report.md",
            *self.candidate_gate_arguments(),
        )
        for dimension, items in MANDATORY_PASSES.items():
            for item in items:
                self.run_cli(
                    "coverage",
                    "--dir",
                    self.root,
                    "--dimension",
                    dimension,
                    "--item",
                    item,
                    "--status",
                    "tested",
                    "--evidence",
                    "artifacts/all-passes.log",
                )
        result = self.run_cli(
            "finish",
            "--dir",
            self.root,
            "--outcome",
            "validated",
            "--reason",
            "All passes cite one file",
            "--candidate-id",
            "C-001",
            "--evidence",
            "reports/finding.md",
            expected=2,
        )
        self.assertIn("mandatory hunt passes reuse one artifact digest", result.stderr)

    def test_missing_evidence_can_be_relocated_without_rewriting_history(self):
        self.initialize()
        self.activate()
        original_raw = "artifacts/experiment.log"
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "experiment",
            "--summary",
            "Record relocatable evidence",
            "--classification",
            "supports",
            "--evidence",
            original_raw,
        )
        original = self.root.parent / original_raw
        relocated = self.root.parent / "archive" / "experiment.log"
        relocated.parent.mkdir()
        original.rename(relocated)
        wrong = self.root.parent / "archive" / "wrong.log"
        wrong.write_text("different bytes\n", encoding="utf-8")
        before = json.loads(self.run_cli("status", "--dir", self.root).stdout)
        self.assertFalse(before["evidence_integrity"]["valid"])
        rejected = self.run_cli(
            "relocate",
            "--dir",
            self.root,
            "--from",
            original_raw,
            "--to",
            "archive/wrong.log",
            "--reason",
            "This content is not identical",
            expected=2,
        )
        self.assertIn("do not match", rejected.stderr)
        self.run_cli(
            "relocate",
            "--dir",
            self.root,
            "--from",
            original_raw,
            "--to",
            "archive/experiment.log",
            "--reason",
            "Evidence was archived with identical bytes",
        )
        after = json.loads(self.run_cli("status", "--dir", self.root).stdout)
        self.assertTrue(after["evidence_integrity"]["valid"])
        self.assertEqual(after["evidence_integrity"]["relocations"], 1)
        self.run_cli("check", "--dir", self.root, "--phase", "activation")

    def test_concurrent_writers_are_serialized(self):
        self.initialize()
        self.activate()
        processes = []
        for index in range(12):
            processes.append(
                subprocess.Popen(
                    [
                        sys.executable,
                        str(SCRIPT),
                        "event",
                        "--dir",
                        str(self.root),
                        "--kind",
                        "mapping",
                        "--summary",
                        f"Concurrent mapping event {index}",
                    ],
                    text=True,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.PIPE,
                )
            )
        failures = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=30)
            if process.returncode != 0:
                failures.append((process.returncode, stdout, stderr))
        self.assertEqual(failures, [])
        status = json.loads(self.run_cli("status", "--dir", self.root).stdout)
        self.assertEqual(status["counts"]["events"], 13)

    def test_main_handles_broken_pipe_without_a_traceback(self):
        self.initialize()
        specification = importlib.util.spec_from_file_location("goal_state_tested", SCRIPT)
        self.assertIsNotNone(specification)
        self.assertIsNotNone(specification.loader)
        module = importlib.util.module_from_spec(specification)
        specification.loader.exec_module(module)

        class ClosedPipe:
            def close(self):
                return None

        with patch.object(module.sys, "stdout", ClosedPipe()), patch(
            "builtins.print", side_effect=BrokenPipeError
        ):
            self.assertEqual(module.main(["status", "--dir", str(self.root)]), 0)

    def test_documented_goal_template_matches_activation_headings(self):
        self.initialize()
        self.complete_contract()
        reference = (REPOSITORY_ROOT / "references" / "goal-contract.md").read_text(
            encoding="utf-8"
        )
        template = reference.split("```markdown", 2)[2].split("```", 1)[0].strip()
        (self.root / "GOAL.md").write_text(template + "\n", encoding="utf-8")
        self.run_cli("check", "--dir", self.root, "--phase", "activation")

    def test_installable_package_excludes_benchmark_payloads(self):
        self.assertFalse((REPOSITORY_ROOT / "benchmarks").exists())
        self.assertTrue((REPOSITORY_ROOT / "BENCHMARKS.md").is_file())
        self.assertTrue((REPOSITORY_ROOT / "LICENSE").is_file())
        readme = (REPOSITORY_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("--depth 1 --single-branch --branch main", readme)

    def test_demo_preview_is_local_looping_and_release_backed(self):
        readme = (REPOSITORY_ROOT / "README.md").read_text(encoding="utf-8")
        preview = REPOSITORY_ROOT / "assets" / "aim-for-the-head-walkthrough-preview.webp"
        self.assertNotIn("files.catbox.moe", readme)
        self.assertIn("assets/aim-for-the-head-walkthrough-preview.webp", readme)
        self.assertIn("releases/download/readme-video-v1", readme)
        self.assertIn("640×360 animated preview", readme)
        contents = preview.read_bytes()
        self.assertLess(len(contents), 1_000_000)
        self.assertTrue(contents.startswith(b"RIFF"))
        self.assertIn(b"ANIM", contents)
        animation = contents.index(b"ANIM")
        self.assertEqual(int.from_bytes(contents[animation + 12 : animation + 14], "little"), 0)

    def test_deep_hunt_references_are_loaded_progressively(self):
        index = REPOSITORY_ROOT / "references" / "deep-hunt.md"
        passes = (
            "deep-business-invariants.md",
            "deep-consumer-propagation.md",
            "deep-boundary-arithmetic.md",
            "deep-external-semantics.md",
            "deep-sequence-interleaving.md",
            "deep-exploit-composition.md",
            "deep-economic-closure.md",
        )
        self.assertLess(index.stat().st_size, 4_000)
        for name in passes:
            path = REPOSITORY_ROOT / "references" / name
            self.assertTrue(path.is_file(), name)
            self.assertLess(path.stat().st_size, 2_500, name)
            self.assertIn(name, index.read_text(encoding="utf-8"))
        skill = (REPOSITORY_ROOT / "SKILL.md").read_text(encoding="utf-8")
        description = skill.split("description: ", 1)[1].splitlines()[0]
        self.assertIn("explicitly requests", description)
        self.assertNotIn("Codex, Claude Code", description)
        self.assertLess(len(description), 400)

    def test_meridian_archive_names_unreachable_freeze_identifiers(self):
        benchmark = (REPOSITORY_ROOT / "BENCHMARKS.md").read_text(encoding="utf-8")
        for commit in (
            "158651792f770f5e827c1f0c363ea91f916cb1b8",
            "31ea4b7367a42fb1d87d486e945e54361a8d0ca3",
            "c1e2b8cd7bd098098a05bb7010277c81e3ae9aed",
            "d07b5ed83def43f6293bd41eaf51e97dc2fec501",
        ):
            self.assertIn(commit, benchmark)
        self.assertIn("not reachable as commit objects", benchmark)

    def test_readme_validated_example_contains_every_default_gate(self):
        readme = (REPOSITORY_ROOT / "README.md").read_text(encoding="utf-8")
        example = readme.split("### Validate a candidate", 1)[1].split("### Pause", 1)[0]
        for gate in DEFAULT_GATES:
            self.assertIn(f'--gate "{gate}=', example)


if __name__ == "__main__":
    unittest.main()
