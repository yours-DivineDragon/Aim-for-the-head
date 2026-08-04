import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scoringDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scoringDir, "../..");
const regressionRoot = path.join(root, "regression-v2");
let assertions = 0;

function eq(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}

function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

function approx(actual, expected, message, epsilon = 1e-12) {
  assertions += 1;
  assert.ok(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
}

async function readJson(relative) {
  return JSON.parse(await readFile(path.join(root, relative), "utf8"));
}

async function digest(relative) {
  return createHash("sha256")
    .update(await readFile(path.join(root, relative)))
    .digest("hex");
}

const results = await readJson("regression-v2/scoring/results.json");
const comparison = await readJson("regression-v2/scoring/comparison.json");
const truth = await readJson("reveal/ground-truth-package/ground-truth.json");
const submission = await readJson("regression-v2/submission/candidates.json");
const seal = await readJson("regression-v2/submission/submission-seal.json");
const baseline = await readJson("baseline-record.json");
const hiddenSummary = await readJson("regression-v2/scoring/hidden-suite-summary.json");
const hiddenLog = await readFile(path.join(scoringDir, "hidden-suite.log"), "utf8");

eq(results.run_kind, "same-target-revealed-regression", "run label");
ok(results.interpretation.includes("must not be represented as blind"), "contamination warning");
eq(submission.novelty_claimed, false, "no novelty claim");
eq(submission.candidate_count, 15, "declared candidate count");
eq(submission.candidates.length, 15, "candidate population");
eq(truth.findings.length, 15, "truth population");
eq(new Set(submission.candidates.map(item => item.id)).size, 15, "unique candidate IDs");
eq(new Set(truth.findings.map(item => item.id)).size, 15, "unique truth IDs");

eq(results.inputs.ground_truth_sha256, await digest("reveal/ground-truth-package/ground-truth.json"), "truth hash");
eq(results.inputs.candidate_submission_sha256, await digest("regression-v2/submission/candidates.json"), "candidate hash");
eq(results.inputs.submission_seal_sha256, await digest("regression-v2/submission/submission-seal.json"), "seal hash");
eq(results.inputs.hidden_suite_log_sha256, await digest("regression-v2/scoring/hidden-suite.log"), "hidden log hash");

const sealLines = [];
for (const [relative, expected] of Object.entries(seal.files)) {
  const actual = createHash("sha256")
    .update(await readFile(path.join(regressionRoot, relative)))
    .digest("hex");
  eq(actual, expected, `sealed file ${relative}`);
  sealLines.push(`${actual}  ${relative}\n`);
}
eq(Object.keys(seal.files).length, seal.file_count, "sealed file count");
eq(
  createHash("sha256").update(sealLines.join("")).digest("hex"),
  seal.aggregate_sha256,
  "seal aggregate"
);
eq(results.inputs.sealed_submission_aggregate_sha256, seal.aggregate_sha256, "result references aggregate");
ok(new Date(seal.sealed_at) < new Date(hiddenSummary.started_at), "submission precedes reveal validation run");
eq(results.canonical_validation.submission_sealed_before_validation, true, "recorded ordering");
eq(hiddenSummary.exit_code, 0, "canonical suite exit");
ok(/ℹ tests 30/.test(hiddenLog), "canonical test count in log");
ok(/ℹ pass 30/.test(hiddenLog), "canonical pass count in log");
ok(/ℹ fail 0/.test(hiddenLog), "canonical failure count in log");
eq(results.canonical_validation, {
  submission_sealed_before_validation: true,
  reproductions_passed: 15,
  controls_passed: 15,
  failed: 0,
  evidence: "regression-v2/scoring/hidden-suite.log"
}, "canonical validation summary");

const mapping = new Map([
  ["F-01", "R2-01"], ["F-02", "R2-02"], ["F-03", "R2-03"],
  ["F-04", "R2-04"], ["F-05", "R2-05"], ["F-06", "R2-06"],
  ["F-07", "R2-07"], ["F-08", "R2-08"], ["F-09", "R2-09"],
  ["F-10", "R2-10"], ["F-11", "R2-11"], ["F-12", "R2-12"],
  ["F-13", "R2-13"], ["F-14", "R2-14"], ["F-15", "R2-15"]
]);
const truthById = new Map(truth.findings.map(item => [item.id, item]));
const candidateById = new Map(submission.candidates.map(item => [item.id, item]));
eq(results.matches.length, 15, "match count");
eq(new Set(results.matches.map(item => item.truth_id)).size, 15, "one truth per match");
eq(new Set(results.matches.map(item => item.candidate_id)).size, 15, "one candidate per match");
for (const item of results.matches) {
  const canonical = truthById.get(item.truth_id);
  const candidate = candidateById.get(item.candidate_id);
  ok(canonical, `canonical ${item.truth_id}`);
  ok(candidate, `candidate ${item.candidate_id}`);
  eq(mapping.get(item.truth_id), item.candidate_id, `adjudicated mapping ${item.truth_id}`);
  eq(item.match, "exact", `exact ${item.truth_id}`);
  eq(item.credit, 1, `credit ${item.truth_id}`);
  eq(item.canonical_severity, canonical.severity.toLowerCase(), `canonical severity ${item.truth_id}`);
  eq(item.candidate_severity, candidate.severity.toLowerCase(), `candidate severity ${item.truth_id}`);
  eq(item.rubric_points_awarded, canonical.scoring_rubric.max_points, `points ${item.truth_id}`);
  eq(item.rubric_points_maximum, canonical.scoring_rubric.max_points, `maximum ${item.truth_id}`);
  ok(item.rationale.length > 40, `substantive rationale ${item.truth_id}`);
  ok(candidate.negative_control.length > 20, `negative control ${item.candidate_id}`);
  ok(candidate.demonstrated_impact.length > 20, `impact ${item.candidate_id}`);
}

eq(results.counts, {
  truth_units: 15,
  raw_claims: 15,
  unique_candidate_clusters: 15,
  exact_matches: 15,
  partial_matches: 0,
  misses: 0,
  false_positive_clusters: 0,
  duplicate_claims: 0,
  novel_valid_clusters: 0
}, "population counts");

const weights = { critical: 8, high: 4, medium: 2, low: 1 };
const weightedTruth = results.matches.reduce((sum, item) => sum + weights[item.canonical_severity], 0);
eq(weightedTruth, 62, "weighted truth denominator");
eq(results.metrics.exact_recall, { numerator: 15, denominator: 15, decimal: 1 }, "exact recall");
eq(results.metrics.credit_recall, { numerator: 15, denominator: 15, decimal: 1 }, "credit recall");
eq(results.metrics.severity_weighted_recall, { numerator: 62, denominator: 62, decimal: 1 }, "weighted recall");
eq(results.metrics.unique_precision, { numerator: 15, denominator: 15, decimal: 1 }, "unique precision");
eq(results.metrics.raw_precision, { numerator: 15, denominator: 15, decimal: 1 }, "raw precision");
eq(results.metrics.duplicate_rate.decimal, 0, "duplicate rate");
eq(results.metrics.claim_false_positive_rate.decimal, 0, "false-positive rate");
eq(results.metrics.severity_calibration.decimal, 1, "severity calibration");
eq(results.metrics.severity_calibration.weighted_absolute_rank_error, 0, "severity error");

const rubricAwarded = results.secondary_104_point_rubric.per_truth.reduce((sum, item) => sum + item.awarded, 0);
const rubricMaximum = results.secondary_104_point_rubric.per_truth.reduce((sum, item) => sum + item.maximum, 0);
eq(rubricAwarded, 104, "rubric award sum");
eq(rubricMaximum, 104, "rubric maximum sum");
eq(results.secondary_104_point_rubric.awarded, 104, "rubric awarded");
eq(results.secondary_104_point_rubric.maximum, 104, "rubric maximum");
eq(results.secondary_104_point_rubric.false_positive_deductions, 0, "rubric FP deduction");

eq(results.comparison_to_blind_baseline, comparison, "standalone comparison equality");
const deltas = comparison.metrics;
approx(deltas.exact_recall.delta, 1 - baseline.result.exact_recall, "exact delta");
approx(deltas.credit_recall.delta, 1 - baseline.result.credit_recall, "credit delta");
approx(deltas.severity_weighted_recall.delta, 1 - baseline.result.severity_weighted_recall, "weighted delta");
approx(deltas.unique_precision.delta, 1 - baseline.result.unique_precision, "precision delta");
eq(deltas.claim_false_positive_rate.delta, 0, "FP delta");
eq(deltas.secondary_rubric_points.delta, 38, "rubric point delta");
eq(comparison.disposition_change.upgraded_truth_ids.partial_to_exact.sort(), ["F-03", "F-04"], "partial upgrades");
eq(comparison.disposition_change.upgraded_truth_ids.miss_to_exact.sort(), ["F-01", "F-06", "F-07", "F-14"], "miss upgrades");
for (const family of results.family_breakdown) {
  eq(family.regression_v2.exact_recall, 1, `${family.family} exact recall`);
  eq(family.regression_v2.credit_recall, 1, `${family.family} credit recall`);
  eq(family.regression_v2.rubric_fraction, 1, `${family.family} rubric`);
}

const terminalCheck = spawnSync(
  "python3",
  ["../../scripts/goal_state.py", "check", "--dir", "regression-v2/goal-state", "--phase", "terminal"],
  { cwd: root, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } }
);
eq(terminalCheck.status, 0, "workflow-v2 terminal helper exit");
ok(terminalCheck.stdout.includes('"valid": true'), "workflow-v2 terminal validity");
const manifestCheck = spawnSync(
  process.execPath,
  ["regression-v2/scripts/verify-source-manifest.mjs"],
  { cwd: root, encoding: "utf8" }
);
eq(manifestCheck.status, 0, "frozen source manifest exit");
ok(manifestCheck.stdout.includes(submission.source_manifest_digest), "frozen source digest");

process.stdout.write(JSON.stringify({
  status: "passed",
  assertions,
  sealed_files: seal.file_count,
  exact: 15,
  false_positives: 0,
  rubric: "104/104"
}) + "\n");
