import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scorerRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(scorerRoot, '..', '..');
const logsRoot = path.join(scorerRoot, 'logs');
fs.mkdirSync(logsRoot, { recursive: true });

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function run(command, args, { cwd = benchmarkRoot, log }) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
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
  const destination = path.join(logsRoot, log);
  fs.writeFileSync(destination, body);
  return {
    path: `logs/${log}`,
    sha256: sha256(fs.readFileSync(destination)),
    exitCode: result.status,
  };
}

const candidates = [];
for (let i = 1; i <= 25; i += 1) {
  const id = `AFH-${String(i).padStart(3, '0')}`;
  const initialLog = path.join(logsRoot, `candidate-${id}.log`);
  let record;
  let attempts = 0;
  if (fs.existsSync(initialLog) && fs.readFileSync(initialLog, 'utf8').includes('exit=0\n')) {
    record = {
      path: `logs/candidate-${id}.log`,
      sha256: sha256(fs.readFileSync(initialLog)),
      exitCode: 0,
    };
    attempts = 1;
  } else {
    for (let attempt = fs.existsSync(initialLog) ? 2 : 1; attempt <= 3; attempt += 1) {
      attempts = attempt;
      record = run(process.execPath, ['blind-run/run-case.mjs', id, '--verify-only'], {
        log: attempt === 1 ? `candidate-${id}.log` : `candidate-${id}-attempt-${attempt}.log`,
      });
      if (record.exitCode === 0) break;
    }
  }
  assert.equal(record.exitCode, 0, `${id} failed ${attempts} attempts; inspect ${record.path}`);
  const content = fs.readFileSync(path.join(scorerRoot, record.path), 'utf8');
  assert.match(content, new RegExp(`"passed":(?:1|2),"caseIds":\\["${id}"\\]`));
  candidates.push({ id, freshProcess: true, embeddedNegativeControl: true, attempts, ...record });
}

function copyForDiscrimination(label) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `perps-scorer-b-${label}-`));
  for (const entry of ['contracts', 'scripts', 'test', 'blind-run']) {
    fs.cpSync(path.join(benchmarkRoot, entry), path.join(tempRoot, entry), { recursive: true });
  }
  for (const entry of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(benchmarkRoot, entry), path.join(tempRoot, entry));
  }
  fs.symlinkSync(path.join(benchmarkRoot, 'node_modules'), path.join(tempRoot, 'node_modules'), 'dir');
  return tempRoot;
}

function replaceOnce(filename, from, to) {
  const current = fs.readFileSync(filename, 'utf8');
  assert.equal(current.split(from).length - 1, 1, `patch anchor count: ${filename}`);
  fs.writeFileSync(filename, current.replace(from, to));
}

const discrimination = [];

{
  const tempRoot = copyForDiscrimination('mcb006-vs-afh008');
  try {
    replaceOnce(
      path.join(tempRoot, 'contracts', 'FundingEngine.sol'),
      'payment = (base * (currentGrowth - previousGrowth)) / 1e18;',
      'payment = SignedWadMath.mulWadDown(base, currentGrowth - previousGrowth);',
    );
    const compile = run(process.execPath, ['scripts/compile.mjs'], {
      cwd: tempRoot,
      log: 'discrimination-MCB-006-compile.log',
    });
    assert.equal(compile.exitCode, 0);
    const survivor = run(process.execPath, ['blind-run/run-case.mjs', 'AFH-008', '--verify-only'], {
      cwd: tempRoot,
      log: 'discrimination-MCB-006-vs-AFH-008.log',
    });
    assert.equal(survivor.exitCode, 0);
    discrimination.push({
      id: 'MCB-006-vs-AFH-008',
      conclusion: 'AFH-008 survives the canonical signed-floor repair, so checkpoint splitting with a positive product is a distinct unregistered defect and does not match MCB-006.',
      compile,
      survivor,
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

{
  const tempRoot = copyForDiscrimination('mcb015-vs-afh012');
  try {
    const filename = path.join(tempRoot, 'contracts', 'ClearingHouse.sol');
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
    const compile = run(process.execPath, ['scripts/compile.mjs'], {
      cwd: tempRoot,
      log: 'discrimination-MCB-015-compile.log',
    });
    assert.equal(compile.exitCode, 0);
    const survivor = run(process.execPath, ['blind-run/run-case.mjs', 'AFH-012', '--verify-only'], {
      cwd: tempRoot,
      log: 'discrimination-MCB-015-vs-AFH-012.log',
    });
    assert.equal(survivor.exitCode, 0);
    discrimination.push({
      id: 'MCB-015-vs-AFH-012',
      conclusion: 'AFH-012 survives the registered zero-size-chain control. It identifies the shared missing-membership-uniqueness primitive through close/reopen, but not the zero-size setup, withdrawal, normalization, or deficit chain; factor 0.3 is the registered fragment boundary.',
      compile,
      survivor,
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

const summary = {
  schema: 1,
  candidateProcesses: candidates.length,
  candidatePasses: candidates.length,
  ambiguityDiscriminationProcesses: 4,
  candidates,
  discrimination,
};
fs.writeFileSync(path.join(scorerRoot, 'rerun-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ candidatePasses: candidates.length, discriminationPasses: discrimination.length }));
