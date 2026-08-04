import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const blindRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(blindRoot, '..');
const evidenceRoot = path.join(blindRoot, 'evidence');

const cases = {
  'AFH-001': [['blind-run/poc/core-accounting.test.mjs', 'H-001']],
  'AFH-002': [['blind-run/poc/integration-accounting.test.mjs', 'H-002'], ['blind-run/poc/integration-accounting.test.mjs', 'H-025']],
  'AFH-003': [['blind-run/poc/integration-accounting.test.mjs', 'H-003']],
  'AFH-004': [['blind-run/poc/integration-accounting.test.mjs', 'H-004']],
  'AFH-005': [['blind-run/poc/core-accounting.test.mjs', 'H-005']],
  'AFH-006': [['blind-run/poc/lifecycle.test.mjs', 'H-006']],
  'AFH-007': [['blind-run/poc/core-accounting.test.mjs', 'H-007']],
  'AFH-008': [['blind-run/poc/core-accounting.test.mjs', 'H-008']],
  'AFH-009': [['blind-run/poc/lifecycle.test.mjs', 'H-009']],
  'AFH-010': [['blind-run/poc/core-accounting.test.mjs', 'H-010']],
  'AFH-011': [['blind-run/poc/composition-boundaries.test.mjs', 'H-011']],
  'AFH-012': [['blind-run/poc/core-accounting.test.mjs', 'H-012']],
  'AFH-013': [['blind-run/poc/core-accounting.test.mjs', 'H-013']],
  'AFH-014': [['blind-run/poc/core-accounting.test.mjs', 'H-014']],
  'AFH-015': [['blind-run/poc/core-accounting.test.mjs', 'H-015']],
  'AFH-016': [['blind-run/poc/lifecycle.test.mjs', 'H-016']],
  'AFH-017': [['blind-run/poc/lifecycle.test.mjs', 'H-017']],
  'AFH-018': [['blind-run/poc/lifecycle.test.mjs', 'H-018']],
  'AFH-019': [['blind-run/poc/lifecycle.test.mjs', 'H-019']],
  'AFH-020': [['blind-run/poc/lifecycle.test.mjs', 'H-020']],
  'AFH-021': [['blind-run/poc/integration-accounting.test.mjs', 'H-021']],
  'AFH-022': [['blind-run/poc/integration-accounting.test.mjs', 'H-022']],
  'AFH-023': [['blind-run/poc/integration-accounting.test.mjs', 'H-023']],
  'AFH-024': [['blind-run/poc/integration-accounting.test.mjs', 'H-024']],
  'AFH-025': [['blind-run/poc/composition-boundaries.test.mjs', 'H-027']],
};

function run(caseId, writeEvidence = true) {
  const specs = cases[caseId];
  if (!specs) throw new Error(`unknown case ${caseId}`);
  const executions = [];
  for (const [file, pattern] of specs) {
    const args = ['--test', '--test-concurrency=1', `--test-name-pattern=${pattern}`, file];
    const result = spawnSync(process.execPath, args, { cwd: targetRoot, encoding: 'utf8' });
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    const oracleLines = combined.split(/\r?\n/).filter((line) => line.startsWith('{"hunterId"'));
    if (result.status !== 0 || oracleLines.length !== 1) {
      throw new Error(`${caseId}/${pattern} failed fresh reproduction (exit ${result.status}, oracle lines ${oracleLines.length})\n${combined}`);
    }
    const oracle = JSON.parse(oracleLines[0]);
    executions.push({
      command: `node --test --test-concurrency=1 --test-name-pattern=${pattern} ${file}`,
      freshProcess: true,
      releaseLike: true,
      embeddedNegativeControl: true,
      oracle,
    });
  }
  const packet = {
    schemaVersion: 1,
    caseId,
    targetRevision: '158651792f770f5e827c1f0c363ea91f916cb1b8',
    compiler: 'solc-js 0.8.30; optimizer 300; viaIR; Shanghai; metadata hash disabled',
    runtime: 'Node 24; deterministic Ganache chain 31337; isolated local process',
    destructiveOrExternalEffects: false,
    executions,
  };
  if (writeEvidence) {
    fs.mkdirSync(evidenceRoot, { recursive: true });
    fs.writeFileSync(path.join(evidenceRoot, `${caseId}.json`), `${JSON.stringify(packet, null, 2)}\n`);
  }
  return packet;
}

const requested = process.argv[2];
const verifyOnly = process.argv.includes('--verify-only');
if (!requested) throw new Error('usage: node blind-run/run-case.mjs <AFH-NNN|all>');
const selected = requested === 'all' ? Object.keys(cases) : [requested];
const results = selected.map((caseId) => run(caseId, !verifyOnly));
console.log(JSON.stringify({ passed: results.length, caseIds: results.map((item) => item.caseId) }));
