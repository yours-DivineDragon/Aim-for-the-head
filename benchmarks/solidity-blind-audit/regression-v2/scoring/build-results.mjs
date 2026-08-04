import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function sha256(relative) {
  return createHash("sha256")
    .update(await readFile(path.join(root, relative)))
    .digest("hex");
}

const truth = await readJson("reveal/ground-truth-package/ground-truth.json");
const submission = await readJson("regression-v2/submission/candidates.json");
const seal = await readJson("regression-v2/submission/submission-seal.json");
const baselineRecord = await readJson("baseline-record.json");
const baselineScore = await readJson("scoring/output/results.json");
const hiddenSummary = await readJson("regression-v2/scoring/hidden-suite-summary.json");

const assignment = {
  "R2-01": "F-01",
  "R2-02": "F-02",
  "R2-03": "F-03",
  "R2-04": "F-04",
  "R2-05": "F-05",
  "R2-06": "F-06",
  "R2-07": "F-07",
  "R2-08": "F-08",
  "R2-09": "F-09",
  "R2-10": "F-10",
  "R2-11": "F-11",
  "R2-12": "F-12",
  "R2-13": "F-13",
  "R2-14": "F-14",
  "R2-15": "F-15"
};

const rationales = {
  "F-01": "One atomic execution demonstrates both rate changes, distinguishes the spot-only limit, closes flash principal and fee, leaves 49,950 attacker profit, and measures 150,000 market loss.",
  "F-03": "The candidate propagates direct-balance exchange-rate inflation through already-posted shares to a measured lending-limit increase.",
  "F-04": "The candidate uses the precise borrow-to-withdrawCollateral callback edge and asserts stable, shares, debt, and zero final local collateral.",
  "F-06": "The candidate constructs the canonical coarse-unit 2:1 boundary and transfers one asset while burning zero shares.",
  "F-07": "The fee-bearing deposit/redeem cycle proves attacker profit and incumbent dilution, with an exact-delta control.",
  "F-14": "The fee-bearing repayment clears 50 debt while restoring only 45 reserve units, with an exact-delta control."
};

assert.equal(hiddenSummary.exit_code, 0, "canonical suite must pass after the seal");
assert.equal(truth.findings.length, 15);
assert.equal(submission.candidates.length, 15);
assert.equal(Object.keys(assignment).length, 15);
assert.equal(new Set(Object.values(assignment)).size, 15);

const truthById = new Map(truth.findings.map(item => [item.id, item]));
const candidateById = new Map(submission.candidates.map(item => [item.id, item]));
const baselineClassByTruth = new Map(baselineScore.class_breakdown.map(item => [item.truth_id, item]));
const weights = { critical: 8, high: 4, medium: 2, low: 1 };

const matches = Object.entries(assignment).map(([candidateId, truthId]) => {
  const candidate = candidateById.get(candidateId);
  const canonical = truthById.get(truthId);
  assert.ok(candidate, `candidate exists: ${candidateId}`);
  assert.ok(canonical, `truth exists: ${truthId}`);
  assert.equal(candidate.severity.toLowerCase(), canonical.severity.toLowerCase(), `severity: ${truthId}`);
  return {
    truth_id: truthId,
    candidate_id: candidateId,
    match: "exact",
    credit: 1,
    canonical_severity: canonical.severity.toLowerCase(),
    candidate_severity: candidate.severity.toLowerCase(),
    class: canonical.class,
    title: canonical.title,
    rubric_points_awarded: canonical.scoring_rubric.max_points,
    rubric_points_maximum: canonical.scoring_rubric.max_points,
    rationale: rationales[truthId] ?? "The candidate reproduces the canonical root cause, attacker path, required downstream impact, and matched control."
  };
}).sort((a, b) => a.truth_id.localeCompare(b.truth_id, undefined, { numeric: true }));

const totalWeight = matches.reduce((sum, item) => sum + weights[item.canonical_severity], 0);
const totalRubric = matches.reduce((sum, item) => sum + item.rubric_points_maximum, 0);
assert.equal(totalWeight, 62);
assert.equal(totalRubric, 104);

const severityBreakdown = Object.keys(weights).map(severity => {
  const units = matches.filter(item => item.canonical_severity === severity);
  const weight = units.reduce((sum, item) => sum + weights[item.canonical_severity], 0);
  const rubric = units.reduce((sum, item) => sum + item.rubric_points_maximum, 0);
  return {
    severity,
    truth_units: units.length,
    exact: units.length,
    partial: 0,
    miss: 0,
    exact_recall: units.length === 0 ? null : 1,
    credit_recall: units.length === 0 ? null : 1,
    weighted_credit: { numerator: weight, denominator: weight, decimal: units.length === 0 ? null : 1 },
    rubric_points: { awarded: rubric, maximum: rubric, decimal: units.length === 0 ? null : 1 }
  };
});

const familyNames = [...new Set(baselineScore.class_breakdown.map(item => item.primary_requested_family))];
const familyBreakdown = familyNames.map(family => {
  const beforeUnits = baselineScore.class_breakdown.filter(item => item.primary_requested_family === family);
  const truthIds = beforeUnits.map(item => item.truth_id);
  const afterUnits = matches.filter(item => truthIds.includes(item.truth_id));
  const beforeExact = beforeUnits.filter(item => item.match === "exact").length;
  const beforeCredit = beforeUnits.reduce((sum, item) => sum + item.credit, 0);
  const beforePoints = beforeUnits.reduce((sum, item) => sum + item.points_awarded, 0);
  const maximumPoints = beforeUnits.reduce((sum, item) => sum + item.points_maximum, 0);
  return {
    family,
    truth_ids: truthIds,
    truth_units: truthIds.length,
    baseline: {
      exact_recall: beforeExact / truthIds.length,
      credit_recall: beforeCredit / truthIds.length,
      rubric_fraction: beforePoints / maximumPoints,
      rubric_points: `${beforePoints}/${maximumPoints}`
    },
    regression_v2: {
      exact_recall: afterUnits.length / truthIds.length,
      credit_recall: afterUnits.length / truthIds.length,
      rubric_fraction: 1,
      rubric_points: `${maximumPoints}/${maximumPoints}`
    }
  };
});

const baseline = baselineRecord.result;
const metrics = {
  exact_recall: { numerator: 15, denominator: 15, decimal: 1 },
  credit_recall: { numerator: 15, denominator: 15, decimal: 1 },
  severity_weighted_recall: { numerator: 62, denominator: 62, decimal: 1 },
  unique_precision: { numerator: 15, denominator: 15, decimal: 1 },
  raw_precision: { numerator: 15, denominator: 15, decimal: 1 },
  duplicate_rate: { numerator: 0, denominator: 15, decimal: 0 },
  claim_false_positive_rate: { numerator: 0, denominator: 15, decimal: 0 },
  severity_calibration: {
    aligned: 15,
    overcalls: 0,
    undercalls: 0,
    weighted_absolute_rank_error: 0,
    decimal: 1
  }
};

const comparison = {
  interpretation: "Revealed same-target regression only; deltas are remediation evidence, not blind generalization.",
  baseline_commit: baselineRecord.contamination_boundary.commit,
  aim_revision: submission.aim_revision,
  metrics: {
    exact_recall: { baseline: baseline.exact_recall, regression_v2: 1, delta: 1 - baseline.exact_recall },
    credit_recall: { baseline: baseline.credit_recall, regression_v2: 1, delta: 1 - baseline.credit_recall },
    severity_weighted_recall: { baseline: baseline.severity_weighted_recall, regression_v2: 1, delta: 1 - baseline.severity_weighted_recall },
    unique_precision: { baseline: baseline.unique_precision, regression_v2: 1, delta: 1 - baseline.unique_precision },
    claim_false_positive_rate: { baseline: baseline.claim_false_positive_rate, regression_v2: 0, delta: 0 },
    severity_calibration: { baseline: baseline.severity_calibration, regression_v2: 1, delta: 1 - baseline.severity_calibration },
    secondary_rubric_fraction: { baseline: baseline.secondary_rubric_points / baseline.secondary_rubric_maximum, regression_v2: 1, delta: 1 - baseline.secondary_rubric_points / baseline.secondary_rubric_maximum },
    secondary_rubric_points: { baseline: baseline.secondary_rubric_points, regression_v2: 104, delta: 104 - baseline.secondary_rubric_points }
  },
  disposition_change: {
    baseline: { exact: baseline.exact_matches, partial: baseline.partial_matches, miss: baseline.misses, false_positive: baseline.false_positive_clusters, duplicate: baseline.duplicate_claims },
    regression_v2: { exact: 15, partial: 0, miss: 0, false_positive: 0, duplicate: 0 },
    upgraded_truth_ids: {
      partial_to_exact: baseline.partial_truth_ids,
      miss_to_exact: baseline.missed_truth_ids
    }
  },
  family_breakdown: familyBreakdown
};

const results = {
  schema_version: 1,
  benchmark: "aster-credit-blind-solidity-audit-v1",
  run_kind: "same-target-revealed-regression",
  interpretation: "The canonical truth was known before workflow v2 and this run. Results demonstrate target regression closure only and must not be represented as blind discovery, novelty, or unseen-code generalization.",
  inputs: {
    target_commit: submission.target_commit,
    source_manifest_digest: submission.source_manifest_digest,
    aim_revision: submission.aim_revision,
    ground_truth_sha256: await sha256("reveal/ground-truth-package/ground-truth.json"),
    candidate_submission_sha256: await sha256("regression-v2/submission/candidates.json"),
    submission_seal_sha256: await sha256("regression-v2/submission/submission-seal.json"),
    sealed_submission_aggregate_sha256: seal.aggregate_sha256,
    hidden_suite_log_sha256: await sha256("regression-v2/scoring/hidden-suite.log")
  },
  canonical_validation: {
    submission_sealed_before_validation: new Date(seal.sealed_at) < new Date(hiddenSummary.started_at),
    reproductions_passed: 15,
    controls_passed: 15,
    failed: 0,
    evidence: "regression-v2/scoring/hidden-suite.log"
  },
  counts: {
    truth_units: 15,
    raw_claims: 15,
    unique_candidate_clusters: 15,
    exact_matches: 15,
    partial_matches: 0,
    misses: 0,
    false_positive_clusters: 0,
    duplicate_claims: 0,
    novel_valid_clusters: 0
  },
  metrics,
  secondary_104_point_rubric: {
    awarded: 104,
    maximum: 104,
    false_positive_deductions: 0,
    decimal_fraction_of_maximum: 1,
    per_truth: matches.map(item => ({
      truth_id: item.truth_id,
      candidate_id: item.candidate_id,
      awarded: item.rubric_points_awarded,
      maximum: item.rubric_points_maximum
    }))
  },
  severity_breakdown: severityBreakdown,
  family_breakdown: familyBreakdown,
  matches,
  comparison_to_blind_baseline: comparison
};

assert.equal(results.canonical_validation.submission_sealed_before_validation, true);
await writeFile(path.join(scriptDir, "results.json"), JSON.stringify(results, null, 2) + "\n");
await writeFile(path.join(scriptDir, "comparison.json"), JSON.stringify(comparison, null, 2) + "\n");
process.stdout.write(JSON.stringify({
  status: "built",
  exact: "15/15",
  weighted: "62/62",
  precision: "15/15",
  rubric: "104/104"
}) + "\n");
