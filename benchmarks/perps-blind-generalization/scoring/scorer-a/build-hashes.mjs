import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname);
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() ? [path.relative(root, full).split(path.sep).join('/')] : [];
  });
}
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const files = walk(root).filter((relative) => relative !== 'HASHES.sha256').sort();
const lines = files.map((relative) => `${sha256(fs.readFileSync(path.join(root, relative)))}  ${relative}`);
fs.writeFileSync(path.join(root, 'HASHES.sha256'), `${lines.join('\n')}\n`);
