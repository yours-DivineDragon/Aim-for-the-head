import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const reviewRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(reviewRoot, '..', '..');
const repositoryRoot = path.resolve(targetRoot, '..', '..');
const records = [];

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function run(label, command, args, { cwd = targetRoot, env = {} } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  const combined = `${stdout}${stderr}`;
  const record = {
    sequence: records.length + 1,
    label,
    command: [command, ...args].join(' '),
    cwd: path.relative(repositoryRoot, cwd) || '.',
    exitCode: result.status,
    signal: result.signal,
    stdout,
    stderr,
    combinedSha256: digest(combined),
  };
  records.push(record);
  process.stdout.write(`${label}: exit=${result.status} sha256=${record.combinedSha256}\n`);
  return record;
}

run('pre-manifest', 'npm', ['run', 'manifest:verify']);
run('pre-seal', 'npm', ['run', 'seal:verify']);
run('pre-frozen-hashes', process.execPath, ['blind-review/reviewer-a/verify-frozen.mjs']);
run('ordinary-5-tests', 'npm', ['test']);

const caseResults = {};
for (let number = 1; number <= 25; number += 1) {
  const id = `AFH-${String(number).padStart(3, '0')}`;
  caseResults[id] = [];
  // Ganache/ethers occasionally returns an exact estimate for a feed state
  // write that then consumes the entire limit. Preserve failed attempts and
  // retry in a wholly fresh process instead of mutating the frozen PoC.
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const record = run(
      `candidate-${id}-attempt-${attempt}`,
      process.execPath,
      ['blind-run/run-case.mjs', id, '--verify-only'],
    );
    caseResults[id].push(record.sequence);
    if (record.exitCode === 0) break;
  }
}

run(
  'independent-discriminating-5-tests',
  process.execPath,
  ['--test', '--test-concurrency=1', 'blind-review/reviewer-a/independent.test.mjs'],
);
run('post-manifest', 'npm', ['run', 'manifest:verify']);
run('post-seal', 'npm', ['run', 'seal:verify']);
run('post-frozen-hashes', process.execPath, ['blind-review/reviewer-a/verify-frozen.mjs']);
run(
  'git-target-immutability',
  'git',
  ['diff', '--exit-code', 'HEAD', '--', 'benchmarks/perps-blind-generalization/contracts', 'benchmarks/perps-blind-generalization/test', 'benchmarks/perps-blind-generalization/blind-run', 'benchmarks/perps-blind-generalization/SOURCE_MANIFEST.json', 'benchmarks/perps-blind-generalization/SPECIFICATION.md'],
  { cwd: repositoryRoot },
);
run(
  'git-reviewer-a-path-scope',
  'git',
  ['status', '--short', '--untracked-files=all', '--', 'benchmarks/perps-blind-generalization/blind-review/reviewer-a'],
  { cwd: repositoryRoot },
);

const candidateSummary = Object.fromEntries(Object.entries(caseResults).map(([id, sequences]) => {
  const attempts = sequences.map((sequence) => records[sequence - 1]);
  return [id, {
    attempts: sequences.length,
    passed: attempts.some((record) => record.exitCode === 0),
    recordSequences: sequences,
  }];
}));

const requiredLabels = new Set([
  'pre-manifest',
  'pre-seal',
  'pre-frozen-hashes',
  'ordinary-5-tests',
  'independent-discriminating-5-tests',
  'post-manifest',
  'post-seal',
  'post-frozen-hashes',
  'git-target-immutability',
  'git-reviewer-a-path-scope',
]);
const requiredPassed = records
  .filter((record) => requiredLabels.has(record.label))
  .every((record) => record.exitCode === 0);
const allCandidatesPassed = Object.values(candidateSummary).every((item) => item.passed);
const log = {
  schemaVersion: 1,
  reviewer: 'A',
  targetRevision: '158651792f770f5e827c1f0c363ea91f916cb1b8',
  submissionRevision: '31ea4b7367a42fb1d87d486e945e54361a8d0ca3',
  freshProcessPolicy: 'Each run-case invocation starts a fresh Node parent which starts a fresh isolated Node test process and deterministic Ganache chain; controls are embedded in the selected test.',
  candidateSummary,
  allCandidatesPassed,
  requiredPassed,
  records,
};
fs.writeFileSync(path.join(reviewRoot, 'execution-log.json'), `${JSON.stringify(log, null, 2)}\n`);
if (!requiredPassed || !allCandidatesPassed) process.exitCode = 1;
