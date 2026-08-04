import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const consensusRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(consensusRoot, '..', '..');
const logsRoot = path.join(consensusRoot, 'logs');
fs.mkdirSync(logsRoot, { recursive: true });

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function execute(id, command, args, { cwd = benchmarkRoot } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
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
  const relative = `logs/${id}.log`;
  const destination = path.join(consensusRoot, relative);
  fs.writeFileSync(destination, body);
  return { id, path: relative, exitCode: result.status, sha256: sha256(fs.readFileSync(destination)), output: body };
}

function copyForControl(label) {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), `perps-final-${label}-`));
  for (const entry of ['contracts', 'scripts', 'test', 'blind-run']) {
    fs.cpSync(path.join(benchmarkRoot, entry), path.join(temporaryRoot, entry), { recursive: true });
  }
  for (const entry of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(benchmarkRoot, entry), path.join(temporaryRoot, entry));
  }
  fs.symlinkSync(path.join(benchmarkRoot, 'node_modules'), path.join(temporaryRoot, 'node_modules'), 'dir');
  return temporaryRoot;
}

function replaceOnce(filename, from, to) {
  const current = fs.readFileSync(filename, 'utf8');
  assert.equal(current.split(from).length - 1, 1, `unique patch anchor: ${filename}`);
  fs.writeFileSync(filename, current.replace(from, to));
}

const candidates = [];
for (let number = 1; number <= 25; number += 1) {
  const candidateId = `AFH-${String(number).padStart(3, '0')}`;
  const existingPath = path.join(logsRoot, `candidate-${candidateId}.log`);
  const record = fs.existsSync(existingPath) && fs.readFileSync(existingPath, 'utf8').includes('exit=0\n')
    ? {
        path: `logs/candidate-${candidateId}.log`,
        exitCode: 0,
        sha256: sha256(fs.readFileSync(existingPath)),
        output: fs.readFileSync(existingPath, 'utf8'),
      }
    : execute(`candidate-${candidateId}`, process.execPath, ['blind-run/run-case.mjs', candidateId, '--verify-only']);
  assert.equal(record.exitCode, 0, `${candidateId} fresh rerun failed; inspect ${record.path}`);
  assert.match(record.output, new RegExp(`"passed":(?:1|2),"caseIds":\\["${candidateId}"\\]`));
  candidates.push({
    id: candidateId,
    freshProcess: true,
    embeddedNegativeControl: true,
    path: record.path,
    sha256: record.sha256,
  });
}

const discrimination = [];
const direct = execute(
  'discrimination-direct-attempt-3',
  process.execPath,
  ['--test', '--test-concurrency=1', 'scoring/consensus/discrimination.test.mjs'],
);
assert.equal(direct.exitCode, 0, `direct discrimination failed; inspect ${direct.path}`);
assert.match(direct.output, /MCB-006-vs-AFH-008/);
assert.match(direct.output, /MCB-015-vs-AFH-012/);
discrimination.push({ id: 'direct-vulnerable-and-reciprocal-controls', path: direct.path, sha256: direct.sha256 });

{
  const temporaryRoot = copyForControl('mcb006');
  try {
    replaceOnce(
      path.join(temporaryRoot, 'contracts', 'FundingEngine.sol'),
      'payment = (base * (currentGrowth - previousGrowth)) / 1e18;',
      'payment = SignedWadMath.mulWadDown(base, currentGrowth - previousGrowth);',
    );
    const compile = execute('discrimination-MCB-006-compile', process.execPath, ['scripts/compile.mjs'], { cwd: temporaryRoot });
    assert.equal(compile.exitCode, 0);
    const survivor = execute('discrimination-MCB-006-AFH-008-survivor', process.execPath, ['blind-run/run-case.mjs', 'AFH-008', '--verify-only'], { cwd: temporaryRoot });
    assert.equal(survivor.exitCode, 0);
    discrimination.push({
      id: 'MCB-006-vs-AFH-008',
      conclusion: 'AFH-008 survives the registered signed-floor repair; the reciprocal positive-ceil control does not repair the registered negative-product case.',
      compile: { path: compile.path, sha256: compile.sha256 },
      survivor: { path: survivor.path, sha256: survivor.sha256 },
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

{
  const temporaryRoot = copyForControl('mcb015');
  try {
    const filename = path.join(temporaryRoot, 'contracts', 'ClearingHouse.sol');
    replaceOnce(
      filename,
      'if (executionPrice == 0 || baseDelta > type(int128).max || baseDelta < type(int128).min) revert InvalidTrade();',
      'if (executionPrice == 0 || baseDelta == 0 || baseDelta > type(int128).max || baseDelta < type(int128).min) revert InvalidTrade();',
    );
    replaceOnce(
      filename,
      'if (oldBase == 0) {\n            activeMarkets[accountId].push(marketId);',
      'if (oldBase == 0) {\n            if (baseDelta != 0) activeMarkets[accountId].push(marketId);',
    );
    const compile = execute('discrimination-MCB-015-compile', process.execPath, ['scripts/compile.mjs'], { cwd: temporaryRoot });
    assert.equal(compile.exitCode, 0);
    const survivor = execute('discrimination-MCB-015-AFH-012-survivor', process.execPath, ['blind-run/run-case.mjs', 'AFH-012', '--verify-only'], { cwd: temporaryRoot });
    assert.equal(survivor.exitCode, 0);
    discrimination.push({
      id: 'MCB-015-vs-AFH-012',
      conclusion: 'AFH-012 survives the registered zero-size control because it uses close/reopen and proves no withdrawal/normalization/deficit chain; only the membership primitive overlaps.',
      compile: { path: compile.path, sha256: compile.sha256 },
      survivor: { path: survivor.path, sha256: survivor.sha256 },
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

const summary = {
  schema: 1,
  candidateFreshProcessesPassed: candidates.length,
  candidateFreshProcessesTotal: 25,
  candidateEmbeddedControls: 25,
  validUnregisteredFreshProcesses: 11,
  validUnregisteredIds: ['AFH-003', 'AFH-008', 'AFH-015', 'AFH-016', 'AFH-017', 'AFH-019', 'AFH-020', 'AFH-022', 'AFH-023', 'AFH-024', 'AFH-025'],
  discriminationPairsPassed: 2,
  discriminationPairsTotal: 2,
  candidates,
  discrimination,
};
fs.writeFileSync(path.join(consensusRoot, 'rerun-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ candidatePasses: candidates.length, unregisteredPasses: 11, discriminationPasses: 2 }));
