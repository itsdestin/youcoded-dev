#!/usr/bin/env bash
# Final render + loudness normalisation. Usage: bash scripts/promo/render.sh [draft]
# Every render goes through `flock /tmp/promo-render.lock` (package.json): two renders at once
# hung one of them at 0 % CPU for twelve minutes on 2026-09-04. A study clip: `npm run study --
# <CompositionId> out/<name>.mp4` takes the same lock. Never render while film.sh is recording.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; cd "$HERE"
# jq parses the loudnorm measurement below. Fail here with a name rather than
# 40 lines later with "jq: command not found" in the middle of a render.
command -v jq >/dev/null || { echo "render.sh needs jq" >&2; exit 1; }
if [[ "${1:-}" == "draft" ]]; then npm run render:draft; exit; fi
npm run render
# Fix: npm run render can exit 0 while still failing to produce the output (e.g. Remotion
# silently skipping a render step) — fail loudly with the expected path instead of letting
# the loudnorm pass below crash on a missing/stale file with a confusing ffmpeg error.
if [[ ! -f out/promo-video.mp4 ]]; then
  echo "render.sh: expected out/promo-video.mp4 after 'npm run render' but it does not exist" >&2
  exit 1
fi
# Two-pass loudnorm to -14 LUFS (what streaming players expect; Reddit does not
# re-level, so a quiet track just sounds quiet). Video stream copied untouched.
M=$(ffmpeg -hide_banner -i out/promo-video.mp4 -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
I=$(jq -r .input_i <<<"$M"); TP=$(jq -r .input_tp <<<"$M"); LRA=$(jq -r .input_lra <<<"$M"); TH=$(jq -r .input_thresh <<<"$M")
# Fix: print the raw mix's measured loudness so a re-render's log shows what came in,
# not just the normalised result — makes it obvious when the source mix drifted.
echo "render.sh: measured input loudness I=$I LUFS (target -14)"
ffmpeg -y -hide_banner -loglevel error -i out/promo-video.mp4 -c:v copy -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$I:measured_TP=$TP:measured_LRA=$LRA:measured_thresh=$TH:linear=true" -c:a aac -b:a 192k out/youcoded-promo.mp4
ffmpeg -y -hide_banner -loglevel error -i out/youcoded-promo.mp4 -an -c:v copy out/youcoded-promo-silent.mp4
# `|| true`: this line only PRINTS the finished loudness. Under `set -o pipefail`
# a pipeline whose grep matches nothing (or whose head/tail closes the pipe early)
# exits non-zero and would fail the script AFTER both outputs already exist.
ffmpeg -hide_banner -i out/youcoded-promo.mp4 -af ebur128 -f null - 2>&1 | grep -E "I:|LRA:" | tail -2 || true
ls -la out/youcoded-promo.mp4 out/youcoded-promo-silent.mp4
