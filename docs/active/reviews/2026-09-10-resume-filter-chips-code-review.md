---
status: active
feature: resume-filter-chips
branch: session/resume-filter-chips (youcoded, f7d772b2 vs origin/master)
reviewer: fresh code reviewer, scripts/ui-review/code-reviewer.md
date: 2026-09-10
---

# Resume filter chips — code review

Inputs: the branch diff (10 files, +693/−217), every touched file read in full plus the
hooks and primitives they call (`useScrollFade`, `use-esc-close`, `use-narrow-viewport`,
`SearchFilterPill`, `Checkbox`, `FilterChip`, `Overlay` z-table, `FileFilterPopover` for
the shell comparison), the 14 contract rows, `react-renderer.md`, `narrow-viewport.md`,
`test-suite-hygiene.md`, `docs/PITFALLS.md`. Not read: spec, plan, decks, transcripts.

## verify.sh

```
verify: /home/destin/youcoded-dev/worktrees/sessions/resume-filter-chips/youcoded (base origin/master)
  tests: related to 10 changed file(s) + 47 source-scanning guards

PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

Also run directly: `vitest run tests/filter-menu-chip.test.tsx` — 7 passed.

## Findings (most severe first)

- F1 accepted — `desktop/src/renderer/components/ResumeBrowser.tsx:331` (with `:1266`, `:1494`, `:1506`) — Widening the window past 640 px while the phone Filters popover is open leaves `filterRowRef`, `projectsTriggerRef` and `tagsTriggerRef` pointing at `null` for the rest of the dialog's life, so the Projects and Tags chips stop opening their menus (`measureDropdown` returns null → `openPill` flips but no dropdown renders), the chip's own click is treated as an outside click, and the row's sideways fade stops updating; closing and reopening Resume Session is the only recovery. Mechanism: `filtersOpen` is cleared by a `useEffect` one commit AFTER `narrow` flips, so there is one committed render in which `chipsRow` (a single element value holding those refs) is mounted twice — once inside the portaled `ResumeFilterPopover` and once via `{!narrow && chipsRow}`; when the popover then unmounts, React sets each shared object ref to `null` unconditionally even though the desktop copy is still in the DOM. — Confirmed by reading the effect ordering and by a throwaway jsdom test (deleted after the run) reproducing the three commits: after the popover unmounts, `document.querySelectorAll('[data-row]').length === 1` and `ref.current === null`. Reachable by dragging a desktop window across 640 px, or a tablet rotation, with the popover open.

- F2 accepted — `desktop/tests/filter-menu-chip.test.tsx:1-114` vs contract row R4 — R4 is `checkedBy: mechanical` with this file as its guard, but nothing in the file exercises the statement ("a chip names the one tag or project you picked; two or more show as a count, like Tags 2"): the seven tests pin FilterMenuChip's classes/chevron, FilterChip `kind="toggle"`, CheckboxMark paints, and five source-text regexes on ResumeBrowser. The label logic lives in `projectsLabel` / `tagsLabel` (`ResumeBrowser.tsx:596-618`) and no test in the repo touches it. — Confirmed by reading the test file and `rg -n "projectsLabel|tagsLabel|Tags 2|Projects 2|selectedList" tests src --glob '*.test.*'` (zero hits). The grader will fail R4 as written; either a rendered-label test is added to this file or the row's guard changes.

- F3 accepted — `desktop/src/renderer/components/ui/Checkbox.tsx:44` — The WHY comment on `CheckboxMark` says "The row carries role=\"menuitemcheckbox\" / aria-checked"; the only rows that use it (`ResumeBrowser.tsx:1300-1303`, `:1370-1373`) carry `role="option"` + `aria-selected` inside `role="listbox"`, and the trigger says `aria-haspopup="listbox"`. The code is internally consistent; the comment describes a different ARIA pattern and will mislead the next caller. — Confirmed by reading both files.

- F4 accepted — `desktop/src/renderer/components/ResumeBrowser.tsx:1456-1458` — The comment above the search box says "no docked trigger — the same call the Marketplace bar makes", but the `narrow` branch directly under it renders `SearchFilterPill` WITH the docked filter trigger (`onToggleFilter`, `filterLabel="Filters"`), and the desktop branch is not the shared pill at all (a hand-rolled box Destin kept). Neither branch matches the sentence. — Confirmed by reading.

- F5 accepted — `desktop/src/renderer/components/ResumeBrowser.tsx:350-353` — The comment on `tagManagerOpen` says the manager is "Opened from the 'Manage tags…' footer in either the Organize popover's TagPicker or the Tags filter dropdown"; this branch removed the dropdown route (contract R3/R11, comment at `:1391-1393` says so). Stale WHY. — Confirmed by reading; `rg -n "Manage tags"` in the file shows only the Organize-side reference remains.

- F6 accepted — `desktop/src/renderer/components/ui/FilterMenuChip.tsx:36-52` — `MenuChevron` is a third hand copy of the same 12 px chevron (`d="m6 9 6 6 6-6"`, `w-3 h-3`, `strokeWidth={2}`) already drawn inline in `ui/Select.tsx:224-233` and `ContentFindBar.tsx:161`; its comment says "Internal: the chip is its only home" while the primitive it cites draws the identical glyph. Works, but the branch's own stated goal (one chevron for anything that opens a list) argues for one exported glyph rather than a new private copy. — Confirmed by `rg -n "m6 9 6 6 6-6" src` (3 hits).

- F7 rejected — `desktop/src/renderer/components/ResumeBrowser.tsx:386-394` (pre-existing, not introduced here; noted because the branch adds a second closer to the same stack) — `useEscClose(open && !renameSession, handleEscClose)` pushes ONE stack entry whose effect deps are `[open, store]`; `EscStore.popTop()` removes the entry before invoking it, and nothing re-pushes it, so after the first ESC "peels one layer" (closes a menu or collapses a row) the browser has no entry left: the next ESC falls through to the chat passthrough (`use-esc-close.tsx:18-19`) instead of closing the dialog. The layered-ESC comment is true for exactly one press. The new phone popover is unaffected (its own entry unmounts with it). — Read from `use-esc-close.tsx:39-54,107-118`; no test in the repo presses ESC twice on ResumeBrowser [PLAUSIBLE — not run].

## Checked and found sound (so the implementer need not re-derive)

- Contract R1/R2/R9/R14 thresholds against code: chip text `text-sm`, chevron `w-3 h-3` (12 px), rows `h-7` (28 px), counts `text-2xs` (`--text-2xs: 11px`, `globals.css:348`); sort glyph bars `h10/h7/h4` for newest-first and `h4/h7/h10` for oldest-first, lit only when `sortDir !== 'desc'`; the invisible twin label keeps the sort chip one width.
- R7 copy: "Resume Session" (`:963`, `:1444`), "Search sessions…" (both branches), "No matching sessions" (`:1524`).
- R10: `activeFilters={selectedProjects.size + selectedTagIds.size}` feeds the pill's badge; sort deliberately excluded and the popover's comment says why.
- R13: both outside-click handlers early-return on the portaled dropdown refs, so picking rows keeps popover + menu open; a tap outside closes both in the same event.
- Popover `zIndex: 60` sits above L1 content (`CONTENT_Z[1] = 50`) and the L1 scrim (40); the menus were already 60 on master.
- `useScrollFade` extension: the two new attributes are set on every caller; the vertical `.scroll-fade` reads neither, and the sideways gradient uses the same `var(--panel)` as the vertical one.
- `FilterChip` default `kind` is unchanged; `filter-chip.test.tsx` (marketplace pin) still queries `role="checkbox"` and passes under verify.
- No IPC, preload, shim or Kotlin change; the renderer is shared, so Android gets the narrow path by construction. Nothing to mirror.
- `callout-authority` exemption removal is backed by the passing guard (no `bg-accent` tint left in ResumeBrowser outside a primitive).
- knip clean: `FilterMenuChip`, `CheckboxMark`, `ResumeFilterPopover` each have a call site.

## Not covered

- No live run at 390 px or across the 640 px breakpoint (F1 is proven at the React level, not in the app); the UX tester's second run is the place for the visual half.
- Keyboard navigation inside the listbox menus (arrow keys, typeahead) — not asserted by any row and not exercised here.
- Android Gradle tests and the marketplace worker (verify.sh does not cover them; nothing on the branch touches either).
- Whether Tailwind emits `max-w-[9rem]` after `max-w-full` (FilterMenuChip base vs caller class, `FilterMenuChip.tsx:67`, `ResumeBrowser.tsx:1274`); FilterChip-family primitives do not go through `mergeClasses`, so the outcome depends on Tailwind's arbitrary-value ordering, which I did not build to check.

One-line disagreement with the design, per the brief: none.


## Triage (implementing session, 2026-09-10)

- F1 accepted — the phone panel now renders only while the window is narrow, so the chips row is never mounted twice across the breakpoint
- F2 accepted — the label rule is a pure function (pickLabel) and the guard test now exercises it: none → category, one → its name, more → category and count
- F3 accepted — comment corrected to the roles the rows actually carry
- F4 accepted — comment rewritten for the two-width layout
- F5 accepted — comment rewritten; the filter-menu route was removed at Destin’s request
- F6 accepted — one ChevronDown glyph in ui/, used by Select, the find bar and FilterMenuChip
- F7 rejected — pre-existing and outside this branch; filed in the roadmap as needs-verify

Counts: 6 accepted · 1 rejected.
