import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const reviewRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(reviewRoot, '..', '..');
const repositoryRoot = path.resolve(targetRoot, '..', '..');
const errors = [];
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const shaFile = (filename) => sha(fs.readFileSync(filename));
const readJson = (filename) => JSON.parse(fs.readFileSync(filename, 'utf8'));
const expect = (condition, message) => { if (!condition) errors.push(message); };

let review;
let submission;
let manifest;
let inventory;
let execution;
try {
  review = readJson(path.join(reviewRoot, 'review.json'));
  submission = readJson(path.join(targetRoot, 'blind-run', 'submission.json'));
  manifest = readJson(path.join(targetRoot, 'SOURCE_MANIFEST.json'));
  inventory = readJson(path.join(targetRoot, 'blind-run', 'HASH_INVENTORY.json'));
  execution = readJson(path.join(reviewRoot, 'execution-log.json'));
} catch (error) {
  errors.push(`JSON parse: ${error.message}`);
}

if (review && submission && manifest && inventory && execution) {
  expect(review.schemaVersion === 1, 'review schemaVersion must be 1');
  expect(review.reviewType === 'independent-blind-solidity-review', 'unexpected reviewType');
  expect(review.reviewer === 'A', 'reviewer must be A');
  expect(review.target.revision === '158651792f770f5e827c1f0c363ea91f916cb1b8', 'target revision mismatch');
  expect(review.target.submissionRevision === '31ea4b7367a42fb1d87d486e945e54361a8d0ca3', 'submission revision mismatch');
  expect(review.target.sourceManifestSha256 === shaFile(path.join(targetRoot, 'SOURCE_MANIFEST.json')), 'manifest file hash mismatch');
  expect(review.target.sourceManifestAggregateSha256 === manifest.aggregateSha256, 'manifest aggregate mismatch in review');
  expect(review.target.frozenSubmissionSha256 === inventory.root_hashes.submission, 'submission root mismatch in review');
  expect(review.target.frozenReportSha256 === inventory.root_hashes.report, 'report root mismatch in review');
  expect(review.target.frozenEvidenceChainSha256 === inventory.root_hashes.evidence_canonical_chain, 'evidence chain mismatch in review');

  const allowedVerdicts = new Set(['confirmed_exact', 'confirmed_narrowed', 'duplicate_of', 'unsupported', 'invalid']);
  const allowedSeverities = new Set(['critical', 'high', 'medium', 'low', 'informational']);
  const allowedConfidence = new Set(['high', 'medium', 'low']);
  const expectedIds = Array.from({ length: 25 }, (_, index) => `AFH-${String(index + 1).padStart(3, '0')}`);
  const candidateIds = review.candidates.map((candidate) => candidate.id);
  expect(review.candidates.length === 25, 'review must contain exactly 25 candidates');
  expect(new Set(candidateIds).size === 25, 'review candidate IDs must be unique');
  expect(JSON.stringify([...candidateIds].sort()) === JSON.stringify(expectedIds), 'review candidate ID set mismatch');
  expect(submission.candidates.length === 25, 'submission candidate count changed');
  expect(new Set(submission.candidates.map((candidate) => candidate.id)).size === 25, 'submission IDs are not unique');

  const statusTotals = {};
  const severityTotals = {};
  const inventoryMap = Object.fromEntries(inventory.files.map((entry) => [entry.path, entry.sha256]));
  const manifestMap = Object.fromEntries(manifest.entries.map((entry) => [entry.path, entry.sha256]));
  const submissionMap = Object.fromEntries(submission.candidates.map((candidate) => [candidate.id, candidate]));
  for (const candidate of review.candidates) {
    const submitted = submissionMap[candidate.id];
    expect(Boolean(submitted), `${candidate.id}: missing submission input`);
    if (submitted) {
      expect(candidate.input.title === submitted.canonical_title, `${candidate.id}: input title mismatch`);
      expect(candidate.input.submittedSeverity === submitted.severity, `${candidate.id}: submitted severity mismatch`);
      expect(candidate.input.submittedRootCause === submitted.root_cause, `${candidate.id}: submitted root cause mismatch`);
    }
    expect(allowedVerdicts.has(candidate.verdict), `${candidate.id}: invalid verdict`);
    expect(allowedSeverities.has(candidate.proposedSeverity), `${candidate.id}: invalid severity`);
    expect(allowedConfidence.has(candidate.confidence), `${candidate.id}: invalid confidence`);
    expect(Array.isArray(candidate.independentlyObservedFacts) && candidate.independentlyObservedFacts.length > 0, `${candidate.id}: facts missing`);
    expect(typeof candidate.rootCauseAndImpactScope === 'string' && candidate.rootCauseAndImpactScope.length > 20, `${candidate.id}: impact scope missing`);
    expect(typeof candidate.overlapGroup === 'string' && candidate.overlapGroup.length > 0, `${candidate.id}: overlap group missing`);
    expect(candidate.composition && Array.isArray(candidate.composition.members), `${candidate.id}: composition missing`);
    expect(typeof candidate.rationale === 'string' && candidate.rationale.length > 20, `${candidate.id}: rationale missing`);
    if (candidate.verdict === 'duplicate_of') expect(/^AFH-\d{3}$/.test(candidate.duplicateOf ?? ''), `${candidate.id}: duplicate target missing`);

    const evidencePath = candidate.input.evidence.path;
    const evidenceFull = path.join(targetRoot, evidencePath);
    expect(fs.existsSync(evidenceFull), `${candidate.id}: evidence path missing`);
    if (fs.existsSync(evidenceFull)) expect(candidate.input.evidence.sha256 === shaFile(evidenceFull), `${candidate.id}: evidence hash mismatch`);
    expect(candidate.input.evidence.sha256 === inventoryMap[evidencePath], `${candidate.id}: evidence inventory mismatch`);

    expect(candidate.reproduction.command === `node blind-run/run-case.mjs ${candidate.id} --verify-only`, `${candidate.id}: command mismatch`);
    expect(candidate.reproduction.freshStateAndProcess === true, `${candidate.id}: fresh process not asserted`);
    expect(candidate.reproduction.result === 'pass', `${candidate.id}: reproduction result not pass`);
    expect(typeof candidate.reproduction.control === 'string' && candidate.reproduction.control.length > 0, `${candidate.id}: control missing`);
    const record = execution.records[candidate.reproduction.executionLogRecord - 1];
    expect(Boolean(record), `${candidate.id}: execution record missing`);
    if (record) {
      expect(record.label.startsWith(`candidate-${candidate.id}-`), `${candidate.id}: wrong execution record`);
      expect(record.exitCode === 0, `${candidate.id}: execution record failed`);
      expect(record.combinedSha256 === candidate.reproduction.outputSha256, `${candidate.id}: output hash mismatch`);
    }
    expect(Array.isArray(candidate.reproduction.sourceFileHashes) && candidate.reproduction.sourceFileHashes.length > 0, `${candidate.id}: source hashes missing`);
    for (const source of candidate.reproduction.sourceFileHashes ?? []) {
      const sourcePath = source.reference.split(':')[0];
      expect(source.sha256 === manifestMap[sourcePath], `${candidate.id}: source manifest hash mismatch for ${sourcePath}`);
      if (manifestMap[sourcePath]) expect(source.sha256 === shaFile(path.join(targetRoot, sourcePath)), `${candidate.id}: live source hash mismatch for ${sourcePath}`);
    }
    statusTotals[candidate.verdict] = (statusTotals[candidate.verdict] ?? 0) + 1;
    severityTotals[candidate.proposedSeverity] = (severityTotals[candidate.proposedSeverity] ?? 0) + 1;
  }
  expect(review.totals.inputs === 25, 'total inputs mismatch');
  expect(JSON.stringify(review.totals.verdicts) === JSON.stringify(statusTotals), 'verdict arithmetic mismatch');
  expect(JSON.stringify(review.totals.proposedSeverity) === JSON.stringify(severityTotals), 'severity arithmetic mismatch');
  expect(review.duplicateGroups.length === (statusTotals.duplicate_of ?? 0), 'duplicate arithmetic mismatch');

  expect(execution.schemaVersion === 1 && execution.reviewer === 'A', 'execution log schema/reviewer mismatch');
  expect(execution.targetRevision === review.target.revision, 'execution target revision mismatch');
  expect(execution.submissionRevision === review.target.submissionRevision, 'execution submission revision mismatch');
  expect(execution.allCandidatesPassed === true, 'not all candidate reruns passed');
  expect(execution.requiredPassed === true, 'required execution gates did not all pass');
  expect(Object.keys(execution.candidateSummary).length === 25, 'execution candidate summary count mismatch');
  for (const id of expectedIds) expect(execution.candidateSummary[id]?.passed === true, `${id}: execution summary not passed`);
  const ordinary = execution.records.find((record) => record.label === 'ordinary-5-tests');
  expect(ordinary?.exitCode === 0 && /tests 5/.test(ordinary.stdout) && /pass 5/.test(ordinary.stdout), 'ordinary 5-test evidence missing');
  const independent = execution.records.find((record) => record.label === 'independent-discriminating-5-tests');
  expect(independent?.exitCode === 0 && /tests 5/.test(independent.stdout) && /pass 5/.test(independent.stdout), 'independent 5-test evidence missing');
  expect(review.execution.logSha256 === shaFile(path.join(reviewRoot, 'execution-log.json')), 'execution log artifact hash mismatch');

  const manifestLines = [];
  for (const entry of manifest.entries) {
    const full = path.join(targetRoot, entry.path);
    expect(fs.existsSync(full), `manifest file missing: ${entry.path}`);
    if (!fs.existsSync(full)) continue;
    const bytes = fs.statSync(full).size;
    const digest = shaFile(full);
    expect(bytes === entry.bytes, `manifest bytes mismatch: ${entry.path}`);
    expect(digest === entry.sha256, `manifest digest mismatch: ${entry.path}`);
    manifestLines.push(`${digest}  ${bytes}  ${entry.path}\n`);
  }
  expect(manifest.entries.length === manifest.fileCount, 'manifest fileCount mismatch');
  expect(sha(manifestLines.join('')) === manifest.aggregateSha256, 'manifest aggregate recomputation mismatch');

  for (const entry of inventory.files) {
    const full = path.join(targetRoot, entry.path);
    expect(fs.existsSync(full), `frozen inventory file missing: ${entry.path}`);
    if (fs.existsSync(full)) expect(shaFile(full) === entry.sha256, `frozen inventory mismatch: ${entry.path}`);
  }
  expect(shaFile(path.join(targetRoot, 'blind-run', 'submission.json')) === inventory.root_hashes.submission, 'frozen submission root hash mismatch');
  expect(shaFile(path.join(targetRoot, 'blind-run', 'REPORT.md')) === inventory.root_hashes.report, 'frozen report root hash mismatch');
  const evidenceLines = fs.readdirSync(path.join(targetRoot, 'blind-run', 'evidence'))
    .filter((name) => name.endsWith('.json')).sort()
    .map((name) => `${shaFile(path.join(targetRoot, 'blind-run', 'evidence', name))}  blind-run/evidence/${name}\n`).join('');
  expect(sha(evidenceLines) === inventory.root_hashes.evidence_canonical_chain, 'frozen evidence chain mismatch');

  const gitDiff = spawnSync('git', ['diff', '--exit-code', 'HEAD', '--',
    'benchmarks/perps-blind-generalization/contracts',
    'benchmarks/perps-blind-generalization/test',
    'benchmarks/perps-blind-generalization/blind-run',
    'benchmarks/perps-blind-generalization/SOURCE_MANIFEST.json',
    'benchmarks/perps-blind-generalization/SPECIFICATION.md',
  ], { cwd: repositoryRoot, encoding: 'utf8' });
  expect(gitDiff.status === 0, 'tracked target/submission files differ from frozen HEAD');

  const hashesPath = path.join(reviewRoot, 'HASHES.sha256');
  expect(fs.existsSync(hashesPath), 'HASHES.sha256 missing');
  if (fs.existsSync(hashesPath)) {
    const lines = fs.readFileSync(hashesPath, 'utf8').trim().split('\n').filter(Boolean);
    const seen = new Set();
    for (const line of lines) {
      const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
      expect(Boolean(match), `invalid HASHES line: ${line}`);
      if (!match) continue;
      const [, expected, relative] = match;
      expect(!seen.has(relative), `duplicate HASHES path: ${relative}`);
      seen.add(relative);
      const full = path.join(reviewRoot, relative);
      expect(fs.existsSync(full), `HASHES file missing: ${relative}`);
      if (fs.existsSync(full)) expect(shaFile(full) === expected, `HASHES digest mismatch: ${relative}`);
    }
    for (const required of ['review.json', 'REPORT.md', 'execution-log.json', 'independent.test.mjs', 'ReviewerVenue.sol', 'check-review.mjs']) {
      expect(seen.has(required), `HASHES missing required artifact: ${required}`);
    }
  }
}

const result = {
  valid: errors.length === 0,
  checks: {
    schema: !errors.some((error) => /schema|reviewType|reviewer/.test(error)),
    inputsAndVerdicts: !errors.some((error) => /candidate|input|verdict|severity|confidence|duplicate/.test(error)),
    evidenceAndReproduction: !errors.some((error) => /evidence|execution|reproduction|control|source/.test(error)),
    arithmetic: !errors.some((error) => /arithmetic|total inputs/.test(error)),
    targetAndSubmissionImmutability: !errors.some((error) => /manifest|frozen|target\/submission/.test(error)),
    artifactHashes: !errors.some((error) => /HASHES|artifact hash/.test(error)),
  },
  candidateCount: review?.candidates?.length ?? 0,
  verdicts: review?.totals?.verdicts ?? {},
  proposedSeverity: review?.totals?.proposedSeverity ?? {},
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
