import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);

function list(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const relative = path.join(prefix, entry.name);
      if (entry.isDirectory()) return list(path.join(directory, entry.name), relative);
      return relative === 'HASHES.sha256' ? [] : [relative];
    })
    .sort();
}

const lines = list(root).map((relative) => {
  const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex');
  return `${digest}  ${relative}`;
});
fs.writeFileSync(path.join(root, 'HASHES.sha256'), `${lines.join('\n')}\n`);
console.log(JSON.stringify({ filesHashed: lines.length }));
