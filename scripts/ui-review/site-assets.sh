#!/usr/bin/env bash
# Regenerates every landing-page demo asset from the REAL renderer:
#   docs/site/           the live embed (npm run build:site)
#   docs/media/          one WebM loop + WebP poster per showcase row (record.mjs)
#   docs/gallery/        gallery stills as WebP (shot.mjs + magick)
# Run before every release so the site can never drift from the app again.
# Usage: bash scripts/ui-review/site-assets.sh <worktree-or-path>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
TARGET="${1:?worktree name or path}"
if [[ -d "$WS/worktrees/$TARGET/desktop" ]]; then TDIR="$WS/worktrees/$TARGET"
elif [[ -d "$TARGET/desktop" ]]; then TDIR="$(cd "$TARGET" && pwd)"
elif [[ -d "$WS/youcoded/desktop" ]]; then TDIR="$WS/youcoded"
else echo "error: no checkout found for '$TARGET' (expected a path containing desktop/, or a worktree under $WS/worktrees/)" >&2; exit 1
fi
export YOUCODED_PORT_OFFSET=300 VITE_NO_WATCH=1; export WB_PORT=5473
OUT="$TDIR/docs"

# 1. workbench (reuse if already up on 5473 from the same tree, else boot)
if ! curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null; then
  (cd "$TDIR" && nohup bash "$WS/scripts/run-workbench.sh" "$TDIR" >/tmp/claude-1000/site-assets-wb.log 2>&1 &)
  for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null && break; sleep 1; done
  STARTED=1
fi
trap '[ "${STARTED:-0}" = 1 ] && pkill -f "[v]ite --port $WB_PORT" || true' EXIT
# Whatever answers on the port MUST be serving the worktree we're regenerating
# assets for. A stale or foreign server (left running from another tree, or from
# a previous session) would produce perfectly "verified" assets of the WRONG
# code — same guard run-review.sh uses (run-review.sh:68-74).
VITE_PID="$(ss -ltnp "sport = :$WB_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2)"
VITE_CWD="$(readlink "/proc/${VITE_PID:-0}/cwd" 2>/dev/null || true)"
if [[ "$VITE_CWD" != "$TDIR/desktop" ]]; then
  echo "[site-assets] REFUSING: port $WB_PORT is served from '${VITE_CWD:-nothing}', not '$TDIR/desktop'. Stop that server or pass a different YOUCODED_PORT_OFFSET." >&2
  exit 1
fi
echo "[site-assets] workbench :$WB_PORT serves $VITE_CWD (pid $VITE_PID)"
node "$WS/scripts/workbench-boot-check.mjs" "$WB_PORT"

# 2. loops — written OUTSIDE docs/site on purpose: `npm run build:site` runs with
# --emptyOutDir and wipes docs/site wholesale (it deleted nine freshly recorded
# loops on 2026-08-27). docs/media is never touched by the embed build.
mkdir -p "$OUT/media"
i=0
for scene in row1-any-ai row2-does-things row3-projects row4-organized row5-follow row5-phone row6-yours row7-play row8-builders; do
  CDP_PORT=$((10320 + i)) node "$HERE/record.mjs" "$HERE/scenes/$scene.json" "$OUT/media/$scene"; i=$((i+1))
done

# 3. gallery
TMP="$(mktemp -d /tmp/claude-1000/site-gallery-XXXX)"
for theme in midnight meadow-mist halftone-dimension creme light dark; do
  CDP_PORT=$((10340 + i)) node "$HERE/shot.mjs" "$HERE/plans/site-gallery.json" "$TMP" "$theme"; i=$((i+1))
done
rm -f "$OUT/gallery/"*.png "$OUT/gallery/"*.webp
for f in "$TMP"/*/*.png; do
  theme="$(basename "$(dirname "$f")")"; name="$(basename "$f" .png)"
  magick "$f" -resize 1200x -quality 80 "$OUT/gallery/$name-$theme.webp"
done
du -sh "$OUT/media" "$OUT/gallery"

# 4. embed — vite build is independent of the dev server; empties docs/site (see step 2)
(cd "$TDIR/desktop" && npm run build:site >/dev/null)
echo "site assets regenerated under $OUT — review docs/gallery and docs/media, then commit them"
