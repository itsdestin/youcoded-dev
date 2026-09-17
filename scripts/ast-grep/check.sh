#!/usr/bin/env bash
# Executable-invariant check. Runs the ast-grep rules in rules/ two ways:
#
#   1. against the VIOLATION FIXTURES — every rule must fire (proves the rules work)
#   2. against the REAL SOURCE        — no rule may fire  (proves the code is clean)
#
# WHY both directions: a rule that silently stops matching is indistinguishable
# from a rule that passes. The workspace already lost a SessionStart hook that way
# (its worktree `find` matched nothing for weeks and printed no section, so nobody
# noticed). Fixtures make a broken rule fail loudly instead of going quiet.
#
# Usage: bash scripts/ast-grep/check.sh [<source-dir>]
#
#   <source-dir>  Defaults to the main checkout's youcoded/desktop/src. Pass one to
#                 scan a worktree instead — scripts/verify.sh does exactly that, so a
#                 branch is checked against ITS OWN source rather than master's.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$(cd "$HERE/../.." && pwd)"
SOURCE_DIR="${1:-$WORKSPACE/youcoded/desktop/src}"

if [[ ! -d "$SOURCE_DIR" ]]; then
    echo "error: source dir not found: $SOURCE_DIR" >&2
    exit 2
fi

# The test tree beside src/ is scanned too (2026-09-16): rules scoped with a
# `**/tests/**` glob guard the tests themselves — the Windows-only breakages that
# kept master red for a week were all test-side shapes. Rules scoped to src/ do
# not match there, so the extra dir costs nothing for them.
TESTS_DIR="$(dirname "$SOURCE_DIR")/tests"
SCAN_DIRS=("$SOURCE_DIR")
[[ -d "$TESTS_DIR" ]] && SCAN_DIRS+=("$TESTS_DIR")

# Prefer a real install (pacman -S ast-grep / npm i -g @ast-grep/cli); npx works but
# re-resolves the binary on every invocation, which is slow enough to notice.
if command -v ast-grep >/dev/null 2>&1; then
    AG=(ast-grep)
else
    AG=(npx --yes --package @ast-grep/cli ast-grep)
    echo "note: using npx (slower). Install with: sudo pacman -S ast-grep"
fi

# How many fixture violations we expect. Bump this when adding a rule + fixture,
# or when broadening an existing rule's coverage with a new fixture line (e.g.
# tool-bounds-not-hand-rolled's 2026-08-06 broadening added AlsoBadTool).
# 2026-08-12: +3 for atomic-tmp-name-per-process (template + two concat spellings).
# 2026-08-28: +1 for observer-ref-returns-cleanup (perf cycle 3 — an observed
# element that is never released makes any later removal free nothing).
# 2026-09-10: +1 for no-workbench-gate-in-shipped-ui.
# 2026-09-16: +1 for test-file-url-to-path (the tests tree is scanned too, see TESTS_DIR).
# 2026-09-16: +1 for iframe-sandbox-no-allow-same-origin (Plan B).
# 2026-09-16: +1 for main-registers-all-quit-routes (Plan B).
# 2026-09-16: +1 for resume-listener-guards-detail-before-call (Plan B).
# 2026-09-16: +1 for appearance-broadcast-reaches-all-windows (Plan B).
# 2026-09-16: +1 for no-two-bare-bg-utilities (Plan B).
# 2026-09-16: +1 for no-hand-rolled-segmented-control (Plan B).
# 2026-09-16: +2 for no-hand-rolled-dialog-header + no-hand-rolled-dialog-back-chevron (Plan B).
# 2026-09-16: +1 for no-hand-rolled-field-error (Plan B, t5b).
# 2026-09-16: +2 for no-bare-glyph-item-action + no-bare-glyph-item-action-stale-copy (Plan B, t5b).
# 2026-09-16: +3 for no-sync-fs-in-main-hot-path + its -transcript-mirror and -git-transport extras (Plan B, t5b).
# 2026-09-16: +4 for no-sync-fs-in-main-read-path + its -theme-preview, -transcript-cwd and -session-browser extras (Plan B, t5b).
# 2026-09-16 (review of batch B): no-sync-fs-in-main-hot-path-transcript-mirror,
#   no-sync-fs-in-main-read-path (the base rule above) and no-sync-fs-in-main-read-path-
#   transcript-cwd were byte-for-byte-identical whole-file bans differing only by
#   `files:` — MERGED into one rule, no-sync-fs-whole-file, with all three source
#   files and all three (renamed) fixtures. Count unaffected: the two +3/+4 lines
#   above now overstate their own family by one member each (git-transport stays under
#   -hot-path; -theme-preview and -session-browser stay under -read-path), but the
#   total EXPECTED_VIOLATIONS is unchanged — no fixture match was removed, only
#   consolidated under one id instead of three.
# 2026-09-16: +4 for shortcuts-dialog-keeps-scroll-body + its -session-name, -session-menu-height and -model-picker-upward extras (Plan B, t5b).
# 2026-09-16 (review of batch B): the 3 extras above RENAMED for honesty — none of them
#   guard the shortcuts dialog, so a shortcuts-dialog-keeps-scroll-body-* name was
#   misleading about what each guards. Now session-name-line-clamp,
#   session-menu-height-capped and model-picker-opens-upward (ids, rule files and
#   fixtures all renamed together; count unaffected — still +4 total for this family).
# 2026-09-16: +7 for no-hardcoded-z-index-or-scrim + its -screen-layer, -9000-band(-ts), -scrim(-ts) and -settings-panel extras (Plan B, t5b).
# 2026-09-16 (review of batch A, fixes 1+2): +1 for no-two-bare-bg-utilities's new
#   template_string fixture line (a bare bg- pair split by a substitution, the shipped
#   bug's own shape); +1 for its real .ts twin no-two-bare-bg-utilities-ts; +1 for
#   no-hand-rolled-segmented-control-ts (both rules' old `.ts` glob did nothing under
#   `language: tsx` — ast-grep only parses a file under the language it's configured with).
# 2026-09-16 (review of batch A, fix 3): +1 for appearance-broadcast-handler-registered,
#   the whole-file branch that fires when the ipcMain.on(IPC.APPEARANCE_BROADCAST, ...)
#   registration is deleted entirely (its sibling rule matches the call site itself, so
#   it has nothing to match once the whole thing is gone).
# 2026-09-16 (review of batch A, fix 5): +1 for iframe-sandbox-requires-allow-scripts,
#   the whole-file branch on HtmlView.tsx that fires when no <iframe> sandbox attribute
#   containing allow-scripts is present at all (its sibling rule only fires when a
#   sandbox attribute IS present and contains allow-same-origin).
# 2026-09-16 (t5c): +2 for perf-mark-index-order + perf-mark-sessions-listed-inside-session-list
#   (Plan B).
# 2026-09-16 (t5c): +2 for decide-permission-passes-powershell-flag + its
#   -shell-label twin.
# 2026-09-16 (t5c): +3 for section-label-canonical-classes + its -ts twin +
#   section-label-no-h4.
# 2026-09-16 (t5c): +3 for tooltip-wraps-forwarding-element + tooltip-title-is-not-data +
#   tooltip-key-on-wrapper-not-child.
# 2026-09-16 (t5c): +3 for type-scale-named-tokens-declared + no-arbitrary-text-size +
#   its -ts twin.
# 2026-09-16 (t5c): +2 for app-no-switch-view-broadcast + app-no-switch-view-receiver.
# 2026-09-16 (t6a): +2 for private-continuation-dir-single-owner + its -devtools twin
#   (accepted-history-privacy.test.ts).
# 2026-09-16 (t6a): +2 for no-unstepped-infinite-animation (its fixture fires both
#   branches — inline style and Tailwind arbitrary value) (animation-frame-budget.test.ts).
# 2026-09-16 (t6a): +2 for arcade-no-forbidden-attention-apis + its -ts twin
#   (arcade-authority.test.ts).
# 2026-09-16 (t6a): +1 for chatview-passes-provider-to-attentionbanner
#   (attention-banner.test.tsx).
# 2026-09-16 (t6a): +1 for buddy-window-move-only-in-place (buddy-caption-channel.test.ts).
# 2026-09-16 (t6a): +1 for buddy-show-consults-refusal-gate (buddy-consent-gate.test.ts).
# 2026-09-16 (t6a): +1 for no-hand-rolled-callout-tint (callout-authority.test.tsx).
# 2026-09-16 (review of batch C, fix 4): +6 for the three tooltip rules
#   (tooltip-wraps-forwarding-element, tooltip-title-is-not-data,
#   tooltip-key-on-wrapper-not-child) each gaining a ternary-wrapped AND an
#   `&&`-wrapped violation fixture line (+2 each) — the rules now also match
#   an offending child hidden behind `{cond ? <X/> : <Y/>}` / `{cond && <X/>}`,
#   which the retired test's textual scan covered but the first-draft rules
#   missed (they only checked a direct jsx_self_closing_element/jsx_element
#   child).
# 2026-09-16 (review of t6a, I1): +4 — private-continuation-dir-single-owner now matches
#   any token spelling the name (its fixture gains a comment line, +1), new -tsx twin (+1),
#   new -present owner branch (+1), -devtools matches any token spelling userData (its
#   fixture gains a destructured name, +1).
# 2026-09-16 (review of t6a, I2): +2 — no-unstepped-infinite-animation's fixture gains a
#   string holding an exempt bracket beside an unstepped one, and a bracket split by ${}.
# 2026-09-16 (review of t6a, I5 animation-css-budget.test.ts): +10 for
#   braille-spinner-interval-driven (2), theme-effects-draws-from-interval (2),
#   mascot-rig-raf-only-for-drag (2), mascot-rig-pauses-when-hidden (1),
#   setting-row-base-is-stepped-hover (1), session-strip-menu-rows-stepped-hover (1),
#   session-strip-no-transition-all (1).
# 2026-09-16 (review of t6a, I5 animation-frame-budget.test.ts): +43 for 22 rules —
#   session-strip-label-window-from-stylesheet (2)
#   session-strip-dot-flows-never-touches (2)
#   session-strip-no-select-on-scaffold (1)
#   index-no-arrival-scaffold (2)
#   chatview-arrival-only-on-incoming (1)
#   session-strip-twin-is-the-real-pill (5)
#   session-strip-twin-follows-cursor (2)
#   session-strip-peek-survives-press-and-drag (2)
#   session-strip-drag-state-keyed-by-id (2)
#   session-strip-held-pill-keeps-name (2)
#   session-strip-packs-real-room (3)
#   session-strip-tear-off-vertical-only (2)
#   session-strip-pill-is-dot-and-name (2)
#   session-strip-name-laid-out-once (2)
#   session-strip-no-hand-written-curve (1)
#   session-strip-drag-visuals-are-state (2)
#   session-strip-drop-never-glides-dot (2)
#   session-strip-peek-waits-for-dwell (1)
#   session-strip-hover-handlers-unconditional (1)
#   session-strip-label-via-pill-label-style (3)
#   pill-label-reveals-with-motion-tokens (1)
#   voice-button-level-ring-stepped (2)
# 2026-09-16 (review of t6a, I3 + I5 arcade-authority.test.ts): +18 —
#   arcade-no-forbidden-attention-apis fixture now fires on 5 reference shapes (+4),
#   its -ts twin on 2 (+1); new arcade-state-play-only-in-own-board (1) + -ts (1),
#   arcade-shared-state-no-connect4-vocabulary (2), arcade-shared-state-has-seat-vocabulary (1),
#   arcade-challenge-game-in-presence-hook (1), -in-reducer (1), -in-lobby (1),
#   -not-hardcoded (1), chatview-yields-keys-to-game-board (1),
#   arcade-handlers-no-ranking-or-formatting (2), arcade-stop-play-keyed-on-open-game (1).
# 2026-09-16 (review of t6a, I4): +2 — chatview-passes-provider-to-attentionbanner's
#   fixture gains the open/close form, and a second fixture fires its whole-file
#   "no banner rendered" branch.
# 2026-09-16 (review of t6a, I5 buddy-consent-gate.test.ts): +4 for
#   buddy-show-refuses-before-creating, buddy-drag-reads-cached-helper-status,
#   buddy-work-area-only-where-needed, buddy-work-area-reresolved-on-display-change.
EXPECTED_VIOLATIONS=159

count_findings() {
    # --json emits an array of matches; jq counts them. Fall back to grep if jq is absent.
    local out
    out="$("${AG[@]}" scan -c "$HERE/sgconfig.yml" --json "$@" 2>/dev/null)"
    if command -v jq >/dev/null 2>&1; then
        printf '%s' "$out" | jq 'length' 2>/dev/null || echo "ERR"
    else
        printf '%s' "$out" | grep -c '"ruleId"' || echo 0
    fi
}

fail=0

# WHY a per-rule check and not just the total (2026-09-10): the count alone
# cannot tell "every rule fired" from "the right NUMBER of findings appeared".
# A rule added with no fixture — or one whose `files:` globs exclude the fixture
# directory, which is easy to miss because rules are path-scoped and fixtures are
# not — contributes zero findings, the total still matches, and the scan reports
# OK. That is a rule guarding nothing, passing the check written to prevent
# exactly that. Measured the day this was added: a new rule sailed through.
rule_ids() { rg --no-filename -o '^id: \S+' "$HERE"/rules/*.yml | sed 's/^id: //' | sort -u; }
firing_ids() {
    "${AG[@]}" scan -c "$HERE/sgconfig.yml" --json "$HERE/fixtures" 2>/dev/null \
        | { command -v jq >/dev/null 2>&1 && jq -r '.[].ruleId' || grep -o '"ruleId":"[^"]*"' | cut -d'"' -f4; } \
        | sort -u
}

echo "== fixtures (every rule must fire) =="
got="$(count_findings "$HERE/fixtures")"
if [[ "$got" == "$EXPECTED_VIOLATIONS" ]]; then
    echo "  OK — $got/$EXPECTED_VIOLATIONS rules fired on the violation fixtures"
    silent="$(comm -23 <(rule_ids) <(firing_ids))"
    if [[ -n "$silent" ]]; then
        echo "  FAIL — these rules fired on NO fixture, so they guard nothing:"
        echo "$silent" | sed 's/^/         /'
        echo "         Add a violation fixture, and name its path in the rule's files: globs."
        fail=1
    fi
else
    echo "  FAIL — expected $EXPECTED_VIOLATIONS findings, got $got"
    echo "         A rule stopped matching. Run for detail:"
    echo "         ${AG[*]} scan -c $HERE/sgconfig.yml $HERE/fixtures"
    fail=1
fi

echo "== real source (no rule may fire) =="
got="$(count_findings "${SCAN_DIRS[@]}")"
if [[ "$got" == "0" ]]; then
    echo "  OK — no invariant violations in ${SCAN_DIRS[*]}"
else
    echo "  FAIL — $got invariant violation(s):"
    "${AG[@]}" scan -c "$HERE/sgconfig.yml" "${SCAN_DIRS[@]}" 2>/dev/null
    fail=1
fi

exit $fail
