#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

command -v npm >/dev/null
command -v ffmpeg >/dev/null

mkdir -p "$SCRIPT_DIR/out" "$REPO_DIR/assets"

npm_args=(--prefix "$SCRIPT_DIR" ci)

if [[ -n "${AIM_HEAD_NPM_CACHE_DIR:-}" ]]; then
  npm_args+=(--cache "$AIM_HEAD_NPM_CACHE_DIR")
fi

npm "${npm_args[@]}"

render_args=(
  render
  src/index.ts
  AimForTheHeadQuickstart
  out/aim-for-the-head-quickstart.mp4
  --overwrite
)

if [[ -n "${REMOTION_BROWSER_EXECUTABLE:-}" ]]; then
  render_args+=(--browser-executable "$REMOTION_BROWSER_EXECUTABLE")
fi

(
  cd "$SCRIPT_DIR"
  npm exec tsc -- --noEmit
  npm exec remotion -- "${render_args[@]}"
)

ffmpeg -y \
  -i "$SCRIPT_DIR/out/aim-for-the-head-quickstart.mp4" \
  -vf "fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=96:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 \
  "$REPO_DIR/assets/aim-for-the-head-quickstart.gif"

printf 'Rendered %s\n' "$REPO_DIR/assets/aim-for-the-head-quickstart.gif"
