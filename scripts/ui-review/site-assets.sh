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
# One clip per name PER SITE THEME, written <name>--<theme>.webm/.webp. WHY (Destin, 2026-10-21): the
# page plays the clip matching the theme its visitor picked, so every clip exists in all four site
# themes (record.mjs's THEME env overrides each scene's own theme), and desktop takes are filmed at
# zoom 1.3 (set in the scenes; the phone take stays 1). "yours" is the one clip whose end differs:
# it starts in the visitor's theme and swaps to a different one (END_THEME fills the scene's
# {{END_THEME}} token). The sync pair is follow (desktop) + phone, one script at two sizes.
# row3-projects is no longer recorded: projects and tags are one card on the page now, so
# `organized` is row4-organized alone. Keep the name list in step with docs/index.html #stage.
# 10 names x 4 themes = 40 recordings.
declare -A END_THEME_FOR=( [youcoded]=golden-sunbreak [meadow-mist]=halftone-dimension \
                           [halftone-dimension]=meadow-mist [golden-sunbreak]=youcoded )
for theme in youcoded meadow-mist halftone-dimension golden-sunbreak; do
  for pair in yours:row6-yours home:home money:money any-ai:row1-any-ai \
              artifact-edit:row2-artifact-edit does-things:row2-does-things organized:row4-organized \
              follow:row5-follow-mirror phone:row5-phone-mirror play:row7-play; do
    name="${pair%%:*}"; scene="${pair##*:}"
    THEME="$theme" END_THEME="${END_THEME_FOR[$theme]}" WORKTREE="$TDIR" \
      node "$HERE/record.mjs" "$HERE/scenes/$scene.json" "$OUT/media/$name--$theme"
  done
done

# 3. gallery — the 48 stills are no longer shown: the page's bottom strip became the ideas wall
# (docs/gallery/idea-*.webp, captured by hand from the demo's Home and Finance pages and the
# workbench's paint and trip-board pages, 2026-10-21). This step still refreshes the stills for
# anything else that reads docs/gallery; regenerating the idea stills is card #175.
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
# WHY: the hand-captured idea-*.webp stills share this folder and the page shows them; a blanket
# *.webp delete removed all four during the v1.3.3 release run (2026-10-23). Delete only the
# generated <screen>-<theme> stills.
find "$OUT/gallery" -maxdepth 1 \( -name '*.png' -o -name '*.webp' \) ! -name 'idea-*' -delete
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
