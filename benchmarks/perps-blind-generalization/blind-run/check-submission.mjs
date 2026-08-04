import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const blindRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(blindRoot, '..');
const repoRoot = path.resolve(targetRoot, '..', '..');
const errors = [];
const checks = {};

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex');
}

function requireCondition(condition, message) {
  if (!condition) errors.push(message);
}

function run(command, args, cwd = targetRoot) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

function walkFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(absolute) : [absolute];
  });
}

const submissionPath = path.join(blindRoot, 'submission.json');
const reportPath = path.join(blindRoot, 'REPORT.md');
const submission = JSON.parse(fs.readFileSync(submissionPath, 'utf8'));
checks.jsonParse = true;

requireCondition(submission.schema_version === 1, 'submission schema_version must be 1');
requireCondition(submission.target?.revision === '158651792f770f5e827c1f0c363ea91f916cb1b8', 'wrong target revision');
requireCondition(Array.isArray(submission.candidates) && submission.candidates.length > 0, 'no submitted candidates');
requireCondition(Array.isArray(submission.rejected_leads), 'rejected leads missing');
requireCondition(fs.existsSync(reportPath), 'REPORT.md missing');

const ids = new Set();
const severity = { critical: 0, high: 0, medium: 0, low: 0 };
const requiredFields = [
  'id', 'canonical_title', 'severity', 'confidence', 'affected_components', 'root_cause', 'preconditions',
  'minimal_transaction_sequence', 'reproduction', 'observed_vs_expected', 'concrete_impact', 'remediation',
  'evidence', 'coverage_dimensions', 'composition', 'evidence_gate_status', 'devils_advocate', 'rescue_critic',
];

for (const candidate of submission.candidates) {
  for (const field of requiredFields) requireCondition(candidate[field] !== undefined, `${candidate.id ?? 'unknown'} missing ${field}`);
  requireCondition(/^AFH-\d{3}$/.test(candidate.id), `invalid candidate id ${candidate.id}`);
  requireCondition(!ids.has(candidate.id), `duplicate id ${candidate.id}`);
  ids.add(candidate.id);
  requireCondition(Object.hasOwn(severity, candidate.severity), `${candidate.id} invalid severity`);
  if (Object.hasOwn(severity, candidate.severity)) severity[candidate.severity] += 1;
  requireCondition(candidate.confidence === 'high', `${candidate.id} confidence must reflect deterministic evidence`);
  requireCondition(candidate.evidence_gate_status.startsWith('all required technical gates passed'), `${candidate.id} evidence gates incomplete`);
  requireCondition(Array.isArray(candidate.affected_components) && candidate.affected_components.length > 0, `${candidate.id} affected components empty`);
  requireCondition(Array.isArray(candidate.preconditions) && candidate.preconditions.length > 0, `${candidate.id} preconditions empty`);
  requireCondition(Array.isArray(candidate.minimal_transaction_sequence) && candidate.minimal_transaction_sequence.length > 0, `${candidate.id} transaction sequence empty`);
  requireCondition(Array.isArray(candidate.coverage_dimensions) && candidate.coverage_dimensions.length > 0, `${candidate.id} coverage dimensions empty`);
  requireCondition(['standalone', 'composed'].includes(candidate.composition?.type), `${candidate.id} composition type invalid`);
  requireCondition(candidate.reproduction?.command === `node blind-run/run-case.mjs ${candidate.id}`, `${candidate.id} reproduction command not canonical`);
  requireCondition(typeof candidate.reproduction?.control === 'string' && candidate.reproduction.control.length > 0, `${candidate.id} negative control missing`);
  for (const testPath of candidate.reproduction?.tests ?? []) {
    const absolute = path.join(targetRoot, testPath.replace(/^blind-run\//, 'blind-run/'));
    requireCondition(fs.existsSync(absolute), `${candidate.id} missing test ${testPath}`);
  }
  requireCondition(Array.isArray(candidate.evidence) && candidate.evidence.length > 0, `${candidate.id} evidence missing`);
  for (const item of candidate.evidence ?? []) {
    const absolute = path.join(targetRoot, item.path);
    requireCondition(absolute.startsWith(blindRoot + path.sep), `${candidate.id} evidence outside blind-run`);
    requireCondition(fs.existsSync(absolute), `${candidate.id} evidence file missing ${item.path}`);
    if (fs.existsSync(absolute)) requireCondition(sha256(absolute) === item.sha256, `${candidate.id} evidence hash mismatch ${item.path}`);
  }
  if (['critical', 'high'].includes(candidate.severity)) {
    requireCondition(candidate.evidence.length > 0 && candidate.reproduction.command.length > 0, `${candidate.id} high/critical executable evidence gate failed`);
  }
}

for (const rejected of submission.rejected_leads) {
  requireCondition(/^REJ-\d{3}$/.test(rejected.id), `invalid rejection id ${rejected.id}`);
  requireCondition(!ids.has(rejected.id), `duplicate id ${rejected.id}`);
  ids.add(rejected.id);
  requireCondition(rejected.status === 'rejected' && rejected.first_failed_gate && rejected.reason, `${rejected.id} rejection incomplete`);
  requireCondition(fs.existsSync(path.join(targetRoot, rejected.evidence)), `${rejected.id} rejection evidence missing`);
}

requireCondition(submission.totals.submitted === submission.candidates.length, 'submitted total mismatch');
requireCondition(submission.totals.rejected_leads === submission.rejected_leads.length, 'rejected total mismatch');
for (const key of Object.keys(severity)) requireCondition(submission.totals[key] === severity[key], `${key} total mismatch`);
checks.schemaAndEvidence = errors.length === 0;

const manifest = run('npm', ['run', 'manifest:verify']);
requireCondition(manifest.status === 0 && manifest.output.includes('Verified 31 manifest files'), 'manifest verification failed');
checks.manifestVerify = manifest.status === 0;

const seal = run('npm', ['run', 'seal:verify']);
requireCondition(seal.status === 0 && seal.output.includes('"verified": true'), 'public seal verification failed');
checks.publicSealVerify = seal.status === 0;

const ordinary = run('npm', ['test']);
requireCondition(ordinary.status === 0 && ordinary.output.includes('ℹ pass 5') && ordinary.output.includes('ℹ fail 0'), 'ordinary suite did not pass 5/5');
checks.ordinarySuite = ordinary.status === 0;

const statePath = path.join(blindRoot, '.goal-hunt', 'state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
requireCondition(state.status === 'completed' && state.outcome === 'validated' && state.terminal, 'Aim state is not terminal validated');
const terminal = run('python3', ['../../scripts/goal_state.py', 'check', '--dir', 'blind-run/.goal-hunt', '--phase', 'terminal']);
requireCondition(terminal.status === 0 && terminal.output.includes('"valid": true'), 'Aim terminal check failed');
checks.aimTerminal = terminal.status === 0;

const gitStatus = run('git', ['status', '--porcelain', '--untracked-files=all'], repoRoot);
const unexpected = gitStatus.output.split(/\r?\n/).filter(Boolean).filter((line) => {
  const pathname = line.slice(3).replace(/^"|"$/g, '');
  return !pathname.startsWith('benchmarks/perps-blind-generalization/blind-run/');
});
requireCondition(unexpected.length === 0, `git status contains paths outside blind-run: ${unexpected.join(', ')}`);
checks.gitScope = unexpected.length === 0;

const inventoryPath = path.join(blindRoot, 'HASH_INVENTORY.json');
requireCondition(fs.existsSync(inventoryPath), 'HASH_INVENTORY.json missing');
if (fs.existsSync(inventoryPath)) {
  const inventory = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const listed = new Set();
  for (const item of inventory.files ?? []) {
    const absolute = path.join(targetRoot, item.path);
    requireCondition(absolute.startsWith(blindRoot + path.sep), `inventory path outside blind-run ${item.path}`);
    requireCondition(!listed.has(item.path), `duplicate inventory path ${item.path}`);
    listed.add(item.path);
    requireCondition(fs.existsSync(absolute), `inventory file missing ${item.path}`);
    if (fs.existsSync(absolute)) requireCondition(sha256(absolute) === item.sha256, `inventory hash mismatch ${item.path}`);
  }
  const exclusions = new Set([inventoryPath, path.join(blindRoot, 'CHECK_RESULT.json')]);
  const unlisted = walkFiles(blindRoot)
    .filter((absolute) => !exclusions.has(absolute))
    .map((absolute) => path.relative(targetRoot, absolute))
    .filter((relative) => !listed.has(relative));
  requireCondition(unlisted.length === 0, `unlisted blind-run files: ${unlisted.join(', ')}`);
  checks.hashInventory = true;
}

const result = {
  valid: errors.length === 0,
  checks,
  candidateCount: submission.candidates.length,
  rejectedCount: submission.rejected_leads.length,
  severity,
  errors,
};
if (process.argv.includes('--write-result')) {
  fs.writeFileSync(path.join(blindRoot, 'CHECK_RESULT.json'), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
if (errors.length) process.exitCode = 1;
