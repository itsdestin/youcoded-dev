---
status: active
date: 2026-07-19
owner: Destin (decisions) / Claude (execution)
subject: Resuming the UI consistency sweep after tranche 2
---

# Handoff — UI consistency, resuming at tranche 3

Tranche 2 is **complete and merged**. This is what the next session needs to know, written
because three separate scope surprises in tranches 1–2 all came from trusting the spec's own
numbers.

## State

| | |
|---|---|
| Tranche 0+1 (tokens, primitives, buttons 1–14) | shipped — youcoded PR #164, `31900a2f` |
| Tranche 2 button half (52–76) | shipped — PR #181, `2bf29a44` |
| Tranche 2 input half (15–17, 19–21, 42, 77) | shipped — PR #183, `d0c646b7` |
| Change 78 (folder picker) | **deferred** — feature, not migration (spec §11.10) |
| Tranches 3–8 | not started |

Working tree clean, no worktrees open, master at `d0c646b7`. Implementation logs: spec **§10**
(tranche 0+1), **§11** (buttons), **§13** (inputs).

## Start here, not with implementation

**The spec has understated scope three times.** §10.7 said "~25–30 remaining hand-rolled buttons"
— it was ~153. It said "changes 1–14 are done" — four files still held ~21 hand-rolled buttons.
§11.9 listed ~10 InputGroup sites — three didn't exist in that shape and one referenced a field
that doesn't exist at all.

Tranche 3 looks like the same shape. Changes 22–25 read as a handful of named components
(SkillCard, MarketplaceCard, EngineCard), but raw greps suggest a much wider surface:

| change | what it says | grep UPPER BOUND (unverified) |
|---|---|---|
| 22 | SkillCard/theme tiles/file cards `bg-panel border` → `.layer-surface` | ~58 `bg-panel`+border sites |
| 23 | hex strips `#4CAF50`/`#66AAFF`/`#f0ad4e` die | 21 occurrences |
| 24 | "one of the app's last 3 neutral stock-palette leaks" | 3 ✓ (the only figure that matches) |
| 25 | EngineCard `bg-well` → the SettingsRow surface | ~54 `bg-well` sites |

**These are upper bounds from greps, deliberately not presented as counts.** The whole lesson of
tranches 1–2 is that a grep can't tell you a cited line is a `<p>`, that a branch has no callers,
that a "done" file isn't, or that a submit belongs to three fields rather than one. Every one of
those was found by reading code at the edit site.

So: **first task of the next session is an audit, not an edit.** Produce a real per-site inventory
for changes 22–25 the way §11.1 did for buttons, and expect the ledger to need corrections before
any code moves.

## Decision waiting on Destin — the contrast fix

Reported twice from two screens (Meadow Mist: the CompactingCard subtitle, then the Appearance row
descriptions). Full analysis in **spec §12**; roadmap entry filed.

The finding that matters: **`fg-faint` on a raised surface fails in 11 of 11 shipped themes**
(4 built-in + 7 community; best 2.31:1, worst 1.24:1). It has never worked. `fg-muted` on `inset`
fails in 9 of 11. Most of the app is not on `canvas` — `.layer-surface` paints `panel` under 55
`OverlayPanel` usages, `.settings-drawer` under all of Settings, and the assistant bubble paints
`inset` under every message and ToolCard. The audit checks `canvas` only.

**The fork Destin needs to pick:**

- **(a) Blanket override** — one rule in the `.layer-surface` family lifts `fg-muted` to `fg-dim`
  across all 55 overlay sites. Cheap, no component churn. Downside: also lifts the `·` separators,
  timestamps, and placeholders that are *supposed* to recede.
- **(b) Split the token** — `fg-faint` stays genuinely decorative; substantive secondary text gets
  its own token. More correct, more work, touches theme manifests.

Recommended approach: build a mockup showing both across Meadow Mist, Cotton Candy Sky and a dark
theme, using the real `SettingsRow` / `CompactingCard` / `UsageCard` / `StatusBar` pills — the
ui-mockup workflow every prior design call in this project used. Destin picks by number.

Fallback if he'd rather skip the mockup round: (a) for `fg-muted` only, leaving `fg-faint` alone.
Fixes both reported screenshots, touches no theme files, lifts nothing meant to recede.

Highest-leverage first fixes regardless of which way it goes:
`SettingsRow.tsx:34` (one line, **18 call sites**, fixes the reported screenshot) →
`ui/states.tsx:119` (same bug in a shared primitive with ZERO call sites — free now, multiplies
later) → the `.layer-surface` descendant rule → `StatusBar`'s ~15 faint pills.

**Unverified mechanism to check before relying on it:** `.layer-surface` already precedents
descendant overrides at `globals.css:827` (the protection cascade), so a sibling rule could cover
all 55 overlay sites with no component churn. It must respect the same layered-vs-unlayered
ordering trap §9.K documents, and needs separate rules for `.settings-drawer` and the bubble.

Neither option models **glass**. Every figure in §12 is flat-token math; wallpaper themes
composite `panel` toward a photograph, so real ratios are worse and vary by wallpaper.

## Queued for Destin's eye (~5 minutes, needs a dev instance)

1. Four fields went 14px → 12px in tranche 2 — a visible shrink on two marketplace search boxes.
   The field scale is 12/11px by design and 14px was off-scale, so this is correct-by-spec, but
   it's the most visible change in PR #183.
2. `panel-glass` nav chips ("Your Library"/"Marketplace") and ThemeScreen's "Browse Theme
   Marketplace" lost resting fills when decision 60 collapsed filled-grey to outline.
3. A sync toggle now reads `cursor-not-allowed` where it read `cursor-wait` while provisioning
   (busy ≠ forbidden — minor, but the primitive's disabled variant wins the cascade).

AccountSection's Save height mismatch is **structurally resolved** — those buttons now live inside
the field's own wrapper, so there's no adjacent-height comparison left to fail.

## Residue (small, deliberate, don't "discover" these again)

- `QuickChips.tsx:374` and `RatingSubmitModal.tsx:345` — two plain `Cancel` text buttons the BUTTON
  half missed. Both `text-[10px]`; nearest primitive step is 11px, so migrating them is a visual
  change Destin hasn't seen. Left rather than silently resized.
- `SyncSetupWizard.tsx:67` and `:925` — two hardcoded-blue spinners. Arguably covered by "status
  colors stay hardcoded", though a spinner isn't really a status color.
- `SessionDrawer.tsx:373` — the one remaining native `<select>`, folding into `FileFilterPopover`
  under change 38. Intentional.
- `SessionStrip.tsx:80` — a `red: '#DD4444'` palette constant feeding status dots. Status colors
  stay hardcoded per the project rule; not a change-17 target.
- Halftone Dimension's dead `.send-btn` selector (`wecoded-themes`) — matches nothing in the
  renderer; the glow comes from its `.bg-accent` rule.

## Process notes worth acting on

**The `audit-ui-tokens` grep-ban (spec §8) is still unapproved and would have caught three misses.**
Change 62's third Create button, `index.tsx`'s hardcoded blue, and `App.tsx`'s third
skip-permissions warning string were all *the third copy of a pattern where two got migrated*.
None were findable by the greps being used. **This app has a habit of three copies; two is never
the answer.** Highest-value item on the guardrails list.

**ESLint does not exist in this repo** — no config, no lint script, verified 2026-07-19. §8 lists an
"ESLint guardrail" as if it were a rule to add; it is actually *adopt ESLint from zero*. Size it
accordingly. The rule that motivated it: `{/* … */}` placed between `cond && (` and its element is
a **syntax error**, not a comment. It was in all six agent briefs and the author still made it
three times in one session. A rule that must be remembered will be forgotten.

**Parallel agents partitioned by file worked well** (6 agents, ~44 files, zero collisions). What
made it work: each brief named its exact file list, said edits outside it would collide, carried
the "never delete child content of a control you migrate" rule with the specific spinner incident,
and told agents to LEAVE anything ambiguous and report rather than guess. Every agent used that
escape hatch at least once, and each time it was the right call — that's where the §11.9
corrections came from.
