---
status: draft
date: 2026-09-27
related: docs/active/design/2026-09-23-ui-element-review/audit/card-measurements.md, decisions.md
---

# One-card trial — a single shared grouping card, in real code

**Branches:** `youcoded` app repo `session/ui-one-card` (based on `origin/session/ui-consistency-audit`,
pushed to `https://github.com/itsdestin/youcoded`); this workspace repo's own
`session/ui-one-card` (based on `origin/master`). Never merged by this session.

## What this is answering

A prior trial ("four kinds of unit", `session/ui-four-kinds`) removed Settings' grouping
cards entirely and was rejected on every screen — "completely destroyed visual hierarchy."
Destin's own lesson from that trial: a card that holds one idea (the sync card with its
warning inside; "Models" as one group) is what gives a screen its hierarchy — the fix was
never to remove the cards, it was to make them all look the SAME card. A second, separate
attempt did that with an outside CSS override and broke badly (every text line grew a box,
button labels vanished). This trial does it a third way: one real React component
(`SettingsCard`), swapped in for the hand-typed recipes it replaces, nothing else touched.

## What was built

**`desktop/src/renderer/components/ui/SettingsCard.tsx`** — the one grouping card. Opaque
fill via a single CSS variable (`--settings-card-bg`, default `var(--well)`), a real 1px
`border-edge`, 12px corners, `overflow-hidden`, no shadow, no blur, no transparency. Two
optional ways to fill it (`padded` for one plain block, `divided` for several bands
separated by one 1px rule) — or neither, when a screen's own conditional layout needs to
own its bands directly (used for every migration below, to keep the exact existing
band/divider structure instead of asking it to fit a new shape).

**`dev/workbench/proposals/settings-card-light.css`** — a workbench-only stylesheet that
sets *only* `[data-settings-card] { --settings-card-bg: var(--panel) }`, so the same build
renders the lighter fill under `?proposal=settings-card-light`. Verified with a direct
computed-style check (not just by eye): in Midnight the card's `background-color` measured
`rgb(22, 27, 34)` (`--panel`) under the proposal vs. the default `--well`; a pixel diff of
the cropped card region between the two builds in Light theme measured RMSE 0.027 (a real,
visible change) — the two fills are close tones in this app's palette in most themes, which
is why it can look subtle at a glance but is a real, correctly-wired swap.

**`desktop/tests/settings-card-authority.test.tsx`** — pins the component's own geometry
(opaque, bordered, one CSS variable for the fill, `padded`/`divided` behavior including "no
stray divider next to a band that didn't render") and an adoption guard: the four files
below must import `SettingsCard` and must not still contain the literal Card-A class string.

## Files changed, and what changed on each screen

**Round 1** unified the outer grouping cards. **Round 2** (this section added
2026-09-27, same day — Destin's follow-up: "several box looks WITHIN one popup,
and those remain") went back in for the rows *inside* those cards, which were
still each drawing their own second box. That needed one new piece: a `bare`
prop on `SettingRow`, `FieldRow` and `StatusStrip` — same component, same
behavior, just no fill/radius of its own, for exactly the case of "a row that
lives inside a SettingsCard."

| File | What the user sees now |
|---|---|
| `PermissionsSection.tsx` | The "Permission modes" card, "Always allowed" card, and every folder's own card now draw the identical bordered card (round 1). |
| `SyncPanel.tsx` | Backup & Sync's main status box is the shared component (round 1). "Additional backups" is now ONE SettingsCard too: the header row and each backend are bare divided rows — no more per-backend colour-tinted box — with "Add a backup"/"Back up all now" outside, below the card (round 2). |
| `SpecialistsSection.tsx` | The tiers card and the roster card carry the same border as every other Settings card (round 1). |
| `LocalModelsSection.tsx` | The "Models" and "Other local apps" cards match (round 1). Every installed/recommended/Hugging-Face model row, and every detected-endpoint row, lost its own box — `divide-y` inside the card instead (round 2). |
| `EngineCard.tsx` | "Local engine" is now its own SettingsCard (same look as "Models"), not a borderless box; every row inside it is bare (round 2). |
| `ProvidersSection.tsx` | The "Your own API keys" list (used on both Cloud providers and Local models) is one SettingsCard with bare divided rows; Add provider stays outside/below (round 2). |
| `ModelProvidersPopup.tsx` | Claude Code / ChatGPT / OpenRouter are bare rows in one SettingsCard on the Cloud providers page. Web search's card-in-a-card (its own box holding two more boxes) is one SettingsCard with bare divided rows (round 2). |
| `SettingsPanel.tsx` (Remote Access) | The setup-status banner, the Server settings group, the Devices list and the Tailscale group are SettingsCards with bare/divided rows; Add Device is a SettingsCard instead of its own hand-typed box (round 2). |
| `assistant-settings/ContextSettings.tsx`, `SessionNaming.tsx` | General page: "Context" and "Session naming" were the FieldRow recipe hand-typed as a `<section>` — now SettingsCard, wrapped by a plain `<section aria-label>` so the `region` accessibility role (asserted by a test) survives (round 2). |
| `assistant-settings/pages.tsx` | Assembles the Cloud providers page's two cards (round 2). |
| `DonateConfirm.tsx` | Popup body was 20px from the edge; now 16px like every sibling popup (round 1). |
| `development/DevelopmentPopup.tsx` | Own padding wrapper was doubling Dialog's inset (32px); now 16px like every sibling (round 1). |
| `assistant-settings/AssistantSettings.tsx` | Nav-rail/content split had a 0px gutter; a 12px `gap-3` now separates them (round 1). |
| `ui/SettingRow.tsx`, `ui/FieldRow.tsx`, `ui/StatusStrip.tsx` | New `bare` prop each (round 2) — see above. |

## Self-check against the checklist

Captured via `scripts/ui-review/shot.mjs` (this workspace's current self-verifying
screenshot driver — **`scripts/ui-review/run-review.sh`, named in the task brief, has been
retired on this branch's base** in favour of `scripts/shoot/`; `shot.mjs` is its
plan-JSON-compatible successor and still self-verifies every shot, so the same plan file
ran unmodified) against `scripts/ui-review/plans/zz-cardcmp.json` (copied into this
workspace, it did not exist here — 19 Settings-family shots), themes meadow-mist, light,
midnight, three passes run strictly one after another:

- **before** — the unmodified `ui-consistency-audit` youcoded checkout (read-only,
  never edited): 56/57 verified (1 pre-existing miss, `meadow-mist/settings-appearance`,
  a plan/theme timing issue on that unmodified checkout, unrelated to this trial)
- **after-dark** — this trial's youcoded checkout, default fill: 57/57 verified
- **after-light** — this trial's checkout with `?proposal=settings-card-light`: 57/57 verified

Checked by reading the captured images (Permissions, Backup & Sync, Specialists, Local
models, Cloud providers, Remote Access, Assistant General in Midnight and Light; Backup &
Sync and Local models also in meadow-mist) after round 2:

- (a) **No single line of text, bullet or hint has its own box** — pass on every screen
  checked. Permissions' folder-card-inside-a-card nesting is pre-existing, approved
  architecture (see round 1's note); unchanged.
- (b) **Every button still shows its label** — pass on every capture read.
- (c) **Same groups, same order** — pass. No group was added, removed, or reordered on any
  converted screen; only the box around it (or around a row inside it) changed.
- (d) **Nothing see-through** — pass, including meadow-mist: the card and its rows are a
  fully opaque solid fill in every theme checked.
- (e) **One card look per screen** — reached on every screen re-checked this round:
  Permissions 1, Specialists 1, Backup & Sync 2 (the sync-status card + the Additional-
  backups card — two cards, ONE look, plus tinted notices), Local models 3 (Local engine +
  Models + Other local apps — three cards, one look, plus a tinted "Download interrupted"
  notice riding inside its row), Cloud providers 2 (the built-in-sign-ins card + Your-own-
  API-keys card), Remote Access 4 (setup banner, Server, Devices, Tailscale — each its own
  card, same look; the Advanced row and the not-installed message stay flat single rows, not
  a card, matching how a lone item is treated everywhere else in Settings), General page 4
  (Default model / Default project folder / Context / Session naming). Every one of those
  counts is "N cards, 1 look" — the number of SEPARATE looks per screen is 1 in every case
  checked, plus tinted notice boxes where a notice exists.
- (f) **Consistent gaps** — still holds; unaffected by round 2's row-level changes.

## Left alone, and why (still true after round 2)

- **`StatusStrip.tsx`** keeps its filled look everywhere EXCEPT inside a SettingsCard, where
  its new `bare` prop is used (Remote Access's setup banner). Every other caller (games,
  chat, tool bodies) is untouched — restyling those was never asked for and isn't a Settings
  surface.
- **`RuntimeBinding.tsx`'s memory-warning card** is the chat-side model picker, not a
  Settings screen (confirmed by checking its callers: `ModelPicker.tsx`, buddy forms,
  `SessionStrip.tsx`, `FirstRunView.tsx` — no Settings page uses it). Out of scope, not
  merely deferred.
- **`SyncSetupWizard.tsx`'s two neutral notes** (the iCloud-path line, the duplicate-
  destination line) are single lines of informational text, not multi-row grouping cards —
  closer to `Callout`'s job than `SettingsCard`'s, and their existing look (a plain untinted
  `bg-inset/50` line) doesn't nest inside anything else. Not converted; flagged rather than
  silently left as-is with no note.
- **`DeliverablesCard.tsx`** and **`tool-views/ChatsearchRefBlock.tsx`** hand-type the same
  Card-A recipe but are chat-timeline surfaces, explicitly out of scope for both rounds.

## Verification

`bash scripts/verify.sh --full` on the youcoded worktree, after BOTH rounds: **types
(both configs), the full test suite, knip, lint and design lint all pass.**
`invariants (ast-grep)` still fails — on the same rules, entirely inside `App.tsx`, which
neither round touched. Re-confirmed pre-existing after round 2 the same way as round 1
(stash every change, re-run `scripts/ast-grep/check.sh` against the untouched base branch —
same two failures already present). Design lint's warning count is at 536, one BELOW the
537 baseline (round 2 also removed a hand-rolled `!important` override that was itself
flagged). `line-budgets.test.ts` required raising `SettingsPanel.tsx`'s budget 3203 → 3212 —
five hand-rolled box/flat-list recipes replaced by the shared component in one file; a
reviewed, explained growth, not drift (the test's own stated policy for this case).
`SyncPanel.tsx` grew too but landed exactly on its existing 2104 budget after trimming
comments, so no change was needed there. The adoption guard
(`settings-card-authority.test.tsx`) now covers all nine migrated files.

## Capture folders (this worktree, gitignored — recaptured after round 2)

- `scratch/card-recipe-trial/before/` — 57 PNGs, the unmodified `ui-consistency-audit` app
- `scratch/card-recipe-trial/after-dark/` — 57 PNGs, this trial, default (`--well`) fill
- `scratch/card-recipe-trial/after-light/` — 57 PNGs, this trial, `--panel` fill proposal

## Open question for Destin

Default fill (`--well`, closer to the canvas, thin border) or the light proposal
(`--panel`, a bit more separated from the canvas)? Verified both still render correctly
after round 2 (computed-style check + a pixel diff on the Local models card, RMSE 0.05 —
a real, visible difference in Light theme).
