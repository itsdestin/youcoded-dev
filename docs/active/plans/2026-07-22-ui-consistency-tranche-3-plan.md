---
status: shipped
date: 2026-07-22
owner: Destin (decisions) / Claude (execution)
subject: Tranche 3 (cards, changes 22–25) implementation plan + proposed ordering for tranches 4–8
shipped: 2026-07-23 — MERGED to master via youcoded PR #245 (merge `dd3e5b30`). The branch carried tranches 3, 5 (31/32/34) and 7, plus Destin's review round (spec §17). Logs: spec §14.11, §15, §16, §17.
type: plan
roadmap: "ROADMAP.md — 'UI consistency system — shared primitives + the 51-change migration' (#ui, added 2026-07-16)"
spec: docs/active/specs/2026-07-16-ui-consistency-design-spec.md (audit in §14)
baseline: youcoded origin/master 82552cee (2026-07-22)
---

# Tranche 3 — implementation plan

Reconciled against the **§14 audit**, which read every cited site on master `82552cee`. Read §14
first; this plan assumes its five corrections. Do not re-derive the inventory from greps.

**Both rulings taken 2026-07-22** — §14.2: delete the dead branch. §14.7: stars stay hardcoded,
"Published successfully!" goes neutral. All 8 tasks executed; see spec §14.11 for the log.

## Shape

~11 edit sites, 8 files, one CSS guard. **One agent, one PR** — the six-agent partition tranche 2
needed is overkill here and would spend more on coordination than the work. The parallel-agents
shape stays queued for tranche 6 (change 35's ~594-site rename), where it fits.

Order matters: task 1 lands the guard before task 3 adds a fifth scale-lift site.

---

## Task 1 — `@media (hover: hover)` guard (do this first)

**File:** `youcoded/desktop/src/renderer/styles/globals.css`

`globals.css` has no `@media (hover: hover)` block (verified — only two `@media (pointer: coarse)`
blocks at `:955` and `:1250`). Three cards already ship an unguarded `hover:scale-[1.02]`:
`MarketplaceCard.tsx:241`, `FilesTab.tsx:362`, `FilesTab.tsx:566`. On the Android WebView a tap
leaves hover stuck, so those cards stay scaled after touch.

Add a rule that neutralizes the transform where hover isn't real, next to the coarse-pointer section
so the two touch accommodations sit together. WHY comment must name §9.E and the sticky-hover reason.

**Verify:** `grep -n "hover: hover" styles/globals.css` returns the new block; `npm run build`
passes. Android sticky-hover itself is a Destin-eyeball item, not a scripted check (see Handoff).

**This retro-fixes a pre-existing Android defect** — call it out in the PR description as a behavior
fix, not a no-op.

---

## Task 2 — SkillCard dead-branch deletion  ✅ **DECIDED 2026-07-22 — delete**

**File:** `components/SkillCard.tsx`

`SkillCard`'s only importer is `CommandDrawer.tsx:166`, which passes no `variant` → `'drawer'`.
Lines **123–186** (`variant === 'marketplace'`) are unreachable, as are the `self` and `marketplace`
keys in `sourceBadgeStyles` (`:37`, `:39`) — `SourceTag` never indexes them.

Remove `:123–186`, the two dead map keys, and any imports that fall out (`StarRating`,
`useMarketplaceStats`, `Button` — check each; `FavoriteStar` is still used by the drawer variant).
The `variant`, `installed`, `updateAvailable`, `onInstall`, `installing` props and their
`skillCardPropsEqual` comparisons all become dead with the branch — remove them from `Props` and the
comparator too, or the next session re-discovers a component with five props nothing passes.

Deleting first makes tasks 3 and 4 roughly half the size.

**Verify:** `npx tsc --noEmit` clean; `grep -rn "SkillCard" desktop/src` still shows exactly one
importer; the drawer renders skills (dev instance).

---

## Task 3 — the drawer card grid (change 22)

**Files:** `components/SkillCard.tsx`, `components/CommandDrawer.tsx`

All three species render in the same grid — migrate together or the grid splits (§14.3).

| site | today | after |
|---|---|---|
| `SkillCard.tsx:199` | `relative bg-panel border border-edge-dim rounded-lg p-3 hover:bg-inset hover:border-edge transition-colors` | `relative layer-surface !rounded-lg p-3 hover:bg-inset transition-colors` + `focus-visible:ring-2 focus-visible:ring-accent` + `style={{ boxShadow: 'none' }}` |
| `CommandDrawer.tsx:131` | `rounded-lg p-3 border border-edge-dim` + `bg-panel/80` / disabled `bg-panel/40` | same recipe; disabled state keeps `opacity-50 cursor-not-allowed` and drops its own bg |
| `CommandDrawer.tsx:348` | `bg-panel/40 border border-dashed border-edge rounded-lg p-3 hover:bg-inset hover:border-accent` | keeps the **dashed** border (it's the action affordance, not a skill) — adopt only radius/padding/hover/focus so it still sits flush in the grid |

**The `!rounded-lg` + `boxShadow:'none'` overrides are not optional** — `.layer-surface` is
`--radius-xl` with a `0 8px 32px` shadow (`globals.css:858–867`), and Destin rejected mixed elevation
in a card grid on 2026-07-08. `FilesTab.tsx:362` is the precedent to copy verbatim. If Destin
actually wants elevated cards, that's a mockup round before this task, not a silent default.

The drawer variant keeps `hover:bg-inset` (no scale lift) — per change 22's own text.

**Do NOT touch:** `ContextTab.tsx:129`, `ConversationsTab.tsx:48` (documented NOT-layer-surface —
`overflow:hidden` clips their text), `FilesTab.tsx:566/586/611` folder cards (deliberately `bg-panel`
to match `.layer-surface`), `FilesTab.tsx:362` (already migrated). §14.5 has the reasons.

**Verify:** `npm test` + `npm run build`; drawer grid eyeball in a dev instance (Destin, ~30s) —
all three tile species should be indistinguishable in geometry.

---

## Task 4 — SkillCard badges (change 23)

**File:** `components/SkillCard.tsx`

Live surface is two lines:

- `:36` `'youcoded-core': 'bg-[#4CAF50]/15 text-[#4CAF50] border border-[#4CAF50]/25'` → identity
  badge = accent pill `bg-accent/15 text-accent border-accent/30` (change 23's approved recipe; the
  blue-status alternative was offered and not taken).
- `:43` `prompt: 'bg-[#f0ad4e]/15 text-[#f0ad4e] border border-[#f0ad4e]/25'` → same accent pill.
  "Prompt" is an identity label, not a warning.

`PluginBadge` (`:61`) is already `bg-accent/10 text-accent border-accent/30` — nearly the target;
align the alpha so the two badge kinds match exactly.

`Get → Button primary sm` is **already done** (`:176`) and lives on the dead branch — nothing to do.

**Open ruling (§14.7):** `StarRating.tsx:67` + `RatingSubmitModal.tsx:66` (`#f0ad4e` star gold) and
`ShareSheet.tsx:129` (`#4CAF50` "Published successfully!"). Star gold is arguably brand rather than
status; the success line is arguably status. Both stay hardcoded unless Destin says otherwise.
Everything else in the 22-occurrence hex inventory belongs to StatusBar/SessionStrip (status,
exempt), GameLobby (change 47) or `cm-theme.ts` (change 36).

**Verify:** badges render on a drawer skill of each kind (YC / Prompt / plugin) — dev instance.

---

## Task 5 — the `locked` tone map (change 24), and its duplicate

**Files:** `components/marketplace/MarketplaceCard.tsx`, `components/marketplace/MarketplaceScreen.tsx`

- `MarketplaceCard.tsx:63` — `locked: 'bg-slate-500/10 text-fg-dim border border-slate-500/30'` →
  `'bg-inset/50 text-fg-dim border border-edge'`.
- `MarketplaceScreen.tsx:587` — a **second** near-duplicate `toneClass` map (§14.8). Delete it and
  import `STATUS_TONE_CLASS` from `MarketplaceCard`. Note the two maps already differ (`border` vs
  no `border`), so this is also a live inconsistency fix — check the detail overlay's pills still
  look right after the consolidation, since they gain the border keyword.

**Verify:** `grep -rnE "(bg|border)-(slate|gray|zinc|neutral|stone)-[0-9]" desktop/src/renderer`
returns only `SessionStrip.tsx:68` (exempt status dot) after tasks 5 and 6.

---

## Task 6 — the last two `bg-gray-950` (change 24)

**File:** `App.tsx:2533`, `:2539`

First-run loading + first-run shell → `bg-canvas`. These paint before the app chrome mounts, so a
stock near-black reads wrong on Light/Crème. Two-line change.

---

## Task 7 — the Local Models panel rows (change 25)

**Files:** `components/EngineCard.tsx`, `components/LocalModelsSection.tsx`

Three byte-identical class strings, all siblings in the same panel (§14.9). The ledger names one;
migrating one alone makes it the odd row out.

| site | today | after |
|---|---|---|
| `EngineCard.tsx:88` | `mt-2 rounded-lg border border-edge-dim bg-well px-3 py-2.5` | `mt-2 rounded-lg bg-inset/50 px-3 py-2.5` |
| `LocalModelsSection.tsx:195` ("Models") | `rounded-lg border border-edge-dim bg-well px-3 py-2.5` | `rounded-lg bg-inset/50 px-3 py-2.5` |
| `LocalModelsSection.tsx:670` ("Other local apps") | same | same |

Destination verified against `ProvidersSection.tsx:272` and `SettingsRow.tsx:27` — both
`bg-inset/50 … rounded-lg px-3 py-2.5`. Borderless is the point of the rule.

`EngineCard`'s header comment (`:4–5`) claims its idioms "mirror ProvidersSection's own rows" —
update it to say they now *are* that surface, or it becomes a stale claim the next session trusts.

**Do not** sweep the other `bg-well` sites (57 lines, 9 comment-only). They are inset surfaces —
QR frames, code wells, chip fills, hover targets — not in-panel rows.

---

## Task 8 — theme-tile focus ring (the only change-22 part that reaches ThemeScreen)

**File:** `components/ThemeScreen.tsx:171`

The tiles paint the *previewed* theme's tokens inline, so `.layer-surface` is wrong for them (§14.5).
But they are `role="button"` + `tabIndex={0}` and the file has **zero** `focus-visible:ring`
anywhere — keyboard users get no focus indication on the theme grid. Add
`focus-visible:ring-2 focus-visible:ring-accent focus:outline-none`.

**Verify:** Tab through the theme grid in a dev instance.

---

## Tranche-3 exit checks

- `cd youcoded/desktop && npm ci && npm test && npm run build`
- `npx tsc --noEmit`
- The JSX comment trap: `{/* … */}` between `cond && (` and its element is a **syntax error**. It
  bit the author three times in one session despite being in every brief. Expect it.
- Never delete child content of a control being migrated (the tranche-2 spinner incident).
- Anything ambiguous: **leave it and report**. Every time an agent used that escape hatch in tranche
  2 it was correct — that is where the §11.9 and §13.4 corrections came from.

---

# Proposed ordering, tranches 4–8

## The finding that should drive the order

**Seven primitives are shipped and have zero call sites.** Counted on master `82552cee`
(`<Primitive` occurrences outside `components/ui/`):

| primitive | call sites | tranche that adopts it |
|---|---|---|
| `ErrorState` / `EmptyState` / `LoadingState` (`states.tsx`) | **0** | 5 |
| `Toast` | **0** | 8 (change 44) |
| `SegmentedTabs` | **0** | 8 (change 45) |
| `Checkbox` | **0** | 7 (change 38) |
| `Radio` | **0** | 7 (change 39) |
| `AnchorTip` | **0** | 4 (change 28) |
| `ProgressBar` | 1 | 8 (change 46) |
| `CloseButton` | 31 | ✅ adopted |
| `InputGroup` | 25 | ✅ adopted |
| `Textarea` | 9 | ✅ adopted |

The build half of the workstream is largely done; the adoption half is not. **Order by "which
tranche turns dead primitives into live ones," not by ledger number.** Every unadopted primitive is
carrying cost (bundle, maintenance, and a false signal that the migration is further along than it is).

## Recommended order

**1. Tranche 5 — States (31–34).** Highest leverage, and it unblocks a second workstream.
`ErrorState`'s `general` mode is **already built** (`states.tsx:111–135`) and is verbatim the
"neutral card + destructive dot + Report bug / Diagnose with Claude" component that
`docs/error-message-standards.md` and the ROADMAP's "Misleading error messages — full audit +
replacement" item wait on. **Correction to the 2026-07-22 handoff's cross-workstream note:** the
error audit is not waiting for the component to be *designed or built* — it is waiting for the
component to be *adopted at call sites*. That makes tranche 5 cheaper than it reads and the
dependency shorter than assumed. Change 34 (`text-red-500` → `text-destructive`) is mechanical and
pairs naturally with it — note `EngineCard.tsx:125` still has a raw `text-red-500` today.

**2. Tranche 7 — Form controls (38–40).** Adopts `Checkbox` and `Radio` (0 sites each) and discharges
two items already recorded as residue: `SessionDrawer.tsx:373`'s last native `<select>` folds into
`FileFilterPopover` under change 38, and change 40 is now just "make the roundness slider
controlled" (`ThemeScreen.tsx:392`) after the §1.5 rescope. Change 38 is explicitly component
*reuse* — `FileFilterPopover` already contains the two Chips the drawer needs.

**3. Tranche 4 — Screens & navigation (26–30).** Adopts `AnchorTip` (0 sites) and change 30 is
code-only and pixel-identical (7 raw `layer-surface fixed z-[61]` popups + 2 hand-rolled `z-[9999]`
scrim blocks → `<Scrim>`/`<OverlayPanel>`). Ordered third because change 26 (the z-40 screen layer)
carries the one genuine regression risk in the remaining ledger — `ProjectView`'s `z-[8000]` was
deliberate ("above all other overlays") and 130 commits of project-view work have landed since the
spec was written. Audit that one before touching it.

**4. Tranche 8 — Session-8 additions (41–51).** Adopts `Toast`, `SegmentedTabs`, `ProgressBar`.
Change 41's `CloseButton` half is **already adopted** (31 sites) — re-audit before planning, the same
way §14 found change 22 half-shipped. Change 47 (games subtree) is self-contained and can be split
off as its own PR; it also clears 4 of the remaining hex sites.

**5. Tranche 6 — Type & tokens (35–37).** Last, deliberately. The tokens exist already
(`globals.css:225–231`: `--text-2xs/3xs/4xs`) but **594 raw `text-[Npx]` sites remain** — this is the
one genuinely large mechanical sweep left, and it is the only tranche that actually justifies the
six-agent file-partition shape. Running it last means it sweeps the *final* state of every file the
other tranches touched, instead of being invalidated by them. Two caveats: change 37 (creme.json's
failing `fg-muted`/`fg-faint`) is a **real legibility bug shipping today** — pull it out and ship it
early, independently, it is a two-value JSON fix; and change 36's link-token derivation should be
re-checked against the OKLCH solver that shipped 2026-07-20, which may have overtaken part of it.

## Two things to raise with Destin alongside the ordering

- **The `audit-ui-tokens` grep-ban (spec §8) is still unapproved** and would have caught three of
  tranche 2's misses and at least two of §14's (the duplicate `toneClass`, the two extra `bg-well`
  rows). It is the highest-value guardrail on the list and it is cheap. ESLint is a separate,
  larger decision — the repo has **no ESLint config and no lint script**, so §8's "ESLint guardrail"
  is *adopt ESLint from zero*, not *add a rule*.
- **The dead-code question is bigger than SkillCard.** Three dead-code sweeps merged 2026-07-21/22
  (#206, #207, #208) and none of them could see an unreachable JSX branch behind a defaulted prop, or
  seven primitives with zero call sites. If that class of dead code matters, it needs a different
  detector than export-level analysis.
