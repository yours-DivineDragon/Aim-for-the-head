import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scorerRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(scorerRoot, '..', '..');
const repositoryRoot = path.resolve(benchmarkRoot, '..', '..');
const prehash = process.argv.includes('--prehash');

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function json(relative) {
  return JSON.parse(fs.readFileSync(path.join(benchmarkRoot, relative), 'utf8'));
}

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-12, `${label}: ${actual} != ${expected}`);
}

function command(commandName, args, options = {}) {
  const result = spawnSync(commandName, args, { cwd: repositoryRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  assert.equal(result.status, 0, `${commandName} ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout.trim();
}

function verifyManifest(manifest, root) {
  for (const entry of manifest.entries) {
    const filename = path.join(root, entry.path);
    const body = fs.readFileSync(filename);
    assert.equal(body.length, entry.bytes, `manifest size ${entry.path}`);
    assert.equal(sha256(body), entry.sha256, `manifest digest ${entry.path}`);
  }
  const canonical = manifest.entries.map((entry) => `${entry.sha256}  ${entry.bytes}  ${entry.path}\n`).join('');
  assert.equal(sha256(canonical), manifest.aggregateSha256, 'manifest aggregate');
}

const expectedInputs = {
  truthCommitmentSha256: 'fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e',
  consensusSha256: 'ba5d60af575433b6f730ca1e59b961a00dedfda67da416b25c3ea6370e3b2696',
  submissionSha256: 'c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef',
  sourceAggregateSha256: 'bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381',
  revealAggregateSha256: 'dc808f47d8fc293a7f811d4f3b24622ad27387d9d7b95d5b2d692ee06430b03c',
};
const expectedInputHashFile = [
  `${expectedInputs.truthCommitmentSha256}  reveal/canonical.tar:registered-plaintext-commitment`,
  `${expectedInputs.consensusSha256}  blind-review/consensus/consensus.json`,
  `${expectedInputs.submissionSha256}  blind-run/submission.json`,
  `${expectedInputs.sourceAggregateSha256}  SOURCE_MANIFEST.json:aggregateSha256`,
  `${expectedInputs.revealAggregateSha256}  reveal/REVEAL_MANIFEST.json:aggregateSha256`,
  '',
].join('\n');
assert.equal(fs.readFileSync(path.join(scorerRoot, 'input-hashes.sha256'), 'utf8'), expectedInputHashFile, 'input-hashes.sha256');

const score = JSON.parse(fs.readFileSync(path.join(scorerRoot, 'score.json'), 'utf8'));
assert.deepEqual(score.inputs, expectedInputs, 'score input commitments');
assert.equal(score.frozenCommits.blindConsensus, 'd07b5ed83def43f6293bd41eaf51e97dc2fec501');
assert.equal(score.frozenCommits.reveal, 'e5ec59a2bcecf41e40cbb16df258bf9af92512bb');

const consensusPath = path.join(benchmarkRoot, 'blind-review', 'consensus', 'consensus.json');
const submissionPath = path.join(benchmarkRoot, 'blind-run', 'submission.json');
assert.equal(sha256(fs.readFileSync(consensusPath)), expectedInputs.consensusSha256, 'consensus input digest');
assert.equal(sha256(fs.readFileSync(submissionPath)), expectedInputs.submissionSha256, 'submission input digest');
const frozenConsensus = command('git', ['show', `d07b5ed83def43f6293bd41eaf51e97dc2fec501:benchmarks/perps-blind-generalization/blind-review/consensus/consensus.json`]);
assert.equal(sha256(Buffer.from(`${frozenConsensus}\n`)), expectedInputs.consensusSha256, 'consensus equals frozen commit');
command('git', ['merge-base', '--is-ancestor', 'e5ec59a2bcecf41e40cbb16df258bf9af92512bb', 'HEAD']);

const sourceManifest = json('SOURCE_MANIFEST.json');
assert.equal(sourceManifest.aggregateSha256, expectedInputs.sourceAggregateSha256);
verifyManifest(sourceManifest, benchmarkRoot);
const revealManifest = json('reveal/REVEAL_MANIFEST.json');
assert.equal(revealManifest.aggregateSha256, expectedInputs.revealAggregateSha256);
verifyManifest(revealManifest, path.join(benchmarkRoot, 'reveal'));

const tar = spawnSync('tar', [
  '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-cf', '-', '-C',
  path.join(benchmarkRoot, 'reveal', 'canonical'), '.',
], { encoding: null, maxBuffer: 8 * 1024 * 1024 });
assert.equal(tar.status, 0, `canonical tar: ${tar.stderr?.toString()}`);
assert.equal(sha256(tar.stdout), expectedInputs.truthCommitmentSha256, 'truth plaintext commitment');

const truth = json('reveal/canonical/truth/units.json');
const submission = json('blind-run/submission.json');
const consensus = json('blind-review/consensus/consensus.json');
assert.equal(truth.units.length, 15);
assert.equal(submission.candidates.length, 25);
assert.equal(consensus.verdicts.length, 25);

const truthIds = truth.units.map((unit) => unit.id).sort();
const scoreTruthIds = score.truthUnits.map((unit) => unit.id).sort();
assert.deepEqual(scoreTruthIds, truthIds, '15 truth IDs exactly once');
assert.equal(new Set(scoreTruthIds).size, 15, 'unique truth IDs');
const candidateIds = submission.candidates.map((candidate) => candidate.id).sort();
const scoreCandidateIds = score.candidates.map((candidate) => candidate.id).sort();
assert.deepEqual(scoreCandidateIds, candidateIds, '25 AFH IDs exactly once');
assert.equal(new Set(scoreCandidateIds).size, 25, 'unique AFH IDs');

const allowedFactors = new Set(['1', '0.6', '0.3', '0']);
const truthById = new Map(truth.units.map((unit) => [unit.id, unit]));
const candidateById = new Map(score.candidates.map((candidate) => [candidate.id, candidate]));
const consensusById = new Map(consensus.verdicts.map((candidate) => [candidate.id, candidate]));
const usedPrimaryCandidates = new Set();
let scaledPoints = 0;
let factorTenths = 0;
const outcomes = { exact: 0, factor06: 0, factor03: 0, missed: 0 };
let severityCorrect = 0;
let severityDenominator = 0;
for (const unit of score.truthUnits) {
  const canonical = truthById.get(unit.id);
  assert.ok(canonical);
  assert.equal(unit.canonicalClass, canonical.class);
  assert.equal(unit.severity, canonical.severity);
  assert.equal(unit.weight, canonical.weight);
  assert.ok(allowedFactors.has(String(unit.factor)), `factor ${unit.id}`);
  assert.equal(Math.round(unit.points * 10), Math.round(unit.weight * unit.factor * 10), `points ${unit.id}`);
  scaledPoints += Math.round(unit.points * 10);
  factorTenths += Math.round(unit.factor * 10);
  if (unit.factor === 1) { assert.equal(unit.outcome, 'exact'); outcomes.exact++; }
  else if (unit.factor === 0.6) { assert.equal(unit.outcome, 'substantial'); outcomes.factor06++; }
  else if (unit.factor === 0.3) { assert.equal(unit.outcome, 'fragment'); outcomes.factor03++; }
  else { assert.equal(unit.outcome, 'missed'); outcomes.missed++; }
  if (unit.factor > 0) {
    assert.ok(unit.primaryCandidate, `primary candidate ${unit.id}`);
    assert.equal(usedPrimaryCandidates.has(unit.primaryCandidate), false, `candidate reused: ${unit.primaryCandidate}`);
    usedPrimaryCandidates.add(unit.primaryCandidate);
    const candidate = candidateById.get(unit.primaryCandidate);
    assert.equal(candidate.classification, 'primary_matched');
    assert.equal(candidate.matchedTruthId, unit.id);
    assert.equal(candidate.matchFactor, unit.factor);
    const finalSeverity = consensusById.get(unit.primaryCandidate).final_severity;
    assert.equal(unit.candidateSeverity, finalSeverity);
    assert.equal(unit.severityCorrect, finalSeverity === canonical.severity);
    severityCorrect += Number(unit.severityCorrect);
    severityDenominator++;
  } else {
    assert.equal(unit.primaryCandidate, null);
    assert.equal(unit.candidateSeverity, null);
    assert.equal(unit.severityCorrect, null);
  }
}
assert.equal(scaledPoints, 894, 'weighted arithmetic');
assert.equal(factorTenths, 133, 'factor arithmetic');
assert.deepEqual(outcomes, { exact: 13, factor06: 0, factor03: 1, missed: 1 });
assert.equal(severityCorrect, 9);
assert.equal(severityDenominator, 14);

const classes = new Set(['primary_matched', 'supporting_or_duplicate', 'valid_unregistered', 'false_positive']);
const classificationCounts = { primary_matched: 0, supporting_or_duplicate: 0, valid_unregistered: 0, false_positive: 0 };
const submissionById = new Map(submission.candidates.map((candidate) => [candidate.id, candidate]));
for (const candidate of score.candidates) {
  assert.ok(classes.has(candidate.classification), `class ${candidate.id}`);
  classificationCounts[candidate.classification]++;
  if (candidate.classification === 'primary_matched') assert.ok(usedPrimaryCandidates.has(candidate.id));
  else assert.equal(candidate.matchedTruthId, null);
  const source = submissionById.get(candidate.id);
  assert.equal(source.evidence.length, 1, `evidence packet count ${candidate.id}`);
  assert.equal(candidate.evidenceSha256, source.evidence[0].sha256, `submission evidence declaration ${candidate.id}`);
  const evidencePath = path.resolve(benchmarkRoot, source.evidence[0].path);
  assert.ok(evidencePath.startsWith(`${benchmarkRoot}${path.sep}`), `evidence scope ${candidate.id}`);
  assert.equal(sha256(fs.readFileSync(evidencePath)), candidate.evidenceSha256, `evidence digest ${candidate.id}`);
}
assert.deepEqual(classificationCounts, { primary_matched: 14, supporting_or_duplicate: 0, valid_unregistered: 11, false_positive: 0 });
assert.deepEqual(score.metrics.candidateClassification, { ...classificationCounts, total: 25 });

const clusters = new Map();
for (const candidate of score.candidates) {
  const members = clusters.get(candidate.dedupCluster) ?? [];
  members.push(candidate);
  clusters.set(candidate.dedupCluster, members);
}
assert.equal(clusters.size, 25, 'distinct candidate root-cause clusters');
for (const members of clusters.values()) {
  if (members.length > 1) assert.ok(members.slice(1).every((candidate) => candidate.classification === 'supporting_or_duplicate'));
}

const truthMetrics = score.metrics.truth;
assert.deepEqual(
  { exact: truthMetrics.exact, factor06: truthMetrics.factor06, factor03: truthMetrics.factor03, missed: truthMetrics.missed },
  outcomes,
);
assert.equal(truthMetrics.creditedUnits, 14);
assert.equal(truthMetrics.denominator, 15);
close(truthMetrics.rawRecall, 14 / 15, 'raw recall');
close(truthMetrics.factorNormalizedRecall, 13.3 / 15, 'factor-normalized recall');
close(truthMetrics.weightedPoints, 89.4, 'weighted points');
assert.equal(truthMetrics.weightedDenominator, 100);
close(truthMetrics.scorePercent, 89.4, 'score percent');

for (const rollup of score.metrics.classRollups) {
  const members = score.truthUnits.filter((unit) => unit.classTags.includes(rollup.tag));
  assert.equal(rollup.unitDenominator, members.length, `class denominator ${rollup.tag}`);
  assert.equal(rollup.unitNumerator, members.filter((unit) => unit.factor > 0).length, `class numerator ${rollup.tag}`);
  close(rollup.rawRecall, rollup.unitNumerator / rollup.unitDenominator, `class recall ${rollup.tag}`);
  assert.equal(rollup.exact, members.filter((unit) => unit.factor === 1).length);
  assert.equal(rollup.factor06, members.filter((unit) => unit.factor === 0.6).length);
  assert.equal(rollup.factor03, members.filter((unit) => unit.factor === 0.3).length);
  assert.equal(rollup.missed, members.filter((unit) => unit.factor === 0).length);
  close(rollup.earnedPoints, members.reduce((sum, unit) => sum + unit.points, 0), `class points ${rollup.tag}`);
  assert.equal(rollup.availablePoints, members.reduce((sum, unit) => sum + unit.weight, 0));
}
assert.deepEqual(score.metrics.classRollups.map((item) => item.tag).sort(), [
  'access', 'business-logic', 'composed', 'cross-contract', 'integration', 'niche', 'reentrancy',
]);

const precision = score.metrics.precision;
assert.equal(precision.rawNumerator, 25 - classificationCounts.false_positive);
assert.equal(precision.rawDenominator, 25);
close(precision.raw, 1, 'raw precision');
assert.equal(precision.distinctClusters, clusters.size);
assert.equal(precision.deduplicatedNumerator, [...clusters.values()].filter((members) => members.some((candidate) => candidate.classification !== 'false_positive')).length);
assert.equal(precision.deduplicatedDenominator, clusters.size);
close(precision.deduplicated, 1, 'deduplicated precision');
assert.equal(precision.validUnregisteredGeneratorMisses, 11);
assert.equal(precision.supportingOrDuplicate, 0);
assert.equal(precision.falsePositives, 0);
assert.equal(score.metrics.severityAccuracy.correct, severityCorrect);
assert.equal(score.metrics.severityAccuracy.denominator, severityDenominator);
close(score.metrics.severityAccuracy.accuracy, 9 / 14, 'severity accuracy');
assert.deepEqual(score.metrics.criticalChain, {
  truthId: 'MCB-015', candidateId: 'AFH-012', outcome: 'fragment_only_not_demonstrated', factor: 0.3,
  earnedPoints: 2.4, availablePoints: 8, compositionBonusEarned: false,
});

const reruns = JSON.parse(fs.readFileSync(path.join(scorerRoot, 'rerun-summary.json'), 'utf8'));
assert.equal(reruns.candidatePasses, 25);
assert.equal(reruns.candidateProcesses, 25);
assert.equal(reruns.ambiguityDiscriminationProcesses, 4);
assert.deepEqual(reruns.candidates.map((candidate) => candidate.id).sort(), candidateIds);
for (const candidate of reruns.candidates) {
  const filename = path.resolve(scorerRoot, candidate.path);
  assert.ok(filename.startsWith(`${scorerRoot}${path.sep}`), `rerun scope ${candidate.id}`);
  assert.equal(sha256(fs.readFileSync(filename)), candidate.sha256, `rerun digest ${candidate.id}`);
  assert.equal(candidate.exitCode, 0);
  assert.equal(candidate.freshProcess, true);
  assert.equal(candidate.embeddedNegativeControl, true);
}
assert.deepEqual(reruns.discrimination.map((item) => item.id).sort(), ['MCB-006-vs-AFH-008', 'MCB-015-vs-AFH-012']);
for (const item of reruns.discrimination) {
  for (const evidence of [item.compile, item.survivor]) {
    const filename = path.resolve(scorerRoot, evidence.path);
    assert.ok(filename.startsWith(`${scorerRoot}${path.sep}`), `discrimination scope ${item.id}`);
    assert.equal(sha256(fs.readFileSync(filename)), evidence.sha256, `discrimination digest ${item.id}`);
    assert.equal(evidence.exitCode, 0);
  }
}
assert.equal(score.verification.candidateFreshProcessesPassed, 25);
assert.equal(score.verification.ambiguityDiscriminationPairsPassed, 2);
assert.equal(score.verification.ambiguityDiscriminationProcesses, 4);

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `no scorer symlink: ${filename}`);
    return entry.isDirectory() ? walk(filename) : [filename];
  });
}

if (!prehash) {
  const manifestPath = path.join(scorerRoot, 'HASHES.sha256');
  assert.ok(fs.existsSync(manifestPath), 'HASHES.sha256 exists');
  const lines = fs.readFileSync(manifestPath, 'utf8').trimEnd().split('\n');
  const parsed = lines.map((line) => {
    const match = line.match(/^([0-9a-f]{64})  (.+)$/);
    assert.ok(match, `HASHES line: ${line}`);
    assert.equal(path.isAbsolute(match[2]), false, `relative hash path ${match[2]}`);
    assert.equal(match[2].includes('..'), false, `hash path traversal ${match[2]}`);
    return { hash: match[1], relative: match[2] };
  });
  const expectedFiles = walk(scorerRoot)
    .map((filename) => path.relative(scorerRoot, filename).split(path.sep).join('/'))
    .filter((relative) => relative !== 'HASHES.sha256')
    .sort();
  assert.deepEqual(parsed.map((entry) => entry.relative), expectedFiles, 'HASHES path coverage and order');
  for (const entry of parsed) assert.equal(sha256(fs.readFileSync(path.join(scorerRoot, entry.relative))), entry.hash, `HASHES digest ${entry.relative}`);
}

console.log(JSON.stringify({
  scoreCheck: 'pass',
  truthUnits: 15,
  candidates: 25,
  exact: 13,
  factor06: 0,
  factor03: 1,
  missed: 1,
  weightedPoints: 89.4,
  rawPrecision: '25/25',
  deduplicatedPrecision: '25/25',
  evidencePackets: 25,
  candidateReruns: '25/25',
  discriminationPairs: '2/2',
  hashesVerified: !prehash,
}, null, 2));
