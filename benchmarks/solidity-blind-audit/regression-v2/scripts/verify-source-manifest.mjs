import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const manifest = JSON.parse(
  await readFile(path.join(root, "source-manifest.json"), "utf8")
);

const lines = [];
for (const [relative, expected] of Object.entries(manifest.files)) {
  const bytes = await readFile(path.join(root, relative));
  const actual = createHash("sha256").update(bytes).digest("hex");
  assert.equal(actual, expected, `source hash mismatch: ${relative}`);
  lines.push(`${actual}  ${relative}\n`);
}

const combined = createHash("sha256").update(lines.join("")).digest("hex");
assert.equal(combined, manifest.combined_digest, "combined manifest mismatch");
process.stdout.write(JSON.stringify({
  status: "passed",
  files: lines.length,
  combined_digest: combined
}) + "\n");
