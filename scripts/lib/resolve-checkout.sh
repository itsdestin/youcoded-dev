# Resolve "which youcoded checkout do you mean?" — used by run-workbench.sh.
#
# (run-dev.sh still carries its own copy. This header claimed both used it from
# the day it was written; corrected 2026-09-10, and folding run-dev into it is
# filed in docs/roadmap/dev-workspace.md rather than done here — it is the
# launcher that paints a real window on Destin's desktop.)
#
# WHY it is shared: run-workbench had its own three-line version that only knew
# `worktrees/<name>/desktop`. Session worktrees live at
# `worktrees/sessions/<name>/youcoded`, which that shape never matches, so the
# workbench could not be pointed at the branch a session was working on without
# an absolute path — three failed launches on 2026-09-09 before falling back to
# typing the path out. run-dev already resolved branch names correctly; now
# both do.
#
# Usage:  resolve_youcoded_checkout "<target>" "<workspace root>"
#         prints the checkout path, or returns 1 after listing what exists.

list_youcoded_worktrees() {
  local main="$1/youcoded"
  echo "Registered youcoded worktrees (branch → path):"
  git -C "$main" worktree list --porcelain | awk '
    /^worktree / { path = substr($0, 10) }
    /^branch /   { br = substr($0, 8); sub("refs/heads/", "", br)
                   printf "  %-42s %s\n", br, path }
  '
}

resolve_youcoded_checkout() {
  local target="$1" root="$2"

  # The caller passes the directory ABOVE scripts/, which inside a session
  # worktree is the worktree — not the workspace. Every layout below is spelled
  # relative to the workspace, so without this the session shapes can never
  # match and the obvious name fails. Measured 2026-09-10: two failed launches
  # from inside a worktree before falling back to the branch name.
  local probe="$root"
  while [[ ! -d "$probe/worktrees" && "$probe" != "/" ]]; do
    probe="$(dirname "$probe")"
  done
  [[ -d "$probe/worktrees" && -d "$probe/youcoded" ]] && root="$probe"

  local main="$root/youcoded"

  # 1. no target → the main checkout
  if [[ -z "$target" ]]; then echo "$main"; return 0; fi
  # 2. an explicit path to something holding desktop/
  if [[ -d "$target/desktop" ]]; then ( cd "$target" && pwd ); return 0; fi
  # 3. the flat worktrees/<name> layout
  if [[ -d "$root/worktrees/$target/desktop" ]]; then echo "$root/worktrees/$target"; return 0; fi
  if [[ -d "$root/youcoded-worktrees/$target/desktop" ]]; then echo "$root/youcoded-worktrees/$target"; return 0; fi
  # 4. the session layout: worktrees/sessions/<name>/youcoded
  if [[ -d "$root/worktrees/sessions/$target/youcoded/desktop" ]]; then
    echo "$root/worktrees/sessions/$target/youcoded"; return 0
  fi
  # 5. a registered worktree, by BRANCH name or path basename, anywhere
  local match
  match="$(git -C "$main" worktree list --porcelain | awk -v want="$target" '
    /^worktree / { path = substr($0, 10) }
    /^branch /   { br = substr($0, 8); sub("refs/heads/", "", br)
                   n = split(path, parts, "/"); base = parts[n]
                   # A session worktree ALWAYS ends in /youcoded, so its basename
                   # never distinguishes one session from another — the name that
                   # does is the directory above it.
                   sess = (base == "youcoded" && n > 1) ? parts[n-1] : ""
                   if (br == want || base == want || sess == want) { print path; exit } }
  ')"
  [[ -n "$match" ]] && { echo "$match"; return 0; }
  return 1
}
