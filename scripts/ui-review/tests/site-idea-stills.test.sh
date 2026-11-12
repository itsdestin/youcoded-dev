#!/bin/bash
# site-idea-stills.test.sh — card #175: the hand-run script (no longer a release step) must produce exactly the four ideas-wall
# pictures at the site's 1216x760, refuse (writing nothing) when a shot failed, and leave every
# other file in the gallery alone.
#
# The shoot itself is STUBBED (SITE_STILLS_SHOOT): a real run builds the app and drives Chrome.
# This test therefore proves the step's wiring, the size, the refusal and the arguments — not that
# the real pictures look right (a real run did that by eye, 2026-11-10). It needs `magick`, which the
# CI runner does not have (see the note beside the ui-review python suites in workspace-ci.yml),
# so it is local-only and SKIPS with a message where magick is missing.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
command -v magick >/dev/null || { echo "SKIP: no magick on this machine"; exit 0; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
fail=0
ok() { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fail=1; }

# A stand-in for shoot.mjs: reads --out/--themes/--width/--height, records its arguments, writes one
# 1400x875 picture per screen name plus the manifest. STUB_FAIL=1 marks the last screen not ok.
cat >"$TMP/stub-shoot.sh" <<'STUB'
#!/bin/bash
printf '%s\n' "$@" >"$STUB_ARGS"
names=(); out=""; theme=""; w=""; h=""
while [[ $# -gt 0 ]]; do case "$1" in
  --out) out="$2"; shift 2;; --themes) theme="$2"; shift 2;; --width) w="$2"; shift 2;; --height) h="$2"; shift 2;;
  --before|--after) shift 2;; --*) shift;; *) names+=("$1"); shift;; esac; done
[[ -n "${STUB_PAIR:-}" ]] && out="$out/after"
mkdir -p "$out"; rows=""; i=0
for n in "${names[@]}"; do
  i=$((i+1)); mkdir -p "$out/$n"
  magick -size "${w}x${h}" "xc:rgb($((i*50)),80,120)" "$out/$n/$theme.png"
  okv=true; [[ -n "${STUB_FAIL:-}" && $i -eq ${#names[@]} ]] && okv=false
  rows+="{\"name\":\"$n\",\"theme\":\"$theme\",\"ok\":$okv,\"reason\":\"did not open\"},"
done
echo "[${rows%,}]" >"$out/manifest.json"
STUB
chmod +x "$TMP/stub-shoot.sh"
export SITE_STILLS_SHOOT="$TMP/stub-shoot.sh" STUB_ARGS="$TMP/args.txt"

echo "site-idea-stills:"
G="$TMP/gallery"; mkdir -p "$G"; echo keep >"$G/home-light.webp"
bash "$ROOT/scripts/ui-review/site-idea-stills.sh" "$ROOT/youcoded" "$G" >/dev/null 2>&1 || bad "step failed on a good run"
for n in home money paint trip; do
  dim="$(magick identify -format '%wx%h' "$G/idea-$n.webp" 2>/dev/null || echo none)"
  [[ "$dim" == "1216x760" ]] && ok "idea-$n.webp is 1216x760" || bad "idea-$n.webp is $dim"
done
[[ "$(ls "$G"/idea-*.webp | wc -l)" -eq 4 ]] && ok "exactly four idea pictures" || bad "wrong picture count"
[[ "$(cat "$G/home-light.webp")" == keep ]] && ok "other gallery files untouched" || bad "another gallery file was changed"
grep -qx 'pages/focus/page-home#site' "$TMP/args.txt" && grep -qx 'pages/page/page-trip-board' "$TMP/args.txt" && ok "shot the four named screens" || bad "wrong screens asked for"

# A failed shot: refuse, and write nothing (the old good picture must survive).
G2="$TMP/g2"; mkdir -p "$G2"; echo old >"$G2/idea-home.webp"
if STUB_FAIL=1 bash "$ROOT/scripts/ui-review/site-idea-stills.sh" "$ROOT/youcoded" "$G2" >/dev/null 2>"$TMP/err.txt"; then bad "a failed shot did not stop the step"; else ok "a failed shot stops the step"; fi
grep -q 'did not open' "$TMP/err.txt" && ok "says why" || bad "refusal did not say why"
[[ "$(cat "$G2/idea-home.webp")" == old && ! -e "$G2/idea-money.webp" ]] && ok "wrote nothing on refusal" || bad "files written despite refusal"

# magick failing on the 3rd picture: the gallery must be untouched (old files stay, no new ones).
# The wrapper only counts the script's own conversions (the ones using -resize); the stub shoot's
# calls pass straight through to the real magick.
REAL_MAGICK="$(command -v magick)"; mkdir -p "$TMP/fakebin"
cat >"$TMP/fakebin/magick" <<WRAP
#!/bin/bash
if [[ "\$*" == *-resize* ]]; then n=\$(( \$(cat "$TMP/count" 2>/dev/null || echo 0) + 1 )); echo \$n >"$TMP/count"; [[ \$n -eq 3 ]] && exit 1; fi
exec "$REAL_MAGICK" "\$@"
WRAP
chmod +x "$TMP/fakebin/magick"
G4="$TMP/g4"; mkdir -p "$G4"; echo old >"$G4/idea-home.webp"; echo old >"$G4/idea-money.webp"
if PATH="$TMP/fakebin:$PATH" bash "$ROOT/scripts/ui-review/site-idea-stills.sh" "$ROOT/youcoded" "$G4" >/dev/null 2>"$TMP/err4.txt"; then bad "a failing conversion did not stop the step"; else ok "a failing conversion stops the step"; fi
[[ "$(cat "$G4/idea-home.webp")" == old && "$(cat "$G4/idea-money.webp")" == old && ! -e "$G4/idea-paint.webp" && ! -e "$G4/idea-trip.webp" ]] && ok "gallery untouched when picture 3 fails" || bad "gallery changed after a mid-run failure"
grep -q 'nothing was written' "$TMP/err4.txt" && ok "says nothing was written" || bad "mid-run failure not explained"

# magick missing: refuse before shooting anything.
mkdir -p "$TMP/nomagick"; for t in bash node dirname mktemp rm cat mkdir; do ln -sf "$(command -v $t)" "$TMP/nomagick/$t"; done
rm -f "$TMP/args.txt"
if PATH="$TMP/nomagick" "$(command -v bash)" "$ROOT/scripts/ui-review/site-idea-stills.sh" "$ROOT/youcoded" "$TMP/g5" >/dev/null 2>"$TMP/err5.txt"; then bad "ran without magick"; else grep -q 'magick' "$TMP/err5.txt" && [[ ! -e "$TMP/args.txt" ]] && ok "no magick: refused before shooting" || bad "no-magick refusal wrong"; fi

# Another checkout than the workspace's own: shot as before=after, reading the 'after' side.
mkdir -p "$TMP/other/desktop"; G3="$TMP/g3"
STUB_PAIR=1 bash "$ROOT/scripts/ui-review/site-idea-stills.sh" "$TMP/other" "$G3" >/dev/null 2>&1 && [[ -f "$G3/idea-trip.webp" ]] && ok "a different checkout is shot as the 'after' side" || bad "different-checkout run failed"
exit $fail
