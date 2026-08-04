import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const consensusRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(consensusRoot, '..', '..');
const logRoot = path.join(consensusRoot, 'logs');
fs.mkdirSync(logRoot, { recursive: true });

const candidateIds = Array.from({ length: 25 }, (_, index) => `AFH-${String(index + 1).padStart(3, '0')}`);
const disagreementIds = [
  'AFH-002', 'AFH-004', 'AFH-005', 'AFH-006', 'AFH-011', 'AFH-014', 'AFH-015', 'AFH-016',
  'AFH-017', 'AFH-018', 'AFH-019', 'AFH-020', 'AFH-021', 'AFH-022', 'AFH-023', 'AFH-024', 'AFH-025',
];
const agreementSample = ['AFH-001', 'AFH-003', 'AFH-007', 'AFH-008', 'AFH-010', 'AFH-013'];
const adjudicationPatterns = [
  'C-002', 'C-004', 'C-011', 'C-017', 'C-019', 'C-020', 'C-021', 'C-022', 'C-024', 'C-OVERLAP',
];

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function runNode(args, logStem, maxAttempts = 1) {
  const attempts = [];
  for (let attempt = 1; attempt <= maxAttempts; ++attempt) {
    const started = new Date().toISOString();
    const result = spawnSync(process.execPath, args, {
      cwd: targetRoot,
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
      maxBuffer: 32 * 1024 * 1024,
    });
    const record = [
      `started=${started}`,
      `attempt=${attempt}`,
      `command=node ${args.join(' ')}`,
      `exit=${result.status}`,
      '--- stdout ---',
      result.stdout ?? '',
      '--- stderr ---',
      result.stderr ?? '',
    ].join('\n');
    const logName = `${logStem}-attempt-${attempt}.log`;
    const logPath = path.join(logRoot, logName);
    fs.writeFileSync(logPath, record.endsWith('\n') ? record : `${record}\n`);
    const item = {
      path: `logs/${logName}`,
      sha256: sha256(fs.readFileSync(logPath)),
      exit: result.status,
    };
    attempts.push(item);
    if (result.status === 0) {
      return {
        ...item,
        command: `node ${args.join(' ')}`,
        attempts,
      };
    }
  }
  throw new Error(`${logStem} failed after ${maxAttempts} fresh attempts`);
}

const candidateReruns = {};
for (const id of candidateIds) {
  candidateReruns[id] = runNode(['blind-run/run-case.mjs', id, '--verify-only'], `rerun-${id}`, 3);
}

const adjudicationReruns = {};
for (const pattern of adjudicationPatterns) {
  adjudicationReruns[pattern] = runNode([
    '--test',
    '--test-concurrency=1',
    `--test-name-pattern=${pattern}`,
    'blind-review/consensus/adjudication.test.mjs',
  ], `adjudication-${pattern}`);
}

const summary = {
  schemaVersion: 1,
  targetRevision: '158651792f770f5e827c1f0c363ea91f916cb1b8',
  candidateIds,
  disagreementIds,
  agreementSample: {
    method: 'fixed stratified sample declared in run-consensus.mjs: one or more candidates across Low/Medium/High and authorization, withdrawal, funding, position-ledger, and portfolio-risk flows',
    ids: agreementSample,
  },
  candidateReruns,
  adjudicationReruns,
  counts: {
    candidateRunnerProcesses: Object.values(candidateReruns).reduce((sum, item) => sum + item.attempts.length, 0),
    underlyingFreshCandidateTestProcesses: Object.entries(candidateReruns).reduce(
      (sum, [id, item]) => sum + item.attempts.length * (id === 'AFH-002' ? 2 : 1),
      0,
    ),
    adjudicationFreshProcesses: Object.values(adjudicationReruns).reduce((sum, item) => sum + item.attempts.length, 0),
    totalFreshTargetTestProcesses: Object.entries(candidateReruns).reduce(
      (sum, [id, item]) => sum + item.attempts.length * (id === 'AFH-002' ? 2 : 1),
      0,
    ) + Object.values(adjudicationReruns).reduce((sum, item) => sum + item.attempts.length, 0),
    disagreementCandidatesRerun: disagreementIds.length,
    agreementSampleCandidatesRerun: agreementSample.length,
    additionalFullMatrixCandidatesRerun: candidateIds.filter((id) => !disagreementIds.includes(id) && !agreementSample.includes(id)).length,
  },
};
fs.writeFileSync(path.join(consensusRoot, 'rerun-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary.counts));
