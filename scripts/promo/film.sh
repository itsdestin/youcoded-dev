#!/usr/bin/env bash
# Films every promo scene against a workbench serving <worktree>, into
# scripts/promo/footage/, and writes the footage-review page for Destin.
# Usage: bash scripts/promo/film.sh <worktree-or-path> [scene ...]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; WS="$(cd "$HERE/../.." && pwd)"
TARGET="${1:?worktree name or path}"; shift || true
if [[ -d "$WS/worktrees/$TARGET/desktop" ]]; then TDIR="$WS/worktrees/$TARGET"
elif [[ -d "$TARGET/desktop" ]]; then TDIR="$(cd "$TARGET" && pwd)"
else TDIR="$WS/youcoded"; fi
export YOUCODED_PORT_OFFSET="${YOUCODED_PORT_OFFSET:-300}" VITE_NO_WATCH=1
export WB_PORT=$((5173 + YOUCODED_PORT_OFFSET))
OUT="$HERE/public/footage"; mkdir -p "$OUT"   # Remotion serves public/ — the clips and marks live there directly
# Posters and one still per mark go to out/review/ (gitignored) — copy the ones a check-in needs into that
# film's docs folder. (They went straight into docs/active/prototypes/promo-2026-09 for the first film.)
REVIEW="$HERE/out/review"; mkdir -p "$REVIEW/footage"

# The workbench we start is killed by process GROUP on exit (setsid gives it
# its own), never by a pkill pattern — a pattern can match the shell running it.
WB_PGID=""
trap '[ -n "$WB_PGID" ] && kill -- -"$WB_PGID" 2>/dev/null || true' EXIT
if ! curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null; then
  setsid bash "$WS/scripts/run-workbench.sh" "$TDIR" >"$OUT/workbench.log" 2>&1 &
  WB_PGID=$!
  for i in $(seq 1 60); do curl -sf "http://127.0.0.1:$WB_PORT/" >/dev/null && break; sleep 1; done
fi
# Same guard as site-assets.sh: whatever answers must be serving THIS tree.
VITE_PID="$(ss -ltnp "sport = :$WB_PORT" 2>/dev/null | rg -o 'pid=[0-9]+' | head -1 | cut -d= -f2 || true)"
VITE_CWD="$(readlink "/proc/${VITE_PID:-0}/cwd" 2>/dev/null || true)"
[[ "$VITE_CWD" == "$TDIR/desktop" ]] || { echo "[film] REFUSING: :$WB_PORT serves '${VITE_CWD:-nothing}', not '$TDIR/desktop'" >&2; exit 1; }
node "$WS/scripts/workbench-boot-check.mjs" "$WB_PORT"

# Round three (storyboard-v3): promo-remote, promo-phone, promo-takeover and
# promo-idle-midnight are retired — the phone beat is one phone clip now, and
# the cold open sits in Cotton Candy Sky.
ALL=(promo-idle-cotton promo-quick-chip promo-theme promo-model promo-sheet promo-project promo-games-lobby promo-connect4 promo-chess promo-flappy promo-conversations promo-anydevice promo-phone-takeover promo-market promo-idle-golden)
# A partial re-film ([scene ...]) still rewrites the review page for EVERY scene,
# so re-filming one never turns the page into a one-entry page.
SCENES=("$@"); [[ ${#SCENES[@]} -gt 0 ]] || SCENES=("${ALL[@]}")
i=0; FAILED=()
for s in "${SCENES[@]}"; do
  echo "[film] $s"
  if CDP_PORT=$((10360 + i)) node "$WS/scripts/ui-review/record.mjs" "$WS/scripts/ui-review/scenes/$s.json" "$OUT/$s"; then
    cp "$OUT/$s.webp" "$REVIEW/footage/$s.webp"
    # One still per MARK, at the mark's end: the frame the edit will cut on.
    # Verifying a take means looking at these, not scrubbing the clip — a mark
    # that lands on a stale theme or a half-open menu is invisible in a poster.
    mkdir -p "$REVIEW/marks"; rm -f "$REVIEW/marks/$s-"*.png
    node -e '
      const m = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
      for (const a of m.actions) if (a.mark) console.log(`${a.mark}\t${a.end}`);
    ' "$OUT/$s.marks.json" | while IFS=$'\t' read -r mark at; do
      ffmpeg -y -loglevel error -ss "$at" -i "$OUT/$s.webm" -frames:v 1 "$REVIEW/marks/$s-$mark.png"
    done
  else FAILED+=("$s"); fi
  i=$((i+1))
done
{
  echo "# Promo footage — review"; echo; echo "Filmed $(date -I) from \`$TDIR\`. One poster (the last frame) per scene; the clips and marks are in \`scripts/promo/public/footage/\`."; echo
  for s in "${ALL[@]}"; do echo "## $s"; echo; echo "![$s](footage/$s.webp)"; echo; done
  [[ ${#FAILED[@]} -eq 0 ]] || { echo "## Failed"; printf -- '- %s\n' "${FAILED[@]}"; }
} > "$REVIEW/footage-review.md"
echo "[film] done — ${#FAILED[@]} failed; review: $REVIEW/footage-review.md"
[[ ${#FAILED[@]} -eq 0 ]]
