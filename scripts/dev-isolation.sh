#!/bin/bash
# dev-isolation.sh — make a throwaway-HOME dev launch unable to reach the REAL GitHub login.
#
# WHY (2026-10-01, one-core R6-3): a smoke ran the app with HOME=<throwaway> and a theme publish opened a real pull request on
# Destin's GitHub. Cause, measured: the app (github-client.ts) asks `gh auth token`, and `gh` keeps its login in the OS keyring
# (Secret Service over the user's D-Bus session, found even with HOME, XDG_CONFIG_HOME and GH_CONFIG_DIR all pointed elsewhere,
# and even with DBUS_SESSION_BUS_ADDRESS/XDG_RUNTIME_DIR unset, because the bus socket is found by user id). A different HOME
# therefore does NOT isolate GitHub. What does: a private, empty D-Bus session (`dbus-run-session`) plus no token variables.
#
# Two ways to use it:
#   sourced (run-dev.sh does this):  source scripts/dev-isolation.sh; dev_isolate_accounts   -> sets DEV_ISOLATION_PREFIX
#   command (smokes, probes):        HOME=<throwaway> bash scripts/dev-isolation.sh <command…>   -> runs it isolated
# Both are no-ops when HOME is the real home. Never reads or prints a token.

dev_isolate_accounts() {
  DEV_ISOLATION_PREFIX=""
  local real_home
  real_home="$(getent passwd "$(id -u)" 2>/dev/null | cut -d: -f6)"
  # Cannot tell which home is real (no getent, e.g. Git Bash) or HOME is it: nothing to isolate from.
  if [[ -z "$real_home" || "$HOME" == "$real_home" ]]; then return 0; fi
  # Config, data, cache and state all inside the throwaway HOME (a leftover XDG_* from the real session would point back out).
  export XDG_CONFIG_HOME="$HOME/.config" XDG_DATA_HOME="$HOME/.local/share" XDG_CACHE_HOME="$HOME/.cache" XDG_STATE_HOME="$HOME/.local/state"
  export GH_CONFIG_DIR="$XDG_CONFIG_HOME/gh"
  mkdir -p "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_CACHE_HOME" "$XDG_STATE_HOME"
  unset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN
  if command -v dbus-run-session >/dev/null 2>&1; then
    # An empty session bus has no keyring on it, so `gh auth token` finds nothing.
    DEV_ISOLATION_PREFIX="dbus-run-session --"
  else
    # No way to hide the keyring here (macOS/other): a decoy token wins over the keyring in gh, so the app gets a token that
    # GitHub refuses ("sign-in expired") instead of the real one. Loud, so nobody mistakes it for "not connected".
    export GH_TOKEN="isolated-dev-home-decoy-token"
    echo "dev-isolation: no dbus-run-session; GitHub is blocked with a decoy token (calls will fail with a 401)." >&2
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  [[ $# -gt 0 ]] || { echo "usage: HOME=<throwaway> bash scripts/dev-isolation.sh <command…>" >&2; exit 2; }
  dev_isolate_accounts
  exec $DEV_ISOLATION_PREFIX "$@"
fi
