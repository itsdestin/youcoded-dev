#!/usr/bin/env bash
# SessionStart hook: inject dynamic project state into Claude's context.
#
# For multi-repo workspaces (youcoded-dev), shows recent commits, current
# branches, uncommitted changes, and active worktrees per sub-repo.
# For single-repo projects, shows the same for the current repo.
#
# Plain text output on stdout is injected into Claude's context at session start.

set -euo pipefail

# Claude Code sets CLAUDE_PROJECT_DIR when running in a project; fallback to cwd
WORKSPACE="${CLAUDE_PROJECT_DIR:-$(pwd)}"

[[ ! -d "$WORKSPACE" ]] && exit 0

collect_repo_state() {
    local repo_dir="$1"
    local repo_name="$2"

    [[ ! -d "$repo_dir/.git" ]] && return

    local branch recent dirty dirty_count
    branch=$(git -C "$repo_dir" branch --show-current 2>/dev/null || echo "detached")
    recent=$(git -C "$repo_dir" log --oneline -3 2>/dev/null || echo "  (no commits)")
    dirty=$(git -C "$repo_dir" status --porcelain 2>/dev/null | head -5)

    echo "### $repo_name (on \`$branch\`)"
    echo "Recent commits:"
    echo '```'
    echo "$recent" | sed 's/^/  /'
    echo '```'

    if [[ -n "$dirty" ]]; then
        dirty_count=$(git -C "$repo_dir" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
        echo "Uncommitted changes (${dirty_count} files, showing first 5):"
        echo '```'
        echo "$dirty" | sed 's/^/  /'
        echo '```'
    fi
    echo ""
}

# Detect multi-repo workspace by checking for known sub-repos
SUB_REPOS=()
for candidate in youcoded youcoded-core youcoded-admin wecoded-themes wecoded-marketplace; do
    if [[ -d "$WORKSPACE/$candidate/.git" ]]; then
        SUB_REPOS+=("$candidate")
    fi
done

if [[ ${#SUB_REPOS[@]} -gt 0 ]]; then
    # Multi-repo workspace
    echo "## Project State (auto-generated at session start)"
    echo ""
    for repo in "${SUB_REPOS[@]}"; do
        collect_repo_state "$WORKSPACE/$repo" "$repo"
    done

    # Active worktrees
    WORKTREES_FOUND=0
    while IFS= read -r -d '' dir; do
        if [[ $WORKTREES_FOUND -eq 0 ]]; then
            echo "### Active worktrees"
            WORKTREES_FOUND=1
        fi
        echo "  - $(basename "$dir")"
    done < <(find "$WORKSPACE" -maxdepth 1 -type d \( -name "*-worktree*" -o -name "*-phase*" -o -name "*-decoupling" \) -print0 2>/dev/null || true)
    [[ $WORKTREES_FOUND -eq 1 ]] && echo ""
elif [[ -d "$WORKSPACE/.git" ]]; then
    # Single-repo project
    echo "## Project State (auto-generated at session start)"
    echo ""
    collect_repo_state "$WORKSPACE" "$(basename "$WORKSPACE")"
fi

# --- Staleness detection ---
# Points at the newest dated audit report in docs/audits/. Warns when stale (>60 days)
# or when the report's `residue:` frontmatter count is non-zero (unapplied findings).
AUDITS_DIR="$WORKSPACE/docs/audits"
if [[ -d "$AUDITS_DIR" ]]; then
    LATEST_AUDIT=$(ls "$AUDITS_DIR"/[0-9]*.md 2>/dev/null | sort | tail -1)
    if [[ -n "$LATEST_AUDIT" ]]; then
        AUDIT_CTIME=$(git -C "$WORKSPACE" log -1 --format=%ct -- "${LATEST_AUDIT#$WORKSPACE/}" 2>/dev/null || true)
        [[ -z "$AUDIT_CTIME" ]] && AUDIT_CTIME=$(stat -c %Y "$LATEST_AUDIT" 2>/dev/null || stat -f %m "$LATEST_AUDIT" 2>/dev/null || echo "")
        if [[ -n "$AUDIT_CTIME" ]]; then
            NOW_EPOCH=$(date +%s)
            AUDIT_AGE_DAYS=$(( (NOW_EPOCH - AUDIT_CTIME) / 86400 ))
            if [[ $AUDIT_AGE_DAYS -gt 60 ]]; then
                echo "### ⚠️ Audit staleness"
                echo "Latest audit ($(basename "$LATEST_AUDIT")) is ${AUDIT_AGE_DAYS} days old. Consider running \`/audit\`."
                echo ""
            fi
        fi
        # residue: N in the report frontmatter = findings awaiting action
        RESIDUE=$(grep -m1 -E '^residue: *[0-9]+' "$LATEST_AUDIT" | grep -oE '[0-9]+' || true)
        if [[ -n "$RESIDUE" && "$RESIDUE" -gt 0 ]] 2>/dev/null; then
            echo "### ⚠️ Unapplied audit findings"
            echo "${RESIDUE} open item(s) in $(basename "$LATEST_AUDIT"). Review the ## Residue section."
            echo ""
        fi
    fi
fi

exit 0
