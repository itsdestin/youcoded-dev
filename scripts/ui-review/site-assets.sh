#!/usr/bin/env bash
# Regenerates every landing-page demo asset from the REAL renderer:
#   docs/site/           the live embed (npm run build:site)
#   docs/media/          one WebM loop + WebP poster per showcase row (record.mjs)
#   docs/gallery/        gallery stills as WebP (shot.mjs + magick)
#   docs/media/embed-*   the demo window's per-theme stills, shot from the built embed (embed-posters.mjs)
# Run before every release so the site can never drift from the app again.
# Usage: bash scripts/ui-review/site-assets.sh <worktree-or-path> [--out <dir>]
#   --out <dir> (or SITE_ASSETS_OUT=<dir>): write media/gallery/site somewhere other
#   than <checkout>/docs — for a test run against scratch/. NEVER point this at
#   youcoded/docs/media, docs/gallery or docs/site from a worktree other than the
#   one you mean to release: those are committed site assets.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
TARGET="${1:?worktree name or path}"; shift || true
OUT_OVERRIDE="${SITE_ASSETS_OUT:-}"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --out) OUT_OVERRIDE="${2:?--out needs a directory}"; shift 2 ;;
    *) echo "[site-assets] unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [[ -d "$WS/worktrees/$TARGET/desktop" ]]; then TDIR="$WS/worktrees/$TARGET"
elif [[ -d "$TARGET/desktop" ]]; then TDIR="$(cd "$TARGET" && pwd)"
elif [[ -d "$WS/youcoded/desktop" ]]; then TDIR="$WS/youcoded"
else echo "error: no checkout found for '$TARGET' (expected a path containing desktop/, or a worktree under $WS/worktrees/)" >&2; exit 1
fi
OUT="${OUT_OVERRIDE:-$TDIR/docs}"
T="${TMPDIR:-/tmp}"; mkdir -p "$T"
TMP="$(mktemp -d "$T/site-gallery-XXXX")"
# Trap FIRST, before anything is spawned: a Ctrl-C during the build must still
# drop the gallery scratch dir. record.mjs/shot.mjs/embed-posters.mjs each clean
# up their own browsers and build cache on exit — nothing long-lived is started
# here any more (see the note below), so there is nothing else to stop.
trap 'rm -rf "$TMP"' EXIT

# 1. build once, up front — record.mjs and shot.mjs each build+serve $TDIR
# themselves through scripts/shoot/engine.mjs (WORKTREE=$TDIR below), and the
# engine caches the build keyed to the checkout, so this is just to fail fast
# and print the one-time build cost instead of hiding it inside the first clip.
#
# This step used to boot a workbench dev server on a FIXED port (:5473, offset
# 300) and refuse to run if that port already served a different tree — a real
# risk when a foreign or stale server was left running. The engine gives every
# run its own free port from its own build, so there is no shared server left
# to be "someone else's": that refusal is moot and has no replacement here.
echo "[site-assets] building $TDIR through the engine (cached after the first run)"
node "$WS/scripts/shoot/build.mjs" "$TDIR" >/dev/null

# 2. loops — written OUTSIDE docs/site on purpose: `npm run build:site` runs with
# --emptyOutDir and wipes docs/site wholesale (it deleted nine freshly recorded
# loops on 2026-08-27). docs/media is never touched by the embed build.
mkdir -p "$OUT/media"
# <file the page plays>:<scene that records it>. WHY a map: the 2026-09-03 redesign renamed five
# of the page's clips to landing-* and recorded the sync pair from the -mirror scenes (one take at
# two sizes), but this loop kept writing the old names — a release run refreshed four files the page
# no longer shows and left those four cards stale. Keep it in step with docs/index.html #stage.
for pair in landing-row1-any-ai:row1-any-ai landing-row2-artifact-edit:row2-artifact-edit \
            row2-does-things:row2-does-things row3-projects:row3-projects row4-organized:row4-organized \
            landing-row5-follow:row5-follow-mirror landing-row5-phone:row5-phone-mirror \
            row6-yours:row6-yours landing-row7-play:row7-play; do
  # (row8-builders left the map on 2026-09-11: the "For builders" slide was removed from the page, youcoded c11db7f0)
  name="${pair%%:*}"; scene="${pair##*:}"
  WORKTREE="$TDIR" node "$HERE/record.mjs" "$HERE/scenes/$scene.json" "$OUT/media/$name"
done

# 3. gallery
for theme in midnight meadow-mist halftone-dimension creme light dark; do
  WORKTREE="$TDIR" node "$HERE/shot.mjs" "$HERE/plans/site-gallery.json" "$TMP" "$theme"
done
# shot.mjs exits 0 even when a shot failed verification — it files the miss under
# <theme>/_unverified/ instead. Refuse BEFORE deleting the previous good stills,
# otherwise a miss silently vanishes from the gallery.
if compgen -G "$TMP/*/_unverified/*.png" >/dev/null; then
  echo "[site-assets] unverified gallery shots — fix the plan and re-run:" >&2; ls "$TMP"/*/_unverified/ >&2; exit 1
fi
NPNG=$(ls "$TMP"/*/*.png | wc -l)
if [[ "$NPNG" -ne 48 ]]; then echo "[site-assets] expected 48 gallery shots (8 screens × 6 themes), got $NPNG" >&2; exit 1; fi
mkdir -p "$OUT/gallery"
rm -f "$OUT/gallery/"*.png "$OUT/gallery/"*.webp
for f in "$TMP"/*/*.png; do
  theme="$(basename "$(dirname "$f")")"; name="$(basename "$f" .png)"
  magick "$f" -resize 1200x -quality 80 "$OUT/gallery/$name-$theme.webp"
done
du -sh "$OUT/media" "$OUT/gallery"

# 4. embed — vite build is independent of the dev server; empties docs/site (see step 2)
(cd "$TDIR/desktop" && npm run build:site >/dev/null)

# 5. demo stills — AFTER step 4 on purpose: they are shot out of the embed just built, so the
# picture in the demo window is the very app that replaces it (2026-09-14: a stale grey still
# made the live demo "pop in" over it). Exits non-zero, writing nothing, if any theme failed to paint.
node "$HERE/embed-posters.mjs" "$OUT"
if [[ "$OUT" == "$TDIR/docs" ]]; then
  echo "site assets regenerated under $OUT — review $OUT/gallery and $OUT/media, then commit them"
else
  echo "site assets regenerated under $OUT (a scratch override — nothing under $TDIR/docs was touched)"
fi
