---
status: draft
scope: Measured (not read-from-source) computed styles for every Settings-family popup, plus three comparison surfaces
date: 2026-09-27
---

# Card & spacing measurements — Settings family

**In plain language:** I opened every Settings screen in a running copy of the app and had
the browser itself report the exact numbers behind what you see — background colors, border
widths, rounded-corner amounts, padding, and the gaps between things — instead of guessing
from eyeballing screenshots. Bottom line: there are **8 different "boxed card" looks** and
**9 different text looks** in use across Settings, several genuinely by accident (same job,
different numbers). The good news: your favorite Backup & Sync card's recipe — dark-well
background, thin border, rounded corners — is already the single most-reused card style in
the app (used on 4 screens), it just isn't built as a shared, reusable piece yet, so each
screen that wants it has to retype the whole recipe by hand. Turning it into one shared piece
is the cleanest fix. Also new since the last review: the ALL-CAPS section labels ("VOLUME",
"INSTALLED") that used to be inconsistent have already been fixed app-wide — Settings no
longer uses them at all. Marketplace still does, and hasn't been migrated to match.

Method: a headless browser opened each screen in the real app (UI Workbench, not the live
app), read the computed CSS on every visible boxed element and every piece of text, and
photographed each screen. Screenshots: `scratch/card-measure/<screen>.png` (this worktree).
Raw per-screen data and the driver script are session-scratch, not committed (see Coverage).

## (a) Container ("card") styles

Excludes buttons and small pills/badges (those follow their own, mostly-consistent Button/Pill
recipe) — this table is only for boxes that **group other content**, which is what "the cards
look different" is actually about.

| Style | Background / glass | Border | Radius | Padding | Screens using it | Example className | Screenshot |
|---|---|---|---|---|---|---|---|
| **Card A — "Well card"** (the Backup & Sync candidate) | Solid `bg-well` (opaque dark, no glass/transparency) | 1px solid `border-edge` | 12px | 0 (rows inside supply their own) | 4: Permissions, Backup & Sync, Sync error, Git Review | `rounded-lg border border-edge bg-well overflow-hidden` | `scratch/card-measure/settings-backup-sync.png` |
| **Card B — "Inset field card"** | `bg-inset` (~50% opacity in some uses) | 1px `border-edge-dim` at 50% alpha | 12px | Varies: 0 / 8-12px / 4-10px depending on use | 8+: General, Cloud providers, Local models, Specialists, Remote Access, Session Files, Git Review | `bg-inset border border-edge-dim rounded-lg ...` (this is the shared `FieldRow` recipe, hand-copied) | `scratch/card-measure/assistant-local.png` |
| **Card C — Error callout** | `bg-destructive/10` | 1px `border-destructive/50` | 12px | 12px | 3: Local models, Backup & Sync, Sync error | `rounded-lg p-3 border bg-destructive/10 border-destructive/50` | `scratch/card-measure/sync-error.png` |
| **Card D — Warning callout** | `bg-amber-500/10` | 1px `border-amber-500/25` | 12px | 12px | 1: Local models | `rounded-lg p-3 border bg-amber-500/10 border-amber-500/25` | `scratch/card-measure/assistant-local.png` |
| **Card E — Success strip** | `bg-green-400/5` | 1px `border-green-400/20` | 12px | 10/12px | 2: Backup & Sync, Sync error | `rounded-lg border px-3 py-2.5 border-green-400/20 bg-green-400/5` | `scratch/card-measure/settings-backup-sync.png` |
| **Card F — Borderless status block** | `bg-inset` only | **none** (0px) | 12px | 10/12px | 1: Remote Access | `px-3 py-2.5 rounded-lg bg-inset flex items-center gap-3` | `scratch/card-measure/settings-remote-access.png` |
| **Card G — Bare divider row** | none | top-only, 1px `border-edge-dim` at 50% | 0 | 0 / 8-12px / 10px (3 different paddings for the same divider job) | 2: Permissions, Specialists | `border-t border-edge-dim` (+ inconsistent padding added per-use) | `scratch/card-measure/assistant-permissions.png` |
| **Card H — Theme swatch tile** | The theme's own preview color (expected to vary) | 12px, 1px border — translucent `border-edge-dim/50` normally, opaque `border-fg` when that theme is active | 12px | 0 | 1: Appearance | `group relative h-24 rounded-lg overflow-hidden border ...` | `scratch/card-measure/settings-appearance.png` |

**Comparison-surface-only style** (not in Settings, measured for contrast — see (g)):

| Style | Background | Border | Radius | Padding | Shadow | Where |
|---|---|---|---|---|---|---|
| **Card M — Marketplace nested box** | `rgb(22,27,34)` (its own `layer-surface` tone) | 1px `rgb(52,58,65)` | **16px** | 12px | **`0 8px 32px rgba(0,0,0,.1)`** | Marketplace detail's "What this can do" box |

Card M is the **only card in the entire sweep with a drop shadow**, and the only one at 16px
radius instead of Settings' 12px everywhere else — a small but real "different level of glass"
Destin flagged, confirmed with numbers.

**Total distinct grouping-card recipes measured: 8 within Settings, 9 counting the Marketplace
comparison card.**

## (b) Text styles

| Style | Size / weight | Case / tracking | Screens | Instances | Role | Example |
|---|---|---|---|---|---|---|
| **T1 — Popup title** | 16px / 600 | normal | 19 of 21 | 19 | Every dialog's own header title | "Assistant settings", "Sound & Notifications" |
| **T2 — Off-weight title** | 16px / **500** | normal | 2 | 3 | Settings **drawer's own** header + Marketplace's "Details" header — same size as T1, one weight lighter | "Settings", "Details" |
| **T3 — Row/page title** | 14px / 500 | normal | 9 | 25 | Drawer's 12 nav-row titles ("Account", "Appearance"…) and each Assistant-settings sub-page's repeated in-page heading | "Account", "Permissions" |
| **T4 — Field/group label** | 12px / 500 | normal | 16 | 139 | The single most-reused label anywhere: field titles, section labels ("Local engine", "Installed", "Permission modes"), theme names | "Default model", "Always allowed" |
| **T5 — Muted/unselected variant of T4** | 12px / 400 | normal, muted color | 9 | 48 | Same size as T4, lighter weight — used for the *unselected* state of the Assistant-settings side nav | "Cloud providers" (when not the active tab) |
| **T6 — Hint / description / value** | 11px / 400 | normal | 20 of 21 | 192 | The most-used text style overall: hints under fields, descriptions, status values ("30%", "Off", "Midnight") | "Sign in to like themes…" |
| **T7 — Small button/link label** | 11px / 500 | normal | 10 | 38 | One size smaller than T4 despite similar visual importance: inline text buttons and value labels | "Add key", "Settings", "Delete" |
| **T8 — Bold emphasis** | 14px / 700 | normal | 3 | 11 | Screen-specific bold call-outs | "Buy Me a Coffee" |
| **T9 — Uppercase eyebrow** | 14px / 400 | **uppercase**, 0.35px tracking | 1 (Marketplace only) | 3 | The *only* uppercase-transform text found anywhere in the sweep | "WHAT THIS CAN DO", "ABOUT" |

**Notable, evidenced finding:** none of the sampled Settings screens render an ALL-CAPS eyebrow
label anymore — every section label ("Volume", "Notification", "Installed", "Always allowed",
"Favorited themes", "Permission modes") measured as plain sentence case, 12px/500, muted color
(style T4). Reading the source confirms why: `components/ui/SectionLabel.tsx` is a **new
shared component** (added 2026-09-24) that deliberately retired the old
`text-3xs uppercase tracking-wider` eyebrow app-wide, and Settings' "fix batch 1" already
adopted it. **This part of the inconsistency is already fixed.** Marketplace's "WHAT THIS CAN
DO" box is the one surface in this sweep that still uses the old uppercase pattern — it hasn't
been migrated yet.

**Total distinct text recipes measured: 9.**

## (c) Spacing

| Value | Where seen | Role |
|---|---|---|
| 16px | 9 of 12 Settings popups + the drawer itself (`px-4 py-4`) | **Dominant** popup edge padding (edge of popup to first card) |
| 20px | Donate only (`p-5`) | Outlier edge padding |
| 32px (effective) | Development only (Dialog's own 16px **plus** a second hand-added `p-4` wrapper inside it) | Doubled edge padding — the only screen where content sits twice as far from the edge as every neighbor |
| 20px | Sound, About, Account (`space-y-5`) | Gap between top-level sections/cards inside a popup body |
| 16px | Appearance, Backup & Sync, Remote Access (`space-y-4`, one level in) | Gap between individual cards within a section |
| 8px | Settings drawer (`space-y-2`) | Gap between the drawer's 12 flat nav rows |
| 2px | Assistant settings nav rail | Gap between the 5 nav-rail buttons (very tight) |
| 6px | Session Files / Git Review file cards (`my-1.5`) | Gap between file-row cards — a **third**, tighter rhythm not used anywhere in Settings |
| 8px | Session Files / Git Review (`mx-2`) | Inset from panel edge to a file card — half of Settings' 16px |

## (d) Per-screen style mix

| Screen | Card styles present | Text styles present |
|---|---|---|
| Settings drawer | none (flat rows, no boxes) | T2 (own title), T3 (row titles), T6 (descriptions/values) |
| Account | Card B (connected-services button) | T1, T4, T6 |
| Assistant · General | Card B (field cards, search input) | T1, T3, T4, T5, T6, T7 |
| Assistant · Cloud providers | Card B (input), buttons only otherwise | T1, T3, T4, T5, T6, T7 |
| Assistant · Local models | Card B, C, D | T1, T3, T4, T5, T6, T7 |
| Assistant · Permissions | Card A, G | T1, T3, T4, T6 |
| Assistant · Specialists | Card G | T1, T3, T4, T6 |
| Assistant · Preferences | Card B (input) | T1, T4, T6 |
| Appearance | Card H (swatches) | T1, T4, T6 |
| Sound & Notifications | none boxed (flat rows + a radio list) | T1, T4, T6 |
| Backup & Sync | Card A, C, E | T1, T4, T6, dedicated 14/600 status word |
| Sync error | Card A, C, E | same as above |
| Remote Access | Card F | T1, T4, T6 |
| Development | none boxed | T1, T3, T6 |
| About | none boxed (wall of text) | T1, T4, T6 |
| Keyboard Shortcuts | none boxed (a 2-col grid) | T1, T6 |
| Buddy Floater | none boxed | T1, T4, T6 |
| Donate | none boxed | T1, T8 |
| **Session Files** (comparison) | Card B (file rows) | T4, T6, T8, large 24px file-type glyphs |
| **Git Review** (comparison) | Card A (diff box), Card B (file rows) | T4, T6, T8 |
| **Marketplace detail** (comparison) | Card M (its own recipe) | T1(ish, "Details"=T2), T9 (uppercase, unique to this screen), T6 |

## (e) The natural single-recipe candidate

**Card A — the "Well card"** (`rounded-lg border border-edge bg-well overflow-hidden`, 12px
radius, solid dark background, thin visible border, no glass/transparency, no shadow) is:

- the exact recipe behind the Backup & Sync top status card Destin liked,
- already the **most cross-screen-reused card style measured** (Permissions, Backup & Sync,
  Sync error, Git Review — 4 screens, 7 instances),
- not see-through (matches Destin's stated dislike of transparent/glassy cards — Card B, by
  contrast, is a translucent `bg-inset` fill).

**It is not backed by a shared component.** `components/ui/` has no `Card.tsx` — this exact
class string is hand-typed identically in four separate files: `DeliverablesCard.tsx`,
`PermissionsSection.tsx`, `SyncPanel.tsx`, and `tool-views/ChatsearchRefBlock.tsx`. Extracting
it into one shared `<Card>` component (the way `FieldRow.tsx` and `SettingRow.tsx` already
exist for other jobs) is the natural next step — every screen that currently hand-rolls a
"grouping box" would import it instead of retyping the recipe.

## (f) Hand-rolled cards (no shared component used)

Files that type out a full card recipe by hand instead of using a shared piece:

- **Card A's recipe** (`rounded-lg border border-edge bg-well overflow-hidden`): `DeliverablesCard.tsx`, `PermissionsSection.tsx`, `SyncPanel.tsx`, `tool-views/ChatsearchRefBlock.tsx` — 4 files, despite `FieldRow.tsx` and `SettingRow.tsx` already existing as the pattern to extend.
- **Card B's recipe** (`bg-inset/50 rounded-lg` field-card look, the *actual job* `FieldRow.tsx` exists to do): hand-typed independently in `AccountSection.tsx`, `assistant-settings/ContextSettings.tsx`, `assistant-settings/SessionNaming.tsx`, `LocalModelsSection.tsx`, `ModelProvidersPopup.tsx`, `project-view/tabs/ContextTab.tsx`, `ResumeBrowser.tsx`, `SettingsPanel.tsx`, `SpecialistReportCard.tsx`, `ui/SegmentedTabs.tsx`, `ui/states.tsx` — **11 files bypass the shared component that already exists for this exact look.**
- **Card F** (Remote Access's borderless status block) and **Card G** (bare dividers with 3 different paddings): each is its own one-off, no shared component to point to.

`SettingRow.tsx` (K2) is genuinely well-adopted — 29 files reference it — but it solves a
*different* job (a full title+hint+control+toggle row), not "a box that groups related rows,"
which is the specific complaint about card inconsistency.

## (g) Whole-popup layout — the cross-screen comparison

This is the part that shows how screens relate to each other, not just what's inside one of
them.

| Screen | Popup size | Edge padding (edge→first card) | Header height | Card/section gap | Columns | Alignment |
|---|---|---|---|---|---|---|
| Settings drawer | 320×900, docked left | 16px | **52px** | 8px (12 flat rows) | 1 | Rows flush with header title |
| Account | 420×316 ("panel") | 16px | 56px | 20px | 1 | Flush |
| Assistant settings (all 5 pages) | 820×700 ("wide") | 16px (content col only) | 56px | 20px→16px (nested) | **2** — 176px nav rail + content, **0px gutter** between them | Content cards start at the rail's own right edge, no breathing margin — the one screen with a hard seam instead of a gap |
| Appearance | 420×588 | 16px | 56px | 20px→16px | 1 | Flush |
| Sound & Notifications | 420×588 | 16px | 56px | 20px | 1 | Flush |
| Backup & Sync / Sync error | 420×588 | 16px | 56px | 20px→16px | 1 | Flush |
| Remote Access | 420×588 | 16px | 56px | 20px→16px | 1 | Flush |
| Development | 420×503 | **32px** (doubled — see (c)) | 56px | 20px | 1 | Content sits noticeably further from the edge than every sibling popup |
| About | 420×588 | 16px | 56px | 20px | 1 | Flush |
| Keyboard Shortcuts | 420×461 | 16px | 56px | n/a (one grid) | 1 | Flush |
| Buddy Floater | 340×202 ("prompt") | 16px | 56px | 8px | 1 | Flush |
| Donate | 340×218 | **20px** (`p-5`, opts out of the shared 16px) | 56px | 16px | 1 | Flush |
| **Session Files** (comparison) | 480×747, docked **right** | 8px | 56px | 6px | 1 | Flush, but a visibly tighter rhythm than every Settings popup |
| **Git Review** (comparison) | same 480×747 panel | 0px (its own sub-header, no popup chrome) | **41px** (its own mini-header, not the 56px Dialog header) | n/a | **2** — 210px file list + content, 0px gutter | Flush to the panel, same "hard seam" two-column pattern as Assistant settings |
| **Marketplace detail** (comparison) | 1312×772, near-fullscreen | **24px** (`p-6`, not 16px) | 60px | n/a | 1, but **centered** 768px-max-width column with large auto margins on both sides | The only screen where card edges do **not** line up with the popup's own physical edge — they line up with an invisible centered column instead |

**What this table shows, in one line:** every single-column Settings popup already agrees on
16px edge padding, a 56px header, and roughly a 20px→16px section rhythm — that part is more
consistent than it looks. The real structural outliers are Development (padding literally
doubled by an accidental extra wrapper), Donate (opted out to 20px on purpose), and the two
places that split into two columns with **zero** gutter between them (Assistant settings,
Git Review) — both read as a hard seam rather than a designed two-pane layout. Marketplace is
the outlier of the whole set: bigger inset (24px vs 16px), a taller header (60px vs 56px), and
the only surface anywhere in the app that centers its content instead of keeping it flush to
the left edge the way every Settings screen and both docked side-panels do.

## Coverage

Screens measured (headless browser, computed CSS + one screenshot each), the UI Workbench,
`meadow-mist` theme requested but not honored by this route — actual captures rendered in the
workbench's default **Midnight** theme (colors above are Midnight's values; the structural
findings — radius, padding, gaps, weights, transforms — are theme-independent):
Settings drawer; Account; Assistant settings — General, Cloud providers, Local models,
Permissions, Specialists, Preferences; Appearance; Sound & Notifications; Backup & Sync
(normal + a forced sync-error state); Remote Access; Development; About; Keyboard Shortcuts;
Buddy Floater; Donate; and, for cross-surface comparison, Session Files, Git Review, and
Marketplace detail.

**Not covered**: Help & Feedback, the sync setup wizard, OpenRouter sign-in, the model picker
dropdown, and modal-on-modal confirms (Skip Permissions Mode, etc.) — all named in the prior
`settings-screens.md` source-reading audit but out of scope for this pass's screen list and
20-screen budget. Narrow/phone-width layouts were not sampled (desktop 1440×900 only). This
audit is a live-measured supplement to `settings-screens.md` (2026-09-23) and
`spacing-composition.md`, not a replacement — where a number here differs from that earlier,
source-reading audit (the uppercase eyebrows, Development's exact padding mechanism), this
document's numbers come from the running app and should be treated as current.

Screenshots and the raw per-screen JSON live under `scratch/` (gitignored) in this worktree —
`scratch/card-measure/*.png` and the driver script's output — and were not committed.
