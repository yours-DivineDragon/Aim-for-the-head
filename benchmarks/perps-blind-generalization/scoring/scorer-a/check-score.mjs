import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const scorerRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(scorerRoot, '..', '..');
const repositoryRoot = path.resolve(benchmarkRoot, '..', '..');
const local = (relative) => path.join(scorerRoot, relative);
const benchmark = (relative) => path.join(benchmarkRoot, relative);
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} != ${expected}`);
const isFile = (filename) => fs.existsSync(filename) && fs.statSync(filename).isFile();

function walk(directory, relativeRoot = directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full, relativeRoot);
    return entry.isFile() ? [path.relative(relativeRoot, full).split(path.sep).join('/')] : [];
  });
}

const score = JSON.parse(fs.readFileSync(local('score.json'), 'utf8'));
assert.equal(score.schemaVersion, 1);
assert.equal(score.scorer, 'scorer-a');

const truthIds = Array.from({ length: 15 }, (_, index) => `MCB-${String(index + 1).padStart(3, '0')}`);
const candidateIds = Array.from({ length: 25 }, (_, index) => `AFH-${String(index + 1).padStart(3, '0')}`);
assert.equal(score.truthUnits.length, 15);
assert.deepEqual(score.truthUnits.map((unit) => unit.id).sort(), truthIds);
assert.equal(new Set(score.truthUnits.map((unit) => unit.id)).size, 15);
assert.equal(score.candidates.length, 25);
assert.deepEqual(score.candidates.map((candidate) => candidate.id).sort(), candidateIds);
assert.equal(new Set(score.candidates.map((candidate) => candidate.id)).size, 25);

const allowedFactors = new Set([0, 0.3, 0.6, 1]);
const allowedLevels = new Set(['exact', 'substantial_partial', 'fragment', 'missed']);
const allowedClasses = new Set(['primary_matched', 'supporting_or_duplicate', 'valid_unregistered', 'false_positive']);
const allowedSeverities = new Set(['critical', 'high', 'medium', 'low']);
for (const unit of score.truthUnits) {
  assert.ok(allowedFactors.has(unit.factor), `factor ${unit.id}`);
  assert.ok(allowedLevels.has(unit.level), `level ${unit.id}`);
  assert.ok(allowedSeverities.has(unit.canonicalSeverity), `severity ${unit.id}`);
  close(unit.earnedPoints, unit.weight * unit.factor, `earned ${unit.id}`);
  assert.ok(candidateIds.includes(unit.primaryCandidate), `primary ${unit.id}`);
  assert.ok(Array.isArray(unit.cluster) && unit.cluster.length >= 1, `cluster ${unit.id}`);
  assert.equal(new Set(unit.cluster).size, unit.cluster.length, `cluster duplicate ${unit.id}`);
  for (const id of unit.cluster) assert.ok(candidateIds.includes(id), `cluster member ${unit.id}/${id}`);
  for (const ref of unit.evidenceRefs) assert.ok(isFile(local(ref)), `missing truth evidence ${unit.id}/${ref}`);
}
assert.equal(score.truthUnits.reduce((sum, unit) => sum + unit.weight, 0), 100);
close(score.truthUnits.reduce((sum, unit) => sum + unit.earnedPoints, 0), 93.3, 'earned total');
assert.equal(new Set(score.truthUnits.map((unit) => unit.primaryCandidate)).size, 15, 'one unique primary per truth unit');

const byCandidate = Object.fromEntries(score.candidates.map((candidate) => [candidate.id, candidate]));
const byTruth = Object.fromEntries(score.truthUnits.map((unit) => [unit.id, unit]));
for (const candidate of score.candidates) {
  assert.ok(allowedClasses.has(candidate.classification), `class ${candidate.id}`);
  assert.ok(allowedSeverities.has(candidate.claimedSeverity), `claimed severity ${candidate.id}`);
  assert.ok(allowedSeverities.has(candidate.adjudicatedScopeSeverity), `scope severity ${candidate.id}`);
  assert.equal(candidate.scopeSeverityExact, candidate.claimedSeverity === candidate.adjudicatedScopeSeverity, `scope severity flag ${candidate.id}`);
  assert.equal(new Set(candidate.dependencies).size, candidate.dependencies.length, `dependency duplicate ${candidate.id}`);
  for (const dependency of candidate.dependencies) assert.ok(candidateIds.includes(dependency), `dependency ${candidate.id}/${dependency}`);
  for (const ref of candidate.evidenceRefs) assert.ok(isFile(local(ref)), `missing candidate evidence ${candidate.id}/${ref}`);
  if (candidate.classification === 'primary_matched') {
    assert.ok(candidate.truthId && byTruth[candidate.truthId], `primary truth ${candidate.id}`);
    assert.equal(byTruth[candidate.truthId].primaryCandidate, candidate.id, `primary reverse map ${candidate.id}`);
    close(candidate.factorContribution, byTruth[candidate.truthId].factor, `factor contribution ${candidate.id}`);
    assert.equal(candidate.truthCanonicalSeverity, byTruth[candidate.truthId].canonicalSeverity, `truth severity ${candidate.id}`);
    assert.equal(candidate.truthSeverityExact, candidate.claimedSeverity === candidate.truthCanonicalSeverity, `truth severity flag ${candidate.id}`);
  } else {
    assert.equal(candidate.truthId, null, `non-primary truth ${candidate.id}`);
    assert.equal(candidate.factorContribution, 0, `non-primary factor ${candidate.id}`);
    assert.equal(candidate.truthCanonicalSeverity, null, `non-primary canonical severity ${candidate.id}`);
  }
}
assert.deepEqual(score.truthUnits.map((unit) => byCandidate[unit.primaryCandidate].truthId), truthIds);

const unitCounts = {
  exact: score.truthUnits.filter((unit) => unit.factor === 1).length,
  factor06: score.truthUnits.filter((unit) => unit.factor === 0.6).length,
  factor03: score.truthUnits.filter((unit) => unit.factor === 0.3).length,
  missed: score.truthUnits.filter((unit) => unit.factor === 0).length,
};
assert.deepEqual(score.metrics.unitCounts, unitCounts);
const hitUnits = score.truthUnits.filter((unit) => unit.factor > 0).length;
assert.deepEqual(score.metrics.rawUnitRecall, { numerator: hitUnits, denominator: 15, percent: hitUnits / 15 * 100 });
close(score.metrics.weighted.earnedPoints, 93.3, 'weighted earned');
assert.equal(score.metrics.weighted.availablePoints, 100);
close(score.metrics.weighted.percent, 93.3, 'weighted percent');

for (const unit of score.truthUnits) {
  const metric = score.metrics.registeredClassByClass[unit.class];
  assert.ok(metric, `class metric ${unit.class}`);
  assert.deepEqual(metric.truthIds, [unit.id]);
  assert.equal(metric.unitsHit, unit.factor > 0 ? 1 : 0);
  assert.equal(metric.unitCount, 1);
  close(metric.earnedPoints, unit.earnedPoints, `class earned ${unit.id}`);
  assert.equal(metric.availablePoints, unit.weight);
  close(metric.weightedPercent, unit.factor * 100, `class weighted ${unit.id}`);
}
assert.equal(Object.keys(score.metrics.registeredClassByClass).length, 15);
for (const [tag, metric] of Object.entries(score.metrics.coverageRollups)) {
  const units = score.truthUnits.filter((unit) => unit.categoryTags.includes(tag));
  const available = units.reduce((sum, unit) => sum + unit.weight, 0);
  const earned = units.reduce((sum, unit) => sum + unit.earnedPoints, 0);
  const hits = units.filter((unit) => unit.factor > 0).length;
  assert.deepEqual(metric.truthIds, units.map((unit) => unit.id), `rollup ids ${tag}`);
  assert.equal(metric.unitsHit, hits, `rollup hits ${tag}`);
  assert.equal(metric.unitCount, units.length, `rollup unit denominator ${tag}`);
  close(metric.rawRecallPercent, hits / units.length * 100, `rollup recall ${tag}`);
  close(metric.earnedPoints, earned, `rollup earned ${tag}`);
  assert.equal(metric.availablePoints, available, `rollup point denominator ${tag}`);
  close(metric.weightedPercent, earned / available * 100, `rollup weighted ${tag}`);
}

const classificationCounts = Object.fromEntries([...allowedClasses].map((candidateClass) => [candidateClass, score.candidates.filter((candidate) => candidate.classification === candidateClass).length]).filter(([, count]) => count !== 0));
assert.deepEqual(score.metrics.candidateClassificationCounts, classificationCounts);
const reportable = score.candidates.filter((candidate) => candidate.reportableDistinctClaim).length;
const precisionPositive = score.candidates.filter((candidate) => candidate.empiricalPrecisionNumerator).length;
assert.deepEqual(score.metrics.empiricalCandidatePrecision, { numerator: precisionPositive, denominator: reportable, percent: precisionPositive / reportable * 100 });
const rawPositive = score.candidates.filter((candidate) => candidate.classification !== 'false_positive').length;
assert.deepEqual(score.metrics.rawSubmissionPrecision, { numerator: rawPositive, denominator: 25, percent: rawPositive / 25 * 100 });
assert.equal(score.metrics.falsePositiveCount, score.candidates.filter((candidate) => candidate.classification === 'false_positive').length);
assert.equal(score.metrics.supportingOrDuplicateCount, score.candidates.filter((candidate) => candidate.classification === 'supporting_or_duplicate').length);
assert.equal(score.metrics.generatorCoverage.distinctValidUnregisteredCandidates, score.candidates.filter((candidate) => candidate.classification === 'valid_unregistered').length);

const scopeExact = score.candidates.filter((candidate) => candidate.scopeSeverityExact).length;
assert.deepEqual(score.metrics.severity.claimScopeExact, { numerator: scopeExact, denominator: 25, percent: scopeExact / 25 * 100 });
const truthSeverityExact = score.candidates.filter((candidate) => candidate.truthId && candidate.truthSeverityExact).length;
assert.deepEqual(score.metrics.severity.primaryTruthLabelExact, { numerator: truthSeverityExact, denominator: 15, percent: truthSeverityExact / 15 * 100 });
assert.equal(score.metrics.criticalChain.registeredTruthId, 'MCB-015');
assert.equal(score.metrics.criticalChain.factor, byTruth['MCB-015'].factor);
assert.equal(score.metrics.criticalChain.complete, false);
assert.equal(byTruth['MCB-015'].primaryCandidate, 'AFH-012');
assert.deepEqual(byCandidate['AFH-017'].dependencies, ['AFH-018']);
assert.deepEqual(byCandidate['AFH-019'].dependencies, ['AFH-018']);
assert.equal(score.metrics.verification.scorerChecker, 'pass');

const expectedInputs = {
  truthPlaintextCommitment: 'fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e',
  consensusSha256: 'ba5d60af575433b6f730ca1e59b961a00dedfda67da416b25c3ea6370e3b2696',
  submissionSha256: 'c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef',
  sourceAggregateSha256: 'bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381',
  revealAggregateSha256: 'dc808f47d8fc293a7f811d4f3b24622ad27387d9d7b95d5b2d692ee06430b03c',
};
for (const [key, digest] of Object.entries(expectedInputs)) assert.equal(score.frozen[key], digest, `score frozen ${key}`);
assert.equal(sha256(fs.readFileSync(benchmark('blind-review/consensus/consensus.json'))), expectedInputs.consensusSha256);
assert.equal(sha256(fs.readFileSync(benchmark('blind-run/submission.json'))), expectedInputs.submissionSha256);

const sourceManifest = JSON.parse(fs.readFileSync(benchmark('SOURCE_MANIFEST.json'), 'utf8'));
for (const entry of sourceManifest.entries) {
  const data = fs.readFileSync(benchmark(entry.path));
  assert.equal(data.length, entry.bytes, `source bytes ${entry.path}`);
  assert.equal(sha256(data), entry.sha256, `source hash ${entry.path}`);
}
const sourceLines = sourceManifest.entries.map((entry) => `${entry.sha256}  ${entry.bytes}  ${entry.path}\n`).join('');
assert.equal(sha256(sourceLines), expectedInputs.sourceAggregateSha256);

const revealManifest = JSON.parse(fs.readFileSync(benchmark('reveal/REVEAL_MANIFEST.json'), 'utf8'));
for (const entry of revealManifest.entries) {
  const data = fs.readFileSync(benchmark(`reveal/${entry.path}`));
  assert.equal(data.length, entry.bytes, `reveal bytes ${entry.path}`);
  assert.equal(sha256(data), entry.sha256, `reveal hash ${entry.path}`);
}
const revealLines = revealManifest.entries.map((entry) => `${entry.sha256}  ${entry.bytes}  ${entry.path}\n`).join('');
assert.equal(sha256(revealLines), expectedInputs.revealAggregateSha256);

const temporaryArchive = path.join(os.tmpdir(), `scorer-a-truth-${process.pid}.tar`);
try {
  const tar = spawnSync('tar', ['--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner', '-cf', temporaryArchive, '-C', benchmark('reveal/canonical'), '.'], { encoding: 'utf8' });
  assert.equal(tar.status, 0, `tar failed: ${tar.stderr}`);
  assert.equal(sha256(fs.readFileSync(temporaryArchive)), expectedInputs.truthPlaintextCommitment);
} finally {
  fs.rmSync(temporaryArchive, { force: true });
}

const inputLines = fs.readFileSync(local('input-hashes.sha256'), 'utf8').trimEnd().split('\n');
assert.equal(inputLines.length, 13);
for (const line of inputLines) assert.match(line, /^[0-9a-f]{64}  .+$/);
for (const digest of Object.values(expectedInputs)) assert.ok(inputLines.some((line) => line.startsWith(`${digest}  `)), `missing frozen input line ${digest}`);
const directInputPaths = [
  'blind-review/consensus/consensus.json',
  'blind-run/submission.json',
  'reveal/canonical/truth/units.json',
  'reveal/canonical/hidden/run-private.mjs',
  'reveal/canonical/harness/PrivateHarnesses.sol',
  'blind-review/reviewer-a/review.json',
  'blind-review/reviewer-b/review.json',
  'SOURCE_MANIFEST.json',
  'reveal/REVEAL_MANIFEST.json',
  'PRE_REGISTRATION.md',
];
for (const relative of directInputPaths) {
  const line = inputLines.find((candidate) => candidate.endsWith(`  ${relative}`));
  assert.ok(line, `missing direct input ${relative}`);
  assert.equal(line.slice(0, 64), sha256(fs.readFileSync(benchmark(relative))), `direct input hash ${relative}`);
}

const hashLines = fs.readFileSync(local('HASHES.sha256'), 'utf8').trimEnd().split('\n');
const inventory = new Map(hashLines.map((line) => {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match, `malformed HASHES line ${line}`);
  assert.ok(!path.isAbsolute(match[2]) && !match[2].split('/').includes('..'), `unsafe HASHES path ${match[2]}`);
  return [match[2], match[1]];
}));
assert.equal(inventory.size, hashLines.length, 'duplicate HASHES path');
const actualOutputs = walk(scorerRoot).filter((relative) => relative !== 'HASHES.sha256').sort();
assert.deepEqual([...inventory.keys()].sort(), actualOutputs, 'HASHES coverage');
for (const [relative, digest] of inventory) assert.equal(sha256(fs.readFileSync(local(relative))), digest, `output hash ${relative}`);
for (const unit of score.truthUnits) for (const ref of unit.evidenceRefs) assert.ok(inventory.has(ref), `unhashed truth evidence ${ref}`);
for (const candidate of score.candidates) for (const ref of candidate.evidenceRefs) assert.ok(inventory.has(ref), `unhashed candidate evidence ${ref}`);

assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim(), score.frozen.revealCommit);
execFileSync('git', ['diff', '--exit-code', score.frozen.blindConsensusCommit, '--',
  'benchmarks/perps-blind-generalization/blind-review/consensus',
  'benchmarks/perps-blind-generalization/blind-run',
  'benchmarks/perps-blind-generalization/SOURCE_MANIFEST.json',
], { cwd: repositoryRoot, stdio: 'pipe' });
execFileSync('git', ['diff', '--exit-code', score.frozen.revealCommit, '--', 'benchmarks/perps-blind-generalization/reveal'], { cwd: repositoryRoot, stdio: 'pipe' });
const trackedChanges = execFileSync('git', ['diff', '--name-only'], { cwd: repositoryRoot, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
assert.ok(trackedChanges.every((relative) => relative.startsWith('benchmarks/perps-blind-generalization/scoring/scorer-a/')), `tracked out-of-scope change: ${trackedChanges.join(', ')}`);

console.log(JSON.stringify({
  ok: true,
  truthUnits: score.truthUnits.length,
  candidates: score.candidates.length,
  unitCounts,
  weightedPoints: score.metrics.weighted.earnedPoints,
  candidateClasses: score.metrics.candidateClassificationCounts,
  empiricalPrecision: score.metrics.empiricalCandidatePrecision,
  rawPrecision: score.metrics.rawSubmissionPrecision,
  outputFilesHashed: inventory.size,
  immutableInputs: 'pass',
  pathScope: 'pass',
}));
