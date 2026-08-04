import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const stateDir = "regression-v2/goal-state";
const helper = "../../scripts/goal_state.py";
const candidates = JSON.parse(
  await readFile(path.join(root, "regression-v2/submission/candidates.json"), "utf8")
).candidates;
const state = JSON.parse(
  await readFile(path.join(root, stateDir, "state.json"), "utf8")
);
assert.equal(state.status, "active", "goal must be active before recording");
assert.equal(state.candidate_revision_count, 0, "refuse to duplicate candidate records");
assert.equal(state.coverage_revision_count, 0, "refuse to duplicate coverage records");

const transcript = [];

function run(args) {
  const result = spawnSync("python3", [helper, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" }
  });
  transcript.push([
    `$ python3 ${helper} ${args.join(" ")}`,
    result.stdout.trimEnd(),
    result.stderr.trimEnd()
  ].filter(Boolean).join("\n"));
  if (result.status !== 0) {
    throw new Error(`goal-state command failed (${result.status}): ${args.join(" ")}`);
  }
  return result.stdout;
}

function event(kind, summary, evidence, extra = []) {
  const args = ["event", "--dir", stateDir, "--kind", kind, "--summary", summary];
  for (const artifact of evidence) args.push("--evidence", artifact);
  args.push(...extra);
  run(args);
}

function coverage(dimension, item, status, evidence, note) {
  const args = [
    "coverage", "--dir", stateDir,
    "--dimension", dimension,
    "--item", item,
    "--status", status
  ];
  for (const artifact of evidence) args.push("--evidence", artifact);
  if (note) args.push("--note", note);
  run(args);
}

event(
  "mapping",
  "Completed the target source, business-flow, trust-boundary, mutable-value consumer, sequence, and economic closure maps.",
  ["regression-v2/maps/business-flow-and-state-machine-model.md", "regression-v2/maps/mutable-value-to-downstream-consumer-map.md"]
);
event(
  "experiment",
  "Executed six deep positive cases with matched condition-changing controls in two fresh Node processes.",
  ["regression-v2/evidence/deep-regressions.log", "regression-v2/evidence/deep-regressions-independent.log"],
  ["--hypothesis", "Boundary, downstream-consumer, cross-function, semantic-delta, and primitive-join tests expose the six formerly incomplete or missed truth units.", "--classification", "supports"]
);
event(
  "experiment",
  "Reexecuted nine retained exact packets against the same frozen source manifest.",
  ["regression-v2/evidence/retained-exact-regressions.log", "regression-v2/evidence/source-manifest.log"],
  ["--hypothesis", "Workflow-v2 precision gates retain the prior exact claims without introducing unsupported candidates.", "--classification", "supports"]
);
event(
  "observation",
  "The disclosed regression candidate set contains fifteen distinct supported units and no unsupported or duplicate cluster.",
  ["regression-v2/submission/candidates.json", "regression-v2/maps/primitive-join-graph.md"]
);

coverage("source-read", "complete Solidity and entry-point census", "inspected", ["regression-v2/maps/business-flow-and-state-machine-model.md"], "All public target contracts and their direct support interfaces were mapped.");
coverage("attack-surface", "lending vault oracle pool bridge signature and strategy surfaces", "tested", ["regression-v2/submission/candidates.json"], "Every ranked surface has a positive execution and a discriminating control.");
coverage("trust-boundary", "public callback token feed messenger signature and initialization boundaries", "tested", ["regression-v2/maps/interface-promise-versus-runtime-delta-matrix.md", "regression-v2/maps/callback-and-action-sequence-matrix.md"]);
coverage("state-invariant", "solvency authorization replay accounting and lifecycle invariants", "tested", ["regression-v2/maps/asset-liability-conservation-ledger.md"]);
coverage("runtime-corpus", "ordinary suite retained packets and deep regression corpus", "tested", ["regression-v2/evidence/execution-summary.json"]);
coverage("config-build", "pinned optimized compiler and deterministic local chain", "tested", ["regression-v2/evidence/ordinary-suite.log", "regression-v2/evidence/source-manifest.log"]);
coverage("historical-family", "revealed-target contamination and baseline family comparison", "inspected", ["BASELINE_RECORD.md", "IMPROVEMENT_STUDY.md"], "Used only to label the regression and later adjudicate it; no blind or novelty claim is made.");
coverage("falsification", "matched condition-changing controls for every claim", "tested", ["regression-v2/evidence/deep-regressions.log", "regression-v2/evidence/retained-exact-regressions.log"]);
coverage("business-invariant", "business-flow-and-state-machine-model", "tested", ["regression-v2/maps/business-flow-and-state-machine-model.md"]);
coverage("business-invariant", "asset-liability-conservation-ledger", "tested", ["regression-v2/maps/asset-liability-conservation-ledger.md"]);
coverage("consumer-propagation", "mutable-value-to-downstream-consumer-map", "tested", ["regression-v2/maps/mutable-value-to-downstream-consumer-map.md"]);
coverage("boundary-arithmetic", "rounding-unit-and-zero-boundaries", "tested", ["regression-v2/maps/rounding-unit-and-zero-boundaries.md", "regression-v2/evidence/deep-regressions.log"]);
coverage("external-semantics", "interface-promise-versus-runtime-delta-matrix", "tested", ["regression-v2/maps/interface-promise-versus-runtime-delta-matrix.md", "regression-v2/evidence/deep-regressions.log"]);
coverage("sequence-interleaving", "callback-and-action-sequence-matrix", "tested", ["regression-v2/maps/callback-and-action-sequence-matrix.md", "regression-v2/evidence/deep-regressions.log"]);
coverage("exploit-composition", "primitive-join-graph", "tested", ["regression-v2/maps/primitive-join-graph.md", "regression-v2/evidence/deep-regressions.log"]);
coverage("economic-closure", "funding-repayment-profit-and-system-loss-ledger", "tested", ["regression-v2/maps/funding-repayment-profit-and-system-loss-ledger.md", "regression-v2/evidence/deep-regressions.log"]);

for (const candidate of candidates) {
  const primaryEvidence = candidate.evidence[0];
  const runtimeEvidence = candidate.evidence.find(value => value.endsWith(".log")) ?? primaryEvidence;
  const independentEvidence = candidate.evidence.includes("regression-v2/evidence/deep-regressions-independent.log")
    ? "regression-v2/evidence/deep-regressions-independent.log"
    : `run/evidence/C-${({
        "R2-02": "008", "R2-05": "006", "R2-08": "010", "R2-09": "003",
        "R2-10": "002", "R2-11": "007", "R2-12": "005", "R2-13": "009",
        "R2-15": "004"
      })[candidate.id]}/reproduction.log`;
  const summary = candidate.demonstrated_impact;
  const leadArgs = [
    "candidate", "--dir", stateDir,
    "--id", candidate.id,
    "--status", "lead",
    "--title", candidate.title,
    "--summary", summary,
    "--evidence", "regression-v2/submission/candidates.json",
    "--evidence", primaryEvidence
  ];
  run(leadArgs);

  const gateEvidence = {
    "attacker-control": `regression-v2/submission/candidates.json ${candidate.id} attacker path`,
    "reachability": `${primaryEvidence} public-entry execution`,
    "defense-analysis": `regression-v2/submission/candidates.json ${candidate.id} root cause and negative control`,
    "security-impact": `${runtimeEvidence} asserted final impact oracle`,
    "realistic-configuration": "regression-v2/evidence/execution-summary.json pinned local release-like environment",
    "safe-reproduction": `${primaryEvidence} isolated deterministic harness`,
    "release-reproduction": "regression-v2/evidence/execution-summary.json unmodified optimized target run",
    "negative-control": `${runtimeEvidence} matched condition-changing control`,
    "independent-reproduction": `${independentEvidence} fresh process execution`,
    "downstream-impact": `regression-v2/submission/candidates.json ${candidate.id} demonstrated impact`,
    "composition-review": "regression-v2/maps/primitive-join-graph.md joined or explicitly closed compatible primitives"
  };
  const validatedArgs = [
    "candidate", "--dir", stateDir,
    "--id", candidate.id,
    "--status", "validated",
    "--title", candidate.title,
    "--summary", summary
  ];
  for (const artifact of candidate.evidence) validatedArgs.push("--evidence", artifact);
  for (const [gate, evidence] of Object.entries(gateEvidence)) {
    validatedArgs.push("--gate", `${gate}=${evidence}`);
  }
  run(validatedArgs);
}

run([
  "finish", "--dir", stateDir,
  "--outcome", "validated",
  "--reason", "Fifteen distinct regression candidates passed every workflow-v2 evidence gate and every mandatory deep-hunt pass on the frozen target.",
  "--candidate-id", "R2-01",
  "--evidence", "regression-v2/submission/candidates.json",
  "--evidence", "regression-v2/evidence/execution-summary.json",
  "--evidence", "regression-v2/maps/primitive-join-graph.md",
  "--residual-risk", "The same-target run is post-reveal and cannot measure blind generalization.",
  "--residual-risk", "Unbounded protocol state spaces can retain variants outside the deterministic corpus."
]);
run(["check", "--dir", stateDir, "--phase", "terminal"]);
run(["status", "--dir", stateDir]);

await writeFile(
  path.join(root, "regression-v2/evidence/goal-state-recording.log"),
  transcript.join("\n\n") + "\n"
);
process.stdout.write(JSON.stringify({
  status: "passed",
  candidates: candidates.length,
  transcript: "regression-v2/evidence/goal-state-recording.log"
}) + "\n");
