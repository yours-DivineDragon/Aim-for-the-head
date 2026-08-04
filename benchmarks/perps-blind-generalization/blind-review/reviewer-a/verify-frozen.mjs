import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const targetRoot = path.resolve(import.meta.dirname, '..', '..');
const read = (relative) => fs.readFileSync(path.join(targetRoot, relative));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const inventory = JSON.parse(read('blind-run/HASH_INVENTORY.json'));
const submission = JSON.parse(read('blind-run/submission.json'));
const failures = [];

for (const entry of inventory.files) {
  const actual = sha(read(entry.path));
  if (actual !== entry.sha256) failures.push({ kind: 'inventory-file', path: entry.path, expected: entry.sha256, actual });
}

const submissionHash = sha(read('blind-run/submission.json'));
const reportHash = sha(read('blind-run/REPORT.md'));
const evidenceLines = fs.readdirSync(path.join(targetRoot, 'blind-run', 'evidence'))
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => `${sha(read(`blind-run/evidence/${name}`))}  blind-run/evidence/${name}\n`)
  .join('');
const evidenceChain = sha(evidenceLines);
if (submissionHash !== inventory.root_hashes.submission) failures.push({ kind: 'root-submission' });
if (reportHash !== inventory.root_hashes.report) failures.push({ kind: 'root-report' });
if (evidenceChain !== inventory.root_hashes.evidence_canonical_chain) failures.push({ kind: 'root-evidence-chain' });
const manifestFileHash = sha(read('SOURCE_MANIFEST.json'));
if (manifestFileHash !== submission.target.manifest_sha256) failures.push({ kind: 'manifest-file' });

console.log(JSON.stringify({
  valid: failures.length === 0,
  inventoryFiles: inventory.files.length,
  submissionHash,
  reportHash,
  evidenceChain,
  manifestFileHash,
  manifestAggregate: inventory.manifest_aggregate_sha256,
  failures,
}));
if (failures.length) process.exitCode = 1;
