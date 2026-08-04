import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
async function stdinLine() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8').trim();
}

const keyHex = await stdinLine();
if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) throw new Error('pipe one externally supplied 32-byte hexadecimal secret to stdin');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'sealed', 'metadata.json'), 'utf8'));
const ciphertext = fs.readFileSync(path.join(root, 'sealed', 'private-bundle.tar.enc'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-reveal-'));
try {
  const derived = crypto.scryptSync(Buffer.from(keyHex, 'hex'), Buffer.from(metadata.saltHex, 'hex'), 32, {
    N: metadata.kdf.N, r: metadata.kdf.r, p: metadata.kdf.p, maxmem: 64 * 1024 * 1024,
  });
  const decipher = crypto.createDecipheriv('aes-256-gcm', derived, Buffer.from(metadata.nonceHex, 'hex'));
  decipher.setAAD(Buffer.from(metadata.associatedDataUtf8, 'utf8'));
  decipher.setAuthTag(Buffer.from(metadata.tagHex, 'hex'));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const digest = crypto.createHash('sha256').update(plaintext).digest('hex');
  if (digest !== metadata.plaintextSha256) throw new Error('plaintext commitment mismatch');
  const archive = path.join(work, 'bundle.tar');
  const extracted = path.join(work, 'bundle');
  fs.writeFileSync(archive, plaintext);
  fs.mkdirSync(extracted);
  const tar = spawnSync('tar', ['-xf', archive, '-C', extracted], { encoding: 'utf8' });
  if (tar.status !== 0) throw new Error(`tar extraction failed: ${tar.stderr}`);
  fs.rmSync(archive, { force: true });
  const run = spawnSync(process.execPath, [path.join(extracted, 'hidden', 'run-private.mjs'), '--target', root], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(run.stdout);
  process.stderr.write(run.stderr);
  if (run.status !== 0) process.exitCode = run.status ?? 1;
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
