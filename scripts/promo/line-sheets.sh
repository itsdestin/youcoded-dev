#!/bin/bash
# One still per speech bubble from out/draft.mp4 (14 frames into each line), four per sheet, in
# film order — the check that every line stands beside the thing it is about and sits on its own
# theme. Reads the cue list from cues.sh. Usage: bash line-sheets.sh <outdir>
set -euo pipefail
cd "$(dirname "$0")"
OUT="${1:?outdir}"; mkdir -p "$OUT"; rm -f "$OUT"/lines-*.png
bash cues.sh "$OUT/cues.json" > /dev/null
F=$(node -e 'const c=require(process.argv[1]);console.log(c.map(x=>x.at+14).join(","))' "$OUT/cues.json")
EXPR=$(echo "$F" | sed 's/,/)+eq(n\\,/g; s/^/eq(n\\,/; s/$/)/')
ffmpeg -v error -y -i out/draft.mp4 -vf "select='$EXPR',tile=2x2" -vsync vfr "$OUT/lines-%02d.png"
ls "$OUT"/lines-*.png
