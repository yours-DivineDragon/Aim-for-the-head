import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
await mkdir(scriptDir, { recursive: true });

const startedAt = new Date();
const args = [
  "--test",
  "--test-concurrency=1",
  "reveal/ground-truth-package/tests/controls.test.mjs",
  "reveal/ground-truth-package/tests/exploits.test.mjs"
];
const child = spawn(process.execPath, args, {
  cwd: root,
  env: { ...process.env, CI: "1", FORCE_COLOR: "0", NO_COLOR: "1" },
  stdio: ["ignore", "pipe", "pipe"]
});
let stdout = "";
let stderr = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", chunk => { stdout += chunk; });
child.stderr.on("data", chunk => { stderr += chunk; });
const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", resolve);
});
const endedAt = new Date();
const log = [
  "# Post-reveal canonical validation suite",
  `command: ${process.execPath} ${args.join(" ")}`,
  `started_at: ${startedAt.toISOString()}`,
  `ended_at: ${endedAt.toISOString()}`,
  `duration_ms: ${endedAt - startedAt}`,
  `exit_code: ${exitCode}`,
  "interpretation: Canonical behavior confirmation after the workflow-v2 submission seal; not hunt input.",
  "",
  "## stdout",
  stdout.trimEnd(),
  "",
  "## stderr",
  stderr.trimEnd() || "(empty)",
  ""
].join("\n");
await writeFile(path.join(scriptDir, "hidden-suite.log"), log);
const summary = {
  schema_version: 1,
  run_kind: "post-reveal-canonical-validation",
  started_at: startedAt.toISOString(),
  ended_at: endedAt.toISOString(),
  duration_ms: endedAt - startedAt,
  exit_code: exitCode,
  expected_reproductions: 15,
  expected_controls: 15,
  submission_seal: "regression-v2/submission/submission-seal.json"
};
await writeFile(path.join(scriptDir, "hidden-suite-summary.json"), JSON.stringify(summary, null, 2) + "\n");
if (exitCode !== 0) process.exit(exitCode ?? 1);
process.stdout.write(JSON.stringify({ status: "passed", tests: 30 }) + "\n");
