#!/bin/bash
# Renders the whole campaign into film/out: six films, every poster size, every web banner.
# WHY one script: a copy or footage change must re-make everything, so nothing ships stale.
# usage: render-all.sh [films|stills]   (no argument = both)
set -u
cd "$(dirname "$0")/film" || exit 1
node sync-footage.mjs || exit 1
mkdir -p out/films out/posters out/banners
if [ "${1:-films}" = films ]; then
  for id in hero60 hero30 short-house short-yours short-rent short-founder; do
    # crf 14 + 320k AAC: a master good enough to upload anywhere; platforms re-compress from it.
    npx remotion render src/index.ts "$id" "out/films/youcoded-$id.mp4" --codec=h264 --crf=14 --audio-bitrate=320k --concurrency=8 --log=error || echo "FAILED $id"
    echo "done $id"
  done
fi
if [ "${1:-stills}" = stills ]; then
  for idea in own ask quote everyone; do
    for size in social-4x5 story-9x16 print-24x36 square landscape-16x9 link-1200x628; do
      npx remotion still src/index.ts "poster-$idea-$size" "out/posters/youcoded-$idea-$size.png" --log=error || echo "FAILED poster-$idea-$size"
    done
  done
  for b in 300x250 336x280 300x600 160x600 728x90 970x250 320x50 320x100; do
    npx remotion still src/index.ts "banner-$b" "out/banners/youcoded-banner-$b.png" --log=error || echo "FAILED banner-$b"
  done
  echo "done stills"
fi
