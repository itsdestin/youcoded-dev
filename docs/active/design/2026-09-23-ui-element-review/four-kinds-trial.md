---
status: draft
date: 2026-09-26
related: docs/active/design/2026-09-23-ui-element-review/{decisions.md,audit/unit-vocabulary.md,batch2-changes.md}
branch: session/ui-four-kinds (youcoded), session/ui-four-kinds (youcoded-dev)
---

# Four-kinds trial — every Settings popup rebuilt to the rule

Trial only. Not approved. Destin asked for before/after pictures of every Settings screen
before deciding whether to keep this. Branch is separate from `session/ui-consistency-audit`
(which it starts from) so it can be thrown away with no effect on the approved work.

**The rule, exactly as applied:** every Settings-family screen is built from four kinds of
unit only — a small grey label, a row (title + hint left, control right; switches, dropdowns,
tab strips, inputs and small tags live inside a row), the one tinted notice box (with its
buttons inside, at the right), and buttons (filled main / outlined secondary / full-width
outlined follow-up). No wrapper cards, no card-inside-a-card, no icon-disc cards, no
hand-rolled chip tabs or tables, no one-off boxes. Lists of things (devices, backups,
providers, models, specialists) became rows. Behaviour is unchanged everywhere — IPC calls,
state, error handling, confirmations — only look and arrangement moved.

## New shared piece

`desktop/src/renderer/components/ui/SettingGroup.tsx` — the missing primitive
`unit-vocabulary.md` §5 flagged: a small label plus its rows, with **no border, no
background** — pure spacing (`space-y-1.5` under an optional `SectionLabel`). Exists so the
next screen reaches for this instead of hand-typing a `<div className="rounded-lg
bg-inset/50">` wrapper, which is exactly how the wrapper cards crept in originally.

Also extended `RowStatus` (`ui/SettingRow.tsx`) with a `tone` prop (`ok`/`warn`/`danger`/
`busy`/`idle`) that owns the five status-dot colours internally, so a caller states what a
status means instead of passing a raw Tailwind class. This was needed because every screen
below had a per-item status dot (device online/offline, backend healthy/failing, sync
syncing/error) that used to pass its own colour string into `RowStatus`, which the project's
design-lint reads as "restyling" the primitive from outside. `dotClassName` stays as an
escape hatch for anything `tone` cannot express yet.

## Per screen

| Screen | Kinds before | Kinds after | What changed |
|---|---|---|---|
| Backup & Sync (+ oversize/error) | 9–10 | **4** (label, row, notice, button) | Big bordered status card → one status row + toggle. Count-chip tabs (Devices/Projects/Conversations) → three fold-out rows, each opening to real rows (not a `<ul>`/`<table>`). Google Drive/backend "icon-disc cards" → plain rows with a leading icon and a small status dot. Faint text buttons → full-width outlined buttons. "Sync log" fold-out and the "too big to sync" notice were already correct and untouched. |
| Assistant settings → Local models | 12 | **4** | "Local engine" and "Models" wrapper cards removed — each is now a label plus flat rows. The engine's "Advanced" fold-out is now a sibling row, not nested inside a card. Model rows, download/interrupted/damaged states unchanged in shape (batch 2 already gave them the right notice boxes). |
| Assistant settings → Permissions | 5 | **4** (SectionLabel, FoldRow, Callout, Button) | Each folder went from its own bordered card to a shared fold-out row (`FoldRow`), count shown as a smaller number after the name. The "modes" and "always allowed" explanation boxes lost their `bg-inset/50` card wrapper — now plain label + prose + rows. "Revoke all N" changed from a borderless (ghost) button to outlined. |
| Assistant settings → Specialists | 7 | **4** | Both wrapper cards (tier picker, roster) removed — labels plus flat rows. Roster rows and tier rows now carry their own row background (previously borrowed from the removed card). Refresh/Open folder buttons changed from borderless to outlined. |
| Remote Access (+ setup states) | 7 | **4** | Consolidated 15 call sites of the separate `StatusStrip` component into one shared status row (`RemoteStatusRow`, built from `SettingRow`+`RowStatus`) — one fewer *kind* of unit on this screen, not just fewer lines. The password field, "Server" group and device list were already fixed in earlier batches. The "Add Device" sub-panel lost its boxed-card background; ghost buttons (Unpair, device Remove, "Not now"/"Remove helper" on the Buddy Floater popup which shares this file) became outlined. The setup banner's exact final shape is still the one thing Destin has not ruled on (`settings-pieces#P-7`) — it is now the flattest honest version, same as before this trial, not a new ruling. |
| Assistant settings → Cloud providers | ~7 (by the exploratory count) | **~2–3 already** | Re-checked directly: each provider (Claude Code/ChatGPT/OpenRouter) is one `ProviderRow` — same tinted-row geometry as `SettingRow`, just with extra slots (a detail line, plan bars, an account button) `SettingRow` doesn't have room for. No wrapper card groups them; they render in a plain sequence. Only cleanup needed: two spaced-caps labels → `SectionLabel`. |
| Assistant settings → General | ~6 (by the exploratory count) | **already flat** | Confirmed unchanged from fix batch 1 — `FieldRow`/`SettingRow` rows only, no wrapper card. Not touched. |
| Account | not previously counted | **label, row, button** (+ an established in-place confirm box, see below) | Three group headings and two field labels still used the old spaced-capitals class (this file predated fix batch 1) — moved to `SectionLabel`/plain field-label style. |
| Settings list/drawer (incl. Android's Connect-to-Desktop) | 2 | **2**, unchanged shape | Two leftover spaced-caps headings and one ghost button on Android's "Connect to Desktop" screen fixed to match the rest of the app. |
| Buddy Floater popup | already row+notice+button | unchanged shape | Two ghost buttons ("Not now", "Remove helper") → outlined, for consistency with the rest of this trial's button rule. |
| Sound & Notifications, Claude Code Preferences, Development (+ bug report), About | 5 / 5 / 3 / 2 (exploratory count) | **unchanged** | Re-checked: their "5" included switches/tab strips/radios *inside* a row, which the final rule does not count separately. Already label+row(+button); nothing to flatten. One ghost "Remove" (custom sound) → outlined. |

**Could not fit / judgement calls:**
- Remote Access's top setup banner has no Destin ruling yet on its final shape (flattened per
  the existing provisional note, not decided here).
- Two destructive-confirm sub-boxes (Account's handle-change and delete-account, Permissions'
  and Providers' "remove" confirms) stay as the app's established in-place-confirm pattern
  (tinted box, Cancel/Confirm side by side) rather than being forced into `Callout` — they
  are a single control's own confirm step, not a notice about something else, and every
  other screen in the app already does it this way.
- `dotColorForState`'s old `'stale'` case used a yellow not among the design guide's four
  status hues; it now reads as `warn` (amber) — a harmonisation, not a new rule.

## Verification

`bash scripts/verify.sh <worktree>` then `--full`: types, full test suite (11,981 passed, 44
skipped, 0 failed), knip, oxlint, and design-lint all **PASS**. Design-lint's warning ceiling
was *lowered* (542 → 529) because this pass fixed more pre-existing warnings than it
introduced (net −8 project-wide after the `RowStatus.tone` fix removed both the new
restyle warnings this trial's own edits caused and several pre-existing ones on the same
pattern). `knip-baseline.json`'s `types` ceiling also dropped 189 → 188.

One **pre-existing, unrelated** `ast-grep` finding remains: `artifact-provider-stable-store`
against `App.tsx` (a file this trial never touched). Confirmed environmental, not a
regression: `App.tsx` is byte-identical between this branch and the read-only
`ui-consistency-audit` worktree, and that rule does not exist at all in that worktree's
`scripts/ast-grep/rules/` — a workspace-checkout version gap (this session's `workspace-start`
fetched `origin/master`, which is behind the audit branch's own workspace state), not
something this trial introduced or is scoped to fix.

Also found and fixed in passing (both pre-existing, unrelated to the four-kinds rule itself):
a stale `QuitSessionsPrompt.tsx` ignore entry in `no-hand-rolled-setting-row-toggle.yml` for a
file that no longer exists (renamed to `CloseSessionPrompt.tsx` long ago, never cleaned up),
and the exemption-table drift that removing SyncPanel's/PermissionsSection's hand-rolled
patterns exposed.

## Screens this trial did not touch

Tool cards, permission prompts and the terminal are explicitly out of scope per the design
guide's "Not covered yet" and this task's brief.
