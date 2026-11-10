#!/bin/bash
# run-dev-resolve.test.sh — run-dev.sh must resolve a session worktree by name, reject bad
# --offset values early, and show running instances in --list. All via --dry-run / --list:
# no app window is ever launched.
#
# WHY (card #19): run-dev.sh had its own copy of the checkout resolver that did not know the
# session layout worktrees/sessions/<name>/youcoded; --offset abc died with a bash arithmetic
# error; and --list showed worktrees but never which dev instances were running.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"; [[ -n "${SLEEPER:-}" ]] && kill "$SLEEPER" 2>/dev/null || true' EXIT

# A throwaway workspace: run-dev.sh locates everything from its own path, so copy the scripts in.
WS="$TMP/ws"
mkdir -p "$WS/scripts/lib" "$WS/youcoded/desktop"
cp "$ROOT/scripts/run-dev.sh" "$ROOT/scripts/dev-isolation.sh" "$WS/scripts/"
cp "$ROOT/scripts/lib/resolve-checkout.sh" "$WS/scripts/lib/"
git -C "$WS/youcoded" init -q -b main
git -C "$WS/youcoded" -c user.name=t -c user.email=t@t commit -q --allow-empty -m init
SESS="$WS/worktrees/sessions/my-feature/youcoded"
git -C "$WS/youcoded" worktree add -q -b feat/x "$SESS"
for d in "$WS/youcoded" "$SESS"; do mkdir -p "$d/desktop/node_modules"; echo '{}' > "$d/desktop/package.json"; done

fail=0
expect() { # <label> <want-regex> <exit 0|1> <args...>
  local label="$1" want="$2" code="$3"; shift 3
  local out rc=0
  out="$(bash "$WS/scripts/run-dev.sh" "$@" 2>&1)" || rc=$?
  if [[ "$rc" == "$code" ]] && grep -Eq -- "$want" <<<"$out"; then echo "  ok   $label"
  else echo "  FAIL $label (exit $rc, wanted $code, pattern $want)"; echo "$out" | sed 's/^/       /'; fail=1; fi
}

echo "run-dev:"
expect "session name resolves to worktrees/sessions/<name>/youcoded" "Checkout: +$SESS\$" 0 my-feature --dry-run
expect "branch name still resolves" "Checkout: +$SESS\$" 0 feat/x --dry-run
expect "an unknown name still fails" "no worktree or branch matching" 1 nope --dry-run
expect "--offset abc is refused with a clear message" "--offset must be a whole number" 1 --offset abc --dry-run
expect "--offset -5 is refused" "--offset must be a whole number" 1 --offset -5 --dry-run
expect "--offset 99999 (ports past 65535) is refused" "ports would pass 65535" 1 --offset 99999 --dry-run
expect "--offset 08 is read as 8, not a bad octal" "Vite: +http://localhost:5181" 0 --offset 08 --dry-run

# --list must show a LIVE instance from its marker and skip one whose pid is dead.
sleep 60 & SLEEPER=$!
mkdir -p "$SESS/desktop/.dev-instances"
printf '{"pid":%d,"devtoolsPort":9272,"vitePort":5223,"offset":50,"profile":"demo"}\n' "$SLEEPER" > "$SESS/desktop/.dev-instances/50.json"
printf '{"pid":999999,"devtoolsPort":9322,"vitePort":5273,"offset":100,"profile":"ghost"}\n' > "$SESS/desktop/.dev-instances/100.json"
expect "--list shows the running instance" "offset 50 +pid $SLEEPER +demo" 0 --list
out="$(bash "$WS/scripts/run-dev.sh" --list 2>&1)"
if grep -q ghost <<<"$out"; then echo "  FAIL --list shows a dead instance"; fail=1; else echo "  ok   --list omits the dead one"; fi

[[ $fail -eq 0 ]] || { echo "run-dev-resolve.test.sh FAILED"; exit 1; }
echo "run-dev-resolve.test.sh OK"
