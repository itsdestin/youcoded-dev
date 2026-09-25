---
status: active
date: 2026-09-24
supersedes: docs/archive/specs/2026-07-26-ask-claude-reference-ux-design.md (Destin discarded the July work)
roadmap: docs/roadmap/files.md → "Document comments"
---

# Document comments + "Ask about this" — START HERE

Google Docs / Word-style comments in the file viewer (highlight text, leave notes, reply,
resolve, history), with the assistant able to act on them, plus a redesign of right-click
**Ask about this**. As of 2026-09-24 the **look and feel is settled in a UI-only mockup**;
nothing is saved and the assistant cannot see comments yet.

## Where the work is

| What | Where |
|---|---|
| The chosen mockup | youcoded branch `session/comments-mock-a` (pushed), worktree `worktrees/sessions/comments-mock-a` |
| Round-1 version of it (kept for reference) | youcoded branch `session/comments-mock-a-v1` |
| Rejected mockups | youcoded branches `session/comments-mock-b` (pins & tray), `session/comments-mock-c` (inline threads); worktrees `worktrees/sessions/comments-mock-{b,c}` |
| Scratch screenshots (untracked) | `worktrees/sessions/comments-mock-a/docs/active/design/2026-09-24-doc-comments/` |

Run it: `YOUCODED_PORT_OFFSET=61 bash scripts/run-workbench.sh <abs path>/worktrees/sessions/comments-mock-a/youcoded`
→ `http://localhost:5234/?mode=workbench`, header file-count button → `2026-09-24-onboarding-redesign.md`
(seeded with comments in every state). **Pass the worktree path**: with no argument the script
serves the SHARED checkout, which cost a round of reviews on 2026-09-24.

State lives only in renderer memory (`desktop/src/renderer/state/doc-comments-store.ts`); no
IPC, no main process, no Android. New code is mostly `desktop/src/renderer/components/comments/`,
plus `ActiveArtifactView.tsx`, `MarkdownView.tsx`, `SessionDrawer.tsx`, `InputBar.tsx`,
`UserMessage.tsx`, `context-menu/build-menu.ts` + `compose-ref.ts`, `SessionCardDetails.tsx`
(CompleteToggle gained optional `titles`).

## Decided by Destin (chat, 2026-09-24)

Chat answers, not deck answers — the contract step still has to ratify them on a deck.

- **One system.** Ask about this = one span asked about immediately; comments = many held
  and sent together. The July "Ask Claude about this" work (draft youcoded PR #263) is
  discarded, not a base.
- **Real records, not copy-paste.** Authors (you / the assistant), timestamps, reply
  threads, resolve by either side, reopen, history ("Show resolved"). Eventually tied to the
  account so shared documents keep their comments.
- **Standards.** Plain files: W3C Web Annotation (quoted text + surrounding text, re-found
  after edits). `.docx`: real Word comments (the format Word and Google Docs both import and
  export). The two convert to each other.
- **Reading mode (default):** comments are tinted, underlined highlights; hover shows that
  comment and its replies; the pointer can move onto the card and reply or resolve there (Destin,
  later on 2026-09-24) — editing stays in Comments mode. A half-typed reply keeps the card open
  until Esc or a click outside. Clicking a highlight opens Comments mode focused on it.
- **Adding:** releasing a text selection in the file viewer opens the SAME right-click menu
  (Ask about this / Add comment / Copy / Select all); chat keeps right-click only. Add
  comment opens a small box anchored at the selection.
- **Ask about this:** a pill INSIDE the sentence in the composer (deletes as one unit), shown
  the same in the sent bubble. Reworked 2026-09-24 after Destin found the caret misplaced and
  the chip off-style: TagChip-style accent chip, no icon, the quote in curly quotes; the
  composer holds a display-sized token so the caret lines up (compose-ref.ts "Draft tokens").
  **Build note:** the SENT text still carries the URL-encoded JSON marker — the backend stage
  must define what the assistant actually receives.
- **Comments mode:** entered with a floating **Comments** button left of the floating
  **Edit** button (same pill shape, pops in/out with the file list exactly like Edit, stays in
  place when pressed, sits over the document — never over the comment pane). Entering folds
  the file list away and widens the viewer.
- **The comment pane:** rounded, bordered panel inset 8px, 256px wide, title row
  "Comments" (no count) with a **Show Resolved** switch copied from the Resume browser's
  Show Complete. Cards stack from the top in document order in their own scroller; clicking
  a card scrolls the document to its highlight and keeps both lit.
- **A card:** avatar · name · time, resolve = the Resume card's circle-check toggle at the top
  right (filled = resolved, click to reopen), no quoted text, replies, reply field with a
  16px send arrow inside it.
- **Ask Your Assistant:** full card width, floats at the bottom of the pane (no bar behind
  it), only while the full pane is visible; sends every open comment as pills.
- Alternatives shown and not chosen: margin-aligned cards, pins & tray (B), inline threads
  (C), four other pane framings (`?commentsPane=column|sheet|margin|titled`).

## Decided by Destin (questions deck, 2026-09-24)

Deck `docs/active/design/2026-09-24-doc-comments/doc-comments.questions.json`, answers beside it.
Three follow-ups were answered in chat (marked *chat*) — the contract deck must ratify them.

- **Storage (Q-1):** a hidden comments folder inside each project. Files with native comments
  (Word, Excel) keep their comments IN the file.
- **Assistant (Q-2):** may reply, resolve, leave its own comments, and edit the file. Its own
  comments must be sparse — only items that clearly need Destin's action or attention, never
  narration of its process. Editing on comments is "largely the entire point": Destin marks up,
  the assistant fixes the doc, and the comments stay on the doc afterwards.
- **After a fix (*chat*):** the assistant decides per situation — reply, resolve, and/or repoint
  the comment to the new text. The tools must allow all three; nothing vanishes silently
  (unresolved comments whose text is gone show "text no longer found").
- **Phone (Q-3):** in this version; tapping a highlight opens the comment list on it.
- **Word (Q-4):** full two-way now — show comments left in Word/Google Docs, add/reply/resolve in
  YouCoded, and they appear in Word/Google Docs. May be built in phases but merges as ONE PR.
  Backup before every write; verify the file still opens.
- **Excel (*chat*):** yes, same as Word — cell comments read from and written into the .xlsx
  (exceljs, already a dependency, reads/writes notes).
- **Google Docs (*chat*):** the file only — a .docx keeps its comments when uploaded to Drive /
  opened in Google Docs. A live link to a Google Drive document is a separate, later project.
- **PR #263 (Q-5):** closed without merging, 2026-09-24.

## Process decisions

- **No UX tester runs** (Destin, 2026-09-24: "we will skip the ui/ux auto tester. my manual
  review makes that mostly unnecessary"). Skip both the pre-deck run and the post-build run.

## What the build found (infrastructure survey, 2026-09-24)

- Accounts: GitHub sign-in through the marketplace Worker (D1). No per-user document
  storage and no document sharing exist or are planned.
- The artifacts sidecar (`.youcoded/artifacts.json`) is the wrong home for comments: one
  file per project rewritten per tool call, the 2026-08 OOM source, and excluded from sync.
- Assistant tools: native tool registry (`desktop/src/main/harness/tools/`) and the
  app-owned MCP for Claude Code sessions (`claude-code-mcp.ts`, byte-identical Android copy).
- `.docx` is read-only today (mammoth drops comments); nothing writes Word files.

## Known gaps in the mockup

- **Word + Excel + phone mocked (2026-09-24, after the deck).** Shared layout
  `comments/CommentableDocument.tsx` (MarkdownView, DocxView, XlsxView). Word: text highlights
  like markdown; fixture `docs/launch-brief.docx` is a REAL .docx with REAL Word comments
  (`dev/workbench/fixtures/docs/make.mjs`), but the mockup shows them from store seeds —
  mammoth drops comments.xml, so reading/writing it is build work. Excel: a comment belongs to
  a CELL (`DocComment.cell`) — Office-red corner triangle (fixed colour: the sheet paper is
  always light), same hover card / click → pane, right-click a cell → Ask about this / Add
  comment, card header shows the cell ("· C4"); fixture `reports/q3-sales-by-rep.xlsx`.
  Colleague authors are `person:<name>` ("Priya Shah"). Screenshots:
  `docs/active/design/2026-09-24-doc-comments/shots-word-excel/` (untracked).
- Phone: markdown/Word/Excel all show the marker rail; a tap opens that comment's sheet (now
  portaled above the composer); no hover card on touch; a long-press selection opens the menu
  after it settles. Checked at 390px in headless Chrome only — not on a real Android WebView,
  where the native selection toolbar may also appear.
- Still not polished: the Ask-Your-Assistant sent
  message, code-file comments, Meadow Mist, the Projects screen (no floating buttons → no Ask
  Your Assistant). Halftone checked for Word + Excel only.
- Spreadsheet cell comments name the cell only ("C4"), not the sheet; a comment on another
  sheet tab is listed but has no mark until that tab is shown.
- Quote matching is first-occurrence, whitespace-insensitive; a repeated phrase lands on
  the first copy.
- Mockup-only code to delete once settled: `comments/pane-variant.ts` and the four losing
  framings, `CommentsModeToggle` (Projects-screen fallback row), the "Resolve as Claude"
  style stand-ins in the seed data. SessionDrawer.tsx's line budget was raised to 1591 for
  this mockup — lower it when that code goes.

## What remains

1. ~~Decisions from Destin~~ — answered above.
2. ~~Design the new surfaces~~ — Word, Excel and phone mocked (see Known gaps). Then **polish** the less-reviewed parts above; UI review deck; contract.
3. **Build** — persistence with history in Web Annotation shape (account-ready ids);
   re-anchoring after edits with a "detached" state; assistant read/reply/resolve tools
   (native + MCP, desktop and Android), including repoint; Word (.docx comments.xml + range
   markers) and Excel (cell notes) read/write with backup; the Ask-about and Ask-Your-Assistant message
   formats sent to the assistant.
4. **Review** — code reviewer, grader, acceptance deck (no UX tester, see Process decisions).
5. **Cleanup** — delete mockup-only code; retire branches/worktrees `comments-mock-b/-c` and
   `-a-v1`. (PR #263 closed 2026-09-24.)
6. **Later, separate projects** — comments syncing across devices; sharing documents with
   other people through the account (roadmap: other-features → accounts).
