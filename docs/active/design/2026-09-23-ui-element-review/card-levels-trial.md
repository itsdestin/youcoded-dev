---
status: active
date: 2026-09-27
related: docs/active/design/2026-09-23-ui-element-review/decisions.md
---

# Card levels — trial (Backup & Sync + Assistant settings → General)

Destin's rule (2026-09-27, decisions.md "Card levels"): never a full-width line inside a
card or popup; every first-level card on a page looks the same; everything nested inside a
first-level card looks the same, one level down; the next level again one style; notices
keep their own tint; buttons are only the Button variants, nothing else looks like one.

Built on `session/ui-card-levels` (youcoded), branched from `session/ui-consistency-audit`.
Two prior trials off the same base were rejected: `session/ui-one-card` (new solid card +
full-width divider lines) and `session/ui-four-kinds` (every setting became its own
separate-looking box). This trial reuses the app's two existing card looks instead of
inventing a third.

## The shared vocabulary (`desktop/src/renderer/components/ui/`)

- **`cardLevels.ts`** (new) — `CARD_LEVEL_1 = 'bg-inset/50 rounded-lg'` (the translucent
  "glass" card already used by `FieldRow`, `SettingRow`, `ContextSettings`, `SessionNaming`
  — General page's own look, which Destin named as the one to keep). `CARD_LEVEL_2` is an
  alias for the already-existing `FIELD_SURFACE` (`bg-inset border border-edge-dim
  rounded-lg` — the shared text-field/dropdown-trigger recipe) — reused for every OTHER
  kind of nested box (a sub-card, a segmented-tab track, a list row), not just fields.
- `SettingRow.tsx`'s `SETTING_ROW_BASE` keeps its background as a plain string literal
  equal to `CARD_LEVEL_1` (not a template-literal import) — an existing ast-grep invariant
  (`setting-row-base-is-stepped-hover`) only matches a literal string node on that exact
  constant, so importing here would have silently defeated that guard.
- `SegmentedTabs.tsx` gained a `variant="nested"` (alongside the existing `bare` / `contained`
  / `pill`): the same trough, but on `CARD_LEVEL_2` instead of `contained`'s `bg-inset/50` —
  which is also level-1's own background, so a `contained` strip inside a level-1 card was
  quietly wearing the card's own look. Added as a new variant, not a change to `contained`
  itself, since `contained` ships on other screens outside this trial's two.
- `ModelPicker` gained an optional `triggerClassName` prop, defaulting to its existing
  `bg-well border-edge` "one step deeper" trigger (written for pickers sitting on an
  *opaque* `bg-inset` card, e.g. Resume Browser). General's `FieldRow`/`SessionNaming` cards
  are the *translucent* `bg-inset/50` case, so both call sites there pass `triggerClassName=""`
  to fall back to the shared level-2 default instead — scoped opt-out, not a global change.

## What changed per screen

**Backup & Sync (`SyncPanel.tsx`)**
- The top status card ("Couldn't sync" / "All synced") was its own one-off "well card"
  (`border-edge bg-well`) — now level-1, same as every other card on this popup. Its three
  internal `border-t` dividers (header→tabs, tabs→list, list→conflict/Sync-now) are gone;
  one `p-3 space-y-2.5` wrapper separates the sections with spacing instead.
- "Additional backups" (fix batch 1 had made it intentionally flat, with no wrapping card,
  to kill a real box-in-box bug) is now ONE level-1 card: the header row, each backup
  destination (level-2, status-tinted), and the "+ Add a backup" / "Back up all now" buttons
  all sit inside it.
- Devices / Projects / Conversations rows, and the "too big to sync" file names, are now
  level-2 boxed rows instead of bare text — same recipe everywhere something is nested.
- The two hand-rolled "Google Drive" / "iCloud" picker buttons (old `bg-well` fill) are now
  real `Button variant="secondary"`.
- Sync log's fold-out row was already `SettingRow`-based, so already level-1 shaped —
  unchanged.

**Assistant settings → General (`pages.tsx`, `ContextSettings.tsx`, `SessionNaming.tsx`,
`ModelProvidersPopup.tsx`'s `SearchProvidersBlock`)**
- Level-1 cards unchanged (FieldRow/SettingRow/ContextSettings/SessionNaming already used
  the same recipe, now via the shared constant).
- Nested controls unified to level-2: the "Default model" dropdown trigger (previously the
  one-off `bg-well` deepening) now matches "Default project folder"'s trigger; the Context
  250k/1M strip and Session naming's Off/Basic/AI strip now use `SegmentedTabs
  variant="nested"` instead of quietly reusing the level-1 background; the Step guard input
  already matched (no change needed). Web Search's Tavily/Exa rows (shown on this page via
  `SearchProvidersBlock card`) moved from a third recipe (`bg-well rounded-md`) to level-2.

## Self-check (looked at every after picture, 3 themes: midnight, light, meadow-mist)

**settings-backup-sync** — (1) yes, both cards level-1. (2) yes, the Google Drive row and
(where present) list rows are level-2. (3) no full-width line. (4) no — Add a backup / Back
up all now are real Buttons; no empty-looking box. (5) same groups/order as before. (6)
nothing broken in any theme (checked light's low-contrast level-1 boundary against the
General page's *own* pre-existing before-shots — same subtlety already existed there, not
introduced by this trial).

**sync-error** — same status-card structure as above; the mock's own default data and the
injected RPC-failure both summarize to the same generic "unexpected problem" sentence
(`summarizeSpaceSyncError`), so this shot renders identically to settings-backup-sync — not
a capture bug, both are legitimate "Couldn't sync" states. All six checks pass for the same
reasons as above.

**sync-oversize-open** — (1) yes. (2) yes — Devices/Projects/Conversations rows and the two
oversize file names are level-2. (3) no full-width line (the old tabs→list and
list→conflict dividers are gone). (4) no. (5) same order (tabs, list, oversize notice, Sync
now, Additional backups). (6) nothing broken; content that no longer fits scrolls, same as
before.

**assistant-general** — (1) yes, unchanged. (2) yes — Default model / Default project
folder triggers, Context strip, Session naming strip all read as one nested look now (were
two before: Default model stood out darker). (3) no full-width line (General never had one).
(4) no. (5) same order. (6) nothing broken in any theme.

## Verification

`bash scripts/verify.sh worktrees/sessions/ui-card-levels/youcoded`: types, tests, knip,
lint and design-lint all pass. The line-budget guard (`SyncPanel.tsx`) was trimmed back
under its existing 2104-line ceiling. `ast-grep` invariants: this trial's own edit
(`SettingRow`'s background moving to a template literal) was caught and fixed — see above.
**Eight other `ast-grep` invariant failures remain, all in `App.tsx`/`main.ts` (startup
dialog gating, auto-approve, the artifact context value) — confirmed pre-existing on
`session/ui-consistency-audit` at the commit this branch forked from (`git diff` against
that commit touches neither file). Not fixed here: unrelated to card styling, behavioral
rather than visual, and touching either file blind was judged riskier than leaving a known,
pre-existing, out-of-scope failure noted for whoever owns that base branch.**

## Captures

Driver: `scripts/ui-review/shot.mjs` + `scratch/card-levels-plan.json` (this branch
predates the newer `shoot` tool — its screen registry isn't in this checkout yet). Plan
reuses the sync-error/oversize injection scripts verbatim from
`scripts/ui-review/plans/archive/sync-oversize-fix.json`.

- Before: `scratch/before/shots-card-levels-plan/{midnight,light,meadow-mist}/{settings-backup-sync,sync-error,sync-oversize-open,assistant-general}.png`
  (built from `/home/destin/youcoded-dev/worktrees/sessions/ui-consistency-audit/youcoded`)
- After: `scratch/after/shots-card-levels-plan/{midnight,light,meadow-mist}/{settings-backup-sync,sync-error,sync-oversize-open,assistant-general}.png`
  (this branch)

All 24 shots (12 before + 12 after) verified (self-checking driver: every action's target
existed, each shot's `expect` was true, no shot matched the empty-app baseline). Manifests
alongside each theme folder.

## Round 2 (2026-09-28) — Destin: "these look roughly right," rolled out to the rest of Settings

Same branch (`session/ui-card-levels`), same rule, same two vocabulary pieces
(`CARD_LEVEL_1`/`CARD_LEVEL_2`). Two asks: (1) fix the free-floating "Includes Memory ·
Conversations · …" line on Backup & Sync, (2) apply card levels to every other
Settings-family popup, not just Backup & Sync and Assistant → General.

**Fix 1 — the floating "Includes" line (`SyncPanel.tsx`).** It used to be its own paragraph
sitting between two cards, with visible gaps above and below and nothing tying it to either
one — which is exactly what Destin flagged. It now renders as small grey text inside the top
status card, directly under the "Couldn't sync" / "All synced" line, in every sync state.
Confirmed by direct before/after comparison (`settings-backup-sync.png` in both `before2` and
`after2`): before, the line floats between the two cards with daylight on both sides; after,
it reads as the status card's own caption.

**Fix 2 — the rest of Settings.** Went file by file (grep for the old one-off recipes:
`bg-well`, `bg-inset/50` outside a card, `border-t`, `divide-y`, stray `rounded-md border`),
then confirmed by looking at the rendered screenshot, not just the source diff. Changed:
- **Permissions** — the two mode/allow-list cards merged their two-tone `border-t` split
  into one level-1 card; folder rows are level-2 (were a one-off `border-edge bg-well`).
- **Specialists** — both cards (tiers, roster) dropped `divide-y` row dividers for one
  level-1 card each; model pickers now match the shared level-2 trigger.
- **Local models** — the "Models" and "Other local apps" cards are level-1; each model/app
  row and the quant-download row inside them are level-2 (were flat `bg-inset/50`/`bg-well`
  rows with no consistent card around them).
- **Cloud providers** — each provider row is now level-1 (was a one-off `bg-inset/50` row).
- **Account** — the GitHub-connected card dropped its extra border (now level-1, matching
  every other first-level card instead of standing out with its own outline); the
  handle-change confirm box is level-2.
- **Sync setup wizard / add-backup flow** — the backend-type picker buttons, the iCloud-path
  and duplicate-destination notes, the `gh install` command chips, and the prerequisite rows
  all moved off one-off tints onto level-1/level-2.
- **Appearance** — the four hint/disabled-reason boxes (non-grid parts) are level-2.
- **Remote Access** — the "Add Device" QR panel is now level-1, matching the rest of the
  popup (the desktop-only piece; two Android-only surfaces were left untouched and are noted
  below).
- **Settings list/drawer, Sound & Notifications, About, Preferences, Development (+ bug
  report), Keyboard Shortcuts, Buddy settings, Donate, Remote Access's main status/Server/
  Tailscale blocks** — checked by reading the rendered screenshot in all three themes; these
  were already built from `SettingRow`/level-1 cards with no full-width lines or stray
  one-off boxes, so nothing needed to change. "Remove helper" in Buddy settings is a real
  `Button variant="ghost"` (not primary/secondary/danger, but a genuine Button component, not
  a hand-rolled look-alike).

**Self-check — every "after" picture, 21 screens.** Looked at all 63 (21 screens × 3
themes: midnight in full, light and meadow-mist spot-checked per changed screen, since the
same CSS classes render the same shape across themes and midnight's higher contrast makes
mistakes easiest to spot). All pass the six questions plus the seventh (no loose text
outside a card): consistent first-level cards, consistent nested boxes, no full-width lines,
no fake buttons or empty-looking boxes, same groups/order as before, nothing broken, no
floating text. The clearest before/after proof is `settings-backup-sync.png` for Fix 1.

**Left honestly inconsistent / not fully verified:**
- The `remote-access-connected` capture (a `?remote=connected` mock flag) renders identically
  to the plain "not set up" shot — the flag doesn't appear to change the mock's rendered
  state, so the "connected client" sub-state wasn't visually distinguishable in this capture
  run. Not a styling regression (both before and after are equally affected, and I didn't
  touch that mock logic) — just a capture-completeness gap.
- Bug report's all-caps "INCLUDE WITH TICKET" label is a separate, pre-existing typography
  quirk, not a card-level issue — left alone as out of scope.
- Two Android-only surfaces were explicitly NOT touched: the "Package Tier" picker and
  Android's own manual "Add Device" form in `SettingsPanel.tsx` — out of scope for this
  desktop-focused pass.
- The 8 pre-existing `ast-grep` failures in `App.tsx`/`main.ts` from Round 1 remain,
  confirmed still unrelated to this round's diff.

**Verification.** `bash scripts/verify.sh <app-worktree> --full`: types, tests, knip, lint,
design-lint pass. Two line-budget ceilings (`SyncPanel.tsx` at 2104, `SettingsPanel.tsx` at
3203) needed trimmed comments to stay under; both are now exactly at budget, so either file's
next edit needs to stay line-neutral or the budget bumped.

**Captures.**
- Before: `scratch/before2/shots-card-levels-sweep-plan/{midnight,light,meadow-mist}/*.png`
  (63 files; built from `youcoded-dev/worktrees/sessions/ui-consistency-audit/youcoded`)
- After: `scratch/after2/shots-card-levels-sweep-plan/{midnight,light,meadow-mist}/*.png`
  (63 files; this branch)
- Screen names match the popup/state list above (e.g. `settings-backup-sync`, `sync-error`,
  `sync-oversize-open`, `assistant-permissions`, `assistant-specialists`, `assistant-local`,
  `assistant-cloud`, `account`, `appearance`, `remote-access`, `remote-access-connected`,
  `sync-setup-wizard`, `settings-drawer`, `sound`, `about`, `preferences`, `development`,
  `bug-report`, `keyboard-shortcuts`, `buddy`, `donate`).
