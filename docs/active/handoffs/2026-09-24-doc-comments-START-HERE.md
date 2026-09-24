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
- **Reading mode (default):** comments are tinted, underlined highlights; hover shows only
  that comment (author, time, text — no reply count, no buttons); clicking a highlight opens
  Comments mode focused on it.
- **Adding:** releasing a text selection in the file viewer opens the SAME right-click menu
  (Ask about this / Add comment / Copy / Select all); chat keeps right-click only. Add
  comment opens a small box anchored at the selection.
- **Ask about this:** a pill INSIDE the sentence in the composer (deletes as one unit), shown
  the same in the sent bubble. Destin wanted to evaluate it visually before fully committing.
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

## What the build found (infrastructure survey, 2026-09-24)

- Accounts: GitHub sign-in through the marketplace Worker (D1). No per-user document
  storage and no document sharing exist or are planned.
- The artifacts sidecar (`.youcoded/artifacts.json`) is the wrong home for comments: one
  file per project rewritten per tool call, the 2026-08 OOM source, and excluded from sync.
- Assistant tools: native tool registry (`desktop/src/main/harness/tools/`) and the
  app-owned MCP for Claude Code sessions (`claude-code-mcp.ts`, byte-identical Android copy).
- `.docx` is read-only today (mammoth drops comments); nothing writes Word files.

## Known gaps in the mockup

- The Ask-about pill (composer + sent bubble), the Ask-Your-Assistant sent message, code-file
  comments, phone/touch (no hover there), Halftone / Meadow Mist, and the Projects screen
  (no floating buttons → no Ask Your Assistant) have not had the late design-guide polish.
- "SHOW RESOLVED" is 10px text (copied from Show Complete; below the 11px floor, G-5).
- Quote matching is first-occurrence, whitespace-insensitive; a repeated phrase lands on
  the first copy.
- The narrow (marker-rail) comment mode was not screenshot-verified at phone width.
- Mockup-only code to delete once settled: `comments/pane-variant.ts` and the four losing
  framings, `CommentsModeToggle` (Projects-screen fallback row), the "Resolve as Claude"
  style stand-ins in the seed data.

## What remains

1. **Decisions from Destin** (questions deck): where comments are saved (hidden app folder
   vs a file beside each document); what the assistant may do (reply / resolve / edit the
   file); phone support now or later and what a tap does; Word comments now or later.
2. **Polish** the less-reviewed parts above; UX tester run 1; UI review deck; contract.
3. **Build** — persistence with history in Web Annotation shape (account-ready ids);
   re-anchoring after edits with a "detached" state; assistant read/reply/resolve tools
   (native + MCP, desktop and Android); the Ask-about and Ask-Your-Assistant message
   formats sent to the assistant.
4. **Review** — code reviewer, UX tester run 2, grader, acceptance deck.
5. **Cleanup** — delete mockup-only code; retire branches/worktrees `comments-mock-b/-c` and
   `-a-v1`; close draft youcoded PR #263 (outward action: ask Destin first).
6. **Later, separate projects** — comments syncing across devices; sharing documents with
   other people through the account (roadmap: other-features → accounts).
