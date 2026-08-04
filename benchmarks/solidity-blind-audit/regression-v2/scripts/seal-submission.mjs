import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const regressionRoot = path.join(root, "regression-v2");
const roots = ["contracts", "evidence", "goal-state", "maps", "scripts", "submission", "tests"];

async function walk(relative) {
  const entries = await readdir(path.join(regressionRoot, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child));
    else if (entry.isFile() && child !== "submission/submission-seal.json") files.push(child);
  }
  return files;
}

const files = (await Promise.all(roots.map(walk))).flat().sort();
const hashes = {};
const aggregateLines = [];
for (const relative of files) {
  const bytes = await readFile(path.join(regressionRoot, relative));
  const digest = createHash("sha256").update(bytes).digest("hex");
  hashes[relative] = digest;
  aggregateLines.push(`${digest}  ${relative}\n`);
}
const aggregate = createHash("sha256").update(aggregateLines.join("")).digest("hex");
const seal = {
  schema_version: 1,
  run_kind: "same-target-revealed-regression",
  contamination_notice: "Post-reveal freeze; no blind, novelty, or generalization claim.",
  target_commit: "75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d",
  source_manifest_digest: "9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926",
  aim_revision: "c4131ba",
  sealed_at: new Date().toISOString(),
  file_count: files.length,
  aggregate_sha256: aggregate,
  files: hashes
};
await writeFile(
  path.join(regressionRoot, "submission/submission-seal.json"),
  JSON.stringify(seal, null, 2) + "\n"
);
process.stdout.write(JSON.stringify({
  status: "sealed",
  file_count: files.length,
  aggregate_sha256: aggregate
}) + "\n");
