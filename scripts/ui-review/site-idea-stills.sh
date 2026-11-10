#!/usr/bin/env bash
# Writes the four website "ideas wall" pictures: <gallery-dir>/idea-{home,money,paint,trip}.webp,
# 1216x760 WebP, shot from the demo's Home and Finance pages and the workbench's paint and
# trip-board pages through `shoot`.
# Usage: bash scripts/ui-review/site-idea-stills.sh <app-checkout> <gallery-dir>
#
# WHY (card #175): site-assets.sh step 3 used to shoot 48 stills (8 screens x 6 themes) that the
# page no longer shows, insist on exactly 48 PNGs, and leave the four pictures the page DOES show
# to be captured by hand. This replaces it.
#
# Settings (env), all with the values the current site pictures were matched to:
#   SITE_STILL_THEME   youcoded        the lavender look of the current pictures (matched by eye and
#                                      by pixel difference against the shipped files, 2026-11-10)
#   SITE_STILL_W/H     1400 x 875      the window the page is laid out in. The shipped pictures show
#                                      more of each page than a 1216-wide window does, so the page is
#                                      shot wider and scaled down to 1216x760 (the site's size).
#   SITE_STILLS_SHOOT  (a command)     replaces `node scripts/shoot/shoot.mjs`; tests stub it
#
# Nothing else in <gallery-dir> is touched. The old <screen>-<theme>.webp stills are no longer
# generated and no longer deleted here (so the `! -name 'idea-*'` safeguard the old step needed is
# moot: there is no delete). Whatever shoot reports as not ok stops the run BEFORE any file is written.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
CHECKOUT="${1:?app checkout}"; GALLERY="${2:?gallery output folder}"
THEME="${SITE_STILL_THEME:-youcoded}"; W="${SITE_STILL_W:-1400}"; H="${SITE_STILL_H:-875}"
read -r -a SHOOT <<<"${SITE_STILLS_SHOOT:-node $WS/scripts/shoot/shoot.mjs}"
# screen name : output name
SCREENS=('pages/focus/page-home#site:home' 'pages/focus/page-money#site:money' 'pages/focus/page-paint:paint' 'pages/page/page-trip-board:trip')
NAMES=(); for p in "${SCREENS[@]}"; do NAMES+=("${p%%:*}"); done

RUN="$(mktemp -d "${TMPDIR:-/tmp}/site-idea-stills-XXXX")"
trap 'rm -rf "$RUN"' EXIT

# shoot photographs the workspace's own youcoded/ unless told two sides; a different checkout
# is shot as before=after=that checkout and the `after` side is used.
SHOTS="$RUN"
if [[ "$(cd "$CHECKOUT" && pwd -P)" != "$(cd "$WS/youcoded" 2>/dev/null && pwd -P || echo none)" ]]; then
  SHOOT_SCALE=1 "${SHOOT[@]}" "${NAMES[@]}" --themes "$THEME" --width "$W" --height "$H" --before "$CHECKOUT" --after "$CHECKOUT" --out "$RUN" >&2
  SHOTS="$RUN/after"
else
  SHOOT_SCALE=1 "${SHOOT[@]}" "${NAMES[@]}" --themes "$THEME" --width "$W" --height "$H" --out "$RUN" >&2
fi

# shoot exits 0 even when a screen failed to prove it was showing; its manifest says. Refuse
# BEFORE overwriting any good picture.
node -e '
  const fs = require("fs"); const [mf, n] = [process.argv[1], Number(process.argv[2])];
  let rows; try { rows = JSON.parse(fs.readFileSync(mf, "utf8")); } catch (e) { console.error("[site-idea-stills] no manifest at " + mf); process.exit(1); }
  const bad = rows.filter((r) => !r.ok);
  if (bad.length || rows.length !== n) {
    console.error("[site-idea-stills] expected " + n + " verified pictures, got " + rows.length + " (" + bad.length + " failed): " + bad.map((r) => r.name + " - " + r.reason).join("; "));
    process.exit(1);
  }
' "$SHOTS/manifest.json" "${#SCREENS[@]}"

mkdir -p "$GALLERY"
for p in "${SCREENS[@]}"; do
  src="$SHOTS/${p%%:*}/$THEME.png"; out="$GALLERY/idea-${p##*:}.webp"
  [[ -f "$src" ]] || { echo "[site-idea-stills] missing picture $src" >&2; exit 1; }
  # `!` so the aspect ratio can never drift off the site's 1216x760 box.
  magick "$src" -resize 1216x760! -quality 80 "$out"
done
echo "[site-idea-stills] wrote ${#SCREENS[@]} pictures to $GALLERY (theme $THEME, shot at ${W}x${H})"
