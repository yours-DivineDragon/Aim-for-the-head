import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


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
        self.activate()
        self.run_cli(
            "event",
            "--dir",
            self.root,
            "--kind",
            "hypothesis",
            "--summary",
            "Queued a parser state hypothesis",
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
        self.assertIn("integrity check failed", result.stderr)

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
        result = self.run_cli("status", "--dir", self.root, expected=2)
        self.assertIn("lacks one attestation per evidence artifact", result.stderr)

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
        self.assertIn("evidence artifact may not be a symlink", result.stderr)

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

    def test_readme_validated_example_contains_every_default_gate(self):
        readme = (REPOSITORY_ROOT / "README.md").read_text(encoding="utf-8")
        example = readme.split("### Validate a candidate", 1)[1].split("### Pause", 1)[0]
        for gate in DEFAULT_GATES:
            self.assertIn(f'--gate "{gate}=', example)


if __name__ == "__main__":
    unittest.main()
