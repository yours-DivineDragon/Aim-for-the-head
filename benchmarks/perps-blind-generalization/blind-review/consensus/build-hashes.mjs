import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`refusing symlink: ${absolute}`);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const files = walk(root)
  .filter((absolute) => path.basename(absolute) !== 'HASHES.sha256')
  .sort((first, second) => first.localeCompare(second));
const lines = files.map((absolute) => {
  const relative = path.relative(root, absolute).split(path.sep).join('/');
  return `${sha256(fs.readFileSync(absolute))}  ${relative}`;
});
fs.writeFileSync(path.join(root, 'HASHES.sha256'), `${lines.join('\n')}\n`);
console.log(`hashed ${files.length} consensus artifacts`);
