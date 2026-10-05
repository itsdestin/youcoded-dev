#!/bin/bash
# dev-isolation.sh — make a throwaway-HOME dev launch unable to reach the REAL GitHub login (and other inherited credentials).
#
# WHY (2026-10-01, one-core R6-3): a smoke ran the app with HOME=<throwaway> and a theme publish opened a real pull request on
# Destin's GitHub. Cause, measured: the app (github-client.ts) asks `gh auth token`, and `gh` keeps its login in the OS keyring
# (Secret Service over the user's D-Bus session, found even with HOME, XDG_CONFIG_HOME and GH_CONFIG_DIR all pointed elsewhere,
# and even with DBUS_SESSION_BUS_ADDRESS/XDG_RUNTIME_DIR unset, because the bus socket is found by user id). A different HOME
# therefore does NOT isolate GitHub. What does: a private, empty D-Bus session plus no token variables.
# This hides credentials; it is not a sandbox (an absolute path still opens a real file).
#
# Two ways to use it:
#   sourced (run-dev.sh does this):  source scripts/dev-isolation.sh; dev_isolate_accounts [state-file]; …; dev_isolation_cleanup [state-file]
#   command (smokes, probes):        HOME=<throwaway> bash scripts/dev-isolation.sh <command…>   -> runs it isolated, then cleans up
# Both do nothing when HOME is (or resolves to) the real home. Never reads or prints a token.

# The real home of this user, or empty when it cannot be told (Git Bash has no getent).
_dev_real_home() {
  local h=""
  if command -v getent >/dev/null 2>&1; then
    # WHY `|| true`: run-dev.sh runs under `set -euo pipefail`; a failing getent in a pipeline would end the whole launch silently.
    h="$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)" || h=""
  fi
  if [[ -z "$h" && -n "${YOUCODED_REAL_HOME:-}" ]]; then h="$YOUCODED_REAL_HOME"; fi
  if [[ -z "$h" && -n "${USERPROFILE:-}" ]] && command -v cygpath >/dev/null 2>&1; then h="$(cygpath -u "$USERPROFILE" 2>/dev/null)" || h=""; fi
  printf '%s' "$h"
}

# Resolve a path through links, `//` and trailing slashes. Falls back to the plain text where readlink/realpath do not exist.
_dev_resolve() {
  local r=""
  r="$(readlink -f -- "$1" 2>/dev/null)" || r=""
  if [[ -z "$r" ]]; then r="$(realpath -- "$1" 2>/dev/null)" || r=""; fi
  if [[ -z "$r" ]]; then r="${1%/}"; fi
  printf '%s' "$r"
}

# True only when /proc proves <pid> is a dbus-daemon started the way dev_isolate_accounts starts it. No /proc, no proof, no kill.
_dev_is_our_bus_daemon() {
  local pid="$1" comm="" cmd=""
  [[ -r "/proc/$pid/comm" && -r "/proc/$pid/cmdline" ]] || return 1
  comm="$(cat "/proc/$pid/comm" 2>/dev/null)" || return 1
  [[ "$comm" == "dbus-daemon" ]] || return 1
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null)" || return 1
  [[ "$cmd" == *"--session"* && "$cmd" == *"--print-address"* ]]
}

# Kill what a private bus started, by exact pid: the daemon (pid from the state file) and every process of this user whose environment
# carries THIS bus's address. Never a pattern match on command lines.
dev_isolation_cleanup() {
  local state="${1:-}" pid="" addr="" p
  [[ -n "$state" && -f "$state" ]] || return 0
  pid="$(sed -n 1p "$state" 2>/dev/null)"; addr="$(sed -n 2p "$state" 2>/dev/null)"
  if [[ -n "$addr" ]]; then
    for p in /proc/[0-9]*; do
      p="${p#/proc/}"
      [[ "$p" == "$$" ]] && continue
      [[ -r "/proc/$p/environ" ]] || continue
      if tr '\0' '\n' < "/proc/$p/environ" 2>/dev/null | grep -qxF "DBUS_SESSION_BUS_ADDRESS=$addr"; then kill "$p" 2>/dev/null || true; fi
    done
  fi
  # WHY the identity check (2026-10-04): the state file can outlive its daemon (a crashed launch never ran cleanup), and the OS reuses
  # pids, so `kill -0` alone could end an unrelated process of this user. Kill only a pid PROVEN to be the dbus-daemon this script
  # starts (comm is dbus-daemon and its command line carries --session and --print-address). Where /proc does not exist (Git Bash on
  # Windows, macOS) identity cannot be proved, so nothing is killed — the state file is simply removed.
  if [[ "$pid" =~ ^[0-9]+$ ]] && _dev_is_our_bus_daemon "$pid"; then kill "$pid" 2>/dev/null || true; fi
  rm -f "$state"
  return 0
}

dev_isolate_accounts() {
  local state="${1:-}" real_home real_resolved home_resolved
  # WHY: a state file left by a crashed earlier launch describes a bus that is gone (or a pid that now belongs to something else);
  # clean it up with the identity-checked routine, then start from nothing, so cleanup can never act on a stale record.
  if [[ -n "$state" && -f "$state" ]]; then dev_isolation_cleanup "$state"; fi
  real_home="$(_dev_real_home)"
  if [[ -z "$real_home" ]]; then
    echo "dev-isolation: cannot tell which home is the real one on this machine (no getent); NOT isolating. Set YOUCODED_REAL_HOME to turn it on." >&2
    return 0
  fi
  real_resolved="$(_dev_resolve "$real_home")"; home_resolved="$(_dev_resolve "$HOME")"
  # HOME that IS the real home (any spelling or link), or that CONTAINS it, reaches the real files: never call it a throwaway.
  if [[ "$home_resolved" == "$real_resolved" || "$real_resolved" == "$home_resolved"/* ]]; then
    if [[ "$HOME" != "$real_home" ]]; then echo "dev-isolation: HOME ($HOME) resolves to the real home ($real_resolved); NOT isolating — this is the real account." >&2; fi
    return 0
  fi
  # Config, data, cache and state all inside the throwaway HOME (a leftover XDG_* from the real session would point back out).
  # XDG_RUNTIME_DIR deliberately STAYS: it holds the Wayland/X display socket the window needs, and the bus is chosen by the explicit
  # address below, so nothing here falls back to the real $XDG_RUNTIME_DIR/bus.
  export XDG_CONFIG_HOME="$HOME/.config" XDG_DATA_HOME="$HOME/.local/share" XDG_CACHE_HOME="$HOME/.cache" XDG_STATE_HOME="$HOME/.local/state"
  export GH_CONFIG_DIR="$XDG_CONFIG_HOME/gh"
  mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
  # Tokens and agents a dev instance has no reason to inherit (nothing in run-dev.sh, the app's dev path or the fake-model smokes reads
  # them; a keyed provider is added inside the throwaway HOME instead).
  unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN SSH_AUTH_SOCK GIT_ASKPASS SSH_ASKPASS \
        GOOGLE_APPLICATION_CREDENTIALS NPM_TOKEN NODE_AUTH_TOKEN ANTHROPIC_API_KEY ANTHROPIC_AUTH_TOKEN OPENAI_API_KEY OPENROUTER_API_KEY
  local v
  for v in $(compgen -e); do
    case "$v" in AWS_*|AZURE_*|CLAUDE_CODE_*TOKEN*|CLAUDE_CODE_*KEY*|CLAUDE_CODE_*SECRET*|CLAUDE_CODE_*OAUTH*|CLAUDE_CODE_*AUTH*) unset "$v" ;; esac
  done
  if command -v dbus-daemon >/dev/null 2>&1 && [[ "$(uname -s)" == "Linux" ]]; then
    # An empty private session bus has no keyring on it, so `gh auth token` finds nothing. It is started here (not via dbus-run-session)
    # so its pid and address are known and `--stop` can end it and the services it activates.
    # KWallet would otherwise ask to "create a wallet" the first time the app touches the keyring: switched off in the throwaway HOME.
    printf '[Wallet]\nEnabled=false\n' > "$XDG_CONFIG_HOME/kwalletrc"
    local tmp addr pid
    tmp="$(mktemp -d)"
    exec 8>"$tmp/addr" 9>"$tmp/pid"
    dbus-daemon --session --fork --print-address=8 --print-pid=9 2>/dev/null || true
    exec 8>&- 9>&-
    addr="$(head -n1 "$tmp/addr" 2>/dev/null)"; pid="$(head -n1 "$tmp/pid" 2>/dev/null)"
    rm -rf "$tmp"
    if [[ -n "$addr" && "$pid" =~ ^[0-9]+$ ]]; then
      export DBUS_SESSION_BUS_ADDRESS="$addr"
      [[ -n "$state" ]] && printf '%s\n%s\n' "$pid" "$addr" > "$state"
      DEV_ISOLATION_MODE="private-bus"
      return 0
    fi
  fi
  # No way to hide the keyring here (macOS, Windows, no dbus-daemon): a decoy token wins over the keyring in gh, so the app gets a
  # token that GitHub refuses ("sign-in expired") instead of the real one. Loud, so nobody mistakes it for "not connected".
  export GH_TOKEN="isolated-dev-home-decoy-token"
  DEV_ISOLATION_MODE="decoy-token"
  echo "dev-isolation: no private session bus available; GitHub is blocked with a decoy token (calls will fail with a 401)." >&2
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  [[ $# -gt 0 ]] || { echo "usage: HOME=<throwaway> bash scripts/dev-isolation.sh <command…>" >&2; exit 2; }
  _state="$(mktemp -u)"
  dev_isolate_accounts "$_state"
  "$@"; _rc=$?
  dev_isolation_cleanup "$_state"
  exit $_rc
fi
