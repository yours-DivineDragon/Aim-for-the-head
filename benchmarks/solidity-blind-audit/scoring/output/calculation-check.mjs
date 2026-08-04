import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(outputDir, "..");
let assertions = 0;

function ok(value, message) {
  assertions += 1;
  assert.ok(value, message);
}

function eq(actual, expected, message) {
  assertions += 1;
  assert.deepEqual(actual, expected, message);
}

function approx(actual, expected, message, epsilon = 1e-11) {
  assertions += 1;
  assert.ok(
    Number.isFinite(actual) && Math.abs(actual - expected) <= epsilon,
    message + ": expected " + expected + ", got " + actual
  );
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function sha256(relativePath) {
  return createHash("sha256")
    .update(readFileSync(resolve(root, relativePath)))
    .digest("hex");
}

function unique(values) {
  return new Set(values).size === values.length;
}

function listFilesRecursively(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const full = resolve(directory, entry);
    if (statSync(full).isDirectory()) files.push(...listFilesRecursively(full));
    else files.push(full);
  }
  return files;
}

const match = readJson("output/match-adjudication.json");
const results = readJson("output/results.json");
const log = readJson("output/consensus-log.json");
const truth = readJson("inputs/canonical/ground-truth.json");
const grading = readJson("inputs/canonical/grading-schema.json");
const scoring = readJson("inputs/canonical/preregistered-scoring.json");
const candidates = readJson("inputs/canonical/candidates.json");
const blind = readJson("inputs/canonical/blind-consensus.json");
const resources = readJson("inputs/canonical/resource-metrics.json");
const metadata = readJson("inputs/canonical/metadata.json");

// Parse every JSON input and assert the frozen population.
const inputJsonFiles = listFilesRecursively(resolve(root, "inputs"))
  .filter((file) => file.endsWith(".json"));
eq(inputJsonFiles.length, 12, "input JSON file count");
for (const file of inputJsonFiles) {
  JSON.parse(readFileSync(file, "utf8"));
  assertions += 1;
}

// Recheck every actual-layout input inventory entry.
const inventoryLines = readFileSync(
  resolve(root, "output/input-hashes.sha256"),
  "utf8"
).trim().split(/\n/);
eq(inventoryLines.length, 73, "input hash inventory entry count");
const inventoryPaths = [];
for (const line of inventoryLines) {
  const parsed = line.match(/^([0-9a-f]{64})  (.+)$/);
  ok(parsed, "valid sha256sum inventory line");
  const [, expected, relativePath] = parsed;
  inventoryPaths.push(relativePath);
  ok(existsSync(resolve(root, relativePath)), "inventory path exists: " + relativePath);
  eq(sha256(relativePath), expected, "inventory hash: " + relativePath);
}
ok(unique(inventoryPaths), "inventory paths are unique");

// Verify supplied commitments and the canonical metadata commitment.
for (const item of match.input_verification.supplied_hashes) {
  eq(sha256(item.path), item.expected_sha256, "supplied artifact hash: " + item.path);
  eq(item.expected_sha256, item.actual_sha256, "recorded hash equality: " + item.path);
  eq(item.match, true, "recorded hash status: " + item.path);
}
eq(sha256("inputs/canonical/ground-truth.json"), metadata.ground_truth_sha256,
  "metadata ground-truth commitment");
eq(sha256("inputs/canonical/candidates.json"),
  match.input_verification.canonical_commitments.candidates_sha256,
  "candidate commitment");
eq(sha256("inputs/canonical/blind-consensus.json"),
  match.input_verification.canonical_commitments.blind_consensus_sha256,
  "blind-consensus commitment");

// The two scorer manifests are identical and verify after canonical-prefix normalization.
const scorerManifestA = readFileSync(
  resolve(root, "inputs/scorer-a/input-hashes.sha256"), "utf8"
);
const scorerManifestB = readFileSync(
  resolve(root, "inputs/scorer-b/input-hashes.sha256"), "utf8"
);
eq(scorerManifestA, scorerManifestB, "scorer input manifests are identical");
const scorerManifestLines = scorerManifestA.trim().split(/\n/);
eq(scorerManifestLines.length, 65, "scorer manifest entry count");
for (const line of scorerManifestLines) {
  const parsed = line.match(/^([0-9a-f]{64})  inputs\/(.+)$/);
  ok(parsed, "valid scorer manifest line");
  const normalized = "inputs/canonical/" + parsed[2];
  ok(existsSync(resolve(root, normalized)), "normalized scorer path exists: " + normalized);
  eq(sha256(normalized), parsed[1], "normalized scorer hash: " + normalized);
}

const truthUnits = match.truth_units;
const candidateUnits = match.candidate_dispositions;
eq(truthUnits.length, 15, "adjudicated truth-unit count");
eq(candidateUnits.length, 11, "candidate disposition count");
eq(truth.findings.length, 15, "canonical truth-unit count");
eq(candidates.candidates.length, 11, "canonical candidate count");
ok(unique(truthUnits.map((item) => item.truth_id)), "truth IDs are unique");
ok(unique(candidateUnits.map((item) => item.candidate_id)), "candidate IDs are unique");
eq(
  [...truthUnits.map((item) => item.truth_id)].sort(),
  [...truth.findings.map((item) => item.id)].sort(),
  "adjudicated truth IDs equal canonical truth IDs"
);
eq(
  [...candidateUnits.map((item) => item.candidate_id)].sort(),
  [...candidates.candidates.map((item) => item.id)].sort(),
  "adjudicated candidate IDs equal canonical candidate IDs"
);

const truthById = new Map(truthUnits.map((item) => [item.truth_id, item]));
const candidateById = new Map(candidateUnits.map((item) => [item.candidate_id, item]));
const canonicalTruthById = new Map(truth.findings.map((item) => [item.id, item]));
const blindById = new Map(blind.candidates.map((item) => [item.id, item]));

for (const item of truthUnits) {
  const canonical = canonicalTruthById.get(item.truth_id);
  eq(item.title, canonical.title, "canonical title: " + item.truth_id);
  eq(item.class, canonical.class, "canonical class: " + item.truth_id);
  eq(item.canonical_severity, canonical.severity.toLowerCase(),
    "canonical severity: " + item.truth_id);
  eq(item.rubric_points.maximum, canonical.scoring_rubric.max_points,
    "canonical point maximum: " + item.truth_id);
  if (item.match === "miss") {
    eq(item.assigned_candidate_id, null, "miss has no assigned candidate: " + item.truth_id);
    eq(item.match_credit, 0, "miss credit: " + item.truth_id);
  } else {
    ok(item.assigned_candidate_id !== null, "matched truth has candidate: " + item.truth_id);
    eq(candidateById.get(item.assigned_candidate_id).assigned_truth_id, item.truth_id,
      "reciprocal candidate mapping: " + item.truth_id);
    eq(item.match_credit, item.match === "exact" ? 1 : 0.5,
      "match credit: " + item.truth_id);
  }
  ok(item.rubric_points.awarded <= item.rubric_points.maximum,
    "points do not exceed maximum: " + item.truth_id);
  if (item.rubric_points.cap_binding) {
    ok(item.rubric_points.awarded <= item.rubric_points.cap,
      "binding severity cap: " + item.truth_id);
  }
}

const assignedCandidateIds = truthUnits
  .map((item) => item.assigned_candidate_id)
  .filter((item) => item !== null);
ok(unique(assignedCandidateIds), "assigned candidates are one-to-one");
eq(assignedCandidateIds.length, 11, "every candidate is assigned exactly once");

for (const item of candidateUnits) {
  const blindItem = blindById.get(item.candidate_id);
  eq(item.consensus_status, blindItem.final_status,
    "candidate consensus status: " + item.candidate_id);
  eq(item.scope, blindItem.scope.decision, "candidate scope: " + item.candidate_id);
  eq(item.consensus_severity, blindItem.final_severity.level,
    "candidate consensus severity: " + item.candidate_id);
  eq(item.duplicate, false, "no duplicate candidate: " + item.candidate_id);
  eq(item.false_positive, false, "no false-positive candidate: " + item.candidate_id);
  eq(item.novel_valid, false, "no novel-valid candidate: " + item.candidate_id);
  const truthItem = truthById.get(item.assigned_truth_id);
  eq(truthItem.assigned_candidate_id, item.candidate_id,
    "reciprocal truth mapping: " + item.candidate_id);
  eq(item.disposition, truthItem.match + "_match",
    "candidate disposition matches truth: " + item.candidate_id);
  eq(item.precision_credit, truthItem.match_credit,
    "candidate precision credit: " + item.candidate_id);
}

// Explicitly preserve the F-01 composed-chain and C-011 anti-inflation decisions.
const f01 = truthById.get("F-01");
eq(f01.match, "miss", "F-01 is missed");
eq(f01.assigned_candidate_id, null, "F-01 has no candidate");
eq(f01.chain_handling.chain_oracle_demonstrated, false, "F-01 oracle absent");
eq(candidateById.get("C-008").assigned_truth_id, "F-02", "C-008 scores only F-02");
eq(candidateById.get("C-011").assigned_truth_id, "F-03", "C-011 scores only F-03");
eq(candidateById.get("C-011").disposition, "partial_match", "C-011 is partial");
eq(candidateById.get("C-011").novel_valid, false, "C-011 not double counted");

const counts = { exact: 0, partial: 0, miss: 0 };
for (const item of truthUnits) counts[item.match] += 1;
eq(counts, { exact: 9, partial: 2, miss: 4 }, "truth disposition counts");
eq(counts.exact + counts.partial + counts.miss, truthUnits.length,
  "truth dispositions exhaust population");

const weights = results.raw_components.severity_weights;
const rank = results.raw_components.severity_rank_map;
const totalTruthWeight = truthUnits.reduce(
  (sum, item) => sum + weights[item.canonical_severity], 0
);
const totalCredit = truthUnits.reduce((sum, item) => sum + item.match_credit, 0);
const weightedCredit = truthUnits.reduce(
  (sum, item) => sum + weights[item.canonical_severity] * item.match_credit, 0
);
eq(totalTruthWeight, 62, "truth severity-weight denominator");
eq(totalCredit, 10, "match-credit numerator");
eq(weightedCredit, 41, "severity-weighted credit numerator");

const precisionCredit = candidateUnits.reduce(
  (sum, item) => sum + item.precision_credit, 0
);
eq(precisionCredit, 10, "precision-credit numerator");

// Recompute all registered scalar metrics.
approx(results.metrics.exact_recall.decimal, counts.exact / truthUnits.length,
  "exact recall decimal");
approx(results.metrics.credit_recall.decimal, totalCredit / truthUnits.length,
  "credit recall decimal");
approx(results.metrics.severity_weighted_recall.decimal,
  weightedCredit / totalTruthWeight, "weighted recall decimal");
approx(results.metrics.unique_precision.decimal,
  precisionCredit / candidateUnits.length, "unique precision decimal");
approx(results.metrics.raw_precision.decimal,
  precisionCredit / results.raw_components.raw_claims, "raw precision decimal");
approx(results.metrics.duplicate_rate.decimal,
  (results.raw_components.raw_claims - results.raw_components.unique_candidate_clusters)
    / results.raw_components.raw_claims,
  "duplicate rate decimal");
approx(results.metrics.claim_false_positive_rate.decimal,
  results.raw_components.false_positive_clusters
    / results.raw_components.unique_candidate_clusters,
  "false-positive rate decimal");
eq(results.metrics.exact_recall.exact_fraction, "9/15 = 3/5",
  "exact recall fraction");
eq(results.metrics.credit_recall.exact_fraction, "10/15 = 2/3",
  "credit recall fraction");
eq(results.metrics.severity_weighted_recall.exact_fraction, "41/62",
  "weighted recall fraction");
eq(results.metrics.unique_precision.exact_fraction, "10/11",
  "unique precision fraction");
eq(results.metrics.raw_precision.exact_fraction, "10/11",
  "raw precision fraction");
eq(results.metrics.duplicate_rate.exact_fraction, "0/11 = 0",
  "duplicate-rate fraction");
eq(results.metrics.claim_false_positive_rate.exact_fraction, "0/11 = 0",
  "false-positive-rate fraction");
eq(results.metrics.control_specificity.decimal, null, "control specificity is null");
eq(results.metrics.control_specificity.raw_components.intact_negative_controls, 0,
  "control specificity zero denominator");
eq(results.metrics.weighted_precision.decimal, null, "official weighted precision is null");
eq(results.metrics.weighted_f1.decimal, null, "official weighted F1 is null");

const uniquePrecisionSensitivity = precisionCredit / candidateUnits.length;
const uniqueF1 = 2 * uniquePrecisionSensitivity * (weightedCredit / totalTruthWeight)
  / (uniquePrecisionSensitivity + weightedCredit / totalTruthWeight);
approx(
  results.metrics.non_preregistered_sensitivities
    .unique_credit_precision_as_weighted_precision.weighted_precision.decimal,
  uniquePrecisionSensitivity,
  "unique-credit weighted-precision sensitivity"
);
approx(
  results.metrics.non_preregistered_sensitivities
    .unique_credit_precision_as_weighted_precision.weighted_f1.decimal,
  uniqueF1,
  "unique-credit weighted-F1 sensitivity"
);
eq(
  results.metrics.non_preregistered_sensitivities
    .unique_credit_precision_as_weighted_precision.weighted_f1.exact_fraction,
  "820/1071",
  "unique-credit weighted-F1 fraction"
);

let candidateWeightTotal = 0;
let candidateWeightedPrecisionCredit = 0;
for (const item of candidateUnits) {
  const weight = weights[item.consensus_severity];
  candidateWeightTotal += weight;
  candidateWeightedPrecisionCredit += weight * item.precision_credit;
}
eq(candidateWeightTotal, 43, "candidate severity-weight denominator");
eq(candidateWeightedPrecisionCredit, 38.5,
  "candidate severity-weighted precision numerator");
const candidateWeightedPrecision = candidateWeightedPrecisionCredit / candidateWeightTotal;
const candidateWeightedF1 =
  2 * candidateWeightedPrecision * (weightedCredit / totalTruthWeight)
  / (candidateWeightedPrecision + weightedCredit / totalTruthWeight);
approx(
  results.metrics.non_preregistered_sensitivities
    .candidate_severity_weighted_precision.weighted_precision.decimal,
  candidateWeightedPrecision,
  "candidate-weighted precision sensitivity"
);
approx(
  results.metrics.non_preregistered_sensitivities
    .candidate_severity_weighted_precision.weighted_f1.decimal,
  candidateWeightedF1,
  "candidate-weighted F1 sensitivity"
);
eq(
  results.metrics.non_preregistered_sensitivities
    .candidate_severity_weighted_precision.weighted_precision.exact_fraction,
  "(77/2)/43 = 77/86",
  "candidate-weighted precision fraction"
);
eq(
  results.metrics.non_preregistered_sensitivities
    .candidate_severity_weighted_precision.weighted_f1.exact_fraction,
  "3157/4150",
  "candidate-weighted F1 fraction"
);

// Recompute severity calibration under both disclosed weighting bases.
let canonicalCalibrationWeight = 0;
let canonicalWeightedError = 0;
let candidateWeightedError = 0;
let aligned = 0;
let overcalls = 0;
let undercalls = 0;
for (const item of truthUnits.filter((entry) => entry.assigned_candidate_id !== null)) {
  const candidate = candidateById.get(item.assigned_candidate_id);
  const delta = rank[candidate.consensus_severity] - rank[item.canonical_severity];
  const absoluteError = Math.abs(delta);
  canonicalCalibrationWeight += weights[item.canonical_severity];
  canonicalWeightedError += weights[item.canonical_severity] * absoluteError;
  candidateWeightedError += weights[candidate.consensus_severity] * absoluteError;
  if (delta === 0) aligned += 1;
  else if (delta > 0) overcalls += 1;
  else undercalls += 1;
}
eq(canonicalCalibrationWeight, 44, "canonical calibration weight");
eq(canonicalWeightedError, 14, "canonical weighted rank error");
eq(candidateWeightedError, 13, "candidate weighted rank error");
eq({ aligned, overcalls, undercalls }, { aligned: 7, overcalls: 1, undercalls: 3 },
  "severity direction counts");
approx(results.metrics.severity_calibration.decimal,
  1 - canonicalWeightedError / (3 * canonicalCalibrationWeight),
  "primary severity calibration");
approx(results.metrics.severity_calibration.reported_severity_weight_sensitivity.decimal,
  1 - candidateWeightedError / (3 * candidateWeightTotal),
  "reported-weight severity calibration sensitivity");
eq(results.metrics.severity_calibration.exact_fraction,
  "1 - 14/(3*44) = 59/66", "primary severity-calibration fraction");
eq(results.metrics.severity_calibration.reported_severity_weight_sensitivity.exact_fraction,
  "1 - 13/(3*43) = 116/129",
  "reported-weight severity-calibration fraction");

// Recompute the complete secondary rubric.
const rubric = results.secondary_104_point_rubric;
const rubricMaximum = rubric.per_truth.reduce((sum, item) => sum + item.maximum, 0);
const rubricAwarded = rubric.per_truth.reduce((sum, item) => sum + item.awarded, 0);
eq(rubricMaximum, grading.maximum_score, "rubric maximum");
eq(rubricMaximum, 104, "rubric maximum constant");
eq(rubricAwarded, 66, "rubric awarded points");
for (const item of rubric.per_truth) {
  const matched = truthById.get(item.truth_id);
  eq(item.match, matched.match, "rubric match: " + item.truth_id);
  eq(item.awarded, matched.rubric_points.awarded, "rubric award: " + item.truth_id);
  eq(item.maximum, matched.rubric_points.maximum, "rubric maximum: " + item.truth_id);
}
eq(truthById.get("F-03").rubric_points.awarded, 2, "F-03 partial-band award");
eq(truthById.get("F-04").rubric_points.awarded, 5, "F-04 partial-band award");
eq(truthById.get("F-05").rubric_points.awarded, 5, "F-05 severity cap");
eq(truthById.get("F-08").rubric_points.awarded, 5, "F-08 severity cap");
const deductions = Object.values(rubric.false_positive_deduction_components)
  .reduce((sum, item) => sum + item.deduction, 0);
eq(deductions, 0, "false-positive deductions");
eq(rubric.finding_points_before_false_positive_deductions, rubricAwarded,
  "pre-deduction rubric score");
eq(rubric.unrounded_score, rubricAwarded - deductions, "unrounded rubric score");
eq(rubric.final_score, Math.round(rubric.unrounded_score * 2) / 2,
  "half-point final rounding");
approx(rubric.decimal_fraction_of_maximum, rubric.final_score / rubric.maximum,
  "rubric score fraction");
eq(rubric.exact_fraction_of_maximum, "66/104 = 33/52",
  "rubric exact fraction");

// Severity breakdowns must aggregate back to the truth and candidate populations.
for (const row of results.severity_breakdown.by_canonical_truth_severity) {
  const members = truthUnits.filter((item) => item.canonical_severity === row.severity);
  eq(row.truth_units, members.length, "severity truth count: " + row.severity);
  eq(row.exact, members.filter((item) => item.match === "exact").length,
    "severity exact count: " + row.severity);
  eq(row.partial, members.filter((item) => item.match === "partial").length,
    "severity partial count: " + row.severity);
  eq(row.miss, members.filter((item) => item.match === "miss").length,
    "severity miss count: " + row.severity);
  if (members.length > 0) {
    const credit = members.reduce((sum, item) => sum + item.match_credit, 0);
    approx(row.credit_recall.decimal, credit / members.length,
      "severity credit recall: " + row.severity);
  } else {
    eq(row.credit_recall, null, "zero-denominator severity recall: " + row.severity);
  }
}
for (const row of results.severity_breakdown.by_candidate_consensus_severity) {
  const members = candidateUnits.filter((item) => item.consensus_severity === row.severity);
  eq(row.candidate_clusters, members.length, "candidate severity count: " + row.severity);
  const credit = members.reduce((sum, item) => sum + item.precision_credit, 0);
  approx(row.decimal, credit / members.length,
    "candidate severity precision: " + row.severity);
}

// Class breakdown is canonical and one-to-one.
eq(results.class_breakdown.length, truthUnits.length, "class-breakdown row count");
ok(unique(results.class_breakdown.map((row) => row.truth_id)),
  "class-breakdown truth IDs unique");
for (const row of results.class_breakdown) {
  const item = truthById.get(row.truth_id);
  eq(row.class, item.class, "class breakdown class: " + row.truth_id);
  eq(row.candidate_id, item.assigned_candidate_id,
    "class breakdown candidate: " + row.truth_id);
  eq(row.match, item.match, "class breakdown match: " + row.truth_id);
  eq(row.credit, item.match_credit, "class breakdown credit: " + row.truth_id);
  eq(row.points_awarded, item.rubric_points.awarded,
    "class breakdown points: " + row.truth_id);
}

// The family matrix is a strict partition, not overlapping tags.
const familyTruthIds = results.coverage_matrix.families
  .flatMap((family) => family.committed_truth_ids);
eq(familyTruthIds.length, truthUnits.length, "family allocation size");
ok(unique(familyTruthIds), "family allocation has no duplicate truth ID");
eq([...familyTruthIds].sort(), [...truthById.keys()].sort(),
  "family allocation is exhaustive");
let familyExact = 0;
let familyPartial = 0;
let familyMiss = 0;
let familyCredit = 0;
let familyAwarded = 0;
let familyMaximum = 0;
for (const family of results.coverage_matrix.families) {
  const members = family.committed_truth_ids.map((id) => truthById.get(id));
  const computed = {
    exact: members.filter((item) => item.match === "exact").length,
    partial: members.filter((item) => item.match === "partial").length,
    miss: members.filter((item) => item.match === "miss").length,
    total: members.length
  };
  eq(family.counts, computed, "family counts: " + family.family);
  const credit = members.reduce((sum, item) => sum + item.match_credit, 0);
  const awarded = members.reduce((sum, item) => sum + item.rubric_points.awarded, 0);
  const maximum = members.reduce((sum, item) => sum + item.rubric_points.maximum, 0);
  approx(family.credit_recall.decimal, credit / members.length,
    "family credit recall: " + family.family);
  eq(family.rubric_points.awarded, awarded, "family awarded points: " + family.family);
  eq(family.rubric_points.maximum, maximum, "family maximum points: " + family.family);
  familyExact += computed.exact;
  familyPartial += computed.partial;
  familyMiss += computed.miss;
  familyCredit += credit;
  familyAwarded += awarded;
  familyMaximum += maximum;
}
eq(
  { familyExact, familyPartial, familyMiss, familyCredit, familyAwarded, familyMaximum },
  {
    familyExact: 9,
    familyPartial: 2,
    familyMiss: 4,
    familyCredit: 10,
    familyAwarded: 66,
    familyMaximum: 104
  },
  "family totals"
);
eq(results.coverage_matrix.de_duplicated_totals.truth_ids, 15,
  "coverage-matrix de-duplicated truth count");

// Resource metrics must be copied from the canonical record and independently derived.
const efficiency = results.resource_efficiency;
eq(efficiency.elapsed_seconds, resources.elapsed_seconds, "elapsed seconds");
eq(efficiency.wall_clock_budget_seconds, resources.wall_clock_budget_seconds,
  "wall-clock budget");
eq(efficiency.budget_exhausted, resources.budget_exhausted, "budget exhausted");
eq(efficiency.local_counts, resources.local_counts, "local resource counts");
approx(efficiency.budget_utilization.decimal,
  resources.elapsed_seconds / resources.wall_clock_budget_seconds,
  "budget utilization");
approx(efficiency.budget_remaining_seconds.decimal,
  resources.wall_clock_budget_seconds - resources.elapsed_seconds,
  "budget remaining");
approx(efficiency.validated_candidates_per_hour.decimal,
  resources.local_counts.validated_candidates * 3600 / resources.elapsed_seconds,
  "validated candidates per hour");
approx(efficiency.exact_matches_per_hour.decimal,
  counts.exact * 3600 / resources.elapsed_seconds,
  "exact matches per hour");
approx(efficiency.match_credit_per_hour.decimal,
  totalCredit * 3600 / resources.elapsed_seconds,
  "match credit per hour");
approx(efficiency.rubric_points_per_hour.decimal,
  rubric.final_score * 3600 / resources.elapsed_seconds,
  "rubric points per hour");
approx(efficiency.mean_elapsed_seconds_per_validated_candidate.decimal,
  resources.elapsed_seconds / resources.local_counts.validated_candidates,
  "mean seconds per candidate");
approx(efficiency.completed_test_case_pass_rate.decimal,
  resources.local_counts.passed_test_cases / resources.local_counts.completed_test_cases,
  "test-case pass rate");
eq(efficiency.elapsed_exact_fraction_seconds, "336529/125",
  "elapsed exact fraction");
eq(efficiency.budget_utilization.exact_fraction, "336529/1350000",
  "budget-utilization exact fraction");
eq(efficiency.budget_remaining_seconds.exact_fraction, "1013471/125",
  "budget-remaining exact fraction");
eq(efficiency.validated_candidates_per_hour.exact_fraction, "4950000/336529",
  "candidate-throughput exact fraction");
eq(efficiency.exact_matches_per_hour.exact_fraction, "4050000/336529",
  "exact-throughput exact fraction");
eq(efficiency.match_credit_per_hour.exact_fraction, "4500000/336529",
  "credit-throughput exact fraction");
eq(efficiency.rubric_points_per_hour.exact_fraction, "29700000/336529",
  "rubric-throughput exact fraction");
eq(efficiency.mean_elapsed_seconds_per_validated_candidate.exact_fraction,
  "336529/1375", "mean-candidate-time exact fraction");
eq(efficiency.completed_test_case_pass_rate.exact_fraction, "74/76 = 37/38",
  "test-pass exact fraction");

// Raw-component and summary mirrors cannot drift.
for (const key of [
  "positive_truth_units",
  "raw_claims",
  "unique_candidate_clusters",
  "exact_matches",
  "partial_matches",
  "misses",
  "match_credit_sum",
  "severity_weighted_match_credit_sum",
  "truth_severity_weight_total",
  "novel_valid_clusters",
  "false_positive_clusters",
  "duplicate_claims",
  "duplicate_clusters"
]) {
  eq(results.raw_components[key], match.summary[key], "summary mirror: " + key);
}
eq(match.summary.rubric_points_before_deductions,
  rubric.finding_points_before_false_positive_deductions,
  "rubric pre-deduction summary mirror");
eq(match.summary.final_rubric_points, rubric.final_score,
  "rubric final summary mirror");

// Validate all machine-referenced paths.
const referencedPaths = new Set([
  match.input_verification.inventory_path,
  results.adjudication_file,
  ...results.source_paths,
  ...log.output_files,
  ...log.referenced_paths
]);
for (const item of truthUnits) for (const evidence of item.evidence) referencedPaths.add(evidence);
for (const item of candidateUnits) for (const evidence of item.evidence) referencedPaths.add(evidence);
for (const relativePath of referencedPaths) {
  ok(existsSync(resolve(root, relativePath)), "referenced path exists: " + relativePath);
}
eq(log.validation.referenced_paths_missing, 0, "recorded missing-path count");
eq(log.validation.calculation_checker_exit_code, 0, "recorded checker status");
eq(log.validation.jq_exit_code, 0, "recorded jq status");
eq(log.validation.hash_exit_code, 0, "recorded hash status");

// Confirm preregistration facts used for null and control handling.
ok(!Object.hasOwn(scoring.metrics, "weighted_precision"),
  "preregistration omits weighted_precision formula");
ok(scoring.metrics.weighted_f1.includes("weighted_precision"),
  "weighted F1 depends on missing weighted precision");
eq(results.raw_components.precommitted_public_negative_controls, 0,
  "no public negative controls");
eq(grading.maximum_score, 104, "grading maximum");

console.log(JSON.stringify({
  status: "passed",
  assertions,
  truth_units: truthUnits.length,
  candidates: candidateUnits.length,
  input_hashes_verified: inventoryLines.length,
  referenced_paths_verified: referencedPaths.size
}));
