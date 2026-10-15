---
date: 2026-10-14
status: shipped (youcoded#623 b58a0acae, 2026-10-14); rewritten after Destin's answers, page-start-session.questions.answers.json
type: spec
topic: YouCoded Pages — any page can open the normal new-session window with a message waiting
origin: Frontier Lab redesign spec §6 ("Update now" button)
component: youcoded/desktop (renderer + a small main change); Android: none
---

# A page opens the new-session window — design

## In plain words

Any page can have a button that opens YouCoded's **normal new-session window** (the one "Create
a page" uses) with a message already filled in. You read it, pick project, model and permission
toggle as usual, press Start; the message still waits in the box until you press Enter. A page
needs your one-time yes, on the usual card before it opens; page or data updates never re-ask.
Works from a paired phone.

## 1. What exists today (checked against app `origin/master` `172fe50cd`, 2026-10-14)

- **The window exists:** `PageCreateDialog` `{ title, subtitle?, initialInput, cwd? }` wraps
  `BuddyNewSessionForm` — starts in `initialCwd` or the saved default, with folder picker, model
  and skip-permissions toggle (`buddy/BuddyNewSessionForm.tsx:57-101, 169`). Used by "Create a
  page" (`App.tsx:4034`) and comments' "Ask your assistant" (`App.tsx:733-749`); on create App
  adopts the session and closes the page view (`App.tsx:4043`).
- **Prefill, never send:** `initialInput` rides `session-create-args.ts:57` onto the session;
  `InputBar` fills the box once, caret at the end, sends nothing (`InputBar.tsx:361-388`).
- **Page bridge:** `window.youcoded` in `page-theme.ts:132-173`, via `postMessage`; `PageHost`
  accepts only its own frame (`PageHost.tsx:259`). No `startSession` today.
- **Approvals:** `page.json` `connections` are parsed strictly (`main/pages/page-connections.ts:202`)
  and fingerprinted (`:316`). Any unapproved line shows `PageApproval` *in place of* the page
  (`needsApproval`, `page-connections.tsx:171-173`; card `:308`; gate `PageHost.tsx:519-525`).
  Sentences come from one function, `describeConnection` (`page-connections.tsx:46`). Remove
  lives in `PageConnectionsDialog` (`:539`). Approvals are per computer (`connections-store.ts:78`).
- **"Code changed" note:** approvals store a code hash (`pages-service.ts:295-298`); the note
  shows when `page.html` differs (`pages-store.ts:150, 167`). **Phone:** may call `session:create`
  (`main/ipc/session.ts:192-200`); standalone Android has no Pages (`SessionService.kt:4415+`).

## 2. The API

```js
// Resolves; never throws. Only defined when page.json declares the ability.
const r = await window.youcoded.startSession({ prompt: 'Run the weekly update…' });
// r → { ok: true } the window is open (not "a session started");
//     { ok: false, reason } otherwise — reason is a plain sentence for the page's author
```

- `prompt`: any text the page writes (Q-3), non-empty, ≤ 20,000 characters (broken-page guard).
  Shown **in full** in the box — that is the safety. So a message carrying **hidden characters**
  (format characters such as zero-width spaces/joiners and text-direction marks, and the Unicode
  tag block) is **refused**, not cleaned (code review F1): they show nothing in the box yet reach
  the model. Cost: an emoji built with a zero-width joiner (👩‍💻) is refused too.
- **Only from a click** (code review F2): the call works only right after the person presses
  something in the page (the browser's own "user activation", which page code cannot fake; the
  app also checks that the page still has the focus). This is the same rule as "you press Start
  yourself", one step earlier: a page cannot open the window on a timer, or reopen it straight
  after Cancel. It is not a rate limit (Q-6 stands): every click still works.
- **One window at a time** (code review F2): while the window is open, a page's further requests
  are turned down (`{ ok: false }`), never swapped in, so the message and the choices the person
  is making never change under them.
- Folder (Q-8): a **project page** starts in its own project (`home.path`); a **personal page**
  starts on the saved default with the picker (later: "your assistant"). `project` (optional) is
  a personal page's suggested starting choice; the picker can still change it.
- Feature detection `typeof window.youcoded.startSession === 'function'` keeps Frontier Lab's
  copy-box fallback working on older apps.

## 3. The manifest field

`page.json`: `"connections": [ { "id": "start-session", "kind": "session" } ]`

- A connection kind with **no settings**, reusing parse → card → remember → Remove.
- **Approval is keyed to this declaration, not the page's code** (Q-7): fingerprint is the
  constant `session`; the record keeps no code hash and the "code changed" check skips it. So
  editing `page.html` or `data.json` never re-asks or shows the note. (Frontier Lab bakes its
  data into `page.html` weekly; this makes that harmless.)
- Any page kind. Not a network destination: no CSP change; not counted for `open`-mixing.
- An `open` page may hold this line too. Its message can then come from any server at run time
  with no re-ask, because the approval is about the declaration, not the code (code review F5);
  that is acceptable because the person still reads the whole message, which can no longer hide
  characters (§2).

## 4. Flow and approval card

1. Page opens → the usual card, *before* the page shows (Q-5), with this extra line:
   > **Open a new-conversation window** with a message this page writes. You'll see the message
   > and choose the project before anything is sent.

   **Allow and open** / **Not now** — existing buttons, memory and Remove.
2. Press → bootstrap posts `youcoded:session:start { id, prompt, project? }` → `PageHost` checks
   its own frame and an approved `session` line → new `onStartSession` prop → App calls
   `setPageCreate({ title: 'Start a conversation', subtitle: 'From <page>', initialInput, cwd })` (Q-1).
3. He checks project, model and the usual permission toggle (Q-4), presses Start; the chat opens
   with the message unsent until Enter (Q-2). App adopts it and closes the page view.
4. No rate limits (Q-6): every conversation needs his own Start. No new main channel: the page
   cannot be open unless approved, and the existing `session:create` does the work.

## 5. What Destin might notice

- Pressing Start leaves the page for the chat (as "Create a page" does). The page only learns
  "window opened"; it cannot read the conversation.
- Adding the field to an already-allowed page shows the card once more, for the new line.
- The permission toggle starts on the saved default, as for any new session.

## 6. Android and phone

- **Paired phone (Q-9):** works — window on the phone, `session:create` on the computer, chat on
  both. Verify the phone's box fills. **Standalone Android:** no Pages, no change, no Kotlin.

## 7. Test plan

Unit (`npx vitest`, desktop):
1. `page-connections-manifest.test.ts`: `session` parses on both page kinds; fingerprint `session`.
2. `pages-store`/`pages-service`: edit `page.html` after approving only `session` → no
   `codeChanged`, no re-ask; a page with another approval still gets the note.
3. `page-theme.test.ts`: `startSession` only when declared; empty/over-long prompt → `{ ok:false }`.
4. `PageHost`: other frames ignored; undeclared refused; project page → `cwd = home.path`;
   personal page → no `cwd`. 5. `PageApproval`: shows the new sentence.

Manual (dev instance only, `bash scripts/run-dev.sh --label "Page start session"`):
6. Frontier Lab: card before open → Allow → Update now → window in Frontier-AI-Lab-Assistant with
   the full message → Start → chat opens, message waiting unsent → Enter sends it.
7. Rebuild Frontier Lab's `page.html` → reopen → no card, no note. 8. Personal page → picker on
   the saved default. 9. Paired phone: same as 6. 10. `shoot` light/dark/narrow; `scripts/verify.sh`.

## 8. Files the build touches

- `desktop/src/shared/pages-types.ts` — `{ id; kind: 'session' }` connection type.
- `desktop/src/main/pages/page-connections.ts` — parse `session`; fingerprint `session`.
- `desktop/src/main/pages/pages-service.ts`, `pages-store.ts` — no code hash / skip for `session`.
- `desktop/src/renderer/components/pages/`: `page-theme.ts` (bootstrap `startSession`),
  `PageHost.tsx` (handle message, `onStartSession`), `page-connections.tsx` (card sentence).
- `desktop/src/renderer/App.tsx` — wire `onStartSession` to `setPageCreate`.
- Tests listed in §7; workbench fake page with a `session` line for `shoot`.
- Page-builder skill (wecoded-pages-plugin) — one paragraph on the field and `startSession`.
- Frontier Lab (its own project) — add the field; call `startSession({ prompt })`.
