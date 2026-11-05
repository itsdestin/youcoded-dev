---
status: active
---
# Pages step 3 — the page's assistant: build design

Design decisions: `2026-10-24-pages-finish-architecture.md` (step 3 section) and the step 3 decks in
`docs/active/design/2026-10-24-pages-finish/` (layout: rounds 1–5; Undo: step3f). Destin, 2026-11-05: skip
the reviewers and the contract ("i will review manually. just think through how to build this, spec it out,
and build").

## What the person gets

1. Every page (not Office) has the round chat button. It opens the page's assistant, floating over the page.
2. The first time, a new chat starts in the page's project folder (`~/YouCoded/Personal` for a personal page,
   the project for a project page), on the person's usual default (runtime, model, permission mode). Nothing
   is typed for them. The assistant already knows which page it is about.
3. Reopening shows the page's last chat. If its program has ended (app restart), it is resumed.
4. The header: the chat's name; Earlier chats (this page's chats, newest first, pick one to continue it);
   Earlier versions; New chat; Hide.
5. Earlier versions lists the page as it was before each request, newest first, each with Put back. Any version
   can be put back; putting one back first saves what is there now, so nothing is lost.
6. The chats are ordinary chats: they appear in the session strip and in Resume under their project, and
   opening one in the main window works as usual. Opening the page's chat never switches the main window.
7. Edit in chat (Page settings, the library) opens the page with its chat open. The old new-session dialog for
   editing a page is gone.
8. A phone does all of this through the same calls.

## Pieces

### A. Main: which chats belong to a page — `src/main/pages/page-chats-store.ts`
- File `<localFallbackDir>/page-assistant-chats.json` (beside `pages-pins.json`), written with the app's
  atomic writer. Shape: `{ v: 1, chats: PageAssistantChat[] }`, newest first, at most 30 per page.
  `PageAssistantChat = { pageId, conversationId?, sessionId?, provider, cwd, startedAt, usedAt }`.
  `sessionId` is the LIVE desktop id (cleared when the session ends); `conversationId` is the saved
  conversation's id (Claude Code session id, or the native id), which is what Resume uses.
- Filled from session creation (`pageId` on the create request), the conversation-id mapping
  (`sessionIdMap.set`), session exit, and each user message (bumps `usedAt`).
- Channel `pages:assistant-chats { id }` → that page's chats with `live: boolean` (both doors).

### B. Session creation carries `pageId`
- `SessionCreateArgs.pageId?`, `SessionInfo.pageId?`. In `SESSION_CREATE`: the page must exist
  (`store.get`); the opening note (C) is attached; the chat is recorded (A); `pageId` is echoed on the info.
- Renderer `session:created` handler: a `pageId` session is added to the list but never auto-selected.

### C. The opening note
- Built in main (`page-assistant-note.ts`): the page's name, its folder relative to the chat's folder, what
  `page.html` / `page.json` / `data.json` / `page.md` are, "use the page-builder skill to change the page",
  "use the page tools (ReadPageData / UpdatePageData) for what it holds", and `page.md` (first 20,000
  characters) when present.
- Claude Code: `--append-system-prompt <note>` (CC-coupled: entry in `docs/cc-dependencies.md`).
  Native: an extra prompt part `page` (`assembleSystemPromptParts`). Resume passes the note again.
- Someone else's `page.md` is the untrusted case; no page can come from someone else until sharing
  (step 6), so the Allow / Don't use card is step 6 work (recorded below). The note frames `page.md` as the
  page's own instructions, not the person's.

### D. Versions — `src/main/pages/page-versions.ts`
- A version is the page folder's own files (`page.html`, `page.json`, `page.md`, `data.json`; nothing else)
  saved to `<localFallbackDir>/page-versions/<sha1(pageId)>/<ms>.json` with `{ label, at, files }`.
  At most 40 per page (oldest dropped).
- Taken before each request in the page's chat: main sees the user message (transcript `user-message`, both
  runtimes) for a session recorded in A, and saves a version labelled with the request's first line. If the
  files equal the newest version's, only the label is replaced (no change happened since).
- Channels (both doors): `pages:versions { id }` → versions, newest first, each with what differs from the
  state after it (`page` / `data` / both) and whether it equals now; `pages:restore-version { id, at }` →
  saves "Before putting back <time>", writes the files (missing ones removed), returns the new list.
- Known limits (accepted): versions are per computer, not synced; putting back also puts back what the page
  itself saved in that time (e.g. a ticked task), which the list says by "Its information changed".

### E. Renderer
- `usePageAssistant(page, projectRoot)` (pages/use-page-assistant.ts): the page's current chat id, open (last
  live → resume last saved → new), `startNew()`, `openChat(conversationId)`, the chats list. Resume goes
  through `runLeaseTakeoverGate` like the buddy (a chat held on another device asks; handoff is refused with a
  plain message: "This chat is open on another device. Start a new chat here, or close it there first.").
- `PageChatPane`: real Earlier chats list (names from `session.browse`), real versions list, New chat.
  Starting/resuming states show a short line in the pane ("Starting the chat…"); failure shows `ErrorState`.
- App: `chatSessionId`/`chatSessionName` props removed; `editPage` opens the page with its chat open.
- The round button's design-lint warnings fixed.

## Follow-ups (not in this build)
- Step 6: Allow / Don't use for someone else's `page.md`, asked again when an update changes it.
- Versions synced across devices (today: per computer).
- Files and web pages the chat reads come through the runtime's own tools; only page data is framed as
  untrusted today.
- Skills a page names (marketplace offer) — later, per the architecture spec.
