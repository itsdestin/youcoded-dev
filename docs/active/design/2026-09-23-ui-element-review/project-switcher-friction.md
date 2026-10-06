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

## Round 2 (2026-10-06) — after Destin's project-switcher-1 answers

App commits `84e64bc2f` (feature) and `d7e505200` (sync-spaces doc); deck `project-switcher-2.json`
(before = round 1 `runs/ps-after`, after `runs/ps2-after`, plus `ps2-after-phone`, `ps2-after-small`).

| # | What I did | Driven by |
|---|---|---|
| R2-1 | Back to the OLD container and rows (search row with ✕, "Recent", outline highlight, Add a project row); round 1's Dialog shell, card and frozen height are gone. | PS-1 ("liked the old styling of the broader container … more"). **Guide vs Destin:** the guide's "Quick pickers follow the same shell: a title and the ✕" and "nothing bare on the popup" are what drove round 1, and Destin preferred the old look. The guide line about quick pickers needs to say "the ✕ in the search row" rather than "a title". |
| R2-2 | Kept: sync pills (PS-2), Folder missing, counts with bold numbers (PC-1), "Not synced" (PQ-2). | Answers. The hero still says "Only on this computer" — asked as P2Q-1. |
| R2-3 | The bin is `display:none` until the row is pointed at or keyboard-highlighted (always on touch), so counts and pill sit flush right. The highlight moved from the row button to its wrapper so the bin sits inside the outlined row. | PC-3 "hover" + note. |
| R2-4 | Three fresh "current project" marks behind `?switcherCurrent=` (now in `workbench-mode.ts`): check beside the name (default), accent edge bar, "Current project" words. | PC-2 (none of round 1's liked). |
| R2-5 | **Remove a synced project = stop + off every device's lists.** Built within the existing sync design: the stop is the existing permanent tombstone; "off every list" is a NEW marker file per project in `Personal/ProjectSync/Removed/`, carried by the same Personal sync. Lists skip removed folders unless this computer re-added it (`readded` on the saved entry). Files stay on every device; GitHub is never contacted. New channel `syncspaces:remove-project` (four desktop surfaces + Android stub). Round 1's local `hidden` marker is gone. | PS-5 note + PQ-1 "stop". See "Sync investigation" below. |
| R2-6 | The GitHub note (link + how to delete it there) on the synced confirm AND as "Removed projects" in Settings → Backup & sync, from one component. The synced confirm widened to `panel` because the note pushed its buttons off a `prompt`-height popup. | PQ-1 note ("separate setting … with an outlink and instructions"). |

### Sync investigation (answered before building)
- **Each device's local copy:** untouched. Stop already detaches the space and KEEPS the folder;
  the marker only changes which lists show it. Pinned by a real-git two-device test (laptop
  removes → desktop pulls → marker arrives, both folders' files intact, the GitHub stand-in's
  commit unchanged).
- **An offline device:** learns on its next Personal pull — discovery runs after every Personal
  sync, and it now re-reads the markers first (also at startup). Until then it keeps syncing
  the project (exactly like Stop today).
- **Older app versions on other devices:** they read only `ProjectSync/*.json`, so they ignore the
  marker folder and see a plain stopped project (listed "Sync stopped", files kept, not syncing).
  Pinned in the same test. A new `state: 'removed'` value was rejected because older builds read
  any unknown state as `active` and would RESTART syncing.
- **Re-adding:** "Add a project" on that folder lists it on that one computer again (as "Sync
  stopped"); sync can't resume — the existing stop is permanent, and creating a new project with
  the same name is still refused (existing rule). The confirm says so.
- **Android / phones:** Android has no synced projects or Project View (stub added, 1,800 Android
  unit-test results green, 0 failures). Remote browsers use the same service through the
  remote server.

### Tooling friction this round
1. **The "centres agree" check paid off at once:** marking the counts + pill row caught a 3px
   offset I had seen in the picture but couldn't measure — the inline `<span title>` around each
   pill added a text line box below it. `flex` on the wrapper fixed it.
2. **`shoot --out` into an existing run folder rewrites its manifest** with only the screens of
   that run, so a partial reshoot silently made the deck lose every other picture. Re-shot the
   whole run. Either merge manifests or refuse an existing folder.
3. **The new line-budget test** failed on +1…+5 lines for a new channel on six files; the right
   answer (raise with a reason) is spelled out in its message — fine. SyncPanel's +32 was moved
   into its own component instead.
4. **"Open this first" steps** (new) worked for both needs: `ArrowDown` to move the highlight off
   the current project, and `scroll` to bring Backup & sync's new card into view — no app switches.
5. Gradle needed bash globbing for the JDK lookup (`ls -d /usr/lib/jvm/*` fails in this zsh
   when `/opt/*/jbr` matches nothing); the workspace note's command assumes bash.

## Round 3 (2026-10-06) — after Destin's project-switcher-2 answers

App commit `62c4e5df0`; deck `project-switcher-3.json` (before `runs/ps2-after`, after
`runs/ps3-after`, phone `runs/ps3-after-phone`).

| # | What I did | Driven by |
|---|---|---|
| R3-1 | No current-project marker; the highlight rests on it, follows pointer/keys, returns when the pointer leaves the list; `aria-current` kept. The check/edge/words drafts and `?switcherCurrent=` removed. | P2C-1. |
| R3-2 | The bin follows only a MOVED highlight, so it never shows on the project you're in by default. | My call (asked on P3-2): a resting bin would sit on the row you were most likely about to pick. |
| R3-3 | "Add a project" centred; the list uses the masked fade. | P2-1, P2-2. |
| R3-4 | The "strange fade" on Backup & sync was the **shared popup fade**: its second gradient left the outer 4% unfaded, so each card's edges stayed bright under the top fade. Removed (app-wide); the pin in `dialog-shell.test.tsx` now asserts there is no side strip. | P2-5 note. Removed once before (2026-09-28) and restored only because it wasn't the cause of Meadow Mist's separate glow — this time it is the cause. |
| R3-5 | The project page's pill says "Not synced". | P2Q-1 "match". |
| R3-6 | Rows got a short accessible name ("wecoded-themes, Sync problem"). | Found driving the open-first steps: the old name was every line of the row cut at 70 characters, which a screen reader reads too. |

### Tooling friction this round
1. **A pointer trip in an open-first `hover` left the wrong row lit.** Hovering the 4th row lit it,
   but the row the pointer crossed just before kept its `:hover` look (bin and tint) — twice, on
   different rows. I could not tell whether it is headless Chrome or the app, so the picture uses
   the arrow keys; **pointing at rows should be checked by hand in a dev window.**
2. **Open-first targets need the exact accessible name** (`{ role, label }`); a plain string only
   works for short names. The error message listing what is on screen made this quick to fix.
3. **An approve slide whose change only shows on light themes** is refused for the dark ones
   ("nothing differs … name an element"); a hand-placed box was the only way through.
4. The fade removal was caught by a **source pin that encoded the old CSS** (expected), which is
   the right outcome — but it shows the pin tested the recipe, not the behaviour ("cards fade
   evenly"); a browser check would have to measure pixels.

## Proposed guide and tooling changes (most valuable first — not implemented)

1. **Guide: quick pickers keep their palette shell** — `guide-draft.md` "Popups": replace "Quick
   pickers … follow the same shell: a title and the ✕" with "a quick picker is a search row with
   the ✕ (no title), plain rows, its add action as a centred last row". Why: round 1 followed the
   guide and Destin preferred the old palette (PS-1).
2. **Guide: "the one you're in" in a switcher** — "Lists and menus": the highlight rests on the
   current item and follows the pointer; no check, pill or tint. Why: six markers declined over
   two rounds (PC-2, P2C-1).
3. **Guide: row actions appear where the pointer is** — a destructive row action (remove) shows on
   the pointed row only, takes no space when hidden, always shows on touch, and never on a
   resting highlight. Why: PC-3 + note, R3-2.
4. **Guide: status words** — name "Not synced" (not "Only on this computer") and the pill set
   for sync in "Status and notices", so the next sync surface doesn't reinvent them. Why: PQ-2/P2Q-1.
5. **shoot: merge, don't overwrite, a run's manifest** on a partial reshoot into an existing
   `--out` (round 2 lost every other picture silently).
6. **shoot: a listbox inside a dialog is not a layer** (`explore-page.mjs`; round 1).
7. **deck: accept a one-word screen name** in crops (`spec.py` looks for `/` or `#`; round 1).
8. **Investigate the stale `:hover` after an open-first `hover` step** (`driver.mjs` `moveTo`) — if
   it is headless Chrome, send a final no-op move; if it is real, it is an app bug (round 3 #1).
9. **`useScrollFade` / `.scroll-fade` docs point new lists at `.scroll-mask`**; the painted band broke
   a flex column in round 1 and Destin asked for the masked fade twice (sessions menu, here).
10. **main-blocking-calls message**: offer "store it in a file this path already reads" beside
    "go async" (round 1).
11. **Line budgets: say in the failure which numbers a new IPC channel normally needs** (every
    channel touches the same six files; round 2).
