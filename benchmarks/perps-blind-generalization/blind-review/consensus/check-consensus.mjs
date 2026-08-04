import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const consensusRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(consensusRoot, '..', '..');
const repoRoot = path.resolve(consensusRoot, '..', '..', '..', '..');
const consensusPrefix = 'benchmarks/perps-blind-generalization/blind-review/consensus/';
const targetPrefix = 'benchmarks/perps-blind-generalization';
const targetRevision = '158651792f770f5e827c1f0c363ea91f916cb1b8';
const hunterRevision = '31ea4b7';
const reviewRevision = 'c1e2b8c';
const expected = {
  hunter: 'c5330151531671c7ed322a155abb7e5270b7e2d83ce4fa3df64a10a0790b29ef',
  reviewerA: '41bc03cc09b9ac715134a7ff580ba7a77ad92b86617aafb035feece548b15de2',
  reviewerB: '1dc57d5a89c4ab71b5e22d2885abcc30ea363c6cc4754d068e53fcfedf775607',
  aggregate: 'bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381',
};

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function gitShow(revision, relative) {
  return execFileSync('git', ['show', `${revision}:${relative}`], { cwd: repoRoot, maxBuffer: 32 * 1024 * 1024 });
}

function local(relative) {
  const resolved = path.resolve(consensusRoot, relative);
  assert.ok(resolved.startsWith(`${consensusRoot}${path.sep}`), `path escape: ${relative}`);
  return resolved;
}

function verifyLocalHash(reference) {
  const absolute = local(reference.path);
  assert.ok(fs.statSync(absolute).isFile(), `missing evidence file: ${reference.path}`);
  assert.equal(sha256(fs.readFileSync(absolute)), reference.sha256, `evidence hash mismatch: ${reference.path}`);
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(consensusRoot, absolute).split(path.sep).join('/');
    assert.equal(entry.isSymbolicLink(), false, `symlink forbidden in consensus output: ${relative}`);
    return entry.isDirectory() ? walk(absolute) : [relative];
  });
}

// Exact supplied inputs.
const inputRecords = [
  [hunterRevision, `${targetPrefix}/blind-run/submission.json`, expected.hunter],
  [reviewRevision, `${targetPrefix}/blind-review/reviewer-a/review.json`, expected.reviewerA],
  [reviewRevision, `${targetPrefix}/blind-review/reviewer-b/review.json`, expected.reviewerB],
];
for (const [revision, relative, digest] of inputRecords) {
  assert.equal(sha256(gitShow(revision, relative)), digest, `frozen input changed: ${relative}`);
}
const targetManifestRaw = gitShow(targetRevision, `${targetPrefix}/SOURCE_MANIFEST.json`);
const targetManifest = JSON.parse(targetManifestRaw);
assert.equal(targetManifest.aggregateSha256, expected.aggregate);

const expectedInputHashFile = [
  `${expected.hunter}  hunter@31ea4b7:${targetPrefix}/blind-run/submission.json`,
  `${expected.reviewerA}  reviewer-a@c1e2b8c:${targetPrefix}/blind-review/reviewer-a/review.json`,
  `${expected.reviewerB}  reviewer-b@c1e2b8c:${targetPrefix}/blind-review/reviewer-b/review.json`,
  `${expected.aggregate}  target@1586517:SOURCE_MANIFEST.aggregateSha256`,
  '',
].join('\n');
assert.equal(fs.readFileSync(local('input-hashes.sha256'), 'utf8'), expectedInputHashFile, 'input hash inventory mismatch');

// Manifest/source immutability in the shared working tree.
assert.equal(sha256(fs.readFileSync(path.join(targetRoot, 'SOURCE_MANIFEST.json'))), sha256(targetManifestRaw), 'working manifest differs from target');
const canonical = [];
for (const entry of targetManifest.entries) {
  const absolute = path.join(targetRoot, entry.path);
  const bytes = fs.readFileSync(absolute);
  assert.equal(bytes.length, entry.bytes, `target byte count changed: ${entry.path}`);
  assert.equal(sha256(bytes), entry.sha256, `target source changed: ${entry.path}`);
  canonical.push(`${entry.sha256}  ${entry.bytes}  ${entry.path}\n`);
}
assert.equal(sha256(canonical.join('')), expected.aggregate, 'manifest aggregate arithmetic mismatch');

// Public ciphertext integrity only; no decryption or plaintext access.
const sealMetadata = JSON.parse(fs.readFileSync(path.join(targetRoot, 'sealed', 'metadata.json'), 'utf8'));
const ciphertext = fs.readFileSync(path.join(targetRoot, 'sealed', 'private-bundle.tar.enc'));
assert.equal(ciphertext.length, sealMetadata.ciphertextBytes, 'sealed ciphertext size mismatch');
assert.equal(sha256(ciphertext), sealMetadata.ciphertextSha256, 'sealed ciphertext digest mismatch');

const consensus = JSON.parse(fs.readFileSync(local('consensus.json'), 'utf8'));
const reruns = JSON.parse(fs.readFileSync(local('rerun-summary.json'), 'utf8'));
const terminal = JSON.parse(fs.readFileSync(local('terminal-verification.json'), 'utf8'));
assert.deepEqual(
  { tests: terminal.ordinary.tests, passed: terminal.ordinary.passed, failed: terminal.ordinary.failed },
  { tests: 5, passed: 5, failed: 0 },
  'terminal ordinary suite is not 5/5',
);
for (const reference of [terminal.compile, terminal.ordinary, terminal.manifest, terminal.seal, terminal.consensusRerun]) {
  assert.equal(reference.exit, 0);
  verifyLocalHash(reference);
}
verifyLocalHash(terminal.rerunSummary);
assert.equal(terminal.freshTargetTestProcesses, reruns.counts.totalFreshTargetTestProcesses);
assert.equal(consensus.schema_version, 1);
assert.equal(consensus.target.revision, targetRevision);
assert.equal(consensus.target.manifest_aggregate_sha256, expected.aggregate);
assert.equal(consensus.verdicts.length, 25);
const expectedIds = Array.from({ length: 25 }, (_, index) => `AFH-${String(index + 1).padStart(3, '0')}`);
const ids = consensus.verdicts.map((item) => item.id);
assert.deepEqual(ids, expectedIds, 'verdict IDs must be ordered AFH-001..AFH-025');
assert.equal(new Set(ids).size, 25, 'duplicate verdict ID');

const allowedClassifications = new Set(['confirmed_exact', 'confirmed_narrowed', 'duplicate_of', 'unsupported', 'invalid']);
const allowedSeverities = new Set(['critical', 'high', 'medium', 'low']);
const allowedConfidence = new Set(['high', 'medium', 'low']);
const byId = Object.fromEntries(consensus.verdicts.map((item) => [item.id, item]));
for (const verdict of consensus.verdicts) {
  assert.ok(allowedClassifications.has(verdict.classification), `invalid classification: ${verdict.id}`);
  assert.ok(allowedSeverities.has(verdict.final_severity), `invalid severity: ${verdict.id}`);
  assert.ok(allowedConfidence.has(verdict.confidence), `invalid confidence: ${verdict.id}`);
  if (verdict.classification === 'duplicate_of') {
    assert.ok(ids.includes(verdict.duplicate_of), `invalid duplicate target: ${verdict.id}`);
    assert.notEqual(verdict.id, verdict.duplicate_of, `self duplicate: ${verdict.id}`);
  } else {
    assert.equal(verdict.duplicate_of, null, `non-duplicate has duplicate target: ${verdict.id}`);
  }
  assert.equal(verdict.accounting.one_to_one_distinct, true);
  for (const dependency of verdict.accounting.dependencies) {
    assert.ok(ids.includes(dependency), `unknown dependency: ${verdict.id} -> ${dependency}`);
    assert.notEqual(dependency, verdict.id, `self dependency: ${verdict.id}`);
  }
  assert.equal(verdict.evidence_hashes.target_manifest_aggregate_sha256, expected.aggregate);
  const hunterEvidence = verdict.evidence_hashes.hunter_packet;
  assert.equal(
    sha256(gitShow(hunterRevision, `${targetPrefix}/${hunterEvidence.path}`)),
    hunterEvidence.sha256,
    `hunter evidence mismatch: ${verdict.id}`,
  );
  verifyLocalHash(verdict.evidence_hashes.consensus_rerun);
  assert.ok(verdict.evidence_hashes.consensus_rerun.attempts.length >= 1);
  assert.equal(verdict.evidence_hashes.consensus_rerun.attempts.at(-1).exit, 0, `no successful rerun: ${verdict.id}`);
  for (const attempt of verdict.evidence_hashes.consensus_rerun.attempts) verifyLocalHash(attempt);
  for (const control of verdict.evidence_hashes.adjudication_controls) verifyLocalHash(control);
  assert.ok(verdict.rerun_refs.includes(verdict.evidence_hashes.consensus_rerun.path));
  for (const reference of verdict.rerun_refs) assert.ok(fs.statSync(local(reference)).isFile(), `missing rerun ref: ${reference}`);
  if (verdict.final_severity === 'high' || verdict.final_severity === 'critical') {
    assert.equal(verdict.evidence_hashes.consensus_rerun.attempts.at(-1).exit, 0, `High/Critical lacks executable closure: ${verdict.id}`);
  }
}

// Classification and severity arithmetic.
for (const classification of allowedClassifications) {
  assert.equal(
    consensus.aggregate.verdicts[classification],
    consensus.verdicts.filter((item) => item.classification === classification).length,
    `classification arithmetic: ${classification}`,
  );
}
for (const severity of allowedSeverities) {
  assert.equal(
    consensus.aggregate.final_severity[severity],
    consensus.verdicts.filter((item) => item.final_severity === severity).length,
    `severity arithmetic: ${severity}`,
  );
}
assert.equal(Object.values(consensus.aggregate.verdicts).reduce((sum, value) => sum + value, 0), 25);
assert.equal(Object.values(consensus.aggregate.final_severity).reduce((sum, value) => sum + value, 0), 25);
assert.equal(consensus.aggregate.total_candidates, 25);

// Matrix coverage and all resolution/rerun links.
assert.equal(consensus.field_comparison_matrix.length, 25);
assert.deepEqual(consensus.field_comparison_matrix.map((item) => item.id), expectedIds);
const disagreementIds = consensus.field_comparison_matrix
  .filter((item) => item.material_disagreement_fields.length)
  .map((item) => item.id);
assert.deepEqual(disagreementIds, reruns.disagreementIds, 'disagreement inventory and rerun plan differ');
assert.equal(consensus.disagreement_resolution_matrix.length, disagreementIds.length);
assert.equal(consensus.aggregate.material_disagreement_candidates, disagreementIds.length);
assert.equal(
  consensus.aggregate.material_disagreement_fields,
  consensus.field_comparison_matrix.reduce((sum, item) => sum + item.material_disagreement_fields.length, 0),
);
assert.equal(consensus.aggregate.resolutions_complete, disagreementIds.length);
for (const resolution of consensus.disagreement_resolution_matrix) {
  assert.ok(disagreementIds.includes(resolution.id));
  assert.ok(resolution.resolution.length >= 40, `thin resolution: ${resolution.id}`);
  assert.ok(resolution.rerun_refs.length >= 2, `disagreement lacks discriminating control: ${resolution.id}`);
  for (const reference of resolution.rerun_refs) assert.ok(fs.statSync(local(reference)).isFile());
}

// Deterministic agreement sample guard.
assert.ok(reruns.agreementSample.ids.length >= 5);
assert.equal(new Set(reruns.agreementSample.ids).size, reruns.agreementSample.ids.length);
for (const id of reruns.agreementSample.ids) {
  assert.ok(ids.includes(id));
  assert.equal(disagreementIds.includes(id), false, `sample includes dispute: ${id}`);
  assert.equal(reruns.candidateReruns[id].attempts.at(-1).exit, 0);
}
assert.deepEqual(new Set(reruns.agreementSample.ids.map((id) => byId[id].final_severity)), new Set(['low', 'medium', 'high']));
assert.deepEqual(reruns.candidateIds, expectedIds, 'terminal rerun did not cover all candidates');
for (const id of expectedIds) {
  const result = reruns.candidateReruns[id];
  assert.ok(result);
  verifyLocalHash(result);
  for (const attempt of result.attempts) verifyLocalHash(attempt);
  assert.equal(result.attempts.at(-1).exit, 0);
}
for (const result of Object.values(reruns.adjudicationReruns)) {
  verifyLocalHash(result);
  assert.equal(result.attempts.at(-1).exit, 0);
}

// Overlap/dependency/duplicate consistency and acyclic dependencies.
assert.equal(consensus.duplicate_groups.length, 0);
assert.equal(consensus.aggregate.duplicate_groups, 0);
const grouped = new Map();
for (const group of consensus.overlap_groups) {
  assert.equal(new Set(group.members).size, group.members.length);
  for (const id of group.members) {
    assert.ok(ids.includes(id));
    assert.equal(grouped.has(id), false, `candidate appears in multiple overlap groups: ${id}`);
    grouped.set(id, group.id);
    assert.equal(byId[id].overlap_group, group.id);
  }
}
for (const verdict of consensus.verdicts) assert.equal(verdict.overlap_group, grouped.get(verdict.id) ?? null);
for (const edge of consensus.dependency_edges) {
  assert.ok(ids.includes(edge.from) && ids.includes(edge.to));
  assert.ok(byId[edge.from].accounting.dependencies.includes(edge.to));
}
const visiting = new Set();
const visited = new Set();
function visit(id) {
  if (visiting.has(id)) throw new Error(`dependency cycle at ${id}`);
  if (visited.has(id)) return;
  visiting.add(id);
  for (const dependency of byId[id].accounting.dependencies) visit(dependency);
  visiting.delete(id);
  visited.add(id);
}
for (const id of ids) visit(id);
assert.equal(byId['AFH-019'].accounting.standalone_finding, false);
assert.deepEqual(byId['AFH-020'].accounting.dependencies, []);
assert.deepEqual(byId['AFH-022'].accounting.dependencies, []);

// Artifact hash inventory covers every regular file except itself.
const allFiles = walk(consensusRoot).filter((relative) => relative !== 'HASHES.sha256').sort();
const inventoryLines = fs.readFileSync(local('HASHES.sha256'), 'utf8').trimEnd().split('\n');
const inventory = new Map(inventoryLines.map((line) => {
  const match = line.match(/^([0-9a-f]{64})  (.+)$/);
  assert.ok(match, `malformed HASHES line: ${line}`);
  return [match[2], match[1]];
}));
assert.deepEqual([...inventory.keys()].sort(), allFiles, 'HASHES inventory path set mismatch');
for (const [relative, digest] of inventory) assert.equal(sha256(fs.readFileSync(local(relative))), digest, `HASHES mismatch: ${relative}`);

// Worktree mutation scope is consensus-only.
const porcelain = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: repoRoot, encoding: 'utf8' });
const changedPaths = porcelain.trim().split('\n').filter(Boolean).map((line) => line.slice(3).split(' -> ').at(-1));
assert.ok(changedPaths.length > 0, 'expected consensus outputs in worktree');
for (const relative of changedPaths) assert.ok(relative.startsWith(consensusPrefix), `out-of-scope worktree change: ${relative}`);

console.log(JSON.stringify({
  ok: true,
  verdicts: consensus.aggregate.verdicts,
  severity: consensus.aggregate.final_severity,
  disagreementsResolved: consensus.aggregate.resolutions_complete,
  freshTargetTestProcesses: reruns.counts.totalFreshTargetTestProcesses,
  manifestAggregate: expected.aggregate,
  scopeFiles: changedPaths.length,
}));
