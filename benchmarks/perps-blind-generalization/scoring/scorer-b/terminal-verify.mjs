import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const scorerRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(scorerRoot, '..', '..');
const logsRoot = path.join(scorerRoot, 'logs');
fs.mkdirSync(logsRoot, { recursive: true });

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function run(id, command, args) {
  const result = spawnSync(command, args, {
    cwd: benchmarkRoot,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const body = [
    `$ ${command} ${args.join(' ')}`,
    `cwd=${benchmarkRoot}`,
    `exit=${result.status}`,
    '',
    result.stdout ?? '',
    result.stderr ?? '',
  ].join('\n');
  const relative = `logs/terminal-${id}.log`;
  const filename = path.join(scorerRoot, relative);
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

const reveal = run('reveal', process.execPath, ['reveal/verify-reveal.mjs', 'verify']);
assert.match(reveal.output, /"revealVerified": true/);
assert.match(reveal.output, /"canonicalPlaintextSha256": "fcf3d39b469073757a1191aba5eb870c655fb4f8b3efb862db07550a072ff66e"/);

const discrimination = run('discrimination', process.execPath, ['scoring/scorer-b/run-reruns.mjs']);
assert.match(discrimination.output, /"candidatePasses":25/);
assert.match(discrimination.output, /"discriminationPasses":2/);

const prehashChecker = run('score-prehash-checker', process.execPath, ['scoring/scorer-b/check-score.mjs', '--prehash']);
assert.match(prehashChecker.output, /"scoreCheck": "pass"/);

const records = [hidden, ordinary, manifest, seal, reveal, discrimination, prehashChecker]
  .map(({ output: _output, ...record }) => record);
const result = {
  schema: 1,
  status: 'pass',
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
  candidateReruns: { passed: 25, total: 25, embeddedControls: 25 },
  ambiguityDiscrimination: { pairsPassed: 2, pairsTotal: 2, freshProcesses: 4 },
  scorePrehashChecker: 'pass',
  commands: records,
};
fs.writeFileSync(path.join(scorerRoot, 'terminal-verification.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ status: 'pass', commands: records.length, hidden: '15+15/15+15', ordinary: '5/5', discrimination: '2/2' }));
