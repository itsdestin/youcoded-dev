---
status: active
extends: docs/active/specs/2026-07-26-menu-internals-design-system.md
branch: feat/menu-internals-tranche-1 (tranche 1 + 2 ship as ONE PR — Destin's call 2026-07-26)
---

# Menu Internals — Tranche 2 (the dialog shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or
> superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Land D1 — one `<Dialog>` shell that owns scrim, centering, sizing, header, close **and the
scroll body** — then migrate the settings/status-bar dialog family onto it.

**Architecture:** `SettingsPopup.tsx` is the seed, but the spec's claim that it "is already correct"
is wrong in one specific way that tranche 1 proved empirically (see §Finding below). `<Dialog>` is
`SettingsPopup` with the body brought inside the component, a width ladder replacing free-form
widths, and a fixed-height ban. Then callers migrate.

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

- **Scope: the settings + status-bar family only.** The 24 top-level `components/*.tsx` dialogs plus
  `ui/` and `development/`. **Marketplace, project-view, game, git, tags and context-menu are OUT** —
  they are different surfaces with their own visual language, and dragging them in triples the diff
  for no benefit to the menus this project is about. Recorded as residue, not silently skipped.
- **One PR.** Tranche 1 and 2 land together on `feat/menu-internals-tranche-1`. Do not merge tranche
  1 separately.
- **No behavior changes.** A dialog that opened centered at 420px still opens centered at 420px.
  Where the width ladder forces a change, it rounds to the NEAREST rung, and the change is listed.

---

### Task 1: The `<Dialog>` primitive

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

### Task 2: Migrate the 7 `SettingsPopup` callers

`SettingsPopup` becomes a thin deprecated alias for one commit, then is deleted. Its two callers
that set `height` (Appearance, Remote Access — `min(600px, 80vh)`) are the interesting ones: they
want a panel that fills regardless of content, which the ban removes. Give them
`maxHeight="80vh"` plus a `flex-1` body and confirm they still fill.

- [ ] **Step 1: Migrate all 7**, deleting each caller's own `flex flex-col` + `scroll-fade` wrapper
      (Dialog owns them now).
- [ ] **Step 2: Delete `SettingsPopup.tsx`**; assert zero importers.
- [ ] **Step 3: Suite + build. Commit.**

---

### Task 3: Migrate the settings/status-bar dialog family

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

### Task 4: K2 — the setting row · **BLOCKED, needs Destin's call**

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
