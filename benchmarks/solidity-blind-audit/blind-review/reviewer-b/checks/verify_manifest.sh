#!/usr/bin/env bash
set -euo pipefail

target_dir=$(cd "$(dirname "$0")/../../target" && pwd)
cd "$target_dir"

manifest=source-manifest.json
expected_combined=$(jq -r '.combined_digest' "$manifest")
mapfile -t files < <(jq -r '.files | keys[]' "$manifest")

printf 'file_count=%s\n' "${#files[@]}"
all_match=true
entries=()
for file in "${files[@]}"; do
  expected=$(jq -r --arg file "$file" '.files[$file]' "$manifest")
  actual=$(sha256sum "$file" | awk '{print $1}')
  match=false
  if [[ "$actual" == "$expected" ]]; then
    match=true
  else
    all_match=false
  fi
  printf '%s  %s  expected=%s  match=%s\n' "$actual" "$file" "$expected" "$match"
  entries+=("$actual  $file")
done

actual_combined=$(printf '%s\n' "${entries[@]}" | sha256sum | awk '{print $1}')
printf 'combined_expected=%s\n' "$expected_combined"
printf 'combined_actual=%s\n' "$actual_combined"
printf 'all_file_hashes_match=%s\n' "$all_match"
printf 'combined_match=%s\n' "$([[ "$actual_combined" == "$expected_combined" ]] && printf true || printf false)"

[[ "$all_match" == true && "$actual_combined" == "$expected_combined" && "${#files[@]}" -eq 22 ]]
