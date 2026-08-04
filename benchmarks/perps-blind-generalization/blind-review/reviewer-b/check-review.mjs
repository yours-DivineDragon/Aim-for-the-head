import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const reviewRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(reviewRoot, '..', '..');
const repositoryRoot = path.resolve(targetRoot, '..', '..');
const reviewPath = path.join(reviewRoot, 'review.json');
const reportPath = path.join(reviewRoot, 'REPORT.md');
const hashesPath = path.join(reviewRoot, 'HASHES.sha256');
const errors = [];
const checks = {};

function requireCondition(condition, message) {
  if (!condition) errors.push(message);
}

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sha256File(filename) {
  return sha256Bytes(fs.readFileSync(filename));
}

function parseJson(filename) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    errors.push(`cannot parse ${path.relative(reviewRoot, filename)}: ${error.message}`);
    return null;
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function canonicalReviewFiles() {
  return walk(reviewRoot)
    .filter((absolute) => absolute !== hashesPath)
    .map((absolute) => ({ absolute, relative: path.relative(reviewRoot, absolute).split(path.sep).join('/') }))
    .sort((first, second) => first.relative.localeCompare(second.relative));
}

function writeHashes() {
  const lines = canonicalReviewFiles().map(({ absolute, relative }) => `${sha256File(absolute)}  ${relative}`);
  fs.writeFileSync(hashesPath, `${lines.join('\n')}\n`);
  console.log(JSON.stringify({ written: path.relative(targetRoot, hashesPath), entries: lines.length }, null, 2));
}

if (process.argv.includes('--write-hashes')) {
  writeHashes();
  process.exit(0);
}

requireCondition(fs.existsSync(reviewPath), 'review.json missing');
requireCondition(fs.existsSync(reportPath), 'REPORT.md missing');
requireCondition(fs.existsSync(hashesPath), 'HASHES.sha256 missing');
const review = fs.existsSync(reviewPath) ? parseJson(reviewPath) : null;
const submissionPath = path.join(targetRoot, 'blind-run', 'submission.json');
const hunterReportPath = path.join(targetRoot, 'blind-run', 'REPORT.md');
const hunterInventoryPath = path.join(targetRoot, 'blind-run', 'HASH_INVENTORY.json');
const manifestPath = path.join(targetRoot, 'SOURCE_MANIFEST.json');
const submission = parseJson(submissionPath);
const hunterInventory = parseJson(hunterInventoryPath);
const manifest = parseJson(manifestPath);

if (review) {
  const requiredTop = ['schemaVersion', 'reviewer', 'classificationVocabulary', 'target', 'execution', 'aggregate', 'verdicts', 'reviewerDiscoveredIssues'];
  for (const field of requiredTop) requireCondition(Object.hasOwn(review, field), `review missing ${field}`);
  requireCondition(review.schemaVersion === 1, 'schemaVersion must equal 1');
  requireCondition(review.reviewer === 'independent-blind-reviewer-b', 'reviewer identity mismatch');
  requireCondition(Array.isArray(review.verdicts) && review.verdicts.length === 25, 'exactly 25 verdicts required');
  requireCondition(Array.isArray(review.reviewerDiscoveredIssues), 'reviewerDiscoveredIssues must be an array');
  checks.schema = errors.length === 0;

  const statusValues = ['confirmed_exact', 'confirmed_narrowed', 'duplicate_of', 'unsupported', 'invalid'];
  const severityValues = ['critical', 'high', 'medium', 'low'];
  requireCondition(JSON.stringify(review.classificationVocabulary) === JSON.stringify(statusValues), 'classification vocabulary mismatch');
  const expectedIds = Array.from({ length: 25 }, (_, index) => `AFH-${String(index + 1).padStart(3, '0')}`);
  const actualIds = review.verdicts.map((item) => item.id);
  requireCondition(JSON.stringify(actualIds) === JSON.stringify(expectedIds), 'verdict IDs must be AFH-001 through AFH-025 in order');
  requireCondition(new Set(actualIds).size === 25, 'duplicate verdict ID');

  const statusCounts = Object.fromEntries(statusValues.map((item) => [item, 0]));
  const severityCounts = Object.fromEntries(severityValues.map((item) => [item, 0]));
  const hunterById = new Map((submission?.candidates ?? []).map((item) => [item.id, item]));
  let downgraded = 0;
  let upgraded = 0;
  let unchanged = 0;
  const severityRank = { low: 0, medium: 1, high: 2, critical: 3 };
  const evidencePaths = new Set();

  for (const verdict of review.verdicts) {
    const required = ['id', 'status', 'hunterSeverity', 'proposedSeverity', 'confidence', 'rootCauseScope', 'impactScope', 'independentFacts', 'overlapGroup', 'compositionMembership', 'rationale', 'evidence'];
    for (const field of required) requireCondition(Object.hasOwn(verdict, field), `${verdict.id} missing ${field}`);
    requireCondition(statusValues.includes(verdict.status), `${verdict.id} invalid status`);
    requireCondition(severityValues.includes(verdict.hunterSeverity), `${verdict.id} invalid hunter severity`);
    requireCondition(severityValues.includes(verdict.proposedSeverity), `${verdict.id} invalid proposed severity`);
    requireCondition(verdict.confidence === 'high', `${verdict.id} confidence must be high after deterministic execution`);
    requireCondition(typeof verdict.rootCauseScope === 'string' && verdict.rootCauseScope.length >= 20, `${verdict.id} root cause too short`);
    requireCondition(typeof verdict.impactScope === 'string' && verdict.impactScope.length >= 20, `${verdict.id} impact scope too short`);
    requireCondition(Array.isArray(verdict.independentFacts) && verdict.independentFacts.length >= 2, `${verdict.id} independent facts incomplete`);
    requireCondition(typeof verdict.compositionMembership === 'string' && verdict.compositionMembership.length >= 10, `${verdict.id} composition membership incomplete`);
    requireCondition(typeof verdict.rationale === 'string' && verdict.rationale.length >= 20, `${verdict.id} rationale too short`);
    requireCondition(Array.isArray(verdict.evidence) && verdict.evidence.length > 0, `${verdict.id} fresh evidence missing`);
    if (verdict.status === 'duplicate_of') requireCondition(/^AFH-\d{3}$/.test(verdict.duplicateOf ?? ''), `${verdict.id} duplicateOf missing`);
    if (['high', 'critical'].includes(verdict.proposedSeverity)) {
      requireCondition(verdict.impactScope.length >= 50, `${verdict.id} High/Critical impact closure too short`);
      requireCondition(verdict.evidence.some((item) => item.command?.includes('node --test')), `${verdict.id} High/Critical executable closure missing`);
    }
    statusCounts[verdict.status] += 1;
    severityCounts[verdict.proposedSeverity] += 1;
    const hunter = hunterById.get(verdict.id);
    requireCondition(Boolean(hunter), `${verdict.id} absent from frozen submission`);
    if (hunter) requireCondition(hunter.severity === verdict.hunterSeverity, `${verdict.id} hunter severity mismatch`);
    if (severityRank[verdict.proposedSeverity] < severityRank[verdict.hunterSeverity]) downgraded += 1;
    else if (severityRank[verdict.proposedSeverity] > severityRank[verdict.hunterSeverity]) upgraded += 1;
    else unchanged += 1;
    for (const evidence of verdict.evidence) {
      requireCondition(typeof evidence.command === 'string' && evidence.command.length > 0, `${verdict.id} evidence command missing`);
      requireCondition(typeof evidence.path === 'string' && evidence.path.startsWith('blind-review/reviewer-b/'), `${verdict.id} evidence path outside reviewer-b`);
      requireCondition(/^[0-9a-f]{64}$/.test(evidence.sha256 ?? ''), `${verdict.id} evidence hash invalid`);
      const absolute = path.join(targetRoot, evidence.path ?? '');
      requireCondition(absolute.startsWith(reviewRoot + path.sep), `${verdict.id} evidence resolves outside reviewer-b`);
      requireCondition(fs.existsSync(absolute), `${verdict.id} evidence missing ${evidence.path}`);
      if (fs.existsSync(absolute)) requireCondition(sha256File(absolute) === evidence.sha256, `${verdict.id} evidence hash mismatch ${evidence.path}`);
      evidencePaths.add(evidence.path);
    }
  }
  checks.verdictSchemaAndEvidence = errors.length === 0;

  requireCondition(JSON.stringify(statusCounts) === JSON.stringify(review.aggregate.verdicts), 'aggregate verdict arithmetic mismatch');
  requireCondition(JSON.stringify(severityCounts) === JSON.stringify(review.aggregate.proposedSeverity), 'aggregate severity arithmetic mismatch');
  requireCondition(downgraded === review.aggregate.hunterSeverityAdjustments.downgraded, 'downgrade count mismatch');
  requireCondition(upgraded === review.aggregate.hunterSeverityAdjustments.upgraded, 'upgrade count mismatch');
  requireCondition(unchanged === review.aggregate.hunterSeverityAdjustments.unchanged, 'unchanged count mismatch');
  requireCondition(Object.values(statusCounts).reduce((sum, count) => sum + count, 0) === 25, 'verdict total arithmetic mismatch');
  requireCondition(Object.values(severityCounts).reduce((sum, count) => sum + count, 0) === 25, 'severity total arithmetic mismatch');
  requireCondition(review.aggregate.duplicateGroups.length === statusCounts.duplicate_of, 'duplicate group arithmetic mismatch');
  checks.aggregateArithmetic = errors.length === 0;

  requireCondition(review.execution.candidateCount === 25, 'execution candidate count mismatch');
  requireCondition(review.execution.freshCandidateProcessCount === 26, 'fresh candidate process count mismatch');
  requireCondition(review.execution.freshCandidateProcessPassCount === 26, 'fresh process pass count mismatch');
  requireCondition(review.execution.finalFreshCandidateProcessCount === 26, 'final fresh candidate process count mismatch');
  requireCondition(review.execution.finalFreshCandidateProcessPassCount === 26, 'final fresh candidate process pass count mismatch');
  requireCondition(review.execution.cumulativeFreshCandidateProcessPassCount === 52, 'cumulative candidate process count mismatch');
  requireCondition(review.execution.ordinaryTestCount === 5 && review.execution.ordinaryTestPassCount === 5, 'ordinary test arithmetic mismatch');
  requireCondition(review.execution.independentTestCount === 9 && review.execution.independentTestPassCount === 9, 'independent test arithmetic mismatch');
  requireCondition(review.execution.finalOrdinaryTestPassCount === 5, 'final ordinary test count mismatch');
  requireCondition(review.execution.finalIndependentTestPassCount === 9, 'final independent test count mismatch');
  const candidateLogs = fs.readdirSync(path.join(reviewRoot, 'logs')).filter((name) => /^AFH-\d{3}(?:-\d+)?\.log$/.test(name)).sort();
  requireCondition(candidateLogs.length === 26, `expected 26 candidate logs, found ${candidateLogs.length}`);
  for (const name of candidateLogs) {
    const record = parseJson(path.join(reviewRoot, 'logs', name));
    requireCondition(record?.exitCode === 0, `${name} did not pass`);
    requireCondition(record?.cwd === targetRoot, `${name} cwd mismatch`);
    requireCondition(record?.command?.includes('--test-concurrency=1'), `${name} not isolated`);
    requireCondition((record?.stdout ?? '').includes('{"hunterId"'), `${name} oracle missing`);
  }
  const finalCandidateLogs = fs.readdirSync(path.join(reviewRoot, 'logs')).filter((name) => /^final-AFH-\d{3}(?:-\d+)?\.log$/.test(name)).sort();
  requireCondition(finalCandidateLogs.length === 26, `expected 26 final candidate logs, found ${finalCandidateLogs.length}`);
  for (const name of finalCandidateLogs) {
    const record = parseJson(path.join(reviewRoot, 'logs', name));
    requireCondition(record?.exitCode === 0, `${name} did not pass`);
    requireCondition(record?.cwd === targetRoot, `${name} cwd mismatch`);
    requireCondition(record?.command?.includes('--test-concurrency=1'), `${name} not isolated`);
    requireCondition((record?.stdout ?? '').includes('{"hunterId"'), `${name} oracle missing`);
  }
  const ordinaryLog = parseJson(path.join(reviewRoot, 'logs', 'ordinary-suite.log'));
  requireCondition(ordinaryLog?.exitCode === 0 && ordinaryLog.stdout.includes('ℹ pass 5') && ordinaryLog.stdout.includes('ℹ fail 0'), 'ordinary suite log not 5/5');
  const independentLog = parseJson(path.join(reviewRoot, 'logs', 'independent-review.log'));
  requireCondition(independentLog?.exitCode === 0 && independentLog.stdout.includes('ℹ pass 9') && independentLog.stdout.includes('ℹ fail 0'), 'independent suite log not 9/9');
  const manifestLog = parseJson(path.join(reviewRoot, 'logs', 'manifest-verify.log'));
  requireCondition(manifestLog?.exitCode === 0 && manifestLog.stdout.includes('Verified 31 manifest files'), 'manifest execution log failed');
  const sealLog = parseJson(path.join(reviewRoot, 'logs', 'seal-verify.log'));
  requireCondition(sealLog?.exitCode === 0 && sealLog.stdout.includes('"verified": true'), 'seal execution log failed');
  const cleanHunterLog = parseJson(path.join(reviewRoot, 'logs', 'hunter-checker-clean.log'));
  requireCondition(cleanHunterLog?.exitCode === 0 && cleanHunterLog.stdout.includes('"valid": true'), 'clean hunter checker log failed');
  const finalOrdinaryLog = parseJson(path.join(reviewRoot, 'logs', 'final-ordinary-suite.log'));
  requireCondition(finalOrdinaryLog?.exitCode === 0 && finalOrdinaryLog.stdout.includes('ℹ pass 5') && finalOrdinaryLog.stdout.includes('ℹ fail 0'), 'final ordinary suite log not 5/5');
  const finalIndependentLog = parseJson(path.join(reviewRoot, 'logs', 'final-independent-review.log'));
  requireCondition(finalIndependentLog?.exitCode === 0 && finalIndependentLog.stdout.includes('ℹ pass 9') && finalIndependentLog.stdout.includes('ℹ fail 0'), 'final independent suite log not 9/9');
  const finalManifestLog = parseJson(path.join(reviewRoot, 'logs', 'final-manifest-verify.log'));
  requireCondition(finalManifestLog?.exitCode === 0 && finalManifestLog.stdout.includes('Verified 31 manifest files'), 'final manifest log failed');
  const finalSealLog = parseJson(path.join(reviewRoot, 'logs', 'final-seal-verify.log'));
  requireCondition(finalSealLog?.exitCode === 0 && finalSealLog.stdout.includes('"verified": true'), 'final seal log failed');
  const finalFrozenDiffLog = parseJson(path.join(reviewRoot, 'logs', 'final-frozen-diff.log'));
  requireCondition(finalFrozenDiffLog?.exitCode === 0 && finalFrozenDiffLog.stdout === '' && finalFrozenDiffLog.stderr === '', 'final frozen diff log failed');
  const finalScopeLog = parseJson(path.join(reviewRoot, 'logs', 'final-reviewer-b-scope.log'));
  requireCondition(finalScopeLog?.exitCode === 0, 'final reviewer-b scope log failed');
  const finalSummary = parseJson(path.join(reviewRoot, 'final-execution-summary.json'));
  requireCondition(finalSummary?.cumulativeCandidateProcessesPassed === 52, 'final execution summary candidate total mismatch');
  requireCondition(finalSummary?.finalOrdinaryTestsPassed === 5 && finalSummary?.finalIndependentTestsPassed === 9, 'final execution summary test totals mismatch');
  requireCondition(JSON.stringify(finalSummary?.immutableBefore) === JSON.stringify(finalSummary?.immutableAfter), 'final execution immutable before/after mismatch');
  checks.executionLogs = errors.length === 0;

  const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
  for (const id of expectedIds) requireCondition(report.includes(id), `REPORT.md omits ${id}`);
  requireCondition(report.includes('RD-001'), 'REPORT.md omits reviewer-discovered issue');
  requireCondition(report.includes('22 confirmed_exact') && report.includes('3 confirmed_narrowed'), 'REPORT.md aggregate wording missing');
  checks.reportCoverage = errors.length === 0;
}

if (review && manifest && submission && hunterInventory) {
  requireCondition(review.target.targetRevision === '158651792f770f5e827c1f0c363ea91f916cb1b8', 'target revision reference mismatch');
  requireCondition(review.target.submissionRevision === '31ea4b7367a42fb1d87d486e945e54361a8d0ca3', 'submission revision reference mismatch');
  requireCondition(sha256File(manifestPath) === review.target.sourceManifestSha256, 'SOURCE_MANIFEST hash changed');
  requireCondition(sha256File(submissionPath) === review.target.submissionSha256, 'submission hash changed');
  requireCondition(sha256File(hunterReportPath) === review.target.hunterReportSha256, 'hunter report hash changed');
  requireCondition(sha256File(hunterInventoryPath) === review.target.hunterHashInventorySha256, 'hunter hash inventory changed');
  requireCondition(submission.target?.revision === review.target.targetRevision, 'submission target revision mismatch');
  requireCondition(submission.target?.manifest_aggregate_sha256 === review.target.sourceManifestAggregateSha256, 'submission manifest aggregate mismatch');
  requireCondition(hunterInventory.target_revision === review.target.targetRevision, 'hunter inventory target revision mismatch');
  requireCondition(hunterInventory.manifest_aggregate_sha256 === review.target.sourceManifestAggregateSha256, 'hunter inventory manifest aggregate mismatch');
  requireCondition(hunterInventory.root_hashes?.submission === review.target.submissionSha256, 'hunter inventory submission root mismatch');
  requireCondition(hunterInventory.root_hashes?.report === review.target.hunterReportSha256, 'hunter inventory report root mismatch');

  const manifestLines = [];
  for (const entry of manifest.entries ?? []) {
    const absolute = path.join(targetRoot, entry.path);
    requireCondition(absolute.startsWith(targetRoot + path.sep), `manifest path escapes target: ${entry.path}`);
    requireCondition(fs.existsSync(absolute), `manifest path missing: ${entry.path}`);
    if (fs.existsSync(absolute)) {
      const bytes = fs.statSync(absolute).size;
      const digest = sha256File(absolute);
      requireCondition(bytes === entry.bytes, `manifest byte mismatch: ${entry.path}`);
      requireCondition(digest === entry.sha256, `manifest digest mismatch: ${entry.path}`);
      manifestLines.push(`${digest}  ${bytes}  ${entry.path}\n`);
    }
  }
  requireCondition(sha256Bytes(manifestLines.join('')) === manifest.aggregateSha256, 'manifest aggregate recomputation mismatch');
  requireCondition(manifest.aggregateSha256 === review.target.sourceManifestAggregateSha256, 'review manifest aggregate mismatch');

  for (const item of hunterInventory.files ?? []) {
    const absolute = path.join(targetRoot, item.path);
    requireCondition(absolute.startsWith(path.join(targetRoot, 'blind-run') + path.sep), `hunter inventory path outside blind-run: ${item.path}`);
    requireCondition(fs.existsSync(absolute), `hunter inventory file missing: ${item.path}`);
    if (fs.existsSync(absolute)) requireCondition(sha256File(absolute) === item.sha256, `hunter inventory file changed: ${item.path}`);
  }
  const evidenceRoot = path.join(targetRoot, 'blind-run', 'evidence');
  const evidenceLines = fs.readdirSync(evidenceRoot)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const relative = `blind-run/evidence/${name}`;
      return `${sha256File(path.join(evidenceRoot, name))}  ${relative}\n`;
    });
  requireCondition(sha256Bytes(evidenceLines.join('')) === hunterInventory.root_hashes?.evidence_canonical_chain, 'hunter evidence canonical chain mismatch');
  checks.targetAndSubmissionHashes = errors.length === 0;
}

try {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  requireCondition(head === '31ea4b7367a42fb1d87d486e945e54361a8d0ca3', 'repository HEAD is not frozen submission revision');
  const parent = execFileSync('git', ['rev-parse', '31ea4b7367a42fb1d87d486e945e54361a8d0ca3^'], { cwd: repositoryRoot, encoding: 'utf8' }).trim();
  requireCondition(parent === '158651792f770f5e827c1f0c363ea91f916cb1b8', 'frozen target is not submission parent');
  execFileSync('git', [
    'diff', '--quiet', '31ea4b7367a42fb1d87d486e945e54361a8d0ca3', '--',
    'benchmarks/perps-blind-generalization/README.md',
    'benchmarks/perps-blind-generalization/BENCHMARK_CONTRACT.md',
    'benchmarks/perps-blind-generalization/SPECIFICATION.md',
    'benchmarks/perps-blind-generalization/INVARIANTS.md',
    'benchmarks/perps-blind-generalization/THREAT_SURFACE.md',
    'benchmarks/perps-blind-generalization/PRE_REGISTRATION.md',
    'benchmarks/perps-blind-generalization/SOURCE_MANIFEST.json',
    'benchmarks/perps-blind-generalization/contracts',
    'benchmarks/perps-blind-generalization/test',
    'benchmarks/perps-blind-generalization/scripts',
    'benchmarks/perps-blind-generalization/package.json',
    'benchmarks/perps-blind-generalization/package-lock.json',
    'benchmarks/perps-blind-generalization/sealed',
    'benchmarks/perps-blind-generalization/blind-run',
  ], { cwd: repositoryRoot, stdio: 'pipe' });
  const ownStatus = execFileSync('git', ['status', '--porcelain', '--untracked-files=all', '--', 'benchmarks/perps-blind-generalization/blind-review/reviewer-b'], { cwd: repositoryRoot, encoding: 'utf8' });
  const outOfScope = ownStatus.split(/\r?\n/).filter(Boolean).filter((line) => !line.slice(3).startsWith('benchmarks/perps-blind-generalization/blind-review/reviewer-b/'));
  requireCondition(outOfScope.length === 0, `reviewer-b path-scope violation: ${outOfScope.join(', ')}`);
  checks.gitImmutabilityAndScope = errors.length === 0;
} catch (error) {
  errors.push(`git immutability/scope check failed: ${error.message}`);
  checks.gitImmutabilityAndScope = false;
}

if (fs.existsSync(hashesPath)) {
  const lines = fs.readFileSync(hashesPath, 'utf8').trimEnd().split('\n').filter(Boolean);
  const parsed = lines.map((line) => {
    const match = /^([0-9a-f]{64})  (.+)$/.exec(line);
    requireCondition(Boolean(match), `invalid HASHES line: ${line}`);
    return match ? { sha256: match[1], relative: match[2] } : null;
  }).filter(Boolean);
  const actualFiles = canonicalReviewFiles();
  requireCondition(parsed.length === actualFiles.length, 'HASHES entry count mismatch');
  requireCondition(JSON.stringify(parsed.map((item) => item.relative)) === JSON.stringify(actualFiles.map((item) => item.relative)), 'HASHES paths missing, extra, or unsorted');
  for (const item of parsed) {
    const absolute = path.join(reviewRoot, item.relative);
    requireCondition(absolute.startsWith(reviewRoot + path.sep), `HASHES path escapes reviewer-b: ${item.relative}`);
    requireCondition(fs.existsSync(absolute), `HASHES file missing: ${item.relative}`);
    if (fs.existsSync(absolute)) requireCondition(sha256File(absolute) === item.sha256, `HASHES digest mismatch: ${item.relative}`);
  }
  checks.reviewHashInventory = errors.length === 0;
}

const result = {
  valid: errors.length === 0,
  checks,
  verdictCount: review?.verdicts?.length ?? 0,
  verdicts: review?.aggregate?.verdicts ?? null,
  proposedSeverity: review?.aggregate?.proposedSeverity ?? null,
  freshCandidateProcesses: review?.execution?.freshCandidateProcessPassCount ?? 0,
  ordinaryTests: review?.execution?.ordinaryTestPassCount ?? 0,
  independentTests: review?.execution?.independentTestPassCount ?? 0,
  errors,
};
console.log(JSON.stringify(result, null, 2));
if (errors.length > 0) process.exitCode = 1;
