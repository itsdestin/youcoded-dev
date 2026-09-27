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

# WHY (2026-09-23): a worktree whose node_modules was hardlinked from a STALE shared
# checkout failed here as "oxlint: command not found" and a TS5095 tsconfig error — neither
# says "your dependencies are older than this branch". Name the missing packages up front.
MISSING_DEPS=$(cd "$DESKTOP" && node -e '
  const p = require("./package.json"); const fs = require("fs");
  const names = Object.keys({ ...p.dependencies, ...p.devDependencies });
  console.log(names.filter((n) => !fs.existsSync("node_modules/" + n)).join(" "));' 2>/dev/null || true)
if [[ -n "$MISSING_DEPS" ]]; then
  echo "WARNING: node_modules is older than package.json — missing: $MISSING_DEPS" >&2
  echo "         Failures below are likely that, not your change. Provision this worktree with" >&2
  echo "         workspace-start, or run 'npm ci' in $DESKTOP if its node_modules is its own." >&2
  echo "" >&2
fi

# Default base ref: prefer origin/master over the local master.
#
# WHY this order (2026-09-07): workspace-start.mjs creates every session branch
# from a FRESHLY-FETCHED origin/master, but the shared checkout's local `master`
# ref is only as current as its last pull — it has been 100+ commits behind.
# Diffing `master...HEAD` (three dots, merge-base) against that stale ref sweeps
# every upstream commit that landed since into "changed files," and if any of
# them touched desktop/package.json the BROAD_RE below trips and a two-file edit
# pays for the FULL suite. origin/master is the ref the branch actually forked
# from, so it is the only honest base. Fall back to local master only when there
# is no origin/master (an offline clone with no remote ref).
if [[ -z "$BASE" ]]; then
  if git -C "$CHECKOUT" rev-parse --verify --quiet origin/master >/dev/null; then
    BASE="origin/master"
  else
    BASE="master"
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

# Tests that read a changed or DELETED non-code file by name. `vitest related`
# follows imports only, and the lists above skip deletions entirely, so a test
# that does readFileSync('…/review-roster.json') is invisible to both. 2026-09-23:
# deleting desktop/test-engine/review-roster.json printed "tests: none" here, then
# 26 harness-eval tests went red on the PR's Linux CI.
mapfile -t GONE_OR_DATA < <(
  { git -C "$CHECKOUT" diff --name-only --diff-filter=D "$BASE...HEAD" 2>/dev/null
    git -C "$CHECKOUT" diff --name-only --diff-filter=D HEAD 2>/dev/null
    printf '%s\n' "${CHANGED[@]:-}" | grep -vE '\.(ts|tsx|js|jsx)$'
  } | grep '^desktop/' | grep -vE '^desktop/(tests|src)/.*\.(snap|md)$' | sort -u || true)
DATA_TESTS=()
for f in "${GONE_OR_DATA[@]:-}"; do
  [[ -n "$f" ]] || continue
  # The stem too (a test may spell it `review-roster\.json` in a regex), but only
  # when it is long enough not to match half the suite ("index", "main").
  base=$(basename "$f"); stem=${base%.*}; pats=(-e "$base"); (( ${#stem} >= 8 )) && pats+=(-e "$stem")
  while IFS= read -r t; do [[ -n "$t" ]] && DATA_TESTS+=("$t"); done < <(cd "$DESKTOP" && grep -rlF "${pats[@]}" tests --include='*.test.ts' --include='*.test.tsx' 2>/dev/null || true)
done
if [[ ${#DATA_TESTS[@]} -gt 0 ]]; then
  mapfile -t DATA_TESTS < <(printf '%s\n' "${DATA_TESTS[@]}" | sort -u)
  REL+=("${DATA_TESTS[@]}")
fi

# Source-scanning guards — the `*-authority` suites and their relatives — read
# the source tree at RUNTIME (guard-scope, or their own join(__dirname,'..','src')).
# `vitest related` walks the IMPORT graph, so it can never relate one of them to a
# file you changed: they are invisible to every partial run, while being exactly
# the guards a new edit is most likely to trip. They are also cheap to run
# (27 files took ~1.2s when first measured; 53 files by 2026-09-23 — recounted
# with this same grep from desktop/, run time not re-measured), so every
# related run gets them appended.
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
  echo "  tests: related to ${#CHANGED[@]} changed file(s) + ${#SCANNERS[@]} source-scanning guards${DATA_TESTS:+ + ${#DATA_TESTS[@]} naming a changed/deleted data file}"
fi
echo ""

# --dry-run prints the resolved plan and stops. Mirrors run-dev.sh's flag, and it
# is how the changed-file detection above gets exercised without paying for a run.
if [[ $DRY -eq 1 ]]; then
  echo "would run:"
  echo "  npx tsgo --noEmit -p tsconfig.json"
  echo "  npx tsgo --noEmit -p tsconfig.tests.json"
  echo "  npm run knip"
  echo "  npm run lint"
  grep -q '"lint:design"' "$DESKTOP/package.json" && echo "  npm run lint:design"
  if [[ $RUN_FULL -eq 1 ]]; then
    echo "  npx vitest run"
  elif [[ ${#REL[@]} -gt 0 ]]; then
    printf '  npx vitest related --run%s\n' "$(printf ' %s' "${REL[@]}")"
  fi
  echo "  bash $ROOT/scripts/ast-grep/check.sh $DESKTOP/src"
  printf '%s\n' "${CHANGED[@]:-}" | grep -q '^desktop/src/renderer/' && echo "  node $ROOT/scripts/shoot/shoot.mjs --check (renderer changed)"
  printf '%s\n' "${CHANGED[@]:-}" | grep -qE '^desktop/(src/renderer/|tests/journeys/)' && echo "  node $ROOT/scripts/shoot/journeys.mjs (renderer or journeys changed)"
  exit 0
fi

# WHY tsgo (TypeScript 7's native compiler) instead of tsc: measured 2026-09-14,
# the two trees take ~1.3s + ~1.9s under tsgo against ~11s + ~16s under tsc,
# with identical verdicts. The BUILD still compiles with tsc (TypeScript 6), and
# CI runs that build, so an emit-only divergence between the compilers is still
# caught before release. Checkouts that predate tsgo fall back to tsc.
TSC=tsc
[[ -x "$DESKTOP/node_modules/.bin/tsgo" ]] && TSC=tsgo
start types "types ($TSC --noEmit)" npx "$TSC" --noEmit -p tsconfig.json
# The test tree is its own TS project (different module resolution, allowJs for
# the .mjs orchestrator). Separate check so a failure names which tree broke.
# Older checkouts have no tsconfig.tests.json; skip rather than fail on them.
if [[ -f "$DESKTOP/tsconfig.tests.json" ]]; then
  TESTS_EXCLUDED=$(grep -cE '^ *"tests/.*\.tsx?"' "$DESKTOP/tsconfig.tests.json" || true)
  start testtypes "types in tests/ ($TSC --noEmit, ${TESTS_EXCLUDED} file(s) still excluded)" \
    npx "$TSC" --noEmit -p tsconfig.tests.json
fi
start knip  "dead code (knip)"     npm run knip --silent
# oxlint is the bug gate, not a style gate — it catches the classes tsc/knip
# structurally cannot (conditional React hooks, floating promises in main,
# runtime imports of undeclared packages). Rule set + the measured cost of every
# deferred rule: desktop/.oxlintrc.json (it replaced eslint.config.mjs 2026-09-14).
start lint  "lint (oxlint)"        npm run lint --silent
# The design-system lint is a RATCHET (2026-09-16): its npm script carries
# `--max-warnings <count measured that day>`, so it fails only when a change
# ADDS a raw colour / arbitrary value / restyled primitive. Until then it had
# zero callers and the count drifted 539 → 542 unseen. Skipped, not failed, on
# a checkout that predates the script.
if grep -q '"lint:design"' "$DESKTOP/package.json"; then
  start design "design lint (oxlint --max-warnings ratchet)" npm run lint:design --silent
fi

if [[ $RUN_FULL -eq 1 ]]; then
  start tests "tests (full suite)" npx vitest run
elif [[ ${#REL[@]} -gt 0 ]]; then
  start tests "tests (related)" npx vitest related --run "${REL[@]}"
fi

# ast-grep runs against the checkout being verified, NOT the main one — a
# worktree's source is the whole point of passing a checkout argument.
start invariants "invariants (ast-grep)" bash "$ROOT/scripts/ast-grep/check.sh" "$DESKTOP/src"

# Screens: open every screen in the list once, in the photo-only build, and fail
# on any that does not show (scripts/shoot/, spec 2026-09-24-shoot-and-explore).
# WHY only on renderer changes: nothing else can move a screen, and the check
# builds the app and starts browsers (~5 s for Settings, measured 2026-09-25).
# It compares no pictures, so run-to-run image differences cannot fail it.
# Skipped, not failed, without Chrome or on a checkout older than the screen list.
if [[ -f "$DESKTOP/src/renderer/dev/workbench/screens/index.ts" ]] \
  && printf '%s\n' "${CHANGED[@]:-}" | grep -q '^desktop/src/renderer/' \
  && command -v google-chrome-stable >/dev/null 2>&1; then
  start screens "screens open (shoot --check)" node "$ROOT/scripts/shoot/shoot.mjs" --check --worktree "$CHECKOUT" --out "$LOGDIR/shoot"
fi

# Journeys: the saved paths through the app (desktop/tests/journeys/) — first conversation,
# a permission ask, theme, model switch, resume, marketplace install, project — each ending in
# a check of the result. WHY in verify and not "on request": a check nobody runs goes stale
# (Destin, 2026-09-26, choosing this over a manual list). ~8 s. A renamed button fails one with
# the step and label named; fix that line in the journey in the same change.
if [[ -d "$DESKTOP/tests/journeys" ]] \
  && printf '%s\n' "${CHANGED[@]:-}" | grep -qE '^desktop/(src/renderer/|tests/journeys/)' \
  && command -v google-chrome-stable >/dev/null 2>&1; then
  start journeys "journeys (click paths)" node "$ROOT/scripts/shoot/journeys.mjs" --worktree "$CHECKOUT"
fi

FAILED=0
FAILED_KEYS=()
for key in types testtypes tests knip lint design invariants screens journeys; do
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
  # WHY: this is the one moment every session is guaranteed to see a failing
  # test, and running a script loads no path-scoped rule. Destin's standing
  # rule (2026-09-17): fix failing/flaky tests on sight, never file them.
  [[ " ${FAILED_KEYS[*]} " == *" tests "* ]] && echo "   A failing or flaky test is fixed now, even if it predates this change — not filed on the roadmap. See CLAUDE.md → Local build & test."
fi
exit $(( FAILED > 0 ? 1 : 0 ))
