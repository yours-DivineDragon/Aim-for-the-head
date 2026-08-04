import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const consensusRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(consensusRoot, '..', '..');
const logRoot = path.join(consensusRoot, 'logs');
fs.mkdirSync(logRoot, { recursive: true });

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function execute(name, command, args) {
  const result = spawnSync(command, args, {
    cwd: targetRoot,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
    maxBuffer: 32 * 1024 * 1024,
  });
  const body = [
    `command=${command} ${args.join(' ')}`,
    `exit=${result.status}`,
    '--- stdout ---',
    result.stdout ?? '',
    '--- stderr ---',
    result.stderr ?? '',
  ].join('\n');
  const relative = `logs/terminal-${name}.log`;
  const absolute = path.join(consensusRoot, relative);
  fs.writeFileSync(absolute, body.endsWith('\n') ? body : `${body}\n`);
  if (result.status !== 0) throw new Error(`${name} failed with exit ${result.status}`);
  return { path: relative, sha256: sha256(fs.readFileSync(absolute)), exit: result.status, stdout: result.stdout ?? '' };
}

const compile = execute('compile', process.execPath, ['scripts/compile.mjs']);
const ordinary = execute('ordinary-suite', process.execPath, ['--test', '--test-concurrency=1', 'test/system.test.mjs']);
if (!/tests 5/.test(ordinary.stdout) || !/pass 5/.test(ordinary.stdout) || !/fail 0/.test(ordinary.stdout)) {
  throw new Error('ordinary suite did not report 5/5');
}
const manifest = execute('manifest-verify', process.execPath, ['scripts/manifest.mjs', 'verify']);
const seal = execute('seal-verify', process.execPath, ['scripts/verify-seal.mjs']);
const consensusRerun = execute('consensus-reruns', process.execPath, ['blind-review/consensus/run-consensus.mjs']);
const rerunSummaryPath = path.join(consensusRoot, 'rerun-summary.json');
const rerunSummary = JSON.parse(fs.readFileSync(rerunSummaryPath, 'utf8'));

const output = {
  schemaVersion: 1,
  targetRevision: '158651792f770f5e827c1f0c363ea91f916cb1b8',
  ordinary: { tests: 5, passed: 5, failed: 0, ...ordinary },
  compile,
  manifest,
  seal,
  consensusRerun,
  rerunSummary: { path: 'rerun-summary.json', sha256: sha256(fs.readFileSync(rerunSummaryPath)) },
  freshTargetTestProcesses: rerunSummary.counts.totalFreshTargetTestProcesses,
};
for (const item of Object.values(output)) if (item && typeof item === 'object') delete item.stdout;
fs.writeFileSync(path.join(consensusRoot, 'terminal-verification.json'), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ ordinary: '5/5', manifest: 'pass', seal: 'pass', freshTargetTestProcesses: output.freshTargetTestProcesses }));
