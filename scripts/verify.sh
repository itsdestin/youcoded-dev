#!/usr/bin/env bash
# One command, one verdict: "is this change safe to ship?"
#
# WHY THIS EXISTS: CLAUDE.md prescribes four separate checks (tsc --noEmit,
# vitest, knip, ast-grep) across two directories, and none of them had an npm
# script or a shared entry point. Every session typed them slightly differently
# and "verified" meant whatever that session happened to remember to run. This
# makes it one command with one exit code.
#
# The second reason is cost. `npm test` is 296 test files; a two-file change
# does not need all of them. This runs `vitest related` on the files you
# actually touched, which is the difference between ~10s and ~2min per loop.
#
# Usage:
#   bash scripts/verify.sh                      # main youcoded checkout, changed files only
#   bash scripts/verify.sh glyph-atlas          # a worktree under worktrees/
#   bash scripts/verify.sh /path/to/checkout    # any dir containing desktop/
#   bash scripts/verify.sh --full               # whole test suite regardless of the diff
#   bash scripts/verify.sh --base origin/master # compare against a different ref
#   bash scripts/verify.sh --dry-run            # print the resolved plan, run nothing
#
# SCOPE, stated rather than implied — this covers youcoded/desktop ONLY:
#   * Android (./gradlew test) is NOT run. 18 Kotlin test files, no changed-file
#     mapping to drive them from. A green run here says nothing about Android.
#   * The marketplace worker has its own CI (wecoded-marketplace/.github/) and is
#     not run here either.
#   * `tsc --noEmit` uses desktop/tsconfig.json, whose `include` is `src/**/*`.
#     Test files under tests/ are therefore NOT type-checked by it — vitest
#     executes them, but esbuild strips types without checking them.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TARGET=""
FULL=0
DRY=0
BASE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) FULL=1; shift ;;
    --dry-run) DRY=1; shift ;;
    --base) BASE="${2:-}"; shift 2 ;;
    -h|--help) sed -n '2,30p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    -*) echo "error: unknown flag '$1'" >&2; exit 2 ;;
    *) TARGET="$1"; shift ;;
  esac
done

# Checkout resolution mirrors run-workbench.sh so the three launchers take the
# same argument. Keep them in sync if either changes.
if [[ -z "$TARGET" ]]; then
  CHECKOUT="$ROOT/youcoded"
elif [[ -d "$TARGET/desktop" ]]; then
  CHECKOUT="$(cd "$TARGET" && pwd)"
elif [[ -d "$ROOT/worktrees/$TARGET/desktop" ]]; then
  CHECKOUT="$ROOT/worktrees/$TARGET"
else
  echo "error: no checkout found for '$TARGET'" >&2
  echo "  expected a path containing desktop/, or a worktree under $ROOT/worktrees/" >&2
  # A youcoded-dev worktree has no worktrees/ dir of its own, so name lookup
  # cannot work from one. Say so rather than leaving the empty listing to explain itself.
  [[ -d "$ROOT/worktrees" ]] || echo "  ($ROOT has no worktrees/ — run this from the main workspace, or pass a full path.)" >&2
  exit 2
fi

DESKTOP="$CHECKOUT/desktop"
# A youcoded-dev *worktree* has no sub-repo clones (they are gitignored, so they
# live only in the main workspace). Say that instead of failing on node_modules.
[[ -d "$DESKTOP" ]] || {
  echo "error: $DESKTOP does not exist." >&2
  echo "  If you are running this from a youcoded-dev worktree, it has no sub-repo" >&2
  echo "  clones — pass an explicit checkout path, or run it from $HOME/youcoded-dev." >&2
  exit 2
}
[[ -d "$DESKTOP/node_modules" ]] || {
  echo "error: $DESKTOP/node_modules is missing — run 'cd $DESKTOP && npm ci' first" >&2
  exit 2
}

# Default base ref: prefer a local master, fall back to the remote. A worktree
# created straight from origin/master may have no local master ref at all.
if [[ -z "$BASE" ]]; then
  if git -C "$CHECKOUT" rev-parse --verify --quiet master >/dev/null; then
    BASE="master"
  else
    BASE="origin/master"
  fi
fi

# ---------- what changed ----------
#
# Three sources, because a branch mid-work has changes in all three states and
# missing any one of them silently under-tests:
#   1. committed on this branch    (BASE...HEAD — three dots = since merge-base)
#   2. staged + unstaged vs HEAD
#   3. untracked but not ignored
changed_files() {
  git -C "$CHECKOUT" diff --name-only --diff-filter=ACMR "$BASE...HEAD" 2>/dev/null
  git -C "$CHECKOUT" diff --name-only --diff-filter=ACMR HEAD 2>/dev/null
  git -C "$CHECKOUT" ls-files --others --exclude-standard 2>/dev/null
}

mapfile -t CHANGED < <(changed_files | sort -u | grep '^desktop/' || true)

# Files whose change invalidates the affected-test mapping itself. `vitest
# related` walks the import graph from a source file; it cannot know that
# editing vitest.config.ts or a shared mock changes the meaning of every test.
# Touch one of these and the only honest answer is the full suite.
BROAD_RE='^desktop/(vitest\.config\.ts|vite\.config\.ts|tsconfig\.json|package(-lock)?\.json|tests/(global-setup|setup-dom)\.ts|tests/__mocks__/)'

RUN_FULL=$FULL
BROAD_HIT=""
if [[ $RUN_FULL -eq 0 ]]; then
  for f in "${CHANGED[@]:-}"; do
    if [[ "$f" =~ $BROAD_RE ]]; then RUN_FULL=1; BROAD_HIT="$f"; break; fi
  done
fi

# Paths handed to `vitest related` must be relative to desktop/, since that is
# vitest's cwd. Test files are passed through too — vitest accepts them and runs
# them directly, which is what you want when the diff only touched a test.
REL=()
for f in "${CHANGED[@]:-}"; do
  [[ "$f" =~ \.(ts|tsx|js|jsx)$ ]] || continue
  REL+=("${f#desktop/}")
done

# ---------- run the checks, in parallel ----------
#
# tsc, vitest and knip are independent and each takes tens of seconds, so they
# run concurrently into separate logs and are reported in a fixed order
# afterwards. Interleaving their stdout would make the output unreadable.
LOGDIR="$(mktemp -d)"
trap 'rm -rf "$LOGDIR"' EXIT

declare -A PID LABEL
start() { # start <key> <label> <cmd...>
  local key="$1" label="$2"; shift 2
  LABEL[$key]="$label"
  ( cd "$DESKTOP" && "$@" ) >"$LOGDIR/$key.log" 2>&1 &
  PID[$key]=$!
}

echo "verify: $CHECKOUT (base $BASE)"
if [[ $FULL -eq 1 ]]; then
  echo "  tests: FULL suite (--full)"
elif [[ -n "$BROAD_HIT" ]]; then
  echo "  tests: FULL suite (test infra changed: $BROAD_HIT)"
elif [[ ${#REL[@]} -eq 0 ]]; then
  echo "  tests: none — no changed TS/JS files under desktop/"
else
  echo "  tests: related to ${#REL[@]} changed file(s)"
fi
echo ""

# --dry-run prints the resolved plan and stops. Mirrors run-dev.sh's flag, and it
# is how the changed-file detection above gets exercised without paying for a run.
if [[ $DRY -eq 1 ]]; then
  echo "would run:"
  echo "  npx tsc --noEmit -p tsconfig.json"
  echo "  npm run knip"
  if [[ $RUN_FULL -eq 1 ]]; then
    echo "  npx vitest run"
  elif [[ ${#REL[@]} -gt 0 ]]; then
    printf '  npx vitest related --run%s\n' "$(printf ' %s' "${REL[@]}")"
  fi
  echo "  bash $ROOT/scripts/ast-grep/check.sh $DESKTOP/src"
  exit 0
fi

start types "types (tsc --noEmit)" npx tsc --noEmit -p tsconfig.json
start knip  "dead code (knip)"     npm run knip --silent

if [[ $RUN_FULL -eq 1 ]]; then
  start tests "tests (full suite)" npx vitest run
elif [[ ${#REL[@]} -gt 0 ]]; then
  start tests "tests (related)" npx vitest related --run "${REL[@]}"
fi

# ast-grep runs against the checkout being verified, NOT the main one — a
# worktree's source is the whole point of passing a checkout argument.
start invariants "invariants (ast-grep)" bash "$ROOT/scripts/ast-grep/check.sh" "$DESKTOP/src"

FAILED=0
for key in types tests knip invariants; do
  [[ -n "${PID[$key]:-}" ]] || continue
  wait "${PID[$key]}"; rc=$?
  if [[ $rc -eq 0 ]]; then
    printf 'PASS  %s\n' "${LABEL[$key]}"
  else
    FAILED=$((FAILED + 1))
    printf 'FAIL  %s\n' "${LABEL[$key]}"
    # Last 25 lines: enough for a tsc error list or a vitest failure summary
    # without dumping a full suite run into the transcript.
    sed 's/^/      /' "$LOGDIR/$key.log" | tail -25
    echo "      (full log was $LOGDIR/$key.log)"
  fi
done

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "OK — all checks passed."
  [[ $RUN_FULL -eq 0 && ${#REL[@]} -eq 0 ]] && echo "   NOTE: no test ran. Nothing changed under desktop/."
  echo "   Not covered: Android (./gradlew test), marketplace worker."
else
  echo "$FAILED check(s) failed."
fi
exit $(( FAILED > 0 ? 1 : 0 ))
