---
status: active — D1 SHIPPED, K2 (Task 4) not started
extends: docs/active/specs/2026-07-26-menu-internals-design-system.md
branch: feat/menu-internals-tranche-1 (tranche 1 + 2 ship as ONE PR — Destin's call 2026-07-26)
---

# Menu Internals — Tranche 2 (the dialog shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

---

## STATUS (2026-07-26, end of session — read this first)

**Branch `feat/menu-internals-tranche-1` in the `youcoded` repo — 18 commits, all pushed, clean
tree. NOTHING IS MERGED. No PR is open.** Suite 3436 green, `tsc --noEmit` clean, `vite build`
clean. Tranche 1 and tranche 2 ship as ONE PR (Destin's call).

| | State |
|---|---|
| **Tranche 1** (K1, K8, Sound bug, K3, K10) | **DONE** — 6 commits, reviewed by Destin in a dev build, plus a 4-item rework of Sound he asked for |
| **Tranche 2 Task 1** `<Dialog>` | **DONE** |
| **Tranche 2 Task 2** 7 SettingsPopup callers | **DONE** — `SettingsPopup.tsx` deleted |
| **Tranche 2 Task 3** migrate the family | **DONE** — **40 dialogs across 22 files** |
| **Tranche 2 Task 4** K2 rows | **NOT STARTED** — decided (below), not written |
| **Bookkeeping** | **NOT DONE** — ROADMAP not flipped, docs not archived |
| **Tranche 3** | Not planned |

**Sizing was rebuilt twice after Destin pushed back, and the second version is what ships.** Do not
reintroduce the ladder. See spec §0b for the full amendment; the short version is that widths are
derived from reading measure (`prompt 340 / panel 420 / document 600`) and the height cap is 1.4x
the size's own width, never a `vh` fraction and never one flat number.

**Current bucket counts:** prompt 15 · panel 24 · document 1 · total 40.
`document` having exactly one member (the changelog) is a known smell — if nothing joins it, collapse
to two sizes and let the changelog carry a documented exception.

**Residue, all named in commit messages, none silent:**
- K1's classes still appear at other sizes on `text-4xs` micro-labels and the marketplace eyebrow
  headings — a design call, deliberately not made.
- `LoadingState` hardcodes the verb, so the Tailscale install reads "Loading Tailscale…". Wants an
  optional `verb` prop.
- `AccountSection`'s "Danger zone" is still an `<h4>` in a retired class order (it is red, so the K1
  guard does not catch it). Belongs with K9.
- `tests/session-meta-parity.test.ts` flakes when parallel workers race the shared test HOME.
  Pre-existing, not caused by this work.
- The confirm cards keep their own headers; D1 says "no untitled dialogs" but titling them is a copy
  decision, not a mechanical one.
- **Out of scope and unmigrated:** marketplace, project-view, game, git, tags, context-menu, buddy.
  `git/DiscardConfirmDialog.tsx` is an L3 destructive confirm — the same *kind* as the ones migrated,
  just on an excluded surface. Worth reconsidering.

**Guard tests added by this work:** `tests/dialog-shell.test.tsx` (11 assertions — render tests for
the shell, plus the adoption guard with a walked scope and an exemption list that fails if it rots),
`tests/section-label-authority.test.ts`, `tests/choice-group-authority.test.ts`,
`tests/sound-preview.test.ts`. Plus `tests/setup-dom.ts`, a vitest `setupFile` supplying the
`ResizeObserver` stub jsdom lacks — every `Dialog` runs `useScrollFade`, so without it a dozen
suites fail for a missing browser API rather than anything about the component.

### NEXT STEPS, in order

1. **Task 4 — K2 rows** (below, decided but unwritten). The last piece of tranche 2, and the change
   with the widest visual reach: every settings row in the app.
2. **Bookkeeping** — flip the ROADMAP entry, move both plan docs and the spec to `docs/archive/`,
   per "merge means merge AND push AND archive AND flip the roadmap item".
3. **Open the PR** on `itsdestin/youcoded` from `feat/menu-internals-tranche-1`.
4. **Tranche 3** — K4/K5/K6/K7/K9/K11/K12, gated on a copy pass. Not planned.

**Before doing anything, re-verify:** `cd worktrees/menu-tranche1/desktop && npm test && npx tsc
--noEmit`. The worktree is at `/home/destin/youcoded-dev/worktrees/menu-tranche1`. Do NOT relaunch
the built app; runtime checks go through `bash scripts/run-dev.sh feat/menu-internals-tranche-1
--label "Menu Tranche 1" --offset 100 --profile dev-menu1`.

---

**Goal:** Land D1 — one `<Dialog>` shell that owns scrim, centering, sizing, header, close **and the
scroll body** — then migrate the settings/status-bar dialog family onto it.

**Architecture:** `SettingsPopup.tsx` was the seed, but the spec's claim that it "is already correct"
is wrong in one specific way that tranche 1 proved empirically (see §Finding below). `<Dialog>` is
`SettingsPopup` with the body brought inside the component, CONTENT-DERIVED sizing replacing
free-form widths, and a fixed-height ban. Then callers migrate.

> **The "width ladder" language below is HISTORICAL.** The ladder was tried and rejected as circular
> — see §STATUS and spec §0b. Sizes are `prompt 340 / panel 420 / document 600`, derived from
> reading measure, and the height cap is 1.4x the size's own width.

**Tech Stack:** React 19 + TypeScript, Tailwind v4 semantic tokens, Vitest 4, Electron 41. The
renderer is shared with the Android WebView — everything here ships on both platforms.

---

## Finding that changes D1 (from tranche 1, 2026-07-26)

Spec §5 D1 says *"`SettingsPopup.tsx` is the seed — it is already correct, it just has 7 callers out
of ~42."* **It is not already correct.** It sets `maxHeight` on the panel but leaves the panel a
plain block, so every caller has to remember `className="flex flex-col"` and wrap its own
`scroll-fade` body. **Two of its seven callers forgot** — Sound and Session Defaults — and the
symptom is a dialog that silently clips its content with no way to scroll to the bottom. Destin hit
it in the Sound popup during the tranche-1 dev review.

A shell that can be held wrong by 2/7 of its own callers is not a shell. **`<Dialog>` must own the
scroll body**, not document it. This is the single most important change in this tranche and it is
not in the spec — the spec is amended by this plan.

## Measurements (against this branch, 2026-07-26)

| Thing | Count |
|---|---|
| Files hand-rolling `<OverlayPanel>` | 49 |
| Files using `<SettingsPopup>` | 7 |
| Distinct dialog widths | ~18 (`max-w-md` 20, `max-w-sm` 15, `max-w-xs` 8, + 12 bespoke `w-[…]`) |
| Distinct `max-h` values | 7 (`85vh` ×7, `80vh` ×6, `45vh`, `70vh`, `84vh`, `50vh`, `40%`) |
| Centering techniques | 2 (transform 27 files · flex-wrapper 5 files) |
| Banned fixed height | 1 — `ContextPopup.tsx:108` `h-[85vh]` when the explainer opens |

**Dialogs by area:** 24 top-level `components/*.tsx` · 7 project-view · 7 marketplace · 3 ui ·
3 development · 1 each tags/git/game/context-menu.

## Global Constraints

Everything from tranche 1's plan still applies (type tokens, `<Button>`, status colors hardcoded,
WHY comments, `stripComments` in guard tests, `<ErrorState>` for errors). Additionally:

- **Scope: the settings + status-bar family only.** `App.tsx` + top-level `components/*.tsx`
  + `components/development` + `components/ui`. (The guard originally read only `components/*.tsx`
  and so could not enforce this; fixed — it now walks the scope explicitly.) **Marketplace, project-view, game, git, tags and context-menu are OUT** —
  they are different surfaces with their own visual language, and dragging them in triples the diff
  for no benefit to the menus this project is about. Recorded as residue, not silently skipped.
- **One PR.** Tranche 1 and 2 land together on `feat/menu-internals-tranche-1`. Do not merge tranche
  1 separately.
- **No behavior changes** beyond size. Where a dialog's width or height moves, the change is listed
  in the commit. (The original "round to the nearest rung" rule is retired along with the ladder —
  a dialog is assigned by CONTENT KIND now: is it a confirm, a settings surface, or long-form text?)

---

### Task 1: The `<Dialog>` primitive — ✅ DONE

**Files:**
- Create: `src/renderer/components/ui/Dialog.tsx`
- Modify: `src/renderer/components/ui/index.ts` (export it)
- Create: `desktop/tests/dialog-authority.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type DialogSize = 'sm' | 'md' | 'lg' | 'xl';   // 340 / 420 / 560 / 820, each min(N, 88vw)
  type DialogProps = {
    open: boolean;
    onClose: () => void;
    title?: string;                  // omit ONLY when the caller renders its own header
    headerActions?: React.ReactNode; // left of the CloseButton
    size?: DialogSize;               // default 'md'
    maxHeight?: string;              // default '80vh'. A fixed height is not expressible.
    panelRef?: React.Ref<HTMLDivElement>;
    className?: string;
    /** Set false when the caller owns its own scroll region. Default true. */
    scrollBody?: boolean;
    children: React.ReactNode;
  };
  ```
- The component renders scrim + centered panel (`flex flex-col`), optional header
  (`px-4 py-3 border-b border-edge shrink-0`, `h2 text-sm font-bold text-fg`), and — when
  `scrollBody` — wraps children in `<div className="scroll-fade flex-1"><div className="px-4 py-4 space-y-5">`.

- [ ] **Step 1: Write the failing guard test** — `desktop/tests/dialog-authority.test.ts` asserts
      (a) no `h-[Nvh]` on an element that also carries `OverlayPanel`/dialog role, (b) `<Dialog` has
      ≥1 consumer, (c) the width ladder rungs are the only ones Dialog exposes. Copy `stripComments`
      verbatim from `tests/type-scale-authority.test.ts`.
- [ ] **Step 2: Run it, confirm it fails.**
- [ ] **Step 3: Write `Dialog.tsx`.** Start from `SettingsPopup.tsx` verbatim, then: panel gets
      `flex flex-col`; `width` becomes `size`; `height` prop is DELETED (the fixed-height ban is
      enforced by not being expressible); body wrapper moves inside.
- [ ] **Step 4: Export from `ui/index.ts`.**
- [ ] **Step 5: Run test, suite, `npx tsc --noEmit`, `npx vite build`.**
- [ ] **Step 6: Commit** — `feat(ui): one dialog shell that owns its scroll body (D1)`

---

### Task 2: Migrate the 7 `SettingsPopup` callers — ✅ DONE

`SettingsPopup` becomes a thin deprecated alias for one commit, then is deleted. Its two callers
that set `height` (Appearance, Remote Access — `min(600px, 80vh)`) are the interesting ones: they
want a panel that fills regardless of content, which the ban removes. Give them
`maxHeight="80vh"` plus a `flex-1` body and confirm they still fill.

- [ ] **Step 1: Migrate all 7**, deleting each caller's own `flex flex-col` + `scroll-fade` wrapper
      (Dialog owns them now).
- [ ] **Step 2: Delete `SettingsPopup.tsx`**; assert zero importers.
- [ ] **Step 3: Suite + build. Commit.**

---

### Task 3: Migrate the settings/status-bar dialog family — ✅ DONE

The ~17 remaining top-level dialogs. Mechanical but not blind — each one drops its hand-rolled
`createPortal` + `<Scrim>` + `<OverlayPanel>` + header + `✕`.

Two that need care, called out because they are not pure deletions:
- **`ContextPopup.tsx:108`** — the one banned fixed height. `h-[85vh]` when the explainer opens is
  what makes the panel jump; it becomes `maxHeight` and the explainer scrolls inside it.
- **`StatusBar.tsx`** — carries the second centering technique and a WHY comment
  (`:529-533`) explaining that transform breaks `backdrop-filter`. Dialog uses the flex-wrapper
  technique, which is the one that does NOT break it — verify the WHY is satisfied, then delete it.

- [ ] **Step 1: Enumerate** — `grep -rln '<OverlayPanel' components/*.tsx`
- [ ] **Step 2: Migrate**, recording every width that moves to a different rung.
- [ ] **Step 3: Extend the guard** — hand-rolling `<OverlayPanel>` in `components/*.tsx` now fails.
- [ ] **Step 4: Suite + build. Commit.**

---

### Task 4: K2 — the setting row · **DECIDED, NOT STARTED — this is where to resume**

**Resolution: (c′) — one component, two densities selected by ROLE.**

Both sizes are already Destin-approved, from looking at rendered UI rather than a spec:
- drawer/navigation rows at `text-sm`/`text-2xs` — change 51, 2026-07-16
- Sound preset rows at `text-xs`/`text-3xs` — tranche 1, approved 2026-07-26

So the axis is not drawer-vs-in-menu, it is **navigation vs list item**:

| variant | type | when |
|---|---|---|
| `nav` (default) | title `text-sm`, desc `text-2xs` | the row takes you somewhere — chevron, opens a dialog |
| `item` | title `text-xs`, desc `text-3xs` | the row is one of N being scanned or chosen between |

This costs nothing K2 was actually buying. The five shapes K2 retires were about **where the
description lives** (below the row · after the row · as a K1 section label · as a `<p>` outside the
container), not about type size. One component, one description rule, one control-slot vocabulary,
two densities. The spec §1 K2 recipe is amended to carry the `variant` axis.

**Original conflict, kept for the record:** spec §1 K2 specified `text-xs`/`text-3xs` for all rows,
which would have silently reverted change 51.

**The spec and the shipped code disagree about row type size, and the spec would silently revert a
decision Destin made on 2026-07-16.**

- Spec §1 K2: title `text-xs`, description `text-3xs`.
- Shipped `SettingsRow.tsx:30-37` (change 51, Destin 2026-07-16): title `text-sm`, subtitle
  `text-2xs`, with the WHY comment *"type and chevron go one step up… at 11px the title/subtitle gap
  read as too loose."*

K2's stated prize is *"the drawer row and the in-menu row become the same object — the single
biggest consistency win in the kit."* They cannot become the same object at two different sizes, so
one of these has to give:

- **(a) Rows adopt `text-sm`/`text-2xs`** — keeps change 51, makes in-menu rows BIGGER everywhere.
- **(b) Rows adopt `text-xs`/`text-3xs`** — follows the kit, shrinks the settings drawer back to
  what Destin explicitly rejected in July.
- **(c) They stay two objects** — drawer row large, in-menu row small. Costs the consistency win but
  changes nothing visually.

Do not guess. Task 4 is written once this is answered; Tasks 1–3 do not depend on it.

---

## Self-Review

**Spec coverage.** D1 fully (Tasks 1–3), with one amendment (Dialog owns the scroll body) justified
by a defect found in production code, not by preference. K2 is scoped and blocked, not skipped.
K6/K7 move to tranche 3 with K4/K5/K9/K11/K12 — they are per-menu restructures gated on the same
copy pass, and this tranche is already large.

**Deliberately deferred:** 18 dialogs on marketplace / project-view / game / git / tags /
context-menu surfaces. Listed as residue in the tranche-2 commit message.

**Risk.** Task 3 touches ~17 dialogs at once and the failure mode is visual, not test-detectable.
Mitigation: migrate in small commits grouped by area, and hand Destin a dev build to sweep before
the PR — per the workspace rule that final-stage visual verification is his, not a scripted rig.
