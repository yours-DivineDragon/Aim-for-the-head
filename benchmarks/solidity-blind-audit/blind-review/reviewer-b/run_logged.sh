#!/usr/bin/env bash
set -u

if [[ $# -lt 2 ]]; then
  printf 'usage: %s LOG COMMAND [ARG ...]\n' "$0" >&2
  exit 64
fi

log_path=$1
shift

set +e
"$@" 2>&1 | tee "$log_path"
exit_code=${PIPESTATUS[0]}
set -e

printf '%s\t%s\t' "$log_path" "$exit_code"
printf '%q ' "$@"
printf '\n'
exit "$exit_code"
