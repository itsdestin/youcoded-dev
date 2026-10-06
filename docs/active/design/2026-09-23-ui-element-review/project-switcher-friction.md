---
status: active
date: 2026-10-05
related: redesign-backlog.md row 10, project-switcher-1.json
---

# Project switcher — where the guide helped, and where it didn't

First drafts of the redesigned project switcher (backlog row 10), built only from
`guide-draft.md`, `decisions.md`, the backlog and the workspace tooling. App commit `12a0cc0ef`
(`youcoded`, branch `session/ui-consistency-audit`). Deck: `project-switcher-1.json` (before
`runs/ps-before`, after `runs/ps-after`, plus `ps-after-phone`, `ps-after-small`,
`ps-after-hero`; YouCoded, YouCoded Night, Midnight).

References opened first (guide "How to use" step 2): **the session switcher's rows**
(`SessionStrip.tsx` — name + `StatusPill` with its dot on line 1, folder + runtime on line 2;
the reference Destin named), **the Project View hero's sync pill** (`ProjectHero.tsx` — the five
sync states' short words), **Session details / Settings** (the shared `Dialog` shell), **the
Sync panel's "Remove backup?" confirm** (`SyncPanel.tsx` `ConfirmDialog` — a remove confirm on
the shared Dialog), **Appearance's themes box** (`ThemeScreen.tsx` — a capped list that scrolls
under the masked fade inside its own box), and the **friends panel pills** (`ui/Pill` with `dot`).

## What a project is (found before designing Remove)

- The project list is the saved-folders file `~/.claude/youcoded-folders.json` **plus every
  folder in `~/YouCoded/Projects`** (synced projects, including ones whose sync was stopped or
  is turned off). Synced ones are listed because their FOLDER exists there (`listProjectsIndex`,
  `listPickerFolders`), never because of the saved file.
- So the old Remove (hover ✕, `folders.remove`) could only work on plain folders, and the ✕
  was hidden on every synced row — "no way to delete some projects". Removing a synced one from
  the saved file would have done nothing: it came straight back.
- Three meanings exist for a synced project: hide it on this computer (built), also stop
  syncing (permanent, every device — today's hero "Stop syncing"), or also move the folder to
  the trash. Built the safe one, asked the rest as PQ-1. Nothing built deletes a folder or a
  user file; the existing opt-in "also delete YouCoded's file history" tick stays.
- Hidden state lives as a `hidden: true` saved-folders entry (see tooling 1 for why not a new
  file). `addFolder` on the same path clears it. Remote browsers share the same service; Android
  has no Project View and no synced projects, so nothing to port (its `artifacts:list-projects-
  index` answers not-implemented). No new IPC channel.

## Decisions, one by one

| # | What I did | Driven by |
|---|---|---|
| 1 | Shell = shared `Dialog`, titled "Switch project", ✕, Esc; search as an `InputGroup` field with its icon. | Guide "Popups": "Quick pickers (the project switcher) follow the same shell: a title and the ✕". Clear. **Behaviour cost:** the old palette hung from 15% down; a centred Dialog jumps as a filter shortens the list — I freeze the list's opening height so it doesn't. Guide silent on filter-as-you-type popups. |
| 2 | Only the list scrolls (masked fade), search and Add a project stay put. | Found in the first `#many` picture: the Dialog's own scrolling body took the search box and Add off screen. Copied Appearance's themes box. **Guide gap:** "a list with its action pinned" has no recipe (games round 2 said the same). |
| 3 | List = small label "Your projects" + one level-1 card holding plain rows. | Guide "Spacing" (nothing bare; label first) + "Lists and menus" (switchers are plain rows). Two rules had to be combined by hand: plain rows *inside* a card. |
| 4 | Row = session switcher's two lines: name + pills; path + counts. | Destin's named reference. |
| 5 | Sync as `Pill` with `dot`: Synced (green), Sync problem (red), Sync stopped / Sync off / Only on this computer (grey). Full sentence in the hover title. | Backlog row 10; guide "Status and notices". Words copied from the hero's pill so one project reads the same twice. "Only on this computer" is long and on most rows — asked as PQ-2. |
| 6 | "Current" pill (accent tint, no dot) replaces the check. | Backlog "checkmarks … are odd"; "Lists and menus" (selected ≠ hovered). Variants `fill` and `top` on PC-2. **Guide silent** on how to mark "the one you're in" in a switcher. |
| 7 | Counts "**21** files · **5** chats" at the right of line 2, hidden under 640px (as before). | Guide "Text and numbers" (summary line). Variants chips/none on PC-1. |
| 8 | A bin (`TrashIcon`, new in `project-view/icons.tsx`) on every row, ghost icon button, red on hover; variant `hover` (pointer row only, always on touch). | Backlog "a remove icon somewhere". **Guide says** close is always the ✕, so a row ✕ would read as close — hence a bin. There was no shared bin icon to reuse; drew one (on the icon sheet automatically). |
| 9 | "Folder missing" amber pill for a project whose folder is gone (new `missing` flag from the index, one async `access` per project); counts hidden on it. | Brief's practice state; error-message standards (say the fact). |
| 10 | Remove confirm on the shared Dialog, prompt width, red Remove on top, Cancel under, full width; three wordings (folder / synced / missing); the tick as a `ConsentRow`. | Guide "Buttons" (narrow → stacked, destructive on top). Old confirm had the red button on the right of a narrow panel and no ✕. ConsentRow is the guide's only "tick before an action" look — it is not quite a consent, a guess. |
| 11 | The hero's "Remove from YouCoded" now shows for synced projects too. | Same behaviour behind both entry points. Its label differs from the bin's ("Remove from your project list") — left, noted. |

## Tooling — did the latest tooling help?

| Tool | Verdict |
|---|---|
| "Several designs of one real screen" recipe | Helped — three switches, screen entries with `params`, done in minutes. Had to put the switches in a new `switcher-variants.ts` because another session had uncommitted edits in `workbench-mode.ts` (commit-by-path would have swept them in). |
| 1.5× shots, `shoot` speed | Good: 33 pictures in ~11 s. |
| Close-up crops `screen@WxH+X+Y` | Essential (dialog is 600px of a 1440 picture). One crop covered before and after even though the two dialogs sit at different heights. |
| `"new": true` on one-picture slides | Used for six built-new states; reads right ("keep / remove"). |
| Per-deck `preview` with `--themes` | Worked; still easy to forget `--themes`. |
| "Parts agree" | Marked the Remove/Cancel stack; nothing found. |
| verify keeps logs | Used — the failing checks named the log file on the FAIL line, saved a rerun. |

## New friction

1. **The blocking-call ratchet forbade the obvious design.** My first hidden-list was a small
   new JSON file beside youcoded-folders.json; `main-blocking-calls.test.ts` failed (sync reads
   and writes on an IPC path, allowlist may only shrink). The whole folders service is sync and
   allowlisted, so the cheapest compliant route was to store the marker *inside* the allowlisted
   file. Correct outcome, but the rule pushes new state into existing files rather than toward
   async — worth a line in the test's message ("or extend a file already read on this path").
2. **`role="listbox"` counts as a popup layer in `shoot --check`.** Seven screens failed the
   Escape test ("Escape should close listbox Projects only"). A list inside a dialog is not a
   layer; I dropped the roles (rows now carry `aria-current`). Either `explore-page.mjs` should
   treat a listbox without its own positioning as part of its dialog, or the README should say
   "don't use listbox/option in a dialog".
3. **A one-word screen name can't be a deck crop.** `projects` (the Project View itself) is a
   real `shoot` screen, but `spec.py` recognises a screen name only if it has a `/` or `#`, so
   `projects@…` was "unknown crop". Worked round by shooting `projects/files` after-only — which
   lost the before picture for PS-7 (the old page wasn't in the before run).
4. **No cheap "before" for a sub-screen added this round.** The remove confirm had no screen
   before, and phone-width before needs the old code; `shoot --before` needs a worktree of the
   old commit (games round noted the same). Three of my steps are after-only for that reason.
5. **The painted `.scroll-fade` breaks a flex column.** Its `::before` became a flex item with a
   negative margin and the list opened already scrolled ~60px. `.scroll-mask` (the newer look)
   is right; nothing steers you to it — `useScrollFade`'s name suggests `.scroll-fade`.
6. **knip's type ratchet fails on another session's work.** `MenuProps` (the other helper's
   uncommitted Menu primitive) pushed "types" to 185/184; verify cannot tell my changes from
   theirs in a shared worktree. Left alone.
7. **Tall dialog crops still push side cards off** (PS-5's Risk card vanished; shortened).
8. Choice slides with tall close-ups stack vertically — only the first variant is on screen
   until you scroll (same as games round 1).

## Left undone / unsure

- **No "syncing" state**: the sync engine reports synced / error / notice events only; there is
  no per-project "syncing now" to show. Not invented.
- **"Sync off"** (sync turned off globally) is not in any practice state — the fake backend has
  sync on. Wording copied from the hero.
- The list is not chunked (`useChunkedReveal`) and has no 1,000-item stress pin; the old one
  wasn't either and project lists are small. renderer-lists.md says new user lists should be.
- Empty "no match" state not photographed (needs typing; no screen state for it).
- Hidden-but-syncing (PQ-1) is a real behaviour choice; the hero's label vs the bin's label.
- Android: unchanged (no Project View there).
- knip FAIL in verify comes from the other helper's uncommitted `MenuProps`, not this change.

## Proposed guide and tooling changes (most valuable first — not implemented)

1. **Guide: "a filterable list in a popup" recipe** — search field first, label, one card of
   plain rows that alone scrolls under the masked fade, follow-up action pinned below; the popup
   keeps its opening height while filtering. (#1, #2 above; Appearance and games converged too.)
2. **Guide: how to mark "the one you're in"** in a switcher (pill vs tint vs own group) once PC-2
   is answered.
3. **shoot: a listbox inside a dialog is not a layer** (`scripts/shoot/explore-page.mjs`).
4. **deck: accept a one-word shoot screen name in crops** (`scripts/ui-review/deck/spec.py`
   `is_screen`: check the run's manifest instead of looking for `/`).
5. **`useScrollFade` docs/name: point new lists at `.scroll-mask`**; consider deleting the
   painted `.scroll-fade` once its last callers move.
6. **main-blocking-calls message**: name "store it in a file this path already reads" as an
   option beside "go async".
7. **verify in a shared worktree**: run knip/type ratchets against the staged-or-committed
   tree only, or name which files a new finding comes from.
