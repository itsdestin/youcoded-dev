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
# 2026-09-16 (review of t6a, I6): +2 — no-hand-rolled-callout-tint's fixture gains a
#   tint and border split across one className attribute, and across one mergeClasses call.
# 2026-09-16 (review of t5c batch C, round 2): +3 for the three tooltip rules
#   (tooltip-wraps-forwarding-element, tooltip-title-is-not-data,
#   tooltip-key-on-wrapper-not-child) each gaining a ONE-extra-layer-of-parens
#   fixture line — `{cond ? (\n<X/>\n) : null}` / `{cond && (\n<X/>\n)}` — the
#   retired test's textual scan was indifferent to parens too, and the round-1
#   ternary/`&&` fix only matched the tag directly, not through a paren wrapper.
# 2026-09-16 (review of t6a, fix round 2, item 1): +2 — no-hand-rolled-callout-tint
#   gains a third branch: a tint in className paired with `border` in a DIFFERENT
#   attribute of the same JSX tag (e.g. style={{ border: '...' }}), the shape the
#   retired ±150-char window caught that round 1's className/mergeClasses-only
#   branches did not. Fixture +2 (open tag + self-closing tag).
# 2026-09-16 (review of t6a, fix round 2, item 2): +1 — mascot-rig-raf-only-for-drag's
#   function-field check drops its `^` anchor so `window.requestAnimationFrame(x)`
#   is caught (the retired regex found the call as a substring, indifferent to what
#   preceded it); the "at least one rafTick call" presence branch now also accepts
#   the window-prefixed form. Fixture +1.
# 2026-09-16 (review of t6a, fix round 2, item 6): +2 —
#   arcade-challenge-game-not-hardcoded and arcade-stop-play-keyed-on-open-game
#   now also match member-form calls (`api.lobbyChallenge(...)`,
#   `React.useEffect(...)`), which `.includes()`-based reads never cared about.
#   Fixture +1 each.
# 2026-09-16 (u1, chatgpt-oauth.test.ts): +3 for limit-sentence-uses-shared-time-format (1)
#   and status-bar-uses-shared-format-time12 (2 — its fixture lacks the import AND
#   keeps a local formatTime12).
# 2026-09-16 (u1, close-prompt-meta-unreadable.test.tsx): +5 for
#   get-meta-marks-failed-read-unreadable (2 — blank answers, and a -missing file with
#   no handler) + its -remote twin (3 — no unreadable key, a "fall through to empty"
#   string, and a -missing file with no case).
# 2026-09-16 (u1, dev-load-recovery.test.tsx): +2 for main-uses-shared-mount-probe
#   (an inlined same-name copy with no import; an inline-string call with the import kept).
# 2026-09-16 (u2, dialog-shell.test.tsx): +3 for no-hand-rolled-dialog-shell (2 — an
#   open and a self-closing OverlayPanel tag) and its -exemption-still-applies twin (1).
# 2026-09-16 (u2, explainer-shell.test.tsx): +4 for settings-explainer-no-chrome-props
#   (2 — self-closing with title, open tag with onBack), explainer-hosts-pass-onback-showinfo
#   (1) and its -lifted twin (1).
# 2026-09-16 (u2, filter-chip.test.tsx): +5 for no-local-filter-chip-recipe (2 — the
#   active recipe in a string, the base recipe in a template) and its -command-drawer
#   twin (3 — the Favorites recipe and ml-auto, plus a file with no FilterChip tag).
# 2026-09-16 (u2, filter-menu-chip.test.tsx): +9 for resume-browser-uses-shared-filter-chips
#   (3 — one fixture each for missing primitives, Tags labelled before Projects, and
#   Projects labelled twice) and resume-browser-no-local-filter-chip-parts (6 — a local
#   FilterPill, a glyph in JSX text, a glyph in a string, the hand-made check box, a
#   ', ' join and a "Projects (N)" template).
# 2026-09-16 (review of u1, fix round 1, item 1): +5 for the new rule
#   chatgpt-types-no-locale-formatter — the shapes the oxlint no-restricted-properties
#   ban misses: an indirect string key, a Reflect.get lookup, a bare-call import,
#   and an aliased import specifier's original name (2 fixture matches on one line
#   pair, 1 each on the other three).
# 2026-09-16 (review of u2, fix 4): +6 for resume-browser-uses-shared-filter-chips —
#   its single "-absent" fixture (which tripped all six presence branches at once)
#   is split into six, one per presence branch (+5), and a "Tags labelled twice"
#   fixture joins the Projects one (+1).
# 2026-09-16 (u3, folders-service.test.ts): +2 for no-folders-json-outside-service (1)
#   and folders-service-called-by-both-transports (1 — a transport calling four of five).
# 2026-09-16 (u3, primitive-adoption.test.ts): +7 for no-hand-rolled-toast (2 — a JSX
#   attribute and a markup template), its -ts twin (1), no-literal-black-white-wash (2 — a
#   className and a template beside a substitution), its -ts twin (1) and
#   toast-auto-dismiss-owned-by-primitive (1).
# 2026-09-16 (u3, project-view-files-tab-stays-mounted.test.tsx): +4 for
#   filestab-mounted-with-hidden-prop (the conditional mount, its tag lacking `hidden`, an
#   open/close tag with the wrong `hidden`, and a file with no FilesTab at all).
# 2026-09-16 (u4, read-pdf.test.ts): +3 for pdfjs-asset-dirs-no-path-sep (path.sep in the
#   function, a comment between it and DEFAULT_PDF_PAGES, and a file with the function renamed).
# 2026-09-16 (u4, remote-appearance-relay.test.ts): +2 for appearance-broadcast-relays-to-remote
#   (a window relay that never tells phones, and a file with no onAppearanceBroadcast callback).
# 2026-09-16 (u4, remote-download.test.ts): +5 for download-route-before-static (a static
#   call before the route (1); a server callback with no route — the callback and both
#   fallbacks (3); a file with no http.createServer((req, res) => …) call (1)).
# 2026-09-16 (u5, remote-host-admin-desktop-only.test.ts): +10 for remote-admin-case-refuses
#   (a performed rename arm, the address check in a comment and the disconnect call (3);
#   one file per missing channel case (5)) and unpair-button-disabled-on-remote (the
#   button without disabled={hostOnly}, and a row description without the hint (2)).
# 2026-09-16 (u5, fix to remote-admin-case-refuses): +1 for its new
#   whole-file backstop (a retired spelling inside a `new` expression, a kind the innermost
#   branch does not list).
# 2026-09-16 (u5, remote-rate-limit.test.ts): +8 for no-ip-keyed-failure-bucket (a get call, a
#   comment, a this.…Attempts set call and an untyped method definition (4); an interface
#   signature caught only by the whole-file backstop (1)) and remote-burst-slows-not-refuses
#   (one file per presence branch: no threshold constant, a refusal instead of the slow
#   start, a slow start never awaited (3)).
# 2026-09-16 (u6, run-over-card.test.tsx): +6 (first written "+5"; corrected in the
#   review of u6 — the parts below add up to 6) for arcade-end-run-keeps-playing (a
#   setPlaying(false) call and the same text in a comment inside endRun (2); the text where
#   only the whole-declaration backstop sees it (1); a shell with no onExit prop (1)) and
#   solo-game-uses-run-over-card (a game that never renders the card, and one whose card
#   has no retryKeyHint (2)).
# 2026-09-16 (review of u6, fix 2): -1 — arcade-end-run-keeps-playing's
#   whole-declaration backstop branch is gone, and its malformed-TS fixture with
#   it: only unparseable code could reach it, so it guarded nothing real.
# 2026-09-16 (review of u3, fix 6): +7 — no-hand-rolled-toast's kind list gains
#   parameters, destructure defaults, class fields and (tsx) jsx_element; its fixture
#   fires on a parameter default, a destructure default, a class field and JSX text
#   split by an expression (4), the -ts twin's on the first three (3).
# 2026-09-16 (review of u4, fix 8): count unchanged — download-route-before-static's
#   presence check is now one whole-file branch ("no server call holds all three"),
#   so the -missing fixture's first finding moved from the server call to the file.
# 2026-09-16 (u7, runtime-default.test.tsx): +16 — runtime-default-key-single-owner (a
#   string, a template piece and a regex naming the key in a .ts file (3)), its -tsx twin
#   (an attribute string, a JSX attribute name and JSX text (3)), its -present branch (an
#   owner naming the key only in a comment (1)), and new-session-forms-use-default-runtime
#   (a literal seed; a literal reset after a close, which is also a second literal; no
#   lazy seed; a second literal outside any close's block; no close; no reset after the
#   close; the welcome form's literal reset in a nested callback; the welcome form with no
#   reset after a close statement; its second literal (9)).
# 2026-09-16 (u7, session-drag-model.test.ts): +8 for preload-no-drag-model-decision (a
#   preload naming the model in a string and a comment, importing and naming the decision,
#   and starting a drag via startDrag and dragHandoff (6); one with no platformFacts object,
#   one whose platformFacts lost its wayland fact (2)).
# 2026-09-16 (u7, session-drawer-skips-parent-rerenders.test.tsx): +5 for
#   artifact-provider-value-memoized (an inline value object, a self-closing provider
#   handed another value, a useMemo whose deps miss artifactState (3); an App with no
#   provider tag, one whose value is not a useMemo (2)).
# 2026-09-16 (u7, session-meta-unreadable.test.tsx): +3 for note-editor-guarded-on-unreadable
#   (an unguarded preview note editor, one "guarded" only by a message mention (2); a drawer
#   with no previewMeta.saveNote editor (1)).
EXPECTED_VIOLATIONS=297

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

# WHY a generator drift check (review round 2, 2026-09-16): a rule file built by
# a generator (scripts/ast-grep/generators/*.py — currently
# no-unstepped-infinite-animation, whose regexes are generated because ast-grep's
# Rust regex has no lookaround) can be hand-edited, or its generator edited
# without re-running it, and the two silently disagree from then on. Each
# generator supports `--check`: compares its own output to the committed YAML,
# prints and fails instead of writing. python3 is a soft dependency — skipped
# (not failed) when absent, same as the jq fallback above.
echo "== generated rules (drift check) =="
if command -v python3 >/dev/null 2>&1; then
    for gen in "$HERE"/generators/*.py; do
        [[ -e "$gen" ]] || continue
        if ! python3 "$gen" --check; then
            fail=1
        fi
    done
else
    echo "  SKIP — python3 not found; generated rules were not checked for drift"
fi

# WHY a dead-path check (review of u2, 2026-09-16): a rule scoped to one named
# file (`files: - "**/src/main/main.ts"`) matches NOTHING once that file is
# renamed or deleted — the real-source scan below then reports OK while the
# rule guards nothing. The retired text-reading tests threw on a missing file;
# this restores that for every rule at once. A "concrete" glob is one whose only
# wildcard is the leading `**/`; each must match at least one existing file under
# SCAN_DIRS. Fixture globs are skipped (the fixture pass covers those), and so is
# any glob with a wildcard past the leading `**/` (it names a family, not a file).
# Handles `files:` written as a block list (`  - "a"`) or a flow list (`["a", "b"]`).
# python3 is a soft dependency, as for the drift check above.
echo "== rule paths (every named file must exist) =="
if command -v python3 >/dev/null 2>&1; then
    if ! python3 - "$HERE/rules" "${SCAN_DIRS[@]}" <<'PY'
import os, re, sys
rules_dir, scan_dirs = sys.argv[1], sys.argv[2:]

def files_globs(text):
    # The `files:` value: either `files: [..]` on one line, or the `- item` lines under it.
    m = re.search(r'^files:[ \t]*\[(.*?)\]', text, re.M | re.S)
    if m:
        items = m.group(1).split(',')
    else:
        # WHY line by line (review of u2, 2026-09-16): the old one-regex block match
        # ended at the first line that was not `- item`, so a `# comment` line inside
        # the list silently dropped every path after it from this check. Walk the
        # lines under `files:` instead — list items are kept, comment and blank lines
        # skipped — and stop at the next top-level key (any other non-indented line).
        items = []
        m = re.search(r'^files:[ \t]*(?:#.*)?$', text, re.M)
        for line in (text[m.end():].split('\n')[1:] if m else []):
            if re.match(r'^[ \t]*(#.*)?$', line):
                continue
            item = re.match(r'^[ \t]*-[ \t]*(.*)$', line)
            if not item:
                break
            items.append(item.group(1))
    return [i.split(' #')[0].strip().strip('"\'') for i in items if i.strip()]

existing = []
for d in scan_dirs:
    for root, _, names in os.walk(d):
        existing += [os.path.join(root, n).replace(os.sep, '/') for n in names]

dead = 0
for name in sorted(os.listdir(rules_dir)):
    if not name.endswith('.yml'):
        continue
    text = open(os.path.join(rules_dir, name), encoding='utf-8').read()
    rule_id = re.search(r'^id:\s*(\S+)', text, re.M).group(1)
    for glob in files_globs(text):
        rest = glob[3:] if glob.startswith('**/') else glob
        if re.search(r'[*?\[{]', rest) or rest.startswith('fixtures/') or '/fixtures/' in rest:
            continue
        if not any(p.endswith('/' + rest) for p in existing):
            print(f'  FAIL — rule {rule_id}: files: glob "{glob}" matches no file (renamed or deleted?)')
            dead += 1
if dead:
    print('         The rule now guards nothing there. Point the glob at the file\'s new path,')
    print('         or drop the rule if the thing it guarded is gone on purpose.')
    sys.exit(1)
print('  OK — every concrete files: path in rules/ names an existing file')
PY
    then
        fail=1
    fi
else
    echo "  SKIP — python3 not found; rule paths were not checked"
fi

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
