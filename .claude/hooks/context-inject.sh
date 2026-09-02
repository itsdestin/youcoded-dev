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

    local branch recent dirty dirty_count behind
    branch=$(git -C "$repo_dir" branch --show-current 2>/dev/null || echo "detached")
    recent=$(git -C "$repo_dir" log --oneline -3 2>/dev/null || echo "  (no commits)")
    dirty=$(git -C "$repo_dir" status --porcelain 2>/dev/null | head -5)
    # How far this checkout trails its upstream, as of the LAST fetch (no network
    # here — a hook must not block on it). WHY: the main youcoded checkout sat 146
    # commits behind for two days on 2026-08-27 and nothing said so; Serena is
    # pinned to it, so every symbol lookup was answering from stale code.
    behind=$(git -C "$repo_dir" rev-list --count 'HEAD..@{u}' 2>/dev/null || echo "0")

    echo "### $repo_name (on \`$branch\`)"
    if [[ "$behind" =~ ^[0-9]+$ && "$behind" -gt 0 ]]; then
        echo "⚠ ${behind} commits behind its upstream as of the last fetch — run \`git -C $repo_name pull --ff-only\` before trusting Serena, this summary, or any /command or skill (they load from this checkout)"
    fi
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

    # Active worktrees — ask git, not the directory names.
    #
    # WHY: this block used to `find -maxdepth 1` for directories named
    # *-worktree* / *-phase* / *-decoupling. Real worktrees live at
    # worktrees/<name> (depth 2) with names like plan-c and sync-health, so the
    # find matched nothing — and because the header only printed when something
    # was found, the whole section silently vanished. Six live worktrees were
    # invisible at session start, and the absence looked exactly like "no
    # worktrees exist". Git's own registry is authoritative and can't drift from
    # a naming convention.
    #
    # The section now ALWAYS prints. "none" and "broken" must not look alike.
    echo "### Active worktrees"
    WT_ANY=0
    for repo in "${SUB_REPOS[@]}"; do
        # wecoded-themes' default branch is `main`, everyone else's is `master` —
        # ask the remote rather than assuming, or every themes worktree reports "?".
        repo_base=$(git -C "$WORKSPACE/$repo" symbolic-ref -q --short refs/remotes/origin/HEAD 2>/dev/null || echo "origin/master")
        while IFS= read -r wt_path; do
            [[ "$wt_path" == "$WORKSPACE/$repo" ]] && continue   # skip the main checkout
            wt_branch=$(git -C "$wt_path" branch --show-current 2>/dev/null || echo "detached")
            # Branch name alone was not what sessions came looking for: the
            # 2026-08-28 transcript audit found 22 of 55 sessions re-deriving
            # dirty/ahead per worktree with their own git calls, because the
            # question is always "is there work in here, and has it landed yet".
            # Both counts together cost ~0.14s for 14 worktrees — measured.
            wt_dirty=$(git -C "$wt_path" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
            wt_ahead=$(git -C "$wt_path" rev-list --count "$repo_base..HEAD" 2>/dev/null || echo "?")
            if [[ "$wt_ahead" == "?" ]]; then
                wt_note="no upstream to compare against"
            elif [[ "$wt_ahead" == "0" ]]; then
                wt_note="nothing ahead of $repo_base; merged or empty, candidate for cleanup"
            else
                wt_note="${wt_ahead} commit(s) ahead"
            fi
            [[ "$wt_dirty" != "0" ]] && wt_note="${wt_note}, ${wt_dirty} uncommitted file(s)"
            echo "  - $(basename "$wt_path") [$repo: ${wt_branch:-detached}] — ${wt_note}"
            WT_ANY=1
        done < <(git -C "$WORKSPACE/$repo" worktree list --porcelain 2>/dev/null | sed -n 's/^worktree //p')
    done

    # Directories under worktrees/ that git doesn't know about — leftovers from a
    # `git worktree remove` that didn't clean up. The CLAUDE.md cleanup rule exists
    # to prevent these; nothing was checking.
    if [[ -d "$WORKSPACE/worktrees" ]]; then
        for wt_dir in "$WORKSPACE"/worktrees/*/; do
            [[ -d "$wt_dir" ]] || continue
            if [[ ! -e "${wt_dir%/}/.git" ]]; then
                echo "  ⚠ $(basename "${wt_dir%/}") — no .git, unregistered leftover"
                WT_ANY=1
            fi
        done
    fi

    [[ $WT_ANY -eq 0 ]] && echo "  (none)"
    echo ""
elif [[ -d "$WORKSPACE/.git" ]]; then
    # Single-repo project
    echo "## Project State (auto-generated at session start)"
    echo ""
    collect_repo_state "$WORKSPACE" "$(basename "$WORKSPACE")"
fi

# --- Orientation block, generated from docs/MAP.md ---
#
# WHY: the 2026-08-28 transcript audit measured that MAP.md is genuinely consulted
# (39 of 55 sessions) but at MEDIAN tool call #20 — after the orientation searching
# has already happened. Only 7 sessions opened it in their first five calls. The
# facts are cheap and the searching is not: 17 sessions listed source directories to
# find a file, 16 hunted a type definition, 11 hunted runtime paths on disk (twice
# timing out on `find /home/destin`). Printing the answers here costs ~7.7 KB /
# ~1.9k tokens once (measured 2026-08-28); a single `ls` of a components directory
# or an `rg` across the renderer costs a comparable amount and answers less.
#
# Generated, never hand-written, so it cannot drift from MAP.md — and every path in
# MAP.md is checked by `scripts/audit-anchors.mjs`.
MAP_FILE="$WORKSPACE/docs/MAP.md"
if [[ -f "$MAP_FILE" ]]; then
    echo "## Where things are (generated from docs/MAP.md — these cost you no tool call)"
    echo ""

    # Subsystem index: name, FIRST entry point, rule. The real table has five wide
    # columns and lists up to 17 files per row; what a session needs on arrival is
    # "which file do I open first, and which rule covers this".
    echo "### Subsystems — open this file first"
    awk -F'|' '
        /^## / { done = 1 }            # the main table ends at the first sub-heading
        done   { next }
        /^\|/ {
            name = $2; entry = $3; rule = $4
            if (name ~ /Subsystem/ || name ~ /^[ -]*$/) next
            sub(/<br>.*/, "", entry)
            gsub(/`/, "", entry)
            sub(/ *\(.*/, "", entry)      # drop the parenthetical note; the path is the answer
            sub(/ *\(.*/, "", rule)
            gsub(/^[ \t]+|[ \t]+$/, "", name)
            gsub(/^[ \t]+|[ \t]+$/, "", entry)
            gsub(/^[ \t]+|[ \t]+$/, "", rule)
            gsub(/<br>/, " + ", rule)
            if (rule == "" || rule == "—") rule = "no rule"
            printf "  %s -> %s  [%s]\n", name, entry, rule
        }
    ' "$MAP_FILE"
    echo ""

    # The two lookup tables, verbatim. Only table rows and bold callouts are echoed;
    # the prose in MAP.md explains WHY those tables exist, which a session doesn't
    # need in order to use them.
    for heading in "Hot paths" "On-disk state"; do
        awk -v want="$heading" '
            /^## / { inside = (index($0, want) > 0); if (inside) print "### " substr($0, 4); next }
            !inside { next }
            /^\|[ ]*-+/ { next }
            /^\|/ || /^\*\*/ { print }
        ' "$MAP_FILE"
        echo ""
    done
fi

# --- Staleness detection ---
# Points at the newest dated audit report in docs/audits/. Warns when stale (>60 days)
# or when the report's `residue:` frontmatter count is non-zero (unapplied findings).
AUDITS_DIR="$WORKSPACE/docs/audits"
if [[ -d "$AUDITS_DIR" ]]; then
    # WHY newest-first with a skip, not `sort | tail -1`: the newest file BY NAME is not always
    # the newest report. 2026-07-15-phase3-baseline.md is a mechanical-only baseline
    # (`scope: baseline`, `residue: 0`), and picking it made the hook compute 41 days and stay
    # silent while the last real run was 125 days old — both warnings below were dead from
    # July to August 2026 (ROADMAP L184). Anything whose frontmatter says `scope: baseline`
    # is skipped; the first remaining file is the report the warnings are about.
    LATEST_AUDIT="$(ls "$AUDITS_DIR"/[0-9]*.md 2>/dev/null | sort -r | while IFS= read -r f; do
        sed -n '2,/^---$/p' "$f" | grep -qE '^scope: *baseline' && continue
        printf '%s\n' "$f"; break
    done)"
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
