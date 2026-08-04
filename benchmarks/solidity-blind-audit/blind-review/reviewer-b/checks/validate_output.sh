#!/usr/bin/env bash
set -euo pipefail

output_dir=$(cd "$(dirname "$0")/.." && pwd)
json="$output_dir/reviewer-b.json"
report="$output_dir/REPORT.md"

jq empty "$json"
jq -e '
  .schema_version == 1 and
  .reviewer_id == "reviewer-b" and
  .target.commit == "75d19f5c283c5e2fe6b1a5913b1ca4b82462c21d" and
  .target.source_manifest_digest == "9ac26ede2c9b8e3f45910a1e8207c10ec418999106571061211fc339ad84c926" and
  (.candidates | length == 11) and
  ([.candidates[].id] | unique | length == 11) and
  (all(.candidates[];
    (.status == "reproduced" or .status == "not_reproduced" or .status == "inconclusive" or .status == "out_of_scope") and
    (.adjudicated_severity == "low" or .adjudicated_severity == "medium" or .adjudicated_severity == "high" or .adjudicated_severity == "critical") and
    (.commands | length >= 1) and
    (.negative_control_result.result | type == "string") and
    (.root_cause_assessment.support | type == "string") and
    (.attacker_prerequisites.support | type == "string") and
    (.execution_path_assessment.support | type == "string") and
    (.demonstrated_impact.support | type == "string") and
    .scope_decision.decision == "in_scope" and
    (.severity_rationale | length > 0) and
    .duplicate_cluster == null
  )) and
  .aggregate_counts.candidates == 11 and
  .aggregate_counts.status.reproduced == 11 and
  .aggregate_counts.status.not_reproduced == 0 and
  .aggregate_counts.status.inconclusive == 0 and
  .aggregate_counts.status.out_of_scope == 0 and
  ((.aggregate_counts.adjudicated_severity.critical +
    .aggregate_counts.adjudicated_severity.high +
    .aggregate_counts.adjudicated_severity.medium +
    .aggregate_counts.adjudicated_severity.low) == 11)
' "$json" >/dev/null

[[ -s "$report" ]]

mapfile -t referenced_logs < <(jq -r '
  .attestations.source_manifest.initial_log,
  .attestations.source_manifest.final_log,
  .attestations.ordinary_suite.log,
  .candidates[].commands[].log,
  .reviewer_harness_incidents[].logs[]
' "$json" | sort -u)

for relative_log in "${referenced_logs[@]}"; do
  [[ -f "$output_dir/$relative_log" ]]
done

printf 'json_valid=true\n'
printf 'candidate_records=11\n'
printf 'unique_candidate_ids=11\n'
printf 'referenced_logs_present=%s\n' "${#referenced_logs[@]}"
printf 'report_nonempty=true\n'
