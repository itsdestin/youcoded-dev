#!/bin/bash
# Run a dev instance of YouCoded alongside your built/installed app.
#
# By default this launches the MAIN checkout (youcoded/). To test an
# unmerged branch, point it at that branch's worktree — the dev instance
# runs the worktree's source, so you can eyeball a fix before it merges.
# See docs/local-dev.md for what this isolates and what it shares.
#
# USAGE
#   bash scripts/run-dev.sh [<worktree>] [options]
#
#   bash scripts/run-dev.sh                     # main checkout (youcoded/)
#   bash scripts/run-dev.sh device-identity     # worktree youcoded-worktrees/device-identity
#   bash scripts/run-dev.sh fix/some-branch     # resolve by BRANCH name (any worktree location)
#   bash scripts/run-dev.sh --path ../elsewhere # an explicit checkout path
#   bash scripts/run-dev.sh --list              # show worktrees + branches, then exit
#   bash scripts/run-dev.sh device-identity --offset 100 --profile dev2   # run a SECOND instance
#   bash scripts/run-dev.sh <wt> --dry-run      # print what would launch, don't launch
#
# OPTIONS
#   --path <dir>      Launch an explicit checkout dir (contains desktop/). Overrides <worktree>.
#   --offset <n>      Port offset (default 50: Vite 5223, remote 9950). Use a DIFFERENT value
#                     to run two dev instances at once — and pair it with --profile.
#   --label <text>    Window-title descriptor → "YouCoded - <text>" in the taskbar/Alt-Tab,
#                     so concurrent dev instances are tellable apart. Defaults to the branch name.
#   --profile <name>  Electron userData profile (default: dev → %APPDATA%/youcoded-<name>/).
#                     Two concurrent instances MUST use different profiles or they share state.
#   --list            List registered worktrees (path + branch) and exit.
#   --dry-run         Resolve + print target/branch/ports/profile, but don't launch.
#   -h, --help        This help.
#
# WHY A WORKTREE, NOT `git checkout`: concurrent Claude sessions each work in
# their own worktree, so switching the main checkout's branch would fight them.
# Pointing dev at a worktree keeps every branch runnable without disturbing the
# others. Worktrees under youcoded-worktrees/<name> share the main checkout's
# node_modules via a junction — this script NEVER runs `npm ci` (that would
# rimraf through the junction and wipe the main checkout's deps; see CLAUDE.md).
set -euo pipefail

# Resolve the workspace root from THIS script's location, so it works from any cwd.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_CHECKOUT="$ROOT/youcoded"

WORKTREE=""
EXPLICIT_PATH=""
OFFSET="${YOUCODED_PORT_OFFSET:-50}"
PROFILE="${YOUCODED_PROFILE:-dev}"
LABEL=""            # window-title descriptor; defaults to the branch name below
DRY_RUN=0

die() { echo "run-dev: $*" >&2; exit 1; }

list_worktrees() {
  echo "Registered youcoded worktrees (branch → path):"
  git -C "$MAIN_CHECKOUT" worktree list --porcelain | awk '
    /^worktree /   { path = substr($0, 10) }
    /^branch /     { br = substr($0, 8); sub("refs/heads/", "", br); printf "  %-42s %s\n", br, path; br="" }
    /^detached/    { printf "  %-42s %s\n", "(detached)", path }
  '
  echo ""
  echo "Launch one with:  bash scripts/run-dev.sh <branch-or-worktree-name>"
}

# --- arg parsing ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)  sed -n '2,37p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --list)     list_worktrees; exit 0 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --path)     EXPLICIT_PATH="${2:-}"; [[ -n "$EXPLICIT_PATH" ]] || die "--path needs a directory"; shift 2 ;;
    --offset)   OFFSET="${2:-}"; [[ -n "$OFFSET" ]] || die "--offset needs a number"; shift 2 ;;
    --profile)  PROFILE="${2:-}"; [[ -n "$PROFILE" ]] || die "--profile needs a name"; shift 2 ;;
    --label)    LABEL="${2:-}"; [[ -n "$LABEL" ]] || die "--label needs a descriptor"; shift 2 ;;
    -*)         die "unknown option: $1 (try --help)" ;;
    *)          [[ -z "$WORKTREE" ]] || die "unexpected extra argument: $1"; WORKTREE="$1"; shift ;;
  esac
done

# --- resolve which checkout to run ---
resolve_checkout() {
  # 1. explicit path wins
  if [[ -n "$EXPLICIT_PATH" ]]; then
    ( cd "$EXPLICIT_PATH" 2>/dev/null && pwd ) || die "--path not found: $EXPLICIT_PATH"
    return
  fi
  # 2. no arg → main checkout
  if [[ -z "$WORKTREE" ]]; then
    echo "$MAIN_CHECKOUT"; return
  fi
  # 3. a directory under youcoded-worktrees/<name>
  if [[ -d "$ROOT/youcoded-worktrees/$WORKTREE/desktop" ]]; then
    echo "$ROOT/youcoded-worktrees/$WORKTREE"; return
  fi
  # 4. match a registered worktree by BRANCH name or path basename (any location)
  local match
  match="$(git -C "$MAIN_CHECKOUT" worktree list --porcelain | awk -v want="$WORKTREE" '
    /^worktree / { path = substr($0, 10) }
    /^branch /   { br = substr($0, 8); sub("refs/heads/", "", br)
                   n = split(path, parts, "/"); base = parts[n]
                   if (br == want || base == want) { print path; exit } }
  ')"
  [[ -n "$match" ]] && { echo "$match"; return; }
  # 5. give up with a helpful listing
  echo "run-dev: no worktree or branch matching '$WORKTREE'." >&2
  echo "" >&2
  list_worktrees >&2
  exit 1
}

CHECKOUT="$(resolve_checkout)"
DESKTOP="$CHECKOUT/desktop"
[[ -f "$DESKTOP/package.json" ]] || die "no desktop/package.json under $CHECKOUT — is that a youcoded checkout?"

# The branch label is informational (a detached worktree is fine to run).
BRANCH="$(git -C "$CHECKOUT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '(unknown)')"

# node_modules must already exist. Worktrees share the main checkout's via a
# junction; we do NOT create it here because `npm ci` in a worktree rimrafs
# through the junction and wipes the MAIN checkout's deps (see CLAUDE.md).
if [[ ! -e "$DESKTOP/node_modules" ]]; then
  echo "run-dev: $DESKTOP/node_modules is missing." >&2
  echo "  For a worktree, junction the main checkout's deps (does NOT copy):" >&2
  echo "    cmd //c \"mklink /J '$DESKTOP/node_modules' '$MAIN_CHECKOUT/desktop/node_modules'\"" >&2
  echo "  (Do NOT run 'npm ci' in a worktree — it deletes through the junction.)" >&2
  exit 1
fi

# Shifts every port youcoded controls (Vite 5173 → 5223, remote 9900 → 9950 at
# the default offset 50). A second concurrent instance needs a DIFFERENT offset
# AND a different --profile so it neither shares a port nor shares userData.
export YOUCODED_PORT_OFFSET="$OFFSET"

# Splits Electron userData → %APPDATA%/youcoded-<profile>/ so the dev instance's
# localStorage, window bounds, and cache don't clobber the built app's.
export YOUCODED_PROFILE="$PROFILE"

# Window-title descriptor so concurrent dev instances are tellable apart in the
# taskbar / Alt-Tab (main.ts reads this → "YouCoded - <label>"). Default to the
# branch name (minus a feat/fix/chore prefix) when --label wasn't given, so a dev
# window is never just "YouCoded".
export YOUCODED_DEV_LABEL="${LABEL:-$(echo "$BRANCH" | sed -E 's#^(feat|fix|chore|refactor|docs)/##')}"

# Belt-and-suspenders: if this script is run from inside a Claude Code session
# (e.g. via a Claude session's Bash tool), the shell carries CC's own session
# markers. Inherited by the dev app and passed to the `claude` it spawns, they
# make that child run as a NESTED session, which writes no transcript → chat
# view stays empty (responses only show in terminal view). The real fix lives in
# the app (desktop/src/main/pty-worker.js strips these at spawn); unsetting them
# here too keeps the dev launch clean regardless of app version.
# See docs/PITFALLS.md → "Local Dev & Launch Environment".
unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_SESSION_ID \
      CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_EFFORT \
      CLAUDE_DESKTOP_SESSION_ID CLAUDE_DESKTOP_PIPE

echo "Starting YouCoded dev"
echo "  Checkout:      $CHECKOUT"
echo "  Branch:        $BRANCH"
echo "  Window title:  YouCoded - $YOUCODED_DEV_LABEL"
echo "  Profile:       $PROFILE  (userData → %APPDATA%/youcoded-$PROFILE/)"
echo "  Vite:          http://localhost:$((5173 + YOUCODED_PORT_OFFSET))"
echo "  Remote server: port $((9900 + YOUCODED_PORT_OFFSET)) (if enabled in dev)"
echo ""

if [[ "$DRY_RUN" == "1" ]]; then
  echo "(--dry-run: not launching)"
  exit 0
fi

cd "$DESKTOP"
npm run dev
