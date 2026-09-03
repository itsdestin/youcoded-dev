#!/usr/bin/env bash
# Rebuilds the mockup environment from a fresh checkout: output dir, asset
# symlinks, resized theme wallpapers, and the compare page. Then:
#   python3 build.py                      # regenerate the six mockup pages
#   python3 serve.py 8901   # view at localhost:8901/compare.html (no-cache)
set -e
cd "$(dirname "$0")"
WS=$(realpath ../../../..)           # workspace root (youcoded-dev), absolute BEFORE any cd
mkdir -p mockups/wall
cd mockups
ln -sfn "$(realpath $WS/youcoded/docs/media)"   media
ln -sfn "$(realpath $WS/youcoded/docs/gallery)" gallery
ln -sfn "$(realpath $WS/youcoded/docs/icons)"   icons
# Mascot art for the theme picker — copied out of wecoded-themes by hand plus
# default.svg (the app's own AppIcon fallback for themes that ship no mascot).
ln -sfn "$(realpath ../mascots)" mascots
# Clips re-filmed for the redesign. Separate from media/ on purpose: media/ is
# the LIVE site's asset directory, and must not change until the port lands.
ln -sfn "$(realpath ../media-local)" media-local
for f in $WS/youcoded/docs/favicon-*.svg; do ln -sfn "$(realpath $f)" .; done
# The live demo: prefer the worktree build that bundles ALL 7 community themes
# (branch feat/site-embed-all-themes). Fall back to the main checkout's copy,
# where only golden-sunbreak / halftone-dimension / meadow-mist theme-sync.
if [ -d "$WS/worktrees/site-themes/docs/site" ]; then
  ln -sfn "$(realpath $WS/worktrees/site-themes/docs/site)" site
else
  ln -sfn "$(realpath $WS/youcoded/docs/site)" site
  echo "NOTE: worktrees/site-themes missing — demo only knows 3 of 7 themes"
fi
# Wallpapers, resized once from the theme registry
for t in cotton-candy-sky devils-garden golden-sunbreak kuromi-dreamer meadow-mist strawberry-kitty; do
  src=$(ls $WS/wecoded-themes/themes/$t/assets/wallpaper.* 2>/dev/null | head -1)
  [ -n "$src" ] && [ ! -f "wall/$t.webp" ] && magick "$src" -resize 2000x -quality 82 "wall/$t.webp"
done
cp ../compare.html .
# Serve with serve.py, NOT `python3 -m http.server`: the latter sends no
# Cache-Control, and the compare page's iframes then hold a stale mockup while
# the file on disk is already correct.
# Round-one A/B/C are hand-written pages, not generated, and are no longer part
# of the review. The sources stay in the prototype root as history; uncomment to
# serve them again.
# cp ../mockup-a-editorial.html ../mockup-b-theater.html ../mockup-c-bento.html .
echo "ready — now: python3 ../build.py && python3 ../serve.py 8901"
