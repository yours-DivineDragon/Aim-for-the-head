import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const sourceIndex = process.argv.indexOf('--source');
const source = path.resolve(sourceIndex === -1 ? path.join(root, '.private-work') : process.argv[sourceIndex + 1]);
const sealed = path.join(root, 'sealed');
const aad = Buffer.from('meridian-clearing-private-v1', 'utf8');

async function stdinLine() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

const keyHex = await stdinLine();
if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('expected one 32-byte hexadecimal sealing secret on stdin');
if (!fs.existsSync(source)) throw new Error('private source directory not found');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-seal-'));
const archive = path.join(work, 'private-bundle.tar');
try {
  const tar = spawnSync('tar', [
    '--sort=name', '--mtime=@0', '--owner=0', '--group=0', '--numeric-owner',
    '-cf', archive, '-C', source, '.',
  ], { encoding: 'utf8' });
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr}`);
  const plaintext = fs.readFileSync(archive);
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const derived = crypto.scryptSync(Buffer.from(keyHex, 'hex'), salt, 32, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
  const cipher = crypto.createCipheriv('aes-256-gcm', derived, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.mkdirSync(sealed, { recursive: true });
  fs.writeFileSync(path.join(sealed, 'private-bundle.tar.enc'), ciphertext);
  const metadata = {
    schema: 1,
    format: 'deterministic POSIX tar encrypted as raw ciphertext; authentication tag stored in metadata',
    archiveCanonicalization: 'tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner',
    cipher: 'AES-256-GCM',
    kdf: { name: 'scrypt', N: 16384, r: 8, p: 1, derivedBytes: 32 },
    associatedDataUtf8: aad.toString('utf8'),
    saltHex: salt.toString('hex'),
    nonceHex: nonce.toString('hex'),
    tagHex: tag.toString('hex'),
    plaintextBytes: plaintext.length,
    plaintextSha256: crypto.createHash('sha256').update(plaintext).digest('hex'),
    ciphertextBytes: ciphertext.length,
    ciphertextSha256: crypto.createHash('sha256').update(ciphertext).digest('hex'),
  };
  fs.writeFileSync(path.join(sealed, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
  console.log(JSON.stringify({ plaintextSha256: metadata.plaintextSha256, ciphertextSha256: metadata.ciphertextSha256, plaintextBytes: metadata.plaintextBytes }, null, 2));
} finally {
  fs.rmSync(work, { recursive: true, force: true });
  keyHex.fill?.(0);
}
