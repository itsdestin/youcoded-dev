#!/usr/bin/env bash
# Put a GitHub-built YouCoded Dev copy on the connected phone, over the Dev copy already there.
#
#   bash scripts/android-install-test-copy.sh <run-id> [--launch]
#   bash scripts/android-install-test-copy.sh --build <branch> [--launch]   # start android-test-build.yml and wait
#
# WHY this is a script (wrap-up 2026-11-10, card #213): one session did these steps by hand seven times and got two
# of them wrong. (1) GitHub signs with its own test key and a copy built on this computer uses another, so the phone
# refuses the update ("signatures do not match") unless the file is re-signed here; removing the Dev copy instead
# would wipe its sessions and sign-ins. (2) A build used to hold two files and "the first .apk found" installed the
# wrong app on Destin's phone. So: the package name is checked and anything but com.youcoded.app.dev is refused.
# It never touches com.youcoded.app (his real app) and never uninstalls anything.
set -euo pipefail

WANT=com.youcoded.app.dev
REPO=itsdestin/youcoded
ADB="$HOME/.android-sdk/platform-tools/adb"
BT=$(ls -d "$HOME"/.android-sdk/build-tools/* 2>/dev/null | sort -V | tail -1)
KEY="$HOME/.android/debug.keystore"
launch=0; run=""; branch=""
while [ $# -gt 0 ]; do
  case "$1" in
    --launch) launch=1 ;;
    --build) branch="${2:?--build needs a branch}"; shift ;;
    *) run="$1" ;;
  esac
  shift
done
[ -x "$ADB" ] && [ -n "$BT" ] || { echo "Android tools not found under ~/.android-sdk"; exit 1; }
"$ADB" get-state >/dev/null 2>&1 || { echo "No phone connected (USB debugging on?)"; exit 1; }

if [ -n "$branch" ]; then
  gh workflow run android-test-build.yml -R "$REPO" --ref "$branch" >/dev/null
  # The run takes a moment to appear; ask until the newest one is on this branch.
  for _ in 1 2 3 4 5 6; do
    run=$(gh run list -R "$REPO" --workflow android-test-build.yml --branch "$branch" --limit 1 --json databaseId,status -q '.[0] | select(.status != "completed") | .databaseId' || true)
    [ -n "$run" ] && break
    read -r -t 5 _ < /dev/null || true
  done
  [ -n "$run" ] || { echo "The build did not start"; exit 1; }
  echo "build $run started; waiting"
  gh run watch "$run" -R "$REPO" --exit-status --interval 30 >/dev/null 2>&1 || { echo "build $run FAILED"; gh run view "$run" -R "$REPO" --json jobs -q '.jobs[].steps[] | select(.conclusion=="failure") | .name'; exit 1; }
fi
[ -n "$run" ] || { echo "usage: $0 <run-id> | --build <branch> [--launch]"; exit 2; }

dir=$(mktemp -d "${TMPDIR:-/tmp}/yc-test-copy.XXXXXX")
gh run download "$run" -R "$REPO" -n youcoded-test-apk -D "$dir" >/dev/null
apk=$(ls "$dir"/*.apk | head -1)
name=$("$BT/aapt2" dump badging "$apk" | sed -n "1s/.*name='\([^']*\)'.*versionName='\([^']*\)'.*/\1 \2/p")
case "$name" in
  "$WANT "*) ;;
  *) echo "REFUSED: this file is '$name', not $WANT"; exit 1 ;;
esac

# Re-sign only when the phone's Dev copy was signed with this computer's key (a local build); otherwise install as built.
signed="$apk"
installed=$("$ADB" shell pm path "$WANT" 2>/dev/null | head -1 | sed 's/package://' | tr -d '\r')
if [ -n "$installed" ] && [ -f "$KEY" ]; then
  "$ADB" pull "$installed" "$dir/on-phone.apk" >/dev/null
  digest() { "$BT/apksigner" verify --print-certs "$1" 2>/dev/null | sed -n 's/.*SHA-256 digest: //p' | head -1; }
  if [ "$(digest "$dir/on-phone.apk")" != "$(digest "$apk")" ]; then
    signed="$dir/resigned.apk"; cp "$apk" "$signed"
    "$BT/apksigner" sign --ks "$KEY" --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android "$signed" 2>/dev/null
    echo "re-signed with this computer's test key (the phone's Dev copy uses it)"
  fi
fi

"$ADB" install -r "$signed" 2>&1 | grep -E "Success|Failure" || { echo "install gave no answer"; exit 1; }
echo "on the phone: $("$ADB" shell dumpsys package "$WANT" | sed -n 's/^ *versionName=//p' | head -1)  (wanted: $name)"

if [ "$launch" = 1 ]; then
  "$ADB" logcat -c
  "$ADB" shell monkey -p "$WANT" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  "$ADB" shell 'sleep 25'
  pid=$("$ADB" shell pidof "$WANT" | tr -d '\r' || true)
  [ -n "$pid" ] && echo "running after 25 s (pid $pid)" || echo "NOT RUNNING after 25 s"
  "$ADB" logcat -d -b crash | tail -15
  [ -n "$pid" ] && "$ADB" logcat -d --pid="$pid" | grep -E "backend ready|auth:ok" | cut -c1-140 | tail -2 || true
fi
rm -rf "$dir"
