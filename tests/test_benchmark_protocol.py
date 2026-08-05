import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPOSITORY_ROOT / "scripts" / "benchmark_protocol.py"


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def digest(value):
    return hashlib.sha256(value).hexdigest()


class BenchmarkProtocolTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "private"
        self.root.mkdir()

    def write_json(self, path, value):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return target

    def run_cli(self, *arguments, expected=0):
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

    def preseal_fixture(self):
        invariants = {
            "schema_version": 1,
            "invariants": [
                {"id": "INV-A", "statement": "Only authorized actors change risk"},
                {"id": "INV-B", "statement": "Credited collateral equals received collateral"},
                {"id": "INV-C", "statement": "Settlement conserves assets and liabilities"},
                {"id": "INV-D", "statement": "Unsupported oracle rounds are rejected"},
            ],
        }
        units = {
            "schema_version": 1,
            "units": [
                {"id": "UNIT-1", "weight": 60},
                {"id": "UNIT-2", "weight": 40},
            ],
        }
        matrix = {
            "schema_version": 1,
            "rows": [
                {
                    "invariant_id": "INV-A",
                    "disposition": "registered-unit",
                    "unit_ids": ["UNIT-1"],
                    "evidence": ["controls/unit-1.log"],
                    "reason": "The hidden control proves the registered authorization unit",
                },
                {
                    "invariant_id": "INV-B",
                    "disposition": "registered-unit",
                    "unit_ids": ["UNIT-2"],
                    "evidence": ["controls/unit-2.log"],
                    "reason": "The hidden control proves the registered balance-delta unit",
                },
                {
                    "invariant_id": "INV-C",
                    "disposition": "patched-safe",
                    "unit_ids": [],
                    "evidence": ["controls/settlement-safe.log"],
                    "reason": "The generator deliberately keeps this invariant safe",
                },
                {
                    "invariant_id": "INV-D",
                    "disposition": "negative-control",
                    "unit_ids": [],
                    "evidence": ["controls/oracle-negative.log"],
                    "reason": "The negative control rejects the unsupported round",
                },
            ],
        }
        for name in (
            "unit-1.log",
            "unit-2.log",
            "settlement-safe.log",
            "oracle-negative.log",
        ):
            path = self.root / "controls" / name
            path.parent.mkdir(exist_ok=True)
            path.write_text(f"deterministic control evidence for {name}\n", encoding="utf-8")
        self.write_json("public-invariants.json", invariants)
        self.write_json("units.json", units)
        self.write_json("matrix.json", matrix)
        return invariants, units, matrix

    def preseal_command(self, output):
        return (
            "preseal",
            "--root",
            self.root,
            "--invariants",
            "public-invariants.json",
            "--units",
            "units.json",
            "--matrix",
            "matrix.json",
            "--output",
            output,
        )

    def test_preseal_requires_total_invariant_and_unit_coverage(self):
        invariants, units, matrix = self.preseal_fixture()
        output = self.root / "sealed" / "PRESEAL_ATTESTATION.json"
        result = self.run_cli(*self.preseal_command(output))
        attestation = json.loads(result.stdout)
        self.assertTrue(attestation["valid"])
        self.assertEqual(attestation["counts"]["public_invariants"], 4)
        self.assertEqual(attestation["counts"]["scored_units"], 2)
        self.assertEqual(attestation["unit_weight_total"], 100.0)
        self.assertEqual(
            attestation["hashes"]["invariant_matrix_canonical_sha256"],
            digest(canonical_json(matrix)),
        )
        self.assertEqual(json.loads(output.read_text(encoding="utf-8")), attestation)

        matrix["rows"] = matrix["rows"][:-1]
        self.write_json("matrix.json", matrix)
        failure = self.run_cli(*self.preseal_command(output), expected=2)
        self.assertIn("public invariant is unmapped: INV-D", failure.stderr)

        matrix = self.preseal_fixture()[2]
        matrix["rows"][1] = {
            "invariant_id": "INV-B",
            "disposition": "patched-safe",
            "unit_ids": [],
            "evidence": ["controls/unit-2.log"],
            "reason": "This leaves a scored unit orphaned",
        }
        self.write_json("matrix.json", matrix)
        failure = self.run_cli(*self.preseal_command(output), expected=2)
        self.assertIn("scored unit has no public invariant: UNIT-2", failure.stderr)

    def test_preseal_rejects_missing_control_and_invalid_weight_total(self):
        _invariants, units, matrix = self.preseal_fixture()
        (self.root / "controls" / "unit-1.log").unlink()
        units["units"][1]["weight"] = 30
        self.write_json("units.json", units)
        output = self.root / "PRESEAL_ATTESTATION.json"
        failure = self.run_cli(*self.preseal_command(output), expected=2)
        self.assertIn("unit weights total 90; expected 100", failure.stderr)
        self.assertIn("evidence artifact does not exist", failure.stderr)

        units["units"][1]["weight"] = float("nan")
        self.write_json("units.json", units)
        matrix["rows"][2]["disposition"] = "out-of-scope"
        self.write_json("matrix.json", matrix)
        failure = self.run_cli(*self.preseal_command(output), expected=2)
        self.assertIn("unit UNIT-2 has an invalid weight", failure.stderr)
        self.assertIn("matrix row 3 has an invalid disposition", failure.stderr)


class PublicationProtocolTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        parent = Path(self.temporary.name)
        self.origin = parent / "origin.git"
        self.work = parent / "work"
        self.run_git(parent, "init", "--bare", "-q", self.origin)
        self.run_git(parent, "init", "-q", self.work)
        self.run_git(self.work, "config", "user.email", "benchmark@example.invalid")
        self.run_git(self.work, "config", "user.name", "Benchmark Test")
        self.run_git(self.work, "remote", "add", "origin", str(self.origin))
        self.benchmark = self.work / "benchmarks" / "demo"

    def run_git(self, directory, *arguments):
        completed = subprocess.run(
            ["git", "-C", str(directory), *map(str, arguments)],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(
            completed.returncode,
            0,
            msg=f"git {' '.join(map(str, arguments))}\n{completed.stderr}",
        )
        return completed.stdout.strip()

    def write_json(self, relative, value):
        path = self.benchmark / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return path

    def commit(self, message):
        self.run_git(self.work, "add", "benchmarks/demo")
        self.run_git(self.work, "commit", "-q", "-m", message)
        return self.run_git(self.work, "rev-parse", "HEAD")

    def push_stage(self, stage):
        self.run_git(
            self.work,
            "push",
            "-q",
            "origin",
            f"HEAD:refs/heads/benchmark/demo/{stage}",
        )
        self.run_git(self.work, "fetch", "-q", "origin")

    def run_protocol(self, through, output=None, expected=0):
        command = [
            sys.executable,
            str(SCRIPT),
            "publication",
            "--repository",
            str(self.work),
            "--benchmark-root",
            "benchmarks/demo",
            "--benchmark-id",
            "demo",
            "--remote",
            "origin",
            "--ref-prefix",
            "benchmark/demo",
            "--through",
            through,
        ]
        if output is not None:
            command.extend(("--output", str(output)))
        completed = subprocess.run(command, text=True, capture_output=True, check=False)
        self.assertEqual(
            completed.returncode,
            expected,
            msg=f"stdout:\n{completed.stdout}\nstderr:\n{completed.stderr}",
        )
        return completed

    def create_sealed_tree(self):
        (self.benchmark / "target").mkdir(parents=True)
        (self.benchmark / "target" / "Protocol.sol").write_text(
            "contract Protocol { uint256 public reserve; }\n", encoding="utf-8"
        )
        invariants = {
            "schema_version": 1,
            "invariants": [{"id": "INV-1", "statement": "Reserve covers claims"}],
        }
        manifest = {
            "schema_version": 1,
            "files": [
                {
                    "path": "target/Protocol.sol",
                    "sha256": digest(
                        (self.benchmark / "target" / "Protocol.sol").read_bytes()
                    ),
                }
            ],
        }
        scoring = {"schema_version": 1, "weights": {"UNIT-1": 100}}
        units = {
            "schema_version": 1,
            "units": [{"id": "UNIT-1", "weight": 100}],
        }
        matrix = {
            "schema_version": 1,
            "rows": [
                {
                    "invariant_id": "INV-1",
                    "disposition": "registered-unit",
                    "unit_ids": ["UNIT-1"],
                    "evidence": ["controls/unit-1.log"],
                    "reason": "The registered unit tests reserve coverage",
                }
            ],
        }
        attestation = {
            "schema_version": 1,
            "valid": True,
            "generated_at": "2026-08-05T00:00:00Z",
            "counts": {
                "public_invariants": 1,
                "scored_units": 1,
                "matrix_rows": 1,
                "evidence_artifacts": 1,
                "dispositions": {
                    "registered-unit": 1,
                    "patched-safe": 0,
                    "negative-control": 0,
                },
            },
            "unit_weight_total": 100.0,
            "hashes": {
                "public_invariants_canonical_sha256": digest(canonical_json(invariants)),
                "units_canonical_sha256": digest(canonical_json(units)),
                "invariant_matrix_canonical_sha256": digest(canonical_json(matrix)),
                "evidence_aggregate_sha256": "a" * 64,
            },
        }
        self.units = units
        self.matrix = matrix
        self.write_json("PUBLIC_INVARIANTS.json", invariants)
        self.write_json("SOURCE_MANIFEST.json", manifest)
        self.write_json("SCORING_RULES.json", scoring)
        attestation_path = self.write_json("sealed/PRESEAL_ATTESTATION.json", attestation)
        ciphertext = self.benchmark / "sealed" / "private-bundle.tar.enc"
        ciphertext.write_bytes(b"authenticated encrypted fixture bytes\n")
        commitment = {
            "schema_version": 1,
            "ciphertext_sha256": digest(ciphertext.read_bytes()),
            "preseal_attestation_sha256": digest(attestation_path.read_bytes()),
            "invariant_matrix_sha256": digest(canonical_json(matrix)),
            "public_invariants_sha256": digest(canonical_json(invariants)),
            "source_manifest_sha256": digest(canonical_json(manifest)),
            "scoring_rules_sha256": digest(canonical_json(scoring)),
        }
        self.write_json("sealed/commitment.json", commitment)

    def copy_receipt(self, source, stage):
        destination = self.benchmark / "publication-receipts" / f"{stage}.json"
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(Path(source).read_bytes())

    def test_ordered_publication_chain_passes_all_four_stages(self):
        self.create_sealed_tree()
        self.commit("Publish sealed benchmark target")
        self.push_stage("sealed")
        sealed_receipt = Path(self.temporary.name) / "sealed.json"
        sealed = json.loads(self.run_protocol("sealed", sealed_receipt).stdout)
        self.assertEqual(sealed["later_stage_refs_absent"], ["submission", "reveal", "scoring"])

        self.copy_receipt(sealed_receipt, "sealed")
        self.write_json("submission/submission.json", {"schema_version": 1, "findings": []})
        self.commit("Publish blind submission")
        self.push_stage("submission")
        submission_receipt = Path(self.temporary.name) / "submission.json"
        self.run_protocol("submission", submission_receipt)

        self.copy_receipt(submission_receipt, "submission")
        self.write_json("reviews/consensus.json", {"schema_version": 1, "accepted": []})
        self.write_json("reveal/units.json", self.units)
        self.write_json("reveal/invariant-coverage.json", self.matrix)
        key = self.benchmark / "reveal" / "key.txt"
        key.write_text("fixture decryption key\n", encoding="utf-8")
        self.commit("Publish reveal and review consensus")
        self.push_stage("reveal")
        reveal_receipt = Path(self.temporary.name) / "reveal.json"
        self.run_protocol("reveal", reveal_receipt)

        self.copy_receipt(reveal_receipt, "reveal")
        self.write_json("scoring/final-score.json", {"schema_version": 1, "score": 0})
        self.commit("Publish final scoring")
        self.push_stage("scoring")
        final = json.loads(self.run_protocol("scoring").stdout)
        self.assertEqual(final["stage"], "scoring")
        self.assertEqual(final["verified_stage_count"], 4)
        self.assertEqual(final["later_stage_refs_absent"], [])

    def test_sealed_gate_rejects_future_paths_and_refs(self):
        self.create_sealed_tree()
        self.write_json("reveal/units.json", {"schema_version": 1, "units": []})
        self.commit("Invalid seal containing future reveal")
        self.push_stage("sealed")
        failure = self.run_protocol("sealed", expected=2)
        self.assertIn("sealed commit contains future-stage paths", failure.stderr)

        self.run_git(self.work, "rm", "-q", "-r", "benchmarks/demo/reveal")
        self.write_json("submission/submission.json", {"schema_version": 1, "findings": []})
        self.commit("Publish a future stage too early")
        self.push_stage("submission")
        self.run_git(
            self.work,
            "update-ref",
            "-d",
            "refs/remotes/origin/benchmark/demo/submission",
        )
        failure = self.run_protocol("sealed", expected=2)
        self.assertIn("future stage ref already exists", failure.stderr)

    def test_sealed_manifest_must_cover_the_exact_target_bytes(self):
        self.create_sealed_tree()
        (self.benchmark / "target" / "Protocol.sol").write_text(
            "contract Protocol { uint256 public unmanifestedChange; }\n",
            encoding="utf-8",
        )
        self.commit("Publish target with a stale source manifest")
        self.push_stage("sealed")
        failure = self.run_protocol("sealed", expected=2)
        self.assertIn("source manifest digest mismatch: target/Protocol.sol", failure.stderr)

    def test_submission_rejects_a_tampered_sealed_receipt(self):
        self.create_sealed_tree()
        self.commit("Publish sealed benchmark target")
        self.push_stage("sealed")
        receipt_path = Path(self.temporary.name) / "sealed.json"
        self.run_protocol("sealed", receipt_path)
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        receipt["commit_sha"] = "0" * 40
        self.write_json("publication-receipts/sealed.json", receipt)
        self.write_json("submission/submission.json", {"schema_version": 1, "findings": []})
        self.commit("Publish submission with a forged receipt")
        self.push_stage("submission")
        failure = self.run_protocol("submission", expected=2)
        self.assertIn("publication-receipts/sealed.json mismatch: commit_sha", failure.stderr)

        sealed_commit = self.run_git(
            self.work,
            "rev-parse",
            "refs/remotes/origin/benchmark/demo/sealed",
        )
        self.run_git(self.work, "switch", "-q", "--detach", sealed_commit)
        receipt["commit_sha"] = self.run_git(
            self.work,
            "rev-parse",
            "refs/remotes/origin/benchmark/demo/sealed",
        )
        receipt["commit_chain_sha256"] = "0" * 64
        self.write_json("publication-receipts/sealed.json", receipt)
        self.write_json("submission/submission.json", {"schema_version": 1, "findings": []})
        self.commit("Publish submission with a forged commit-chain digest")
        self.run_git(
            self.work,
            "push",
            "-q",
            "--force",
            "origin",
            "HEAD:refs/heads/benchmark/demo/submission",
        )
        self.run_git(self.work, "fetch", "-q", "origin")
        failure = self.run_protocol("submission", expected=2)
        self.assertIn(
            "publication-receipts/sealed.json mismatch: commit_chain_sha256",
            failure.stderr,
        )

    def test_submission_may_not_modify_the_sealed_target(self):
        self.create_sealed_tree()
        self.commit("Publish sealed benchmark target")
        self.push_stage("sealed")
        receipt_path = Path(self.temporary.name) / "sealed.json"
        self.run_protocol("sealed", receipt_path)

        self.copy_receipt(receipt_path, "sealed")
        self.write_json("submission/submission.json", {"schema_version": 1, "findings": []})
        (self.benchmark / "target" / "Protocol.sol").write_text(
            "contract Protocol { uint256 public reserve; uint256 public debt; }\n",
            encoding="utf-8",
        )
        self.commit("Attempt to change the target with the submission")
        self.push_stage("submission")
        failure = self.run_protocol("submission", expected=2)
        self.assertIn("submission commit modifies frozen or out-of-stage paths", failure.stderr)
        self.assertIn("M:target/Protocol.sol", failure.stderr)

    def test_reveal_must_match_the_presealed_units_and_matrix(self):
        self.create_sealed_tree()
        self.commit("Publish sealed benchmark target")
        self.push_stage("sealed")
        sealed_receipt = Path(self.temporary.name) / "sealed.json"
        self.run_protocol("sealed", sealed_receipt)

        self.copy_receipt(sealed_receipt, "sealed")
        self.write_json("submission/submission.json", {"schema_version": 1, "findings": []})
        self.commit("Publish blind submission")
        self.push_stage("submission")
        submission_receipt = Path(self.temporary.name) / "submission.json"
        self.run_protocol("submission", submission_receipt)

        self.copy_receipt(submission_receipt, "submission")
        self.write_json("reviews/consensus.json", {"schema_version": 1, "accepted": []})
        wrong_units = json.loads(json.dumps(self.units))
        wrong_units["units"][0]["weight"] = 99
        self.write_json("reveal/units.json", wrong_units)
        self.write_json("reveal/invariant-coverage.json", self.matrix)
        key = self.benchmark / "reveal" / "key.txt"
        key.write_text("fixture decryption key\n", encoding="utf-8")
        self.commit("Attempt to publish a mismatched reveal")
        self.push_stage("reveal")
        failure = self.run_protocol("reveal", expected=2)
        self.assertIn("revealed units do not match the pre-seal commitment", failure.stderr)


if __name__ == "__main__":
    unittest.main()
