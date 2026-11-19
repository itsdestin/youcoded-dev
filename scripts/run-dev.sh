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
#   bash scripts/run-dev.sh --stop [--offset N]  # stop the instance on that offset's ports (Electron AND its Vite)
#   bash scripts/run-dev.sh <wt> --without chatgpt,api-keys   # this launch: no ChatGPT sign-in, no saved API keys
#
# PRIVATE HOME (always): the test copy runs in its own home folder, ~/.cache/youcoded-test-copies/<profile>/home.
# Its chats, settings, themes and provider list live there — never in the real app, which cannot see that folder.
# It starts like a fresh install (default theme, no installed plugins), reused by the next launch of that profile.
# SIGN-INS (kept by default, each can be switched off per launch): claude-code, chatgpt, api-keys. They are LENT:
# a pass that works for hours or days, never the renewal key, so nothing the test copy does can sign the real app out.
# GitHub is the exception — OFF unless asked for, because with it a test copy can publish as Destin.
#
# OPTIONS
#   --path <dir>      Launch an explicit checkout dir (contains desktop/). Overrides <worktree>.
#   --no-devtools     Disable the remote-debugging port (on by default, localhost only)
#   --offset <n>      Port offset (default 50: Vite 5223, remote 9950, debugger 9272). Use a DIFFERENT value
#                     to run two dev instances at once — and pair it with --profile.
#   --label <text>    Window-title descriptor → "YouCoded - <text>" in the taskbar/Alt-Tab,
#                     so concurrent dev instances are tellable apart. Defaults to the branch name.
#   --profile <name>  Electron userData profile (default: dev → %APPDATA%/youcoded-<name>/).
#                     Two concurrent instances MUST use different profiles or they share state.
#   --phone-build     Build the app once and serve THAT to a phone's browser: it loads like the
#                     installed app, but renderer edits reach the phone only after another build.
#   --without <list>  Switch sign-ins OFF for this launch: comma list of claude-code, chatgpt, api-keys, or all.
#   --with github     Lend the real GitHub login too (the test copy can then publish and open pull requests as Destin).
#   --fresh           Delete this profile's private home first, so the test copy starts from nothing.
#   --list            List running dev instances, then registered worktrees (path + branch), and exit.
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
# Throwaway-HOME account isolation (GitHub keyring etc.) and its cleanup: see scripts/dev-isolation.sh.
source "$ROOT/scripts/dev-isolation.sh"
# WHY (card #19 i): this script used to carry its own checkout resolver that did not know the session
# layout worktrees/sessions/<name>/youcoded, so `run-dev.sh <session-name>` failed for the very worktrees
# workspace-start creates. One shared resolver (also used by run-workbench.sh) keeps them from drifting.
source "$ROOT/scripts/lib/resolve-checkout.sh"
# One state file per offset: the private bus pid and address, so --stop can end the bus and what it started (exact pids).
bus_state_file() { echo "${TMPDIR:-/tmp}/youcoded-dev-bus-$(id -u)-$1.state"; }

WORKTREE=""
EXPLICIT_PATH=""
PHONE_BUILD=0
OFFSET="${YOUCODED_PORT_OFFSET:-50}"
# Remote-debugging port on by default for dev instances; --no-devtools turns it off.
DEVTOOLS=1
PROFILE="${YOUCODED_PROFILE:-dev}"
LABEL=""            # window-title descriptor; defaults to the branch name below
DRY_RUN=0
STOP=0
WITHOUT=""          # sign-ins switched off for this launch (--without)
WITH_GITHUB=0       # --with github
FRESH=0             # --fresh: delete the profile's private home first

die() { echo "run-dev: $*" >&2; exit 1; }

# WHY (card #19 ii): the offset feeds shell arithmetic and TCP port numbers. "abc" died later with a bare
# bash arithmetic error, "08" was read as a (bad) octal number, and a huge value produced a port above 65535
# that only failed at launch. The highest base port is 9900, so 55635 is the largest offset that stays valid.
validate_offset() {
  [[ "$1" =~ ^[0-9]+$ ]] || die "--offset must be a whole number from 0 to 55635 (got '$1')"
  local n=$((10#$1))
  (( n <= 55635 )) || die "--offset must be a whole number from 0 to 55635 (got '$1'; ports would pass 65535)"
  OFFSET="$n"   # normalised: "050" becomes 50, never octal
}

# The three ports one instance owns, for a given offset. Vite and the remote server
# are the two everybody hits; the debugger only exists when devtools are on.
ports_for_offset() { echo "$((5173 + $1)) $((9900 + $1)) $((9222 + $1))"; }

# pid(s) LISTENING on a TCP port — derived from the port at the moment of use, never
# remembered from an earlier listing (a stale pid once killed Destin's live app engine).
pids_on_port() {
  # `|| true`: under `set -o pipefail` a port with no listener makes grep exit 1, which
  # would abort the whole script through `set -e` — silently, since nothing prints.
  ss -ltnpH "sport = :$1" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true
}

# WHY a preflight (2026-09-16, dev-workspace.md): with four-plus session worktrees on this
# machine an offset collision is the normal case, and Vite only reported it AFTER the whole
# launch sequence had run, as a bare "Port 5233 is already in use" that named neither the
# worktree holding it nor a free offset. Check first, name the holder, suggest the next gap.
# A listener on a port, whoever owns it. `ss -p` only reveals pids for this user's
# sockets, so "no pid found" must never read as "port free" — a root-owned service on
# the same number would still make the launch fail.
port_busy() { [[ -n "$(ss -ltnH "sport = :$1" 2>/dev/null)" ]]; }

preflight_ports() {
  local busy=0 p pids pid cwd
  for p in $(ports_for_offset "$OFFSET"); do
    port_busy "$p" || continue
    busy=1
    pids="$(pids_on_port "$p")"
    if [[ -z "$pids" ]]; then
      echo "run-dev: port $p is already taken (by a process this user cannot see)" >&2
      continue
    fi
    for pid in $pids; do
      cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
      echo "run-dev: port $p is already taken by pid $pid${cwd:+ (running in $cwd)}" >&2
    done
  done
  if [[ "$busy" == "1" ]]; then
    local try
    for try in $(seq $((OFFSET + 10)) 10 $((OFFSET + 200))); do
      local free=1 q
      for q in $(ports_for_offset "$try"); do port_busy "$q" && { free=0; break; }; done
      if [[ "$free" == "1" ]]; then
        echo "run-dev: that is another dev instance on offset $OFFSET — launch this one with --offset $try --profile <its-own-name>, or stop the other with: bash scripts/run-dev.sh --stop --offset $OFFSET" >&2
        exit 1
      fi
    done
    die "every offset from $OFFSET to $((OFFSET + 200)) is in use — stop something first (bash scripts/run-dev.sh --stop --offset <n>)"
  fi
}

# WHY --stop (2026-09-16, dev-workspace.md): killing the Electron process by hand orphaned
# its Vite server, which kept the port and made the NEXT launch fail with an error that
# named Vite rather than the leftover. The launcher knows every port it started, so it can
# end the pair. Signals go to pids derived from the ports in this same command.
stop_instance() {
  local any=0 p pids pid
  for p in $(ports_for_offset "$OFFSET"); do
    pids="$(pids_on_port "$p")"
    [[ -n "$pids" ]] || continue
    for pid in $pids; do
      any=1
      echo "run-dev: stopping pid $pid on port $p ($(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null | cut -c1-80))"
      kill "$pid" 2>/dev/null || true
    done
  done
  # WHY (2026-10-01 one-core R6-3): a throwaway-HOME launch runs on a private session bus whose activated services (ksecretd, the desktop
  # portal) outlive the app; end them by the exact pids recorded for this offset (see dev-isolation.sh).
  local bus_state; bus_state="$(bus_state_file "$OFFSET")"
  if [[ "$any" == "0" ]]; then dev_isolation_cleanup "$bus_state"; echo "run-dev: nothing is listening on offset $OFFSET's ports ($(ports_for_offset "$OFFSET"))"; return 0; fi
  # A graceful TERM first; anything still holding a port two seconds later gets KILL.
  sleep 2
  for p in $(ports_for_offset "$OFFSET"); do
    for pid in $(pids_on_port "$p"); do echo "run-dev: pid $pid ignored SIGTERM — killing"; kill -9 "$pid" 2>/dev/null || true; done
  done
  dev_isolation_cleanup "$bus_state"
  echo "run-dev: offset $OFFSET's ports are free"
}

# WHY (card #19 iii): `--list` used to show only worktrees, so there was no way to see which dev instances
# were actually running (and on which offset) before picking a free one. Each launch writes a marker
# <checkout>/desktop/.dev-instances/<offset>.json holding its pid (see the MARKER write below); an instance
# is "running" when that pid is alive. A marker left by a killed run names a dead pid and is skipped.
# Instances started with --no-devtools write no marker and so cannot be listed here.
list_running_instances() {
  local path m pid off prof found=0
  while IFS= read -r path; do
    for m in "$path"/desktop/.dev-instances/*.json; do
      [[ -f "$m" ]] || continue
      pid="$(sed -n 's/.*"pid":\([0-9][0-9]*\).*/\1/p' "$m" | head -1)"
      [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null || continue
      off="$(sed -n 's/.*"offset":\([0-9][0-9]*\).*/\1/p' "$m" | head -1)"
      prof="$(sed -n 's/.*"profile":"\([^"]*\)".*/\1/p' "$m" | head -1)"
      if [[ "$found" == "0" ]]; then echo "Running dev instances (offset, pid, profile → checkout):"; found=1; fi
      printf '  offset %-6s pid %-8s %-12s %s\n' "$off" "$pid" "${prof:-?}" "$path"
    done
  done < <(git -C "$MAIN_CHECKOUT" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')
  if [[ "$found" == "0" ]]; then echo "No dev instances running (those started with --no-devtools are not listed)."; fi
}

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
    -h|--help)  sed -n '2,51p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --list)     list_running_instances; echo ""; list_worktrees; exit 0 ;;
    --dry-run)  DRY_RUN=1; shift ;;
    --stop)     STOP=1; shift ;;
    --phone-build) PHONE_BUILD=1; shift ;;
    --path)     EXPLICIT_PATH="${2:-}"; [[ -n "$EXPLICIT_PATH" ]] || die "--path needs a directory"; shift 2 ;;
    --offset)   [[ -n "${2:-}" ]] || die "--offset needs a number"; validate_offset "$2"; shift 2 ;;
    --no-devtools) DEVTOOLS=0; shift ;;
    --profile)  PROFILE="${2:-}"; [[ -n "$PROFILE" ]] || die "--profile needs a name"; shift 2 ;;
    --without)  [[ -n "${2:-}" ]] || die "--without needs a list (claude-code, chatgpt, api-keys, all)"; WITHOUT="${WITHOUT:+$WITHOUT,}$2"; shift 2 ;;
    --with)     [[ "${2:-}" == "github" ]] || die "--with takes only: github"; WITH_GITHUB=1; shift 2 ;;
    --fresh)    FRESH=1; shift ;;
    --label)    LABEL="${2:-}"; [[ -n "$LABEL" ]] || die "--label needs a descriptor"; shift 2 ;;
    -*)         die "unknown option: $1 (try --help)" ;;
    *)          [[ -z "$WORKTREE" ]] || die "unexpected extra argument: $1"; WORKTREE="$1"; shift ;;
  esac
done

# The offset may also have come from YOUCODED_PORT_OFFSET, which the --offset case above never sees.
validate_offset "$OFFSET"

# --stop needs only the offset; it never resolves a checkout or launches anything.
if [[ "$STOP" == "1" ]]; then stop_instance; exit 0; fi

# --- resolve which checkout to run ---
resolve_checkout() {
  # 1. explicit path wins
  if [[ -n "$EXPLICIT_PATH" ]]; then
    ( cd "$EXPLICIT_PATH" 2>/dev/null && pwd ) || die "--path not found: $EXPLICIT_PATH"
    return
  fi
  # 2. everything else (no arg, <name>, session name, branch name) is the shared resolver's job
  local found
  if found="$(resolve_youcoded_checkout "$WORKTREE" "$ROOT")"; then echo "$found"; return; fi
  # 3. give up with a helpful listing
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

# --- the private home, and which sign-ins this launch keeps (card #17) ---
# WHY: --profile only separates the app's own data folder. Chats (~/.claude), providers and native chats (~/.youcoded) and
# the synced folder (~/YouCoded) are all found through HOME — 86 source files ask for the home folder — so the only
# way to keep a test copy out of the real app's chats and settings is to give it a different HOME.
REAL_HOME="$(_dev_real_home)"
PRIVATE_HOME=""
if [[ -n "$REAL_HOME" && "$(_dev_resolve "$HOME")" == "$(_dev_resolve "$REAL_HOME")" ]]; then
  # WHY the name check: the profile becomes a folder name, and --fresh deletes that folder.
  [[ "$PROFILE" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die "--profile may only use letters, digits, dot, dash and underscore (got '$PROFILE')"
  PRIVATE_ROOT="$REAL_HOME/.cache/youcoded-test-copies"
  PRIVATE_HOME="$PRIVATE_ROOT/$PROFILE/home"
fi
# else: the caller already set HOME to a throwaway of their own (a smoke, a lab rig). That stays as it was: nothing is
# lent and GitHub is hidden behind a private bus (dev_isolate_accounts below).

KEEP=""
for s in claude-code chatgpt api-keys; do
  case ",$WITHOUT," in *",all,"*|*",$s,"*) ;; *) KEEP="${KEEP:+$KEEP,}$s" ;; esac
done
IFS=',' read -ra _without <<< "$WITHOUT"
for s in "${_without[@]}"; do
  case "$s" in ""|claude-code|chatgpt|api-keys|all) ;; github) die "GitHub is already off by default (switch it ON with --with github)" ;; *) die "--without: unknown sign-in '$s' (known: claude-code, chatgpt, api-keys, all)" ;; esac
done
if [[ -z "$PRIVATE_HOME" && ( -n "$WITHOUT" || "$WITH_GITHUB" == "1" || "$FRESH" == "1" ) ]]; then
  die "--without / --with / --fresh only apply when run-dev.sh makes the private home itself; HOME is already set to $HOME"
fi

# The first-run wizard's setup state lives under HOME, NOT under Electron's
# userData, so --profile alone does not isolate it: a dev instance that runs the
# wizard writes over the state file Destin's INSTALLED app reads, and leaving it
# mid-flow makes his real app open on the setup wizard at its next launch.
# (Found by the T5 review of the ChatGPT sign-in build, 2026-09-05.)
# With a private home it sits inside that home (prepare-home.mjs marks setup as done there).
export YOUCODED_TOOLKIT_STATE_DIR="${PRIVATE_HOME:-$HOME}/.claude/toolkit-state-$PROFILE"

# Chromium's remote-debugging port, ON BY DEFAULT for dev instances (2026-08-28).
#
# WHY default-on: without it, inspecting a live renderer means killing the app,
# relaunching with the env var, and losing whatever state you were debugging.
# That cost real time on the marketplace-feedback bug — three restarts to reach
# a question one eval answered, and the bug it finally exposed (a main-process
# handler dropping fields) was invisible to tsc AND to the whole test suite,
# because the component tests mock that layer.
#
# WHY it is safe here: Chromium binds this to 127.0.0.1 only — strictly less
# exposed than the remote server this same script starts on 0.0.0.0. It is also
# double-gated in main.ts, which ignores the variable unless `!app.isPackaged`,
# so a packaged build can never open it however this is set.
#
# It follows the same offset scheme as every other port so concurrent worktrees
# don't collide (9222 + offset; 9272 at the default offset 50).
# `--no-devtools` opts out.
if [[ "$DEVTOOLS" == "1" ]]; then
  export YOUCODED_DEVTOOLS_PORT="$((9222 + OFFSET))"
fi

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
if [[ -n "$PRIVATE_HOME" ]]; then
  echo "  Private home:  $PRIVATE_HOME$([[ "$FRESH" == "1" ]] && echo '  (--fresh: emptied first)')"
  echo "                 (chats and settings stay here; the real app never sees them)"
else
  echo "  Private home:  none made here — HOME is already $HOME (nothing is lent to it)"
fi
echo "  Vite:          http://localhost:$((5173 + YOUCODED_PORT_OFFSET))"
echo "  Remote server: port $((9900 + YOUCODED_PORT_OFFSET)) (if enabled in dev)"
if [[ "$PHONE_BUILD" == "1" ]]; then
  echo "  Phone page:    a built copy (--phone-build; rebuild after renderer edits)"
else
  echo "  Phone page:    live code from Vite"
fi
if [[ "$DEVTOOLS" == "1" ]]; then
  echo "  Debugger:      http://127.0.0.1:$((9222 + OFFSET))/json/list  (localhost only; --no-devtools to disable)"
else
  echo "  Debugger:      off (--no-devtools)"
fi
echo ""

if [[ "$DRY_RUN" == "1" ]]; then
  if [[ -n "$PRIVATE_HOME" ]]; then
    echo "  Sign-ins:      would keep: ${KEEP:-none}; GitHub: $([[ "$WITH_GITHUB" == "1" ]] && echo kept || echo OFF)"
  fi
  echo "(--dry-run: not launching)"
  exit 0
fi

preflight_ports

# WHY (2026-10-01 one-core R6-3): a throwaway HOME alone does NOT isolate GitHub — `gh` keeps its login in the OS keyring, and a
# smoke's theme publish opened a real pull request. When HOME is not the real home, point every XDG dir and GH_CONFIG_DIR inside
# it, drop the token variables, and run under an empty D-Bus session. Details: scripts/dev-isolation.sh.
if [[ -n "$PRIVATE_HOME" ]]; then
  if [[ "$FRESH" == "1" ]]; then
    # Deletes only <real home>/.cache/youcoded-test-copies/<profile> — the profile name was checked above, so this path
    # cannot climb out of that folder.
    rm -rf -- "${PRIVATE_ROOT:?}/${PROFILE:?}"
  fi
  # Runs with the REAL home still in place: it reads the real sign-ins (never writes them) and fills the private home.
  node "$ROOT/scripts/dev-signins/prepare-home.mjs" --home "$PRIVATE_HOME" --real-home "$REAL_HOME" --profile "$PROFILE" \
    --desktop "$DESKTOP" --keep "$KEEP" || die "could not prepare the private home — not launching (a test copy never falls back to the real home)"
  dev_private_home_env "$PRIVATE_HOME" "$([[ "$WITH_GITHUB" == "1" ]] && echo keep || echo off)"
  case "$DEV_GITHUB_STATE" in
    kept)        echo "  GitHub:        kept (--with github: this test copy can publish and open pull requests as you)" ;;
    unavailable) echo "  GitHub:        NOT AVAILABLE (--with github, but gh has no login to lend)" ;;
    *)           echo "  GitHub:        OFF (default; --with github lends it)" ;;
  esac
else
  dev_isolate_accounts "$(bus_state_file "$OFFSET")"
fi
# WHY after the port preflight: a launch that dies on a busy offset must not overwrite the state file of the instance already running there.
# WHY a trap right away: the private bus must end with this launch even when a later step (the port preflight, a failed build) dies, and
# the dev-instance marker below is removed by the same trap.
cleanup_all() { [[ -n "${MARKER:-}" ]] && rm -f "$MARKER"; dev_isolation_cleanup "$(bus_state_file "$OFFSET")"; return 0; }
trap cleanup_all EXIT
if [[ -n "${DEV_ISOLATION_MODE:-}" && "$DEV_ISOLATION_MODE" != "private-home" ]]; then echo "  Accounts:      isolated (throwaway HOME: GitHub login blocked, $DEV_ISOLATION_MODE)"; fi

# The marker `explore --dev` attaches through (scripts/shoot/explore.mjs → devMarker).
# WHY: a window title or a port number proves nothing about whose app answers there; this
# file names this script's own pid, and only this script writes it — Destin's installed
# app never runs run-dev.sh, so it can never be attached to. Removed when this script
# exits; a leftover from a killed run names a dead pid, which explore ignores.
if [[ "$DEVTOOLS" == "1" ]]; then
  MARKER="$DESKTOP/.dev-instances/$OFFSET.json"
  mkdir -p "$DESKTOP/.dev-instances"
  printf '{"pid":%d,"devtoolsPort":%d,"vitePort":%d,"offset":%d,"profile":"%s","home":"%s"}\n' \
    "$$" "$((9222 + OFFSET))" "$((5173 + OFFSET))" "$OFFSET" "${PROFILE//[\"\\]/}" "${HOME//[\"\\]/}" > "$MARKER"
fi

cd "$DESKTOP"
if [[ "$PHONE_BUILD" == "1" ]]; then
  # WHY opt-in, and built fresh here: the remote server used to serve any built copy it found on disk,
  # and one left by an Android test build hid a whole day of phone-side fixes (2026-09-11). A dev
  # window now serves live code unless this flag builds a current copy (choosePhonePageSource).
  echo "Building the app for the phone…"
  mkdir -p dist/renderer/data
  cp src/renderer/data/skill-registry.json dist/renderer/data/skill-registry.json
  npx vite build || die "phone build failed"
  export YOUCODED_REMOTE_BUILT=1
fi
npm run dev
