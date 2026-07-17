#!/usr/bin/env bash
# Setup script for the youcoded-dev workspace.
# Clones or pulls the latest from all sub-repos, then updates the workspace repo itself.

# The whole body is wrapped in a { ... } brace group on purpose. Bash normally reads a
# script from disk *as it runs*, so a script that pulls an update over itself can execute
# half-old/half-new text. A brace group is one compound command, so bash parses this entire
# file into memory before running any of it, and the `exit` at the bottom means it never
# reads the file again. (git pull happens to swap the file's inode, which would also save
# us -- this makes the safety guaranteed rather than incidental.)
{
  set -euo pipefail

  # Operate on the workspace containing THIS script, not the caller's current directory --
  # otherwise `cd youcoded && bash ../setup.sh` would clone into the wrong place, and the
  # self-update below would pull whatever repo you happened to be standing in.
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  cd "$ROOT"

  REPOS=(
    "itsdestin/youcoded:master"
    "itsdestin/youcoded-core:master"
    "itsdestin/youcoded-admin:master"
    "itsdestin/wecoded-themes:main"
    "itsdestin/wecoded-marketplace:master"
  )

  for entry in "${REPOS[@]}"; do
    repo="${entry%%:*}"
    branch="${entry##*:}"
    name="${repo##*/}"

    if [ -d "$name/.git" ]; then
      echo "Updating $name..."
      git -C "$name" fetch origin
      git -C "$name" pull origin "$branch"
    else
      echo "Cloning $name..."
      git clone --branch "$branch" "https://github.com/$repo.git" "$name"
    fi
  done

  # --- the workspace repo (youcoded-dev) itself ---
  # Done last, so a failure here can't stop the sub-repos from syncing. Never cloned: if
  # you are running this file, the repo is already on disk.
  echo "Updating youcoded-dev (workspace)..."
  script_before="$(git hash-object "$ROOT/setup.sh")"

  git fetch origin
  if ! git pull origin master; then
    echo ""
    echo "WARNING: sub-repos synced, but youcoded-dev itself did not update."
    echo "Git refused rather than touching your work -- see its error above. Commit,"
    echo "stash, or resolve, then re-run: bash setup.sh"
    exit 1
  fi

  # If that pull changed setup.sh, the version that just ran is the OLD one (bash already
  # had it in memory), so anything new in it -- an added repo, say -- has not run yet.
  if [ "$(git hash-object "$ROOT/setup.sh")" != "$script_before" ]; then
    echo ""
    echo "NOTE: setup.sh was updated by that pull, so this run used the previous version."
    echo "Re-run 'bash setup.sh' to apply it."
    exit 0
  fi

  echo ""
  echo "Workspace ready. All repos are up to date."
  exit 0
}
