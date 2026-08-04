import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const scorerRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(scorerRoot, '..', '..');
const summaryPath = path.join(scorerRoot, 'rerun-summary.json');
const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
const commands = [
  ['consensus-checker-clean-clone', process.execPath, ['scoring/scorer-a/clean-consensus-check.mjs']],
  ['compile-check', process.execPath, ['scoring/scorer-a/compile-check.mjs']],
  ['discrimination', process.execPath, ['--test', '--test-concurrency=1', 'scoring/scorer-a/discrimination.test.mjs']],
];
const replacedNames = new Set(['consensus-checker', ...commands.map(([name]) => name)]);
summary.commands = summary.commands.filter((item) => !replacedNames.has(item.name));

for (const [name, executable, args] of commands) {
  const startedAt = new Date().toISOString();
  const result = spawnSync(executable, args, { cwd: benchmarkRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const relativeLog = `logs/${name}.log`;
  fs.writeFileSync(path.join(scorerRoot, relativeLog), [
    `name=${name}`,
    `startedAt=${startedAt}`,
    `command=${[executable, ...args].join(' ')}`,
    `exit=${result.status}`,
    '',
    result.stdout ?? '',
    result.stderr ?? '',
  ].join('\n'));
  summary.commands.push({ name, command: [executable, ...args], exit: result.status, log: relativeLog });
  console.log(`${name}: exit ${result.status}`);
  if (result.status !== 0) {
    summary.complete = false;
    fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    process.exit(result.status ?? 1);
  }
}
summary.complete = true;
summary.note = 'The in-place frozen consensus checker was superseded by an exact d07b5ed clean-clone run because its historical path guard intentionally rejects later scoring directories.';
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
