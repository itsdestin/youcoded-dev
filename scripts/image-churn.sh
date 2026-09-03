#!/usr/bin/env bash
# scripts/image-churn.sh — find changed image files whose PIXELS did not change.
#
# WHY THIS EXISTS: rebuilding the review decks on 2026-09-01 re-cut 265 PNGs. Every
# one was a different file on disk and every one was pixel-for-pixel identical to the
# committed version — ImageMagick writes different encoder metadata each run. That is
# hundreds of megabytes of meaningless binary diff, and it hides the one image that
# genuinely did change. It was caught by hand that day; nothing would catch it next time.
#
# Any generator that re-emits images has this failure mode: the deck's crops, the
# landing page's gallery stills and loop posters, theme previews.
#
# Usage:
#   bash scripts/image-churn.sh [--staged] [--revert] [-- <pathspec>...]
#
#   (default)    compare the WORKING TREE against HEAD
#   --staged     compare the INDEX against HEAD instead
#   --revert     restore the identical-pixel files instead of only listing them
#   -- <paths>   limit to these pathspecs (default: the whole repo)
#
# Exit 0 when nothing is churning, 1 when something is (so it can gate a commit).
# `--revert` always exits 0 — it fixed what it found.
#
# Needs ImageMagick (`magick`). Without it the script says so and exits 0 rather than
# pretending everything is fine.
set -uo pipefail

STAGED=0; REVERT=0; PATHSPEC=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --staged) STAGED=1; shift ;;
    --revert) REVERT=1; shift ;;
    --) shift; PATHSPEC=("$@"); break ;;
    -h|--help) sed -n '2,26p' "$0" | sed 's|^# \{0,1\}||'; exit 0 ;;
    *) echo "image-churn: unknown argument '$1' (try --help)" >&2; exit 2 ;;
  esac
done

command -v magick >/dev/null 2>&1 || {
  echo "image-churn: ImageMagick ('magick') is not installed — cannot compare pixels, so nothing was checked."
  exit 0
}
git rev-parse --git-dir >/dev/null 2>&1 || { echo "image-churn: not a git repo" >&2; exit 2; }

# Raster formats only. A pixel comparison is meaningless for SVG (text) and for video.
EXT_RE='\.(png|jpg|jpeg|webp|gif|bmp|tif|tiff)$'

if [[ $STAGED -eq 1 ]]; then
  mapfile -t CHANGED < <(git diff --cached --name-only --diff-filter=M -- "${PATHSPEC[@]:-.}" | grep -Ei "$EXT_RE" || true)
  WHERE="index"
else
  mapfile -t CHANGED < <(git diff --name-only --diff-filter=M -- "${PATHSPEC[@]:-.}" | grep -Ei "$EXT_RE" || true)
  WHERE="working tree"
fi

if [[ ${#CHANGED[@]} -eq 0 ]]; then
  echo "image-churn: no modified images in the $WHERE — nothing to check."
  exit 0
fi

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
IDENTICAL=(); REAL=(); UNREADABLE=()

for f in "${CHANGED[@]}"; do
  old="$TMP/old.${f##*.}"
  git show "HEAD:$f" > "$old" 2>/dev/null || { UNREADABLE+=("$f"); continue; }
  # -metric AE counts DIFFERING PIXELS. It prints the count on stderr and exits 1 when
  # the images differ at all, so both streams are captured and the exit code ignored.
  # Beware: it prints "0 (0)" for identical images, so match the leading token only.
  n="$(magick compare -metric AE "$old" "$f" null: 2>&1 | awk '{print $1}')"
  if [[ "$n" == "0" ]]; then IDENTICAL+=("$f")
  elif [[ "$n" =~ ^[0-9] ]]; then REAL+=("$f ($n px)")
  else UNREADABLE+=("$f — $n"); fi
done

echo "image-churn: ${#CHANGED[@]} modified image(s) in the $WHERE"
[[ ${#REAL[@]} -gt 0 ]] && { echo "  really changed (keep these):"; printf '    %s\n' "${REAL[@]}"; }
[[ ${#UNREADABLE[@]} -gt 0 ]] && { echo "  could not compare:"; printf '    %s\n' "${UNREADABLE[@]}"; }

if [[ ${#IDENTICAL[@]} -eq 0 ]]; then
  echo "  no churn — every changed image really changed."
  exit 0
fi

echo "  CHURN — ${#IDENTICAL[@]} file(s) differ on disk but are pixel-identical to HEAD:"
printf '    %s\n' "${IDENTICAL[@]}"

if [[ $REVERT -eq 1 ]]; then
  if [[ $STAGED -eq 1 ]]; then
    git restore --staged --worktree -- "${IDENTICAL[@]}"
  else
    git checkout -- "${IDENTICAL[@]}"
  fi
  echo "  reverted ${#IDENTICAL[@]} file(s)."
  exit 0
fi

echo
STAGED_FLAG=""; [[ $STAGED -eq 1 ]] && STAGED_FLAG=" --staged"   # "0" is non-empty, so ${STAGED:+} is wrong here
echo "  Revert them with:  bash scripts/image-churn.sh${STAGED_FLAG} --revert"
exit 1
