import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const consensusRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(consensusRoot, '..', '..');
const repositoryRoot = path.resolve(benchmarkRoot, '..', '..');
const logsRoot = path.join(consensusRoot, 'logs');
fs.mkdirSync(logsRoot, { recursive: true });

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function run(id, command, args, { cwd = benchmarkRoot } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const body = [
    `$ ${command} ${args.join(' ')}`,
    `cwd=${cwd}`,
    `exit=${result.status}`,
    '',
    result.stdout ?? '',
    result.stderr ?? '',
  ].join('\n');
  const relative = `logs/terminal-${id}.log`;
  const filename = path.join(consensusRoot, relative);
  fs.writeFileSync(filename, body);
  assert.equal(result.status, 0, `${id} failed; inspect ${filename}`);
  return { id, command: `${command} ${args.join(' ')}`, exitCode: result.status, path: relative, sha256: sha256(fs.readFileSync(filename)), output: body };
}

const hidden = run('hidden', process.execPath, ['reveal/canonical/hidden/run-private.mjs', '--target', '.']);
assert.match(hidden.output, /"reproductionPass": 15/);
assert.match(hidden.output, /"controlPass": 15/);

const ordinary = run('ordinary', 'npm', ['run', 'check']);
assert.match(ordinary.output, /Compiled 15 Solidity sources/);
assert.match(ordinary.output, /(?:#|ℹ) pass 5/);

const manifest = run('manifest', 'npm', ['run', 'manifest:verify']);
assert.match(manifest.output, /Verified 31 manifest files: bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381/);

const seal = run('seal', 'npm', ['run', 'seal:verify']);
assert.match(seal.output, /"verified": true/);
assert.match(seal.output, /fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e/);

const reveal = run('reveal', process.execPath, ['reveal/verify-reveal.mjs', 'verify']);
assert.match(reveal.output, /"revealVerified": true/);
assert.match(reveal.output, /"canonicalPlaintextSha256": "fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e"/);

const discrimination = run('discrimination', process.execPath, ['--test', '--test-concurrency=1', 'scoring/consensus/discrimination.test.mjs']);
assert.match(discrimination.output, /MCB-006-vs-AFH-008/);
assert.match(discrimination.output, /MCB-015-vs-AFH-012/);
assert.match(discrimination.output, /ℹ pass 2/);

const finalChecker = run('final-checker-prehash', process.execPath, ['scoring/consensus/check-final-score.mjs', '--prehash']);
assert.match(finalChecker.output, /"finalScoreCheck":"pass"/);

const head = run('head', 'git', ['rev-parse', 'HEAD'], { cwd: repositoryRoot });
assert.match(head.output, /[0-9a-f]{40}/);
const scorerAncestor = run(
  'scorer-ancestor',
  'git',
  ['merge-base', '--is-ancestor', 'a3ba6036d5c7b7902f775fd80ef4a6eccdf7c63f', 'HEAD'],
  { cwd: repositoryRoot },
);
const trackedDiffArgs = ['diff', '--name-only', 'a3ba6036d5c7b7902f775fd80ef4a6eccdf7c63f', '--', 'benchmarks/perps-blind-generalization'];
const trackedDiff = run('input-immutability', 'git', trackedDiffArgs, { cwd: repositoryRoot });
const changedPaths = spawnSync('git', trackedDiffArgs, { cwd: repositoryRoot, encoding: 'utf8' }).stdout.trim().split(/\r?\n/).filter(Boolean);
const consensusOutputPrefix = 'benchmarks/perps-blind-generalization/scoring/consensus/';
assert.ok(changedPaths.every((filename) => filename.startsWith(consensusOutputPrefix)), changedPaths.join('\n'));
const status = run('path-scope', 'git', ['status', '--porcelain', '--', 'benchmarks/perps-blind-generalization'], { cwd: repositoryRoot });
const statusLines = status.output.split(/\r?\n/).filter((line) => /^[? MADRCU!]{2} /.test(line));
assert.ok(statusLines.every((line) => line.slice(3).startsWith(consensusOutputPrefix)), statusLines.join('\n'));

const reruns = JSON.parse(fs.readFileSync(path.join(consensusRoot, 'rerun-summary.json'), 'utf8'));
assert.equal(reruns.candidateFreshProcessesPassed, 25);
assert.equal(reruns.validUnregisteredFreshProcesses, 11);
assert.equal(reruns.discriminationPairsPassed, 2);

const commands = [hidden, ordinary, manifest, seal, reveal, discrimination, finalChecker, head, scorerAncestor, trackedDiff, status]
  .map(({ output: _output, ...record }) => record);
const result = {
  schema: 1,
  status: 'pass',
  scorerCommit: 'a3ba6036d5c7b7902f775fd80ef4a6eccdf7c63f',
  hidden: { reproductionsPassed: 15, reproductionsTotal: 15, controlsPassed: 15, controlsTotal: 15 },
  ordinary: { testsPassed: 5, testsTotal: 5, solidityInputs: 15, artifacts: 25 },
  integrity: {
    sourceManifestFilesPassed: 31,
    sourceManifestFilesTotal: 31,
    sourceAggregateSha256: 'bd7aacd7d51c679b4e40f83d6ca49d49b03b69490ad6751f50c81236e7ef5381',
    sealVerified: true,
    revealVerified: true,
    truthCommitmentSha256: 'fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e',
  },
  candidateReruns: { passed: 25, total: 25, embeddedControls: 25, validUnregisteredPassed: 11, validUnregisteredTotal: 11 },
  targetedDiscrimination: { pairsPassed: 2, pairsTotal: 2, terminalTestsPassed: 2, terminalTestsTotal: 2 },
  finalScoreCheckerPrehash: 'pass',
  inputImmutability: 'frozen-inputs-unchanged',
  pathScope: 'consensus-only',
  commands,
};
fs.writeFileSync(path.join(consensusRoot, 'terminal-verification.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: 'pass', hidden: '15+15/15+15', ordinary: '5/5', candidates: '25/25', unregistered: '11/11', discrimination: '2/2', finalChecker: 'pass', scope: 'consensus-only' }));
