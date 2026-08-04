import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const revealRoot = path.resolve(import.meta.dirname);
const benchmarkRoot = path.resolve(revealRoot, '..');
const canonicalRoot = path.join(revealRoot, 'canonical');
const manifestPath = path.join(revealRoot, 'REVEAL_MANIFEST.json');
const keyHex = '781e168244802aee53e32760392cc6db32e9a91b4d67d8e9a5541ed6627e39be';
const expectedCanary = 'PRIVATE-CANARY-d769d4f52d3aa0b060ac53dc1af9df80fab83abf57349010';

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function readSeal() {
  const metadata = JSON.parse(fs.readFileSync(path.join(benchmarkRoot, 'sealed', 'metadata.json'), 'utf8'));
  const ciphertext = fs.readFileSync(path.join(benchmarkRoot, 'sealed', 'private-bundle.tar.enc'));
  assert.equal(sha256(ciphertext), metadata.ciphertextSha256, 'ciphertext digest');
  const derived = crypto.scryptSync(Buffer.from(keyHex, 'hex'), Buffer.from(metadata.saltHex, 'hex'), 32, {
    N: metadata.kdf.N,
    r: metadata.kdf.r,
    p: metadata.kdf.p,
    maxmem: 64 * 1024 * 1024,
  });
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, Buffer.from(metadata.nonceHex, 'hex'));
  decipher.setAAD(Buffer.from(metadata.associatedDataUtf8, 'utf8'));
  decipher.setAuthTag(Buffer.from(metadata.tagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  assert.equal(sha256(plaintext), metadata.plaintextSha256, 'authenticated plaintext commitment');
  assert.equal(plaintext.length, metadata.plaintextBytes, 'plaintext size');
  return { metadata, plaintext };
}

function deterministicTar(source) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-reveal-tar-'));
  const archive = path.join(work, 'canonical.tar');
  const result = spawnSync('tar', [
    '--sort=name',
    '--mtime=@0',
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '-cf',
    archive,
    '-C',
    source,
    '.',
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`canonical tar failed: ${result.stderr}`);
  const data = fs.readFileSync(archive);
  fs.rmSync(work, { recursive: true, force: true });
  return data;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function verifyManifest() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const actualFiles = walk(revealRoot)
    .map((file) => path.relative(revealRoot, file).split(path.sep).join('/'))
    .filter((file) => file !== 'REVEAL_MANIFEST.json')
    .sort();
  assert.deepEqual(actualFiles, manifest.entries.map((entry) => entry.path), 'manifest coverage');
  for (const entry of manifest.entries) {
    const data = fs.readFileSync(path.join(revealRoot, entry.path));
    assert.equal(data.length, entry.bytes, `size ${entry.path}`);
    assert.equal(sha256(data), entry.sha256, `digest ${entry.path}`);
  }
  const canonical = manifest.entries.map((entry) => `${entry.sha256}  ${entry.bytes}  ${entry.path}\n`).join('');
  assert.equal(sha256(canonical), manifest.aggregateSha256, 'manifest aggregate');
  return manifest;
}

function writeManifest() {
  const entries = walk(revealRoot)
    .map((file) => path.relative(revealRoot, file).split(path.sep).join('/'))
    .filter((file) => file !== 'REVEAL_MANIFEST.json')
    .sort()
    .map((file) => {
      const data = fs.readFileSync(path.join(revealRoot, file));
      return { path: file, bytes: data.length, sha256: sha256(data) };
    });
  const canonical = entries.map((entry) => `${entry.sha256}  ${entry.bytes}  ${entry.path}\n`).join('');
  const manifest = {
    schema: 1,
    hashAlgorithm: 'SHA-256',
    coverage: 'Every regular file below reveal/ except this manifest, with absence of unlisted files enforced by verify-reveal.mjs',
    canonicalization: 'UTF-8 lines: <sha256><two spaces><bytes><two spaces><path><LF>, sorted by path',
    fileCount: entries.length,
    aggregateSha256: sha256(canonical),
    entries,
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote reveal manifest for ${entries.length} files: ${manifest.aggregateSha256}`);
}

function command(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: benchmarkRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`);
}

const mode = process.argv[2] ?? 'verify';
if (mode === 'extract') {
  assert.equal(fs.existsSync(canonicalRoot), false, 'canonical directory must not preexist');
  const { plaintext } = readSeal();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-reveal-extract-'));
  try {
    const archive = path.join(work, 'canonical.tar');
    fs.writeFileSync(archive, plaintext);
    fs.mkdirSync(canonicalRoot, { recursive: true });
    command('tar', ['-xf', archive, '-C', canonicalRoot], { cwd: benchmarkRoot });
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  console.log(`Authenticated and extracted canonical bundle to ${canonicalRoot}`);
} else if (mode === 'manifest') {
  writeManifest();
} else if (mode === 'verify' || mode === 'full') {
  const { metadata } = readSeal();
  const recreated = deterministicTar(canonicalRoot);
  assert.equal(recreated.length, metadata.plaintextBytes, 'recreated canonical tar size');
  assert.equal(sha256(recreated), metadata.plaintextSha256, 'recreated canonical tar commitment');
  const canary = fs.readFileSync(path.join(canonicalRoot, 'canary.txt'), 'utf8').trim();
  assert.equal(canary, expectedCanary, 'published canary');
  const manifest = verifyManifest();
  const attestation = JSON.parse(fs.readFileSync(path.join(revealRoot, 'REVEAL_ATTESTATION.json'), 'utf8'));
  assert.equal(attestation.seal.plaintextSha256, metadata.plaintextSha256);
  assert.equal(attestation.seal.ciphertextSha256, metadata.ciphertextSha256);
  assert.equal(attestation.publication.decryptionKeyHex, keyHex);
  assert.equal(attestation.canary.value, expectedCanary);
  console.log(JSON.stringify({
    revealVerified: true,
    canonicalPlaintextSha256: metadata.plaintextSha256,
    ciphertextSha256: metadata.ciphertextSha256,
    revealManifestSha256: manifest.aggregateSha256,
    canary,
  }, null, 2));
  if (mode === 'full') {
    command(process.execPath, [path.join(canonicalRoot, 'hidden', 'run-private.mjs'), '--target', benchmarkRoot]);
    command('npm', ['run', 'manifest:verify']);
    command('npm', ['run', 'seal:verify']);
    command('npm', ['run', 'check']);
  }
} else {
  throw new Error('usage: node reveal/verify-reveal.mjs <extract|manifest|verify|full>');
}
