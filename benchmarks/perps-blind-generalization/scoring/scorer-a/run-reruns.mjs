import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const scorerRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(scorerRoot, '..', '..');
const logRoot = path.join(scorerRoot, 'logs');
fs.mkdirSync(logRoot, { recursive: true });

const commands = [
  ['input-manifest', process.execPath, ['scripts/manifest.mjs', 'verify']],
  ['seal-verifier', process.execPath, ['scripts/verify-seal.mjs']],
  ['reveal-verifier', process.execPath, ['reveal/verify-reveal.mjs', 'verify']],
  ['hidden-reproduction-controls', process.execPath, ['reveal/canonical/hidden/run-private.mjs', '--target', '.']],
  ['ordinary-tests', process.execPath, ['--test', '--test-concurrency=1', 'test/system.test.mjs']],
  ['candidate-reruns', process.execPath, ['blind-run/run-case.mjs', 'all', '--verify-only']],
  ['severity-cap-c017', process.execPath, ['--test', '--test-concurrency=1', '--test-name-pattern=C-017', 'blind-review/consensus/adjudication.test.mjs']],
  ['consensus-checker', process.execPath, ['blind-review/consensus/check-consensus.mjs']],
  ['compile-check', process.execPath, ['scoring/scorer-a/compile-check.mjs']],
  ['discrimination', process.execPath, ['--test', '--test-concurrency=1', 'scoring/scorer-a/discrimination.test.mjs']],
];

const summary = [];
for (const [name, executable, args] of commands) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, {
    cwd: benchmarkRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const output = [
    `name=${name}`,
    `startedAt=${startedAt}`,
    `command=${[executable, ...args].join(' ')}`,
    `exit=${result.status}`,
    '',
    result.stdout ?? '',
    result.stderr ?? '',
  ].join('\n');
  const relativeLog = `logs/${name}.log`;
  fs.writeFileSync(path.join(scorerRoot, relativeLog), output);
  summary.push({ name, command: [executable, ...args], exit: result.status, log: relativeLog });
  console.log(`${name}: exit ${result.status}`);
  if (result.status !== 0) {
    fs.writeFileSync(path.join(scorerRoot, 'rerun-summary.json'), `${JSON.stringify({ schema: 1, complete: false, commands: summary }, null, 2)}\n`);
    process.exit(result.status ?? 1);
  }
}

fs.writeFileSync(path.join(scorerRoot, 'rerun-summary.json'), `${JSON.stringify({ schema: 1, complete: true, commands: summary }, null, 2)}\n`);
