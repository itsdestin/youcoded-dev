#!/usr/bin/env bash
# Copies what the promo's overlays need from every theme the video shows — the
# mascot rig, its companions and the wallpaper — out of the theme REGISTRY
# checkout (wecoded-themes/themes/<slug>/, the canonical copy; the app's vendored
# fixtures lag it — Golden Sunbreak's rig was missing there on 2026-09-03) into
# public/themes/<slug>/, which Remotion serves. public/ is gitignored, so run
# this after a fresh clone, before `npm run render:draft`.
# Usage: bash scripts/promo/theme-assets.sh [<wecoded-themes checkout>]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
# The default looks beside the WORKSPACE root, which for a worktree at
# youcoded-dev/worktrees/<name> is two levels up from $WS.
REG="${1:-}"
[[ -n "$REG" ]] || for c in "$WS/wecoded-themes" "$WS/../../wecoded-themes"; do [[ -d "$c/themes" ]] && { REG="$c"; break; }; done
REG="${REG:?no wecoded-themes checkout found — pass its path}/themes"
[[ -d "$REG" ]] || { echo "no theme registry at $REG" >&2; exit 1; }
OUT="$HERE/public/themes"; mkdir -p "$OUT"
for slug in golden-sunbreak halftone-dimension kuromi-dreamer strawberry-kitty meadow-mist cotton-candy-sky devils-garden; do
  src="$REG/$slug"; dst="$OUT/$slug"; rm -rf "$dst"; mkdir -p "$dst"
  cp "$src/manifest.json" "$dst/"
  [[ -f "$src/assets/mascot-rig.svg" ]] && cp "$src/assets/mascot-rig.svg" "$dst/"
  [[ -d "$src/assets/companions" ]] && cp -r "$src/assets/companions" "$dst/"
  # the first wallpaper the manifest names, whatever its extension
  wp="$(python3 -c "import json,sys;print((json.load(open('$src/manifest.json')).get('background') or {}).get('value',''))")"
  [[ -n "$wp" && -f "$src/$wp" ]] && cp "$src/$wp" "$dst/wallpaper.${wp##*.}"
  echo "[theme-assets] $slug: $(ls "$dst" | tr '\n' ' ')"
done

# A pre-blurred 1920x1080 copy of each wallpaper for the backdrop. WHY not a CSS
# blur at render: a 30 px blur on a full frame, 2,149 frames long, is minutes of
# render time for a picture that never changes; a 12 px blur on a 480 px copy
# scaled back up is the same softness for free.
for d in "$OUT"/*/; do
  wp="$(ls "$d"wallpaper.* 2>/dev/null | head -1 || true)"; [[ -n "$wp" ]] || continue   # no wallpaper (Halftone) is fine — under pipefail the failed ls used to abort the script here
  magick "$wp" -resize '480x270^' -gravity center -extent 480x270 -blur 0x18 -resize 1920x1080! -quality 88 "$d/backdrop.jpg"
done
node "$HERE/gen-theme-art.mjs"
