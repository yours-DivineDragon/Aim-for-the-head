import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const outputArgument = process.argv.find(value => value.startsWith("--output-dir="));
const sealed = existsSync(path.join(root, "regression-v2/submission/submission-seal.json"));
const outputRelative = outputArgument
  ? outputArgument.slice("--output-dir=".length)
  : sealed ? "regression-v2/replay-evidence" : "regression-v2/evidence";
if (!/^regression-v2\/[a-z0-9][a-z0-9-]*$/u.test(outputRelative)) {
  throw new Error("--output-dir must be a simple directory directly under regression-v2");
}
const evidenceDir = path.join(root, outputRelative);
await mkdir(evidenceDir, { recursive: true });

const environment = {
  ...process.env,
  CI: "1",
  FORCE_COLOR: "0",
  NO_COLOR: "1"
};

async function execute(label, command, args) {
  const startedAt = new Date();
  const child = spawn(command, args, {
    cwd: root,
    env: environment,
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
  const record = {
    label,
    command: [command, ...args],
    started_at: startedAt.toISOString(),
    ended_at: endedAt.toISOString(),
    duration_ms: endedAt - startedAt,
    exit_code: exitCode,
    stdout,
    stderr
  };
  if (exitCode !== 0) {
    const error = new Error(`${label} failed with exit code ${exitCode}`);
    error.record = record;
    throw error;
  }
  return record;
}

function render(records) {
  return records.map(record => [
    `## ${record.label}`,
    `command: ${record.command.join(" ")}`,
    `started_at: ${record.started_at}`,
    `ended_at: ${record.ended_at}`,
    `duration_ms: ${record.duration_ms}`,
    `exit_code: ${record.exit_code}`,
    "",
    "### stdout",
    record.stdout.trimEnd(),
    "",
    "### stderr",
    record.stderr.trimEnd() || "(empty)",
    ""
  ].join("\n")).join("\n");
}

const startedAt = new Date().toISOString();
const completed = [];
let failure;

try {
  const manifest = await execute(
    "frozen source manifest",
    process.execPath,
    ["regression-v2/scripts/verify-source-manifest.mjs"]
  );
  completed.push(manifest);
  await writeFile(path.join(evidenceDir, "source-manifest.log"), render([manifest]));

  const ordinary = await execute("ordinary compile and test suite", "npm", ["run", "check"]);
  completed.push(ordinary);
  await writeFile(path.join(evidenceDir, "ordinary-suite.log"), render([ordinary]));

  const retainedIds = ["C-008", "C-006", "C-010", "C-003", "C-002", "C-007", "C-005", "C-009", "C-004"];
  const retained = [];
  for (const id of retainedIds) {
    const record = await execute(
      `retained exact regression ${id}`,
      "bash",
      [`run/evidence/${id}/reproduce.sh`]
    );
    retained.push(record);
    completed.push(record);
  }
  await writeFile(path.join(evidenceDir, "retained-exact-regressions.log"), render(retained));

  const deep = await execute(
    "workflow-v2 deep positive and negative controls",
    process.execPath,
    ["--test", "--test-concurrency=1", "regression-v2/tests/deep-regressions.test.mjs"]
  );
  completed.push(deep);
  await writeFile(path.join(evidenceDir, "deep-regressions.log"), render([deep]));

  const deepIndependent = await execute(
    "independent fresh-process repeat of workflow-v2 deep controls",
    process.execPath,
    ["--test", "--test-concurrency=1", "regression-v2/tests/deep-regressions.test.mjs"]
  );
  completed.push(deepIndependent);
  await writeFile(
    path.join(evidenceDir, "deep-regressions-independent.log"),
    render([deepIndependent])
  );
} catch (error) {
  failure = error;
  if (error.record) completed.push(error.record);
}

const endedAt = new Date().toISOString();
const summary = {
  schema_version: 1,
  run_kind: "same-target-revealed-regression",
  contamination_notice: "The benchmark truth was known before this run; this is not blind, novel, or a generalization estimate.",
  started_at: startedAt,
  ended_at: endedAt,
  status: failure ? "failed" : "passed",
  commands: completed.map(({ stdout, stderr, ...record }) => ({
    ...record,
    stdout_bytes: Buffer.byteLength(stdout),
    stderr_bytes: Buffer.byteLength(stderr)
  }))
};
await writeFile(
  path.join(evidenceDir, "execution-summary.json"),
  JSON.stringify(summary, null, 2) + "\n"
);

if (failure) throw failure;
process.stdout.write(JSON.stringify({
  status: "passed",
  commands: completed.length,
  evidence_dir: path.relative(root, evidenceDir)
}) + "\n");
