import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(root, 'SOURCE_MANIFEST.json');
const mode = process.argv[2] ?? 'verify';

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function includedFiles() {
  const explicit = [
    'README.md', 'PRE_REGISTRATION.md', 'BENCHMARK_CONTRACT.md', 'SPECIFICATION.md',
    'INVARIANTS.md', 'THREAT_SURFACE.md', 'package.json', 'package-lock.json',
  ];
  const groups = ['contracts', 'scripts', 'test'];
  const files = [...explicit.map((name) => path.join(root, name))];
  for (const group of groups) {
    for (const file of walk(path.join(root, group))) {
      if (file.endsWith('.sol') || file.endsWith('.mjs')) files.push(file);
    }
  }
  return files.map((file) => path.relative(root, file).split(path.sep).join('/')).sort();
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function calculate() {
  const entries = includedFiles().map((file) => ({
    path: file,
    bytes: fs.statSync(path.join(root, file)).size,
    sha256: sha256(fs.readFileSync(path.join(root, file))),
  }));
  const canonical = entries.map((entry) => `${entry.sha256}  ${entry.bytes}  ${entry.path}\n`).join('');
  return {
    schema: 1,
    hashAlgorithm: 'SHA-256',
    canonicalization: 'UTF-8 lines: <sha256><two spaces><bytes><two spaces><path><LF>, sorted by path',
    fileCount: entries.length,
    aggregateSha256: sha256(canonical),
    entries,
  };
}

if (mode === 'write') {
  const manifest = calculate();
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote SOURCE_MANIFEST.json for ${manifest.fileCount} files: ${manifest.aggregateSha256}`);
} else if (mode === 'verify') {
  const recorded = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actual = calculate();
  if (JSON.stringify(recorded) !== JSON.stringify(actual)) {
    console.error('SOURCE_MANIFEST.json does not match hunter-visible inputs.');
    process.exitCode = 1;
  } else {
    console.log(`Verified ${actual.fileCount} manifest files: ${actual.aggregateSha256}`);
  }
} else {
  throw new Error('usage: node scripts/manifest.mjs <write|verify>');
}
