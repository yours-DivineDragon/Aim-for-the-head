import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const metadata = JSON.parse(fs.readFileSync(path.join(root, 'sealed', 'metadata.json'), 'utf8'));
const ciphertext = fs.readFileSync(path.join(root, 'sealed', 'private-bundle.tar.enc'));
const digest = crypto.createHash('sha256').update(ciphertext).digest('hex');
const checks = {
  cipher: metadata.cipher === 'AES-256-GCM',
  kdf: metadata.kdf?.name === 'scrypt' && metadata.kdf?.N === 16384 && metadata.kdf?.r === 8 && metadata.kdf?.p === 1,
  salt: /^[0-9a-f]{32}$/.test(metadata.saltHex),
  nonce: /^[0-9a-f]{24}$/.test(metadata.nonceHex),
  tag: /^[0-9a-f]{32}$/.test(metadata.tagHex),
  bytes: ciphertext.length === metadata.ciphertextBytes && metadata.plaintextBytes === metadata.ciphertextBytes,
  digest: digest === metadata.ciphertextSha256,
  commitment: /^[0-9a-f]{64}$/.test(metadata.plaintextSha256),
};
if (Object.values(checks).some((value) => !value)) {
  console.error(JSON.stringify({ verified: false, checks }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ verified: true, ciphertextSha256: digest, plaintextCommitment: metadata.plaintextSha256 }, null, 2));
}
