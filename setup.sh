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

  # One inventory for initial installation and isolated session startup.
  repo_list=$(node -e 'const r=require(process.argv[1]); for (const [name,v] of Object.entries(r)) if(name!=="workspace") console.log(`${v.repository}:${v.branch}`)' "$ROOT/scripts/workspace-repos.json")
  REPOS=()
  while IFS= read -r entry; do REPOS+=("$entry"); done <<< "$repo_list"

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

  # The guard that stops this checkout diverging in the first place. Git does not
  # carry hooks between clones, so it is (re)installed from the tracked copy on
  # every run -- that also restores it if someone deletes it.
  hook_src="$ROOT/scripts/git-hooks/pre-commit"
  hook_dst="$(git rev-parse --git-common-dir)/hooks/pre-commit"
  if [ -f "$hook_src" ]; then
    if [ ! -f "$hook_dst" ] || ! cmp -s "$hook_src" "$hook_dst"; then
      mkdir -p "$(dirname "$hook_dst")"
      cp "$hook_src" "$hook_dst"
      chmod +x "$hook_dst"
      echo "Installed the commit guard (commits belong in a worktree, not here)."
    fi
  fi

  # NOT `git pull --ff-only`. That reports the state honestly but can only ever
  # refuse, and its advice was `git pull --rebase --autostash` -- which is the one
  # thing never to do to a checkout other sessions are working in, and which on
  # 2026-09-03 would have tried to replay six commits whose changes were ALREADY
  # upstream (copied across by hand, so different shas, guaranteed conflicts).
  # workspace-sync.sh tells a duplicate commit from a unique one, heals the case
  # that is provably safe, and otherwise names the exact blocking file.
  if ! bash "$ROOT/scripts/workspace-sync.sh" "$ROOT" master; then
    echo ""
    echo "WARNING: sub-repos synced, but youcoded-dev itself did not update."
    echo "The reason is above. Nothing in your working folder was changed."
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
