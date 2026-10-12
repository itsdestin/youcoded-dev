---
status: active
date: 2026-10-12
related: redesign-backlog.md row 18, backup-warning-1.json, decisions.md ("First-run sign-in")
---

# Where the backup warning lives: where the guide helped, and where it didn't

Round 1 of backlog row 18. Destin's words (2026-10-04, `first-run-5#P5-2`, decided on first-run-4#P4-2):
"remove the copy at the bottom about backups. this is a weird place for that warning". Deck
`backup-warning-1.json`, with pictures in `runs/bw1`, all shot in the photo-only build. Themes: Halftone (his
current theme), Crème, YouCoded, YouCoded Night and Meadow Mist.

Code (app commits `42902759b`, `0607a056e`):
- `components/backup-note-practice.ts`: the `?backupNote=` switch, which is workbench-only. It also holds the
  wording, the one-time memory and the claim.
- `components/FileChangeNotice.tsx`.
- Hooks in `ToolCard.tsx`, `PermissionsSection.tsx` and `guide-stops.ts` / `GuideTour.tsx`.
- Screens in `screens/backup-note.ts` (delete them when he picks).
- Practice conversation `fixtures/bubbles/edit-approval.jsonl`.
- Tests: `tests/file-change-notice.test.tsx`, plus the tour Escape case in `first-run-guide.test.tsx`.

## What a new user learns today, and when

| When | Where | What it says |
|---|---|---|
| Setup | Sign-in step | **Nothing since 2026-10-04.** Until then it said: "With your permission, the assistant may create, change, or delete files on your device. Create backups for anything you cannot replace." (added 2026-09-10 in `3186f6750`, removed in `c937d78a8`). |
| First launch | The buddy's tour (desktop only; can be skipped) | Eight stops. The Files stop says "Files the assistant makes show up here…". **Nothing about changes, permission or backups.** |
| Every file change, Claude (Ask first by default) | Permission card | "Editing a file · <path>", Yes / No. Nothing explains what Yes allows. The diff shows only when the card is opened. |
| Every file change, ChatGPT / OpenRouter / local | — | **No card asks.** A native session with a folder starts on the Coder preset = **Auto edit**, which changes files without asking. **No first-time warning covers Auto edit.** |
| Only if they turn on Skip permissions or Full auto | First-time warning (once) | "…a mistake reaches your files before you see it. Keep your own backups of anything you cannot replace." |
| Only on a small model | First-time warning (once) | "…can damage files… Start with work you can undo" (there is no undo; see below). |
| Only if they open it | Settings → Permissions | The three modes, the four always-asks, and "Removing an approval doesn't undo anything it already did" (behind the ⓘ). |
| Only if they open it | Backup & sync | Off by default. When on, it "Includes Memory · Conversations · …" and **not project files**, which are opt-in per folder. Its ⓘ explainer overstates this ("conversations, projects, and files"). |
| Never | Undo | **There is no undo of an assistant change.** Git review's "Revert changes…" restores a file to its last commit, the user's edits included. Office's Versions covers only files open in its editor. |

So a ChatGPT or local-model user, who changes files without being asked from the first session, is told
nothing about backups or undo anywhere they would look.

## Decisions, one by one

| # | What I did | Driven by |
|---|---|---|
| 1 | Three homes built in the real renderer behind one workbench switch: a tour stop after Files, a one-time notice on the first file-change card, and a notice in Permissions' modes card. "Nowhere" is the fourth option. | Brief; guide "How to use" step 2. The references I used were the first-time warnings (once per install, `youcoded-warned-<kind>`), the tips (the buddy, one per sitting) and the Specialists ask (a notice inside a card). |
| 2 | Destin's 2026-09-10 sentence word for word in every home. A separate wording question (BW-5) offers a plainer one. | He rejected the place, not the words. "With your permission" is untrue in Auto edit, so I asked rather than rewrote. |
| 3 | The first-change notice claims only a **live** card (waiting for Yes, or running). | The first photo showed nothing: a finished edit in a hidden practice tab had claimed it first. An old conversation is not "the first time". |
| 4 | Got it is outlined and beside the words; it drops under them on a phone. | Guide "One filled button per view": Yes is the card's answer. Guide "Text and buttons on one line when they fit". |
| 5 | The notice in Permissions has no button and uses the card's 2xs text size. | Native-permissions rule: the modes block has zero controls. The first shot at text-sm out-shouted the modes. |
| 6 | The tour can now be photographed (`tour/<stop>`). The stop is handed to the tour through guide-state, not App.tsx. | The tour had no screen at all. App.tsx's line budget. |
| 7 | **Escape on the tour now closes its bubble and leaves the screen open** (statement slide BW-6). Before, Escape closed the screen under the bubble and left the tour floating. | Found by `shoot --check` on the new tour screens; this is a real app bug. Guide: every popup closes on Esc. |
| 8 | Recommended: the first-change notice, and the "no undo" wording. | It is the only home that reaches Auto edit users, phones and people who skip the tour. |

No IPC change. The shared React UI is the same on Android, so the notice and the Permissions note would reach
the phone. The tour does not run there.

## Tooling: did it help?

| Tool | Verdict |
|---|---|
| `shoot` with `params` per screen | Worked; three practice states without a click path. |
| `shoot --check` | Caught a real bug (decision 7) on its first run. |
| Composite crop (`"crop": [...]`) on a decide slide | Worked for three different screens side by side, but see frictions 2 and 3. |
| `preview` per-theme contact sheets | Readable this time (one sheet per theme). |
| Test-waits check / guard proof | Used. The notice and Escape guards were both seen red. |

## Friction

1. **MAP has no row for the tour, tips or first-time warnings** (`components/guide/`,
   `first-time-warnings.ts`). I found them through `git log -S` on the removed sentence and the archived spec.
2. **A decide slide must carry a highlight, but a composite refuses every kind except a hand box.** AUTHORING says
   a list crop "is already the focus and gets no box" for brief slides, yet decide still requires one. I gave it
   a 100% box, which draws an orange frame round everything and prints two warnings.
3. **A close-up box that fits one theme cuts another.** Crème's monospace font makes the same chat card ~30%
   wider, so `chat#…@820x340` cut off Got it in Crème only. I crept to 900 and then 1100, and ended at the full
   window width (small pictures). The deck has no "crop to this element in every theme" (`@panel`-style) for an
   element that is not the screen's panel.
4. **A practice screen in a kept-open tab steals one-time state.** Other practice sessions' finished edits
   mounted first. Nothing in shoot says which session's cards are on screen versus hidden.
5. **The `shoot --check` Escape rule has no idea of a layer that owns what it opened.** The tour opens the
   Projects view; "Skip" rightly closes both, and the check calls that "closed two". I had to pick a behaviour
   (Escape closes only the bubble) partly to satisfy the check.
6. **Escape order is registration order, not what's drawn on top.** A floating bubble drawn above everything
   loses Escape to any screen opened after it. I fixed the tour by re-registering per stop; the stack itself
   could prefer the higher layer.
7. **`shoot --check <names>` runs every screen anyway** (316 pictures, ~4 min under load) rather than the names
   given.
8. **jsdom here has no localStorage, and every test hand-rolls the same Map shim** (first-time-warnings,
   buddy-linux-migration, now this one). The coordinator's "load failure" in this file was the verify run catching
   the file between writing it and adding the shim. The error line, 14:33, is `localStorage.clear()` in the
   pre-shim version; the file was committed with the shim, and 30 parallel runs and the full verify pass.
9. **Guide gaps met:**
   - **Permission prompts and tool cards are "not covered yet"**, so the guide had no rule for a notice inside one.
     I used "a notice about one thing sits inside it".
   - Nothing on **one-time explanations** in general: tour vs tip vs first-time warning vs notice, and which job
     each is for.
   - Nothing on what a **lone notice button does on a phone**: Callout drops it under the words at its own width,
     not full width as the guide's lone-button rule says.
10. **The deck's words assume colours.** I first wrote "a blue notice"; info notices take the theme's accent
    (pink in Halftone). The builder checks code words but not colour words.
11. **A four-option decide warns "more than three usually means two questions".** "Nowhere" is a real fourth
    answer here, not a second question.
12. Process: I worked in the shared session worktree as briefed (no `workspace-start`). A PC restart mid-task
    lost the first survey agent; nothing uncommitted was mine.

## Not done / unsure

- Android was not built here. The change is shared React with no IPC.
- No UX tester or code reviewer was run (short route; that is Destin's call).
- Full verify (2026-10-12):
  - Passed: types, knip, lint, design lint, ast-grep and journeys.
  - 7 tests failed, not mine. They were broken by the ErrorState round's "Try again" rename (`9dea997fe`): files-tab-list-view, session-naming-settings and two office files. That helper is fixing them.
  - The screen check failed once on a shared photo-build race (ENOENT `/tmp/youcoded-shoot/builds/…/dist/index.html`). Rerun alone, all 317 screens passed.
- The Write card's "New file" chip shows even when Write overwrites a file (seen while surveying). Reported,
  not changed.
- Backup & sync's ⓘ explainer says it backs up "projects, and files", but only opted-in project folders sync.
  Reported, not changed.

## Proposed guide and tooling changes (most valuable first, not implemented)

1. **Guide: a "first-time explanations" recipe.** When to use a tour stop, a tip, a once-only warning popup, or a
   once-only notice inside the thing, and that each says what happens on the user's computer (friction 9; this
   whole row was that question).
2. **Guide: lift "permission prompts are not covered" for notices**, or say where an explanation on a
   permission card goes (friction 9).
3. **Escape stack: prefer the topmost drawn layer** (or let a floating layer like the tour stay on top) instead of
   the last registered (friction 6).
4. **shoot `--check`: an entry can say its layer owns the layers it opened** (`closes: ['Project']`), so a tour or
   wizard can close what it opened (friction 5).
5. **deck: a close-up anchored to an element, not pixels** (`"crop": "chat#x@[data-tool-use-id]"` + margin), so
   one crop fits every theme's font width (friction 3).
6. **deck: a decide or choice slide over a composite needs no highlight** (friction 2).
7. **MAP: a "First days: tour, tips, first-time warnings, empty screens" row** naming `components/guide/`,
   `first-time-warnings.ts`, `FirstTimeWarning.tsx`, `HelpPopup.tsx`, `tests/first-run-guide.test.tsx` and
   `tests/first-time-warnings.test.ts`, and the `tour/<stop>` screens (friction 1).
8. **tests: one `tests/helpers/local-storage.ts`** shim instead of a copy per file (friction 8).
9. **shoot: `--check <names>` checks only those names** (friction 7).
10. **deck builder: flag colour words** ("blue", "red", "pink") in slide text, as it flags code words
    (friction 10).
11. **Guide: a lone notice button at phone width** follows the lone-button rule (full width), or the rule
    exempts notices (friction 9).
