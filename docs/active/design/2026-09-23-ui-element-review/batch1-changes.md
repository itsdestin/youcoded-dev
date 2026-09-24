---
status: active
date: 2026-09-24
related: docs/active/design/2026-09-23-ui-element-review/decisions.md
---

# Fix batch 1 — what changed

Applied the design guide's rules to the screens Destin named for judging the rules
"applied to the most egregious settings menus" (decisions.md, "See it applied"):
Assistant settings (all five pages), Remote Access, Backup & Sync, and the
hover/selected bug in four pick-one lists. Mid-session Destin added local model
download states to the list; that's included below too. Branch:
`session/ui-consistency-audit` in `itsdestin/youcoded`, pushed, not merged.

New shared pieces, used throughout: `components/ui/SectionLabel.tsx` (the small
grey label — 12px, normal words, no spaced-out capitals) and
`components/ui/FieldRow.tsx` (a text box or dropdown's label and hint sitting
above it, promoted from a helper Assistant settings' General page already had).

## A. Assistant settings

**General.** No visible change to controls — this page was already close to the
guide. Rows sit slightly closer together (a little less air between them, per the
guide's tighter settings spacing).

**Cloud providers.** The small grey headings ("Web search", "Your own API keys")
lose their spaced-out capital letters — they now read as ordinary words, just
smaller and greyer. The "Replace OpenRouter key" popup's two buttons now stack
one above the other (Connect on top) instead of sitting side by side — that popup
is narrow, and side-by-side buttons were the wrong shape for a narrow popup.

**Local models.** The "Installed" / "Recommended" / "More on Hugging Face"
headings lose their capital letters, same as above.

**Permissions.** Fixed the doubled heading Destin's audit flagged directly — the
page used to show "CHATGPT, OPENROUTER AND LOCAL MODELS" immediately followed by
"PERMISSION MODES" with nothing between them, which read as a mistake. The first
one is gone; "Permission modes" is the only heading there now. The "Turn on Skip
Permissions Mode" confirmation popup's two buttons now stack (danger button on
top) instead of sitting side by side, for the same narrow-popup reason as above.

**Specialists.** Its headings ("Specialist intelligence tiers", "Available
specialists", and the "Built in" / "Your specialists" grouping inside the roster)
lose their capital letters.

**What I left alone:** the actual controls, model pickers, toggles and roster
rows are untouched — only headings, spacing and the two confirmation popups'
button layout changed. I could not find an actual second "box inside a box" on
the Specialists page in the current code — the audit that named one appears to
predate a since-landed fix; the tier picker is already one flat card.

## B. Remote Access

The "Server" / "Devices" / "Advanced" / "Tailscale" headings lose their capital
letters. The Password field is rebuilt to match every other field in the app: the
hint ("At least 8 characters.") now sits right under the "Password" label, above
the box — it used to sit below the box, to the right, which the audit named as
the one place in the app still doing it backwards. The Set button stays inside
the box, unchanged. "Saved" and the Generate button move to one row under the
box instead of "Saved" floating beside the label. The lone "Install Tailscale"
button (shown when Tailscale isn't installed) is now full width, matching every
other lone button in the app.

**Left alone on Destin's explicit instruction:** the "Keep awake" control — its
five time-choices and label placement are exactly as they were. It gets its own
redesign later.

## C. Backup & Sync

The "Additional backups" section was a dashed-border box containing more boxes
inside it (a bordered row per backup destination, plus a dashed "+ Add a backup"
button) — the audit named this directly as boxes-inside-boxes. It's now flat: a
plain row with the toggle (matching every other setting row in the app), then the
backup destinations directly underneath as their own rows (not nested inside
another box), then a normal outlined "+ Add a backup" button with a solid border
instead of a dashed one. The "Optional" tag next to the heading is now a small
neutral tag instead of a capitalized pill. The "Warnings" heading and the
"Includes" / "Sync log" captions lose their capital letters. Everything sits a
touch closer together throughout the popup.

**Left alone:** the main sync status card (the "All synced" / "Couldn't sync"
box with its tabs and device list) — its layout already matches the guide, and
its nested warning box for "conversations too big to sync" is the exact example
the guide's own writers point to as the right way to show a warning, not a
violation.

## D. Selected no longer looks like hovered (bug fix)

In four places, a row you were hovering over (with the mouse, not selecting)
looked identical to the row that was actually selected — moving the mouse could
make you think you were about to act on the wrong session, file or project.
Fixed by giving the truly-selected row a light accent-colored tint that hover
never uses:

- The session drawer's file list (and its "Referenced conversations" list below it)
- The project switcher's project list
- The "All Sessions" dropdown in the top bar

Nothing else about these lists changed — same rows, same order, same drag-and-drop
behavior; only the selected row's color is different now, and only when nothing
else (like the drag animation) is also active.

## Addendum: local model download labels (added mid-session)

Destin asked that every download error/failed/interrupted/paused label for local
models be brought in line with the rest of the app. Found and fixed:

- **The colored "Downloading" / "Verifying" / "Download interrupted" / "Damaged"
  banner** across the top of a model row already put its color in the banner
  itself rather than in colored text (that part was already right, and was
  measured for readability on light themes when it was built) — only its
  spaced-out capital letters are gone now; it reads as ordinary words.
- **Every plain red error line** — "Could not start the download," "Could not
  resume the download," "Could not delete the model," the local engine's
  install/restart failures — is now shown in a soft tinted box instead of just
  red text, matching how every other error box in the app looks. The button that
  would fix each problem (Download, Resume, Delete, Install, Restart) was already
  sitting right there on the row, so nothing new was added — clicking it again is
  the retry.
- **Two "retry" controls that were plain clickable text** are now real buttons:
  the "tap to retry" link when a model's size can't be checked (Hugging Face
  unreachable), and the "Pause" link on a download that's just starting (the
  installed-models list already used a real button for the same action — this
  one didn't).
- The "Suggested for this computer" heading on the first-run local-model screen
  loses its capital letters too.

Nothing about how downloads actually start, pause, resume or fail changed —
only how the messages and buttons around them look.

## Verification

`bash scripts/verify.sh` (types, related tests, dead-code check, lint, the
design-system lint, and the ast-grep invariant checks) — green, then re-run
with `--full` (the whole test suite, not just files touched) — also green.

Two existing guards encoded the *old* rule and were updated rather than deleted,
with a comment explaining why:

- `tests/permissions-section.test.tsx` asserted the Permissions page's "Commands"
  heading used the old spaced-capitals recipe; now it asserts the new one.
- `tests/setting-row-authority.test.tsx` tracked exactly two switches in
  Backup & Sync that live outside a proper settings row; flattening "Additional
  backups" turned one of those into a proper row, so the count is now one.

Four files grew past their tracked line-count ceiling (`line-budgets.json`) from
the WHY comments and restructuring this batch added — each was raised to its
actual new size, explained in that screen's own commit: `SettingsPanel.tsx`,
`SyncPanel.tsx`, `SessionStrip.tsx`, and `SessionDrawer.tsx` (newly listed).

## Rules I could not apply cleanly

- **Rule 3's "Keep awake" exception and rule 2's hint-placement rule are in
  tension** on that one control by design (Destin's own call, noted above) — no
  conflict once you know it's excluded, but worth naming so a future session
  doesn't "fix" it.
- The **status-pill wording rule** ("a small tinted pill... a live status also
  carries its colored dot inside the pill") doesn't map cleanly onto the local
  model download banner, which is a full-width colored band across a card rather
  than a small pill — I kept its existing shape (already measured for contrast)
  and only fixed its casing rather than rebuilding it as a pill, which would have
  been a much larger, riskier change for a one-line ask.

## Commits (branch `session/ui-consistency-audit`, pushed)

1. `ui: add SectionLabel and FieldRow primitives`
2. `Assistant settings: apply design guide to all five pages` (+ the download-label addendum)
3. `Remote Access: apply design guide`
4. `Backup & Sync: flatten the "Additional backups" card`
5. `Pick-one lists: selected no longer looks like hover`

Not merged — Destin decides when this is ready.
