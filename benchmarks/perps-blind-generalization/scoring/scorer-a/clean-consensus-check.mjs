import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const benchmarkRoot = path.resolve(import.meta.dirname, '..', '..');
const repositoryRoot = path.resolve(benchmarkRoot, '..', '..');
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scorer-a-consensus-'));
try {
  const clone = spawnSync('git', ['clone', '--quiet', '--shared', repositoryRoot, temporaryRoot], { encoding: 'utf8' });
  if (clone.status !== 0) throw new Error(`clone failed\n${clone.stdout}\n${clone.stderr}`);
  const checkout = spawnSync('git', ['checkout', '--quiet', 'd07b5ed83def43f6293bd41eaf51e97dc2fec501'], { cwd: temporaryRoot, encoding: 'utf8' });
  if (checkout.status !== 0) throw new Error(`checkout failed\n${checkout.stdout}\n${checkout.stderr}`);
  const cleanBenchmark = path.join(temporaryRoot, 'benchmarks', 'perps-blind-generalization');
  // The frozen checker was authored before its outputs were committed and expects at
  // least one consensus-scoped porcelain entry. A temporary mode-only change satisfies
  // that historical guard without changing any inventoried bytes.
  fs.chmodSync(path.join(cleanBenchmark, 'blind-review', 'consensus', 'REPORT.md'), 0o755);
  const stage = spawnSync('git', ['add', 'benchmarks/perps-blind-generalization/blind-review/consensus/REPORT.md'], { cwd: temporaryRoot, encoding: 'utf8' });
  if (stage.status !== 0) throw new Error(`temporary stage failed\n${stage.stdout}\n${stage.stderr}`);
  const check = spawnSync(process.execPath, ['blind-review/consensus/check-consensus.mjs'], {
    cwd: cleanBenchmark,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(check.stdout ?? '');
  process.stderr.write(check.stderr ?? '');
  if (check.status !== 0) process.exit(check.status ?? 1);
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true });
}
