import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const blindRoot = path.resolve(import.meta.dirname);
const repoRoot = path.resolve(blindRoot, '..', '..', '..');
const submission = JSON.parse(fs.readFileSync(path.join(blindRoot, 'submission.json'), 'utf8'));
const stateDir = 'benchmarks/perps-blind-generalization/blind-run/.goal-hunt';
const helper = 'scripts/goal_state.py';

function call(args) {
  const result = spawnSync('python3', [helper, ...args], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
}

function relativeTest(candidate) {
  return candidate.reproduction.tests[0].replace(/^blind-run\//, '../');
}

const mode = process.argv[2];
if (!['leads', 'validated', 'rejected'].includes(mode)) {
  throw new Error('usage: node blind-run/sync-goal-state.mjs <leads|validated|rejected>');
}

if (mode === 'leads') {
  for (const candidate of submission.candidates) {
    call(['candidate', '--dir', stateDir, '--id', candidate.id, '--status', 'lead', '--title', candidate.canonical_title, '--summary', candidate.root_cause, '--evidence', `../evidence/${candidate.id}.json`]);
  }
}

if (mode === 'validated') {
  for (const candidate of submission.candidates) {
    const evidence = `../evidence/${candidate.id}.json`;
    const gatePairs = [
      `attacker-control=${evidence}`,
      `reachability=${relativeTest(candidate)}`,
      'defense-analysis=../INVARIANT_CATALOG.md',
      `security-impact=${evidence}`,
      'realistic-configuration=../INITIAL_ATTESTATION.md',
      `safe-reproduction=${evidence}`,
      `release-reproduction=${evidence}`,
      `negative-control=${evidence}`,
      `independent-reproduction=${evidence}`,
      'duplicate-check=../HYPOTHESIS_LEDGER.md',
      'downstream-impact=../COMPOSITION_AND_CLOSURE.md',
      'composition-review=../COMPOSITION_AND_CLOSURE.md',
    ];
    const args = ['candidate', '--dir', stateDir, '--id', candidate.id, '--status', 'validated', '--title', candidate.canonical_title, '--summary', candidate.concrete_impact, '--evidence', evidence];
    for (const pair of gatePairs) args.push('--gate', pair);
    call(args);
  }
}

if (mode === 'rejected') {
  for (const candidate of submission.rejected_leads) {
    call([
      'candidate', '--dir', stateDir, '--id', candidate.id, '--status', 'rejected', '--title', candidate.title,
      '--summary', candidate.reason, '--evidence', '../evidence/REJECTED.json', '--failed-gate', candidate.first_failed_gate,
    ]);
  }
}

console.log(JSON.stringify({ synchronized: mode, count: mode === 'rejected' ? submission.rejected_leads.length : submission.candidates.length }));

