import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);
const files = fs.readdirSync(root, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== 'HASHES.sha256')
  .map((entry) => entry.name)
  .sort();
const lines = files.map((name) => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
  return `${digest}  ${name}`;
});
fs.writeFileSync(path.join(root, 'HASHES.sha256'), `${lines.join('\n')}\n`);
