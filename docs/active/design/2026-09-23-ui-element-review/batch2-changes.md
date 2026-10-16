---
status: active
date: 2026-09-26
related: docs/active/design/2026-09-23-ui-element-review/decisions.md
---

# Fix batch 2 — what changed

Batch 1 was rejected as too shallow (`ui-fix-batch-1#B1-1…B1-7`). This batch rebuilds the
pieces Destin objected to, on the real screens, using his newer rulings from the
settings-pieces and pieces decks. Branch `session/ui-consistency-audit` in both repos,
pushed, not merged.

## New shared pieces (and where they are used)

| Piece | What it looks like | Used on |
|---|---|---|
| **Notice box** (`Callout`, updated) | The one tinted box for every warning, error and info note. It can now hold **its own buttons, inside the box at the right** (they drop to their own line, still on the right, when the box is narrow). Text inside is normal grey; only the box and the title carry colour — **no more red body text**, including the red tone. Titles grew from 10px to 12px to match the "too big to sync" reference box. | Backup & Sync (sync error, warnings list, conflict note), Local models (interrupted / damaged downloads, crashed engine), Specialists (per-specialist warnings), Remote Access (short-password note) |
| **Fold-out row** (`FoldRow`, new) | A boxed row like a setting, label on the left, arrow on the right that turns down when open; what opens sits directly under it. | Backup & Sync → Sync log |
| **"I understand" row** (`ConsentRow`, new) | The whole line is one tappable box, tick box on the left, lights up (accent border + tint) when ticked. | Skip Permissions popup |
| **Tinted pill** (`Pill`, new) | Small round label, normal case, colour only in the tint. | Specialists roster labels and warning counts |
| **Small label, reading version** (`SectionLabel reading`) | The 12px grey label with a soft underline under its words, for labels over reading text. | About, every explainer page (About Permissions, Remote Access / Sync / Specialists info) |

## Per screen — what the user will see

**Backup & Sync.** When sync fails, the top card still reads like a normal setting (dot,
"Couldn't sync", a grey "GitHub · account" line, the switch). Under it, inside the same card,
is a red-tinted box with the plain-language problem in grey text and **Show details** and
**Try again** inside the box at the right (plus **Connect GitHub…** when it is a sign-in
problem). Show details opens the raw error under the sentence; the buttons do not move.
"Sync now" and "Back up all now" are **full-width outlined buttons** (no underlined text);
"+ Add a backup" is the same height. **Sync log** is a boxed fold-out row with the arrow on the
right; its Refresh is an outlined button. The Warnings list uses the same notice box with its
buttons inside at the right. Rows sit 6px apart, groups 16px. The "too big to sync" box is
unchanged (it is the reference).

**Skip Permissions popup.** "I understand, and I use Skip Permissions at my own risk" is one
boxed, tappable line with the tick on the left; it lights up when ticked. "Turn it on" stays
greyed out until then. Stacked buttons unchanged (red on top, outlined Cancel under it).

**Remote Access.** **Generate is gone.** The password's **Set** is a small filled button inside
the box. "Saved" is grey, not green. The short-password note is a warning box. The top block is
no longer a box inside a box: the one-line intro is plain text, then the status strip ("Not set
up yet." + Set up) on its own. **This top block is provisional** — Destin has not chosen its
final look (`settings-pieces#P-7`, re-ask on the real screen). Keep awake untouched.

**Local models** (Settings and the first-run model step, which reuses the same rows). The
coloured strips across the top of model cards are gone. An interrupted download shows an amber
notice box inside its card titled "Download interrupted" with **Delete** (red outline) and
**Resume** (filled) inside it. A damaged download shows a red box "Damaged download" with the
explanation in plain grey (it used to hide behind an (i)) and Delete inside it. A download in
progress says "Downloading · 66% — …" above its bar. A failed Resume/Delete shows its reason
inside that same box. **Settings** and **Add vision (0.9 GB)** are outlined small buttons. A
crashed local engine shows a red box inside the engine card with **Restart engine** inside it.

**Specialists.** The intro now sits right under the "Specialists" heading (8px, was 16px).
Groups are 16px apart. "READ-ONLY" / "CAN EDIT & RUN COMMANDS" are tinted pills reading
"Read-only" / "Can edit & run commands". The count line reads "Available specialists 7" (smaller,
fainter number) with an amber "1 warning" pill. A specialist's warning is a small warning box in
its row (was amber text). "Clear" under a tier picker is an outlined button.

**Spaced-out capitals removed** (shared small label, 12px grey, normal case): Preferences
(Default permission mode, Editor mode, Output style, System prompt), Sound (Volume,
Notification), Themes (Favorited themes, Glass, Terminal), About (Disclaimer, Privacy, Licenses,
Policies — with the soft underline), every explainer heading (with the soft underline), and the
standalone "Local models" heading.

**Smallest text is 11px everywhere** (the 10px step). Checked at 1440×900, 1024×700, 700×900 and
390×844 against the same page at 10px: the status bar keeps the same rows (1.5px taller), the
session pills pack the same ("+10" either way), marketplace cards and chip rows show no new
wrapping or clipping, and no 11px text on the chat screen or marketplace wraps where it did not
at 10px. No fix was needed. The 9px step was not part of Destin's question and is unchanged.

## Guards and tests changed, and why

- `tests/callout-authority.test.tsx`: the "no action slot" premise is replaced by Destin's rule.
  New cases pin **grey body text in every tone** (proved: it goes red when danger text is put
  back to red) and **buttons inside the box after the text**. Exemption counts: SettingsPanel
  3→2 (Remote Access intro box removed), SyncPanel 4→2 (warnings list moved onto the notice box).
- `tests/status-strip-authority.test.tsx`: comments no longer claim a notice with a button must be
  a status strip.
- `tests/no-bare-disclosure.test.ts`: SyncPanel's two known bare dropdowns are gone; the
  exception list is now empty.
- `scripts/ast-grep/rules/no-hand-rolled-callout-tint.yml`: message updated; new fixture — a
  hand-rolled tinted notice *with* a button, which the old rule excused (expected fixture
  findings 423 → 424 in `check.sh`).
- `tests/SettingsPanel.test.tsx`: asserts Generate is absent and Set is filled.
- `tests/LocalModelsSection.test.tsx`: pins Resume/Delete inside the interrupted box, Delete and
  the plain explanation inside the damaged box, and the "Downloading · …" line.
- `PreferencesPopup.test.tsx`: new label wording.
- `line-budgets.json`: SyncPanel 2042→2104 (WHY comments + warnings list rework), globals.css
  2921→2927 (the 11px WHY comment), SettingsPanel 3211→3203 (shrank).
- `scripts/ui-review/plans/states-settings-repair.json` → `sync-show-details`: clicks the new
  Show details button (or the old one) so before and after both capture.
- The 2026-08-25 guide's "keep the status bar at 10px" note is marked superseded.

## Could not do / provisional / judgement calls

- **Remote Access top block** — flattened, provisional (see above).
- **"Download again"** for a damaged model: there is no one-click action for it today (the fix is
  "find it in search"), so the box says that in words and offers Delete only. No action invented.
- **Sync error header**: the header keeps the status title "Couldn't sync"; the box under it has
  the problem sentence without a repeated title. Nearest rule; Destin may prefer a title in the box.
- **Status dot + word → tinted pill** (Settings list "Sync Failing"/"Disabled", engine
  "Stopped/Running", device Online/Offline, Backup & Sync "All synced"): no shared pill existed
  before this batch, so per the brief these were **left as they are**. `Pill` now exists for a
  later pass.
- **Left alone, outside this batch's screens:** the phone's "Connected to X" green box
  (SettingsPanel), Remote Access "Add Device"/"Unpair", Android saved-devices labels (still
  spaced capitals), the backup rows' own red/green tint, fit colours like green "Runs fast",
  local models "Show all N" text button, the Theme screen's "Browse Theme Marketplace" text
  button, FirstTimeWarning's consent tick box (still the bare square), the 9px text step.

## No rule — nearest rule used

- **Notice box title size** (12px) — copied from the guide's reference box.
- **Consent row "lit" colour** — accent border + light accent tint (the app's selected-state
  colour), a shade stronger than an info notice so the two never look alike.
- **Pill tones for Specialists** — both capability labels share one accent tint (Destin earlier
  rejected colouring "can edit" as a hazard); only warnings are amber.
- **Pill shape** — fully round, like the session status pill the guide names; it is a label, not
  a control, so it does not follow the theme's control roundness.
- **Sync log Refresh** — follow-up action rule (full-width outlined).
- **Warnings list button order** — outlined buttons first, the filled fix last (far right), from
  the two-button rule.

## For the parent to capture (before/after)

| Plan | Shots |
|---|---|
| `sync-oversize-fix` | `sync-error`, `sync-auth-error`, `sync-retrying`, `sync-oversize`, `sync-oversize-open` |
| `states-settings-repair` | `sync-show-details`, `sync-log-open`, `remote-access-not-set-up`, `remote-access-setup-checking`, `remote-access-error` |
| `error-batch1` | `sync-retry-failed` (warnings list) |
| `states-remote-access` | `remote-not-set-up`, `remote-ready`, `remote-disabled`, `remote-error` |
| `assistant-settings` | `assistant-claude-skip-on` (tick the line for the lit state), `assistant-specialists`, `assistant-local`, `assistant-permissions-explainer` |
| `error-audit-current` | `mock-local-interrupted`, `mock-local-damaged`, `mock-local-resume-failure`, `mock-local-paused-after-resume` |
| `local-engine` | `local-engine-card` |
| `main` | `settings-backup-sync`, `settings-remote-access`, `settings-sound`, `settings-about`, `settings-appearance`, `preferences-config` |

## Verification

`bash scripts/verify.sh <worktree>/youcoded` then `--full`: types, tests (full suite: 819
files, 11,982 tests passed, 44 skipped), dead code, lint, design lint and ast-grep invariants —
all PASS. Desktop only: no Android (Kotlin) code changed; the shared React screens were not run
in the Android app. Eyeballed in one workbench (Midnight theme, 1440×900): the sync error with
details and the Sync log open, the ticked Skip Permissions line, interrupted and damaged model
rows, Specialists, Remote Access.
