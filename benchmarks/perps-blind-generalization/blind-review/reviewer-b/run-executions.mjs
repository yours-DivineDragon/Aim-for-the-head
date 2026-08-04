import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const reviewRoot = path.resolve(import.meta.dirname);
const targetRoot = path.resolve(reviewRoot, '..', '..');
const repositoryRoot = path.resolve(targetRoot, '..', '..');
const logRoot = path.join(reviewRoot, 'logs');
fs.mkdirSync(logRoot, { recursive: true });

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

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function run(label, command, args, cwd = targetRoot) {
  const started = new Date().toISOString();
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' } });
  const record = {
    label,
    startedUtc: started,
    finishedUtc: new Date().toISOString(),
    cwd,
    command: [command, ...args].join(' '),
    exitCode: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
  fs.writeFileSync(path.join(logRoot, `${label}.log`), `${JSON.stringify(record, null, 2)}\n`);
  if (result.status !== 0) throw new Error(`${label} failed with exit ${result.status}`);
  return record;
}

if (process.argv.includes('--independent-only')) {
  const independent = run('independent-review', process.execPath, ['--test', '--test-concurrency=1', 'blind-review/reviewer-b/independent-review.test.mjs']);
  console.log(JSON.stringify({ independentSuiteExitCode: independent.exitCode, log: 'logs/independent-review.log' }, null, 2));
  process.exit(0);
}

if (process.argv.includes('--hunter-clean')) {
  const tempRoot = fs.mkdtempSync('/tmp/perps-reviewer-b-check-');
  const cloneRoot = path.join(tempRoot, 'repo');
  try {
    const clone = spawnSync('git', ['clone', '--quiet', '--shared', repositoryRoot, cloneRoot], { encoding: 'utf8' });
    if (clone.status !== 0) throw new Error(`clean clone failed: ${clone.stderr}`);
    const cloneTarget = path.join(cloneRoot, 'benchmarks', 'perps-blind-generalization');
    const cloneModules = path.join(cloneTarget, 'node_modules');
    fs.mkdirSync(cloneModules);
    for (const entry of fs.readdirSync(path.join(targetRoot, 'node_modules'))) {
      fs.symlinkSync(path.join(targetRoot, 'node_modules', entry), path.join(cloneModules, entry));
    }
    fs.cpSync(path.join(targetRoot, 'blind-run', '.goal-hunt'), path.join(cloneTarget, 'blind-run', '.goal-hunt'), { recursive: true });
    run('compile-clean', 'npm', ['run', 'compile'], cloneTarget);
    run('ordinary-suite-clean', 'npm', ['test'], cloneTarget);
    const clean = run('hunter-checker-clean', process.execPath, ['blind-run/check-submission.mjs'], cloneTarget);
    console.log(JSON.stringify({ hunterCheckerCleanExitCode: clean.exitCode, log: 'logs/hunter-checker-clean.log' }, null, 2));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  process.exit(0);
}

if (process.argv.includes('--final-gates')) {
  const immutableFiles = [
    path.join(targetRoot, 'SOURCE_MANIFEST.json'),
    path.join(targetRoot, 'blind-run', 'submission.json'),
    path.join(targetRoot, 'blind-run', 'REPORT.md'),
    path.join(targetRoot, 'blind-run', 'HASH_INVENTORY.json'),
  ];
  const before = Object.fromEntries(immutableFiles.map((filename) => [path.relative(targetRoot, filename), sha256(filename)]));
  let finalCandidateProcesses = 0;
  for (const [caseId, specs] of Object.entries(cases)) {
    for (let index = 0; index < specs.length; index += 1) {
      const [file, pattern] = specs[index];
      const suffix = specs.length === 1 ? '' : `-${index + 1}`;
      run(`final-${caseId}${suffix}`, process.execPath, ['--test', '--test-concurrency=1', `--test-name-pattern=${pattern}`, file]);
      finalCandidateProcesses += 1;
    }
  }
  const ordinary = run('final-ordinary-suite', 'npm', ['test']);
  const independent = run('final-independent-review', process.execPath, ['--test', '--test-concurrency=1', 'blind-review/reviewer-b/independent-review.test.mjs']);
  const manifest = run('final-manifest-verify', 'npm', ['run', 'manifest:verify']);
  const seal = run('final-seal-verify', 'npm', ['run', 'seal:verify']);
  const diff = run('final-frozen-diff', 'git', [
    'diff', '--exit-code', '31ea4b7367a42fb1d87d486e945e54361a8d0ca3', '--',
    'benchmarks/perps-blind-generalization/README.md',
    'benchmarks/perps-blind-generalization/BENCHMARK_CONTRACT.md',
    'benchmarks/perps-blind-generalization/SPECIFICATION.md',
    'benchmarks/perps-blind-generalization/INVARIANTS.md',
    'benchmarks/perps-blind-generalization/THREAT_SURFACE.md',
    'benchmarks/perps-blind-generalization/PRE_REGISTRATION.md',
    'benchmarks/perps-blind-generalization/SOURCE_MANIFEST.json',
    'benchmarks/perps-blind-generalization/contracts',
    'benchmarks/perps-blind-generalization/test',
    'benchmarks/perps-blind-generalization/scripts',
    'benchmarks/perps-blind-generalization/package.json',
    'benchmarks/perps-blind-generalization/package-lock.json',
    'benchmarks/perps-blind-generalization/sealed',
    'benchmarks/perps-blind-generalization/blind-run',
  ], repositoryRoot);
  const scope = run('final-reviewer-b-scope', 'git', ['status', '--porcelain', '--untracked-files=all', '--', 'benchmarks/perps-blind-generalization/blind-review/reviewer-b'], repositoryRoot);
  const after = Object.fromEntries(immutableFiles.map((filename) => [path.relative(targetRoot, filename), sha256(filename)]));
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('immutable target/submission hashes changed during final gates');
  const summary = {
    schemaVersion: 1,
    completedUtc: new Date().toISOString(),
    targetRevision: '158651792f770f5e827c1f0c363ea91f916cb1b8',
    submissionRevision: '31ea4b7367a42fb1d87d486e945e54361a8d0ca3',
    immutableBefore: before,
    immutableAfter: after,
    initialCandidateProcessesPassed: 26,
    finalCandidateProcessesPassed: finalCandidateProcesses,
    cumulativeCandidateProcessesPassed: 26 + finalCandidateProcesses,
    uniqueCandidatesPassedInitiallyAndFinally: 25,
    finalOrdinaryTestsPassed: ordinary.stdout.includes('ℹ pass 5') ? 5 : 0,
    finalIndependentTestsPassed: independent.stdout.includes('ℹ pass 9') ? 9 : 0,
    finalManifestExitCode: manifest.exitCode,
    finalSealExitCode: seal.exitCode,
    finalFrozenDiffExitCode: diff.exitCode,
    finalReviewerScopeExitCode: scope.exitCode,
  };
  fs.writeFileSync(path.join(reviewRoot, 'final-execution-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}

const sourceManifest = path.join(targetRoot, 'SOURCE_MANIFEST.json');
const submission = path.join(targetRoot, 'blind-run', 'submission.json');
const hunterReport = path.join(targetRoot, 'blind-run', 'REPORT.md');
const hunterInventory = path.join(targetRoot, 'blind-run', 'HASH_INVENTORY.json');
const before = {
  sourceManifestSha256: sha256(sourceManifest),
  submissionSha256: sha256(submission),
  reportSha256: sha256(hunterReport),
  hunterInventorySha256: sha256(hunterInventory),
};

const reproductionRecords = [];
for (const [caseId, specs] of Object.entries(cases)) {
  for (let index = 0; index < specs.length; index += 1) {
    const [file, pattern] = specs[index];
    const suffix = specs.length === 1 ? '' : `-${index + 1}`;
    reproductionRecords.push(run(
      `${caseId}${suffix}`,
      process.execPath,
      ['--test', '--test-concurrency=1', `--test-name-pattern=${pattern}`, file],
    ));
  }
}

const ordinary = run('ordinary-suite', 'npm', ['test']);
const independent = run('independent-review', process.execPath, ['--test', '--test-concurrency=1', 'blind-review/reviewer-b/independent-review.test.mjs']);
const manifest = run('manifest-verify', 'npm', ['run', 'manifest:verify']);
const seal = run('seal-verify', 'npm', ['run', 'seal:verify']);
const hunterChecker = run('hunter-checker', process.execPath, ['blind-run/check-submission.mjs']);
const gitScope = run(
  'git-scope',
  'git',
  ['status', '--short', '--', 'benchmarks/perps-blind-generalization'],
  repositoryRoot,
);

const after = {
  sourceManifestSha256: sha256(sourceManifest),
  submissionSha256: sha256(submission),
  reportSha256: sha256(hunterReport),
  hunterInventorySha256: sha256(hunterInventory),
};

if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('immutable target/submission hashes changed');

const summary = {
  schemaVersion: 1,
  targetRevision: '158651792f770f5e827c1f0c363ea91f916cb1b8',
  submissionRevision: '31ea4b7367a42fb1d87d486e945e54361a8d0ca3',
  before,
  after,
  candidateCount: Object.keys(cases).length,
  reproductionProcessCount: reproductionRecords.length,
  reproductionPassCount: reproductionRecords.filter((item) => item.exitCode === 0).length,
  ordinarySuiteExitCode: ordinary.exitCode,
  independentSuiteExitCode: independent.exitCode,
  manifestExitCode: manifest.exitCode,
  sealExitCode: seal.exitCode,
  hunterCheckerExitCode: hunterChecker.exitCode,
  gitScopeExitCode: gitScope.exitCode,
  logCount: fs.readdirSync(logRoot).filter((item) => item.endsWith('.log')).length,
};
fs.writeFileSync(path.join(reviewRoot, 'execution-summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
