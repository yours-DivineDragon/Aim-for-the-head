#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../../.."
node --test --test-concurrency=1 run/evidence/C-011/repro.test.mjs
