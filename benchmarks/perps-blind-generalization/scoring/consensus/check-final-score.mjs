import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const consensusRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(consensusRoot, '..', '..');
const repositoryRoot = path.resolve(benchmarkRoot, '..', '..');
const readJson = (relative) => JSON.parse(fs.readFileSync(path.join(benchmarkRoot, relative), 'utf8'));
const hash = (filename) => crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
const score = readJson('scoring/consensus/final-score.json');
const matrix = readJson('scoring/consensus/MATCH_MATRIX.json');
const truth = readJson('reveal/canonical/truth/units.json');
const submission = readJson('blind-run/submission.json');
const consensus = readJson('blind-review/consensus/consensus.json');
const reruns = readJson('scoring/consensus/rerun-summary.json');

const expectedInputs = {
  scorerCommit: 'a3ba6036d5c7b7902f775fd80ef4a6eccdf7c63f',
  truthPlaintextCommitmentSha256: 'fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e',
  consensusSha256: 'ba5d60af575433b6f730ca1e59b961a00dedfda67da416b25c3ea6370e3b2696',
  scorerAScoreSha256: '01035f9e76c4707bba4912fda4dc99777e414b41025eb0d52bb668b719fbb98f',
  scorerBScoreSha256: '756e9984b7168567b971a6c73ae1c23910ce3a04b7ba59d302cfaafb4d059aa9',
  submissionSha256: 'c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef',
  sourceAggregateSha256: 'bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381',
  revealAggregateSha256: 'dc808f47d8fc293a7f811d4f3b24622ad27387d9d7b95d5b2d692ee06430b03c',
};
assert.deepEqual(score.inputs, expectedInputs);
assert.equal(hash(path.join(benchmarkRoot, 'blind-review/consensus/consensus.json')), expectedInputs.consensusSha256);
assert.equal(hash(path.join(benchmarkRoot, 'scoring/scorer-a/score.json')), expectedInputs.scorerAScoreSha256);
assert.equal(hash(path.join(benchmarkRoot, 'scoring/scorer-b/score.json')), expectedInputs.scorerBScoreSha256);
assert.equal(hash(path.join(benchmarkRoot, 'blind-run/submission.json')), expectedInputs.submissionSha256);
assert.equal(readJson('SOURCE_MANIFEST.json').aggregateSha256, expectedInputs.sourceAggregateSha256);
assert.equal(readJson('reveal/REVEAL_MANIFEST.json').aggregateSha256, expectedInputs.revealAggregateSha256);

const expectedTruthIds = Array.from({ length: 15 }, (_, index) => `MCB-${String(index + 1).padStart(3, '0')}`);
const expectedCandidateIds = Array.from({ length: 25 }, (_, index) => `AFH-${String(index + 1).padStart(3, '0')}`);
assert.deepEqual(truth.units.map((unit) => unit.id), expectedTruthIds);
assert.deepEqual(score.truthUnits.map((unit) => unit.id), expectedTruthIds);
assert.deepEqual(matrix.truthUnits.map((unit) => unit.id), expectedTruthIds);
assert.deepEqual(submission.candidates.map((candidate) => candidate.id), expectedCandidateIds);
assert.deepEqual(score.candidates.map((candidate) => candidate.id), expectedCandidateIds);
assert.deepEqual(matrix.candidates.map((candidate) => candidate.id), expectedCandidateIds);
assert.equal(new Set(score.truthUnits.map((unit) => unit.id)).size, 15);
assert.equal(new Set(score.candidates.map((candidate) => candidate.id)).size, 25);
assert.equal(truth.units.reduce((sum, unit) => sum + unit.weight, 0), 100);

const truthById = Object.fromEntries(truth.units.map((unit) => [unit.id, unit]));
for (const unit of score.truthUnits) {
  const canonical = truthById[unit.id];
  assert.equal(unit.canonicalClass, canonical.class);
  assert.equal(unit.severity, canonical.severity);
  assert.equal(unit.weight, canonical.weight);
  assert.ok([0, 0.3, 0.6, 1].includes(unit.factor));
  assert.equal(unit.points, unit.weight * unit.factor);
  assert.equal(unit.outcome, unit.factor === 1 ? 'exact' : unit.factor === 0.6 ? 'factor_0.6' : unit.factor === 0.3 ? 'fragment_0.3' : 'missed');
}

const factors = Object.fromEntries(score.truthUnits.map((unit) => [unit.id, unit.factor]));
assert.deepEqual(factors, {
  'MCB-001': 1, 'MCB-002': 1, 'MCB-003': 1, 'MCB-004': 1, 'MCB-005': 1,
  'MCB-006': 0, 'MCB-007': 1, 'MCB-008': 1, 'MCB-009': 1, 'MCB-010': 1,
  'MCB-011': 1, 'MCB-012': 1, 'MCB-013': 1, 'MCB-014': 1, 'MCB-015': 0.3,
});
const primaryIds = score.truthUnits.filter((unit) => unit.primaryCandidate).map((unit) => unit.primaryCandidate);
assert.equal(primaryIds.length, 14);
assert.equal(new Set(primaryIds).size, 14);
assert.ok(!primaryIds.includes('AFH-008'));
assert.equal(score.truthUnits.find((unit) => unit.id === 'MCB-015').primaryCandidate, 'AFH-012');

const classifications = Object.groupBy(score.candidates, (candidate) => candidate.classification);
assert.equal(classifications.primary_matched.length, 14);
assert.equal(classifications.valid_unregistered.length, 11);
assert.equal(classifications.supporting_or_duplicate, undefined);
assert.equal(classifications.false_positive, undefined);
assert.deepEqual(classifications.valid_unregistered.map((candidate) => candidate.id), ['AFH-003', 'AFH-008', 'AFH-015', 'AFH-016', 'AFH-017', 'AFH-019', 'AFH-020', 'AFH-022', 'AFH-023', 'AFH-024', 'AFH-025']);
assert.equal(new Set(score.candidates.map((candidate) => candidate.dedupCluster)).size, 25);
for (const candidate of score.candidates) {
  assert.equal(hash(path.join(benchmarkRoot, candidate.evidencePath)), candidate.evidenceSha256);
  if (candidate.classification === 'primary_matched') {
    const unit = score.truthUnits.find((item) => item.id === candidate.matchedTruthId);
    assert.ok(unit);
    assert.equal(unit.primaryCandidate, candidate.id);
    assert.equal(candidate.matchFactor, unit.factor);
  } else if (candidate.classification === 'valid_unregistered') {
    assert.equal(candidate.matchedTruthId, null);
    assert.equal(candidate.matchFactor, 0);
    assert.ok(candidate.validation.root.length > 20);
    assert.ok(candidate.validation.distinctFromTruth.length > 20);
    assert.ok(candidate.validation.distinguishingRepair.length > 20);
    assert.ok(candidate.validation.evidence.length > 20);
  }
}

const exact = score.truthUnits.filter((unit) => unit.factor === 1).length;
const factor06 = score.truthUnits.filter((unit) => unit.factor === 0.6).length;
const factor03 = score.truthUnits.filter((unit) => unit.factor === 0.3).length;
const missed = score.truthUnits.filter((unit) => unit.factor === 0).length;
const credited = score.truthUnits.filter((unit) => unit.factor > 0).length;
const factorSum = score.truthUnits.reduce((sum, unit) => sum + unit.factor, 0);
const points = score.truthUnits.reduce((sum, unit) => sum + unit.points, 0);
assert.deepEqual({ exact, factor06, factor03, missed }, { exact: 13, factor06: 0, factor03: 1, missed: 1 });
assert.equal(credited, 14);
assert.equal(factorSum, 13.3);
assert.equal(points, 89.4);
assert.equal(score.metrics.truth.rawRecall, 14 / 15);
assert.equal(score.metrics.truth.factorNormalizedRecall, 13.3 / 15);
assert.equal(score.metrics.truth.scorePercent, 89.4);

for (const rollup of [...score.metrics.canonicalClassRollups, ...score.metrics.familyRollups]) {
  const units = score.truthUnits.filter((unit) => rollup.truthIds.includes(unit.id));
  assert.equal(rollup.truthIds.length, new Set(rollup.truthIds).size);
  assert.equal(rollup.rawRecallNumerator, units.filter((unit) => unit.factor > 0).length);
  assert.equal(rollup.rawRecallDenominator, units.length);
  assert.equal(rollup.factorNormalizedRecall, units.reduce((sum, unit) => sum + unit.factor, 0) / units.length);
  assert.equal(rollup.earnedPoints, units.reduce((sum, unit) => sum + unit.points, 0));
  assert.equal(rollup.availablePoints, units.reduce((sum, unit) => sum + unit.weight, 0));
}
assert.deepEqual(score.metrics.familyRollups.map((rollup) => rollup.tag), ['business-logic', 'composed', 'cross-contract', 'integration', 'niche', 'access', 'reentrancy']);
assert.deepEqual(score.metrics.candidateClassification, { primary_matched: 14, supporting_or_duplicate: 0, valid_unregistered: 11, false_positive: 0, total: 25 });
assert.deepEqual(score.metrics.precision, {
  rawNumerator: 25, rawDenominator: 25, raw: 1,
  deduplicatedNumerator: 25, deduplicatedDenominator: 25, deduplicated: 1,
  distinctClusters: 25, validUnregisteredGeneratorMisses: 11, supportingOrDuplicate: 0, falsePositives: 0,
});

const verdictById = Object.fromEntries(consensus.verdicts.map((verdict) => [verdict.id, verdict]));
const creditedUnits = score.truthUnits.filter((unit) => unit.factor > 0);
const severityCorrect = creditedUnits.filter((unit) => verdictById[unit.primaryCandidate].final_severity === unit.severity).length;
assert.equal(severityCorrect, 9);
assert.equal(score.metrics.severityAccuracy.correct, 9);
assert.equal(score.metrics.severityAccuracy.denominator, 14);
assert.equal(score.metrics.severityAccuracy.accuracy, 9 / 14);
assert.deepEqual(score.metrics.severityAccuracy.disagreements.map((item) => item.truthId), ['MCB-001', 'MCB-008', 'MCB-009', 'MCB-010', 'MCB-015']);
assert.deepEqual(score.metrics.criticalChain, {
  truthId: 'MCB-015', candidateId: 'AFH-012', outcome: 'fragment_only_not_demonstrated', factor: 0.3,
  earnedPoints: 2.4, availablePoints: 8, compositionBonusEarned: false,
  omittedSteps: ['repeated zero-size setup', 'withdrawal against amplified equity', 'price normalization', 'resulting position-backed deficit'],
});
assert.equal(score.generatorTruthCompleteness.distinctValidUnregisteredDefects, 11);

assert.equal(reruns.candidateFreshProcessesPassed, 25);
assert.equal(reruns.candidateFreshProcessesTotal, 25);
assert.equal(reruns.candidateEmbeddedControls, 25);
assert.equal(reruns.validUnregisteredFreshProcesses, 11);
assert.equal(reruns.discriminationPairsPassed, 2);
for (const candidate of reruns.candidates) assert.equal(hash(path.join(consensusRoot, candidate.path)), candidate.sha256);
assert.match(fs.readFileSync(path.join(consensusRoot, 'logs/discrimination-direct-attempt-3.log'), 'utf8'), /ℹ pass 2/);
assert.match(fs.readFileSync(path.join(consensusRoot, 'logs/discrimination-MCB-006-AFH-008-survivor.log'), 'utf8'), /exit=0/);
assert.match(fs.readFileSync(path.join(consensusRoot, 'logs/discrimination-MCB-015-AFH-012-survivor.log'), 'utf8'), /exit=0/);

assert.deepEqual(score.researchComparison.stages.map((stage) => stage.stage), ['original_blind_baseline', 'same_target_v2_regression', 'unseen_perps_blind_generalization']);
assert.deepEqual(score.researchComparison.stages.map((stage) => stage.exact), [9, 15, 13]);
assert.deepEqual(score.researchComparison.stages.map((stage) => stage.falsePositives), [0, 0, 0]);

const consensusOutputPrefix = 'benchmarks/perps-blind-generalization/scoring/consensus/';
const trackedPaths = execFileSync(
  'git',
  ['diff', '--name-only', expectedInputs.scorerCommit, '--', 'benchmarks/perps-blind-generalization'],
  { cwd: repositoryRoot, encoding: 'utf8' },
).trim().split(/\r?\n/).filter(Boolean);
assert.ok(
  trackedPaths.every((filename) => filename.startsWith(consensusOutputPrefix)),
  `frozen benchmark inputs changed:\n${trackedPaths.join('\n')}`,
);
const status = execFileSync('git', ['status', '--porcelain', '--', 'benchmarks/perps-blind-generalization'], { cwd: repositoryRoot, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean);
assert.ok(status.every((line) => line.slice(3).startsWith(consensusOutputPrefix)), `out-of-scope path:\n${status.join('\n')}`);

if (!process.argv.includes('--prehash')) {
  const hashManifest = fs.readFileSync(path.join(consensusRoot, 'HASHES.sha256'), 'utf8').trim().split(/\r?\n/);
  assert.ok(hashManifest.length >= 1);
  for (const line of hashManifest) {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `malformed HASHES line: ${line}`);
    assert.equal(hash(path.join(consensusRoot, match[2])), match[1], `hash mismatch: ${match[2]}`);
  }
}

console.log(JSON.stringify({ finalScoreCheck: 'pass', assertions: 'truth=15,candidates=25,points=89.4,precision=25/25,severity=9/14,scope=consensus-only' }));
