#!/usr/bin/env bash
# One command, one verdict: "is this change safe to ship?"
#
# WHY THIS EXISTS: CLAUDE.md prescribes five separate checks (tsc --noEmit,
# vitest, knip, eslint, ast-grep) across two directories, and none of them had an npm
# script or a shared entry point. Every session typed them slightly differently
# and "verified" meant whatever that session happened to remember to run. This
# makes it one command with one exit code.
#
# The second reason is cost. `npm test` is ~600 test files; a two-file change
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
#   * `tsc --noEmit` runs TWICE: desktop/tsconfig.json (src/**) and
#     desktop/tsconfig.tests.json (the test tree). Until 2026-09-02 only the
#     first existed and nothing type-checked a single test file. The second one
#     still EXCLUDES the files that were already failing when it was introduced
#     — the count is printed on every run so the debt cannot go quiet.
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

# A SYMLINKED node_modules is not a supported shape, and it used to fail
# silently: Vite resolved through the link to the main checkout, its file guard
# denied the resulting path, and ~60 suites died at import with
# `Denied ID .../github-dark.css?inline` while the summary said only "tests
# failed". vitest.config.ts now allows the resolved directory, so the suites run
# — but the OTHER hazard is unfixable from here and worse: `npm ci` and Gradle's
# bundleWebUi follow the link and empty the MAIN checkout's node_modules for
# every worktree at once (workspace CLAUDE.md, verified 2026-08-13). Say so
# loudly rather than letting a green run imply the setup is fine.
if [[ -L "$DESKTOP/node_modules" ]]; then
  echo "WARNING: $DESKTOP/node_modules is a SYMLINK to $(readlink "$DESKTOP/node_modules")" >&2
  echo "         Tests will run, but do NOT run 'npm ci' or any Gradle task in this" >&2
  echo "         checkout — both follow the link and wipe the shared copy." >&2
  echo "         Replace it with a hardlink farm:" >&2
  echo "           rm '$DESKTOP/node_modules' && cp -al <main-checkout>/desktop/node_modules '$DESKTOP/node_modules'" >&2
  echo "" >&2
fi

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

# Source-scanning guards — the `*-authority` suites and their relatives — read
# the source tree at RUNTIME (guard-scope, or their own join(__dirname,'..','src')).
# `vitest related` walks the IMPORT graph, so it can never relate one of them to a
# file you changed: they are invisible to every partial run, while being exactly
# the guards a new edit is most likely to trip. They are also nearly free (27
# files, ~1.2s), so every related run gets them appended.
# 2026-08-28: a `text-[13px]` passed a green verify.sh twice and turned CI red on
# all three platforms — type-scale-authority.test.ts had never been run.
SCANNERS=()
if [[ $RUN_FULL -eq 0 && ${#REL[@]} -gt 0 ]]; then
  mapfile -t SCANNERS < <(cd "$DESKTOP" && grep -rlE "helpers/guard-scope|'\.\.', *'src'" tests --include='*.test.ts' --include='*.test.tsx' 2>/dev/null | sort || true)
  REL+=("${SCANNERS[@]:-}")
fi

# ---------- run the checks, in parallel ----------
#
# tsc, vitest, knip and eslint are independent and each takes tens of seconds,
# so they run concurrently into separate logs and are reported in a fixed order
# afterwards. Interleaving their stdout would make the output unreadable.
LOGDIR="$(mktemp -d)"
# Kept ONLY on a green run. A failing run moves its logs somewhere durable
# below, because the transcript tail is 25 lines and a flake is unreportable
# without the rest — on 2026-09-02 two tests failed here, passed on a re-run,
# and their NAMES were gone with the temp dir before anyone could file them.
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
  echo "  tests: related to ${#CHANGED[@]} changed file(s) + ${#SCANNERS[@]} source-scanning guards"
fi
echo ""

# --dry-run prints the resolved plan and stops. Mirrors run-dev.sh's flag, and it
# is how the changed-file detection above gets exercised without paying for a run.
if [[ $DRY -eq 1 ]]; then
  echo "would run:"
  echo "  npx tsc --noEmit -p tsconfig.json"
  echo "  npx tsc --noEmit -p tsconfig.tests.json"
  echo "  npm run knip"
  echo "  npm run lint"
  if [[ $RUN_FULL -eq 1 ]]; then
    echo "  npx vitest run"
  elif [[ ${#REL[@]} -gt 0 ]]; then
    printf '  npx vitest related --run%s\n' "$(printf ' %s' "${REL[@]}")"
  fi
  echo "  bash $ROOT/scripts/ast-grep/check.sh $DESKTOP/src"
  exit 0
fi

start types "types (tsc --noEmit)" npx tsc --noEmit -p tsconfig.json
# The test tree is its own TS project (different module resolution, allowJs for
# the .mjs orchestrator). Separate check so a failure names which tree broke.
# Older checkouts have no tsconfig.tests.json; skip rather than fail on them.
if [[ -f "$DESKTOP/tsconfig.tests.json" ]]; then
  TESTS_EXCLUDED=$(grep -cE '^ *"tests/.*\.tsx?"' "$DESKTOP/tsconfig.tests.json" || true)
  start testtypes "types in tests/ (tsc --noEmit, ${TESTS_EXCLUDED} file(s) still excluded)" \
    npx tsc --noEmit -p tsconfig.tests.json
fi
start knip  "dead code (knip)"     npm run knip --silent
# eslint is the bug gate, not a style gate — it catches the classes tsc/knip
# structurally cannot (conditional React hooks, floating promises in main,
# runtime imports of undeclared packages). Rule set + the measured cost of every
# deferred rule: desktop/eslint.config.mjs.
start lint  "lint (eslint)"        npm run lint --silent

if [[ $RUN_FULL -eq 1 ]]; then
  start tests "tests (full suite)" npx vitest run
elif [[ ${#REL[@]} -gt 0 ]]; then
  start tests "tests (related)" npx vitest related --run "${REL[@]}"
fi

# ast-grep runs against the checkout being verified, NOT the main one — a
# worktree's source is the whole point of passing a checkout argument.
start invariants "invariants (ast-grep)" bash "$ROOT/scripts/ast-grep/check.sh" "$DESKTOP/src"

FAILED=0
FAILED_KEYS=()
for key in types testtypes tests knip lint invariants; do
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
    FAILED_KEYS+=("$key")
  fi
done

# Preserve the logs for every check that failed. The old line said "(full log
# was $LOGDIR/…)" and pointed at a path the EXIT trap was about to delete — a
# message naming a file the reader cannot open is worse than no message.
if [[ $FAILED -gt 0 ]]; then
  KEEP="$ROOT/scratch/verify-$(date +%Y%m%d-%H%M%S)-$$"
  if mkdir -p "$KEEP" 2>/dev/null; then
    for key in "${FAILED_KEYS[@]}"; do cp "$LOGDIR/$key.log" "$KEEP/$key.log" 2>/dev/null; done
    echo ""
    echo "full logs: $KEEP"
  fi
fi

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "OK — all checks passed."
  [[ $RUN_FULL -eq 0 && ${#REL[@]} -eq 0 ]] && echo "   NOTE: no test ran. Nothing changed under desktop/."
  echo "   Not covered: Android (./gradlew test), marketplace worker."
else
  echo "$FAILED check(s) failed."
fi
exit $(( FAILED > 0 ? 1 : 0 ))
