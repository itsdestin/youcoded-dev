---
date: 2026-10-14
status: draft
type: spec
topic: YouCoded Pages — a page may start a new conversation in its own project with a message waiting in the box ("start a session from a page")
origin: Frontier Lab redesign spec §6 (Frontier-AI-Lab-Assistant, worktree frontier-lab-phase1, docs/superpowers/specs/2026-10-13-frontier-lab-redesign-design.md) — "a manifest-declared ability, a first-use approval card, a visible session"
component: youcoded/desktop (renderer + main); Android: none (see §7)
related:
  - docs/active/specs/2026-09-15-youcoded-pages-scope.md (§8 assistant tasks, §10 background activity)
  - docs/active/plans/2026-09-16-youcoded-pages-phasing.md (Phase 3 "files and assistant tasks")
  - docs/archive/specs/2026-09-20-youcoded-pages-phase2-technical-design.md (connections, approvals)
  - .claude/rules/feature-flow.md
---

# A page starts a conversation — design draft

> **Status: draft for Destin's questions round.** Written read-only against app `master`
> `788a22eab` (2026-10-13). No code was changed, built or run. Per `.claude/rules/feature-flow.md`
> this is a UI feature (a new approval card), so the next step is to turn §10's open questions into
> a words-only questions deck (`page-start-session.questions.json`) before any mockup is drawn.
> This file was written into the shared checkout at the caller's request and is **not committed**;
> move it into a `workspace-start` worktree before committing (workspace CLAUDE.md, "Before any
> development edit, including docs").

## For Destin — in plain words

Today a page (a small app inside YouCoded, like Frontier Lab) can save its own notes, fetch from
websites you approved, and refresh. It **cannot** start a conversation with the assistant. Frontier
Lab's "Update now" button therefore shows the request in a box with a Copy button, and you start a
new conversation yourself and paste it.

The proposal: a page can say, in its settings file, "I may start a conversation in my project
with *this exact message*." The first time it tries, YouCoded shows a card naming the project and
quoting the message word for word, with **Allow** and **Not now**. After you allow it, pressing the
page's button opens a brand-new conversation in that project, switches you to it, and leaves the
message **typed in the box but not sent**. You read it and press Enter. Nothing runs in the
background and nothing is sent for you (unless you decide otherwise in question 2).

Almost all of the machinery already exists: "Create a page" already opens a new conversation with
`/page-builder` waiting in the box, and the page approval system already knows how to ask once,
remember the answer on this computer, and let you remove it later.

---

## 1. What exists today

### 1.1 How a page is loaded and sandboxed

- A page is a folder: `page.html`, `page.json` (name, description, icon, optional `connections`) and
  an optional `data.json`. Two homes: the Personal sync space's `Pages/`, or a project's `Pages/`
  folder. `youcoded/desktop/src/main/pages/pages-store.ts:4-10`, listing at `:70-160`.
  Frontier Lab is a **project page**: `<Frontier-AI-Lab-Assistant>/Pages/frontier-lab/`, so its
  `PageHome` is `{ kind: 'project', path, name }` (`shared/pages-types.ts:11-17`).
- The page runs in an `<iframe srcDoc>` with `sandbox="allow-scripts allow-popups allow-forms"` and
  **no** `allow-same-origin`, so it is an opaque origin that cannot script the app.
  `renderer/components/pages/PageHost.tsx:526-534` (rationale at `:1-7`).
- The host builds the framed document itself (our head first, then the author's): a strict CSP
  (`connect-src 'none'`, `frame-src 'none'`, `webrtc 'block'`), the theme, the style kit, and a
  bootstrap script. `renderer/components/pages/page-theme.ts:327-349` (CSP), `:487-514` (shell).
- **The `window.youcoded` bridge** is that bootstrap (`page-theme.ts:132-315`): `data`, `devices`,
  `save()`, `onData()`, `onRefresh()`, `fetch()`, `plaid()`, `socket()`, `video()`. Every call is a
  `postMessage` to the parent; answers are matched by the page's own request id and only accepted
  from `parent` (`:254-256`). There is no `startSession` today.
- The host listens only to **its own frame** (`e.source !== frameRef.current?.contentWindow`,
  `PageHost.tsx:260`) and forwards each message type to `window.claude.pages.*` (`:245-324`).
  `fetch` is checked against approvals **in main**, never in the renderer
  (`main/pages/page-fetch.ts`, rate cap `MAX_PER_PAGE_PER_MINUTE = 120` at `:52`).

### 1.2 How `page.json` is read

- `PagesStore.readManifest` reads and JSON-parses `page.json` (folding sync conflict copies) and
  returns `{ name, description, icon, connections: parseConnections(o.connections) }`.
  `main/pages/pages-store.ts:180-196`.
- `parseConnections` (`main/pages/page-connections.ts:202-296`) is strict: unknown kinds and bad
  fields are **dropped**, at most 8 connections, and a list that mixes `open` (whole internet) with a
  credentialled kind is dropped whole. Each kind has a **fingerprint** (`:316-353`); an approval is
  recorded against it, so widening a connection makes the page ask again.
- Connection kinds today: `youcoded`, `key`, `public`, `github`, `open`, `device`, `plaid`
  (`shared/pages-types.ts:52-135`). There is no "ability" kind that is not a network destination.

### 1.3 Approvals: the card, memory and removal

- **The card** — `PageApproval`, shown *in place of* the page until every connection is approved;
  "Before this page opens / <name> wants to connect", a list of plain sentences ("This page would be
  able to: …"), **Allow and open** / **Not now**. `renderer/components/pages/page-connections.tsx:308-536`.
  The sentence for each kind comes from ONE function, `describeConnection` (`:46-90`).
- **The gate** — `needsApproval(page)` is true while *any* connection is unapproved
  (`page-connections.tsx:171-173`); PageHost then renders the card instead of the frame
  (`PageHost.tsx:519-525`).
- **Memory** — `<userData>/page-connections.json`, per install, **never synced**; keyed per page by
  `approvalKey(home, slug)`, which uses the project's **canonical path**, so two clones with the same
  folder name do not share a grant. `main/pages/connections-store.ts:1-20, 36-49, 78-81`.
  Each record stores `fingerprint`, `approvedAt`, `htmlHash`.
- **Code changed** — if `page.html` changes after approval the band shows a quiet "Code changed since
  you allowed this" note, dismissible; it never re-gates (`PageCodeChanged.tsx:1-44`,
  `pages-service.ts:254-270`, flag computed at `pages-store.ts:151`).
- **Removal** — the library card's connections dialog lists each line with **Remove** ("This stops
  future use… The page will ask again next time it opens."). `page-connections.tsx:539-581`.
- **Phone** — approval over remote access may only reuse saved keys
  (`pages-service.ts:277`, `main/ipc/pages.ts:77-85`).

### 1.4 How a new session is created today

- **The common door**: `window.claude.session.create(args)` → IPC `session:create`
  (`main/ipc/session.ts:187-203`) → `SessionManager.createSession` (`main/session-manager.ts`).
  The args are built in ONE place, `shared/session-create-args.ts` (`buildSessionCreateArgs`),
  which already carries **`initialInput`: "Text to prefill (not send) in the message box"** (`:52-57`).
- Main copies `initialInput` onto the returned `SessionInfo` (`session-manager.ts:38-40, 386-388`);
  `InputBar` fills the box **once per session id**, focuses it, caret at the end, and sends nothing
  (`renderer/components/InputBar.tsx:360-388`).
- The new-session button path: `App.tsx` `createSession(cwd, dangerous, model, provider, …, initialInput)`
  (`App.tsx:2558-2592`) → `adoptCreatedSession(info)` (`:2507-2520`) puts it on screen.
- **Precedent 1 — "Create a page"**: `PageHost`'s `onCreatePage` → `setPageCreate({ title, initialInput:
  '/page-builder ' })` (`App.tsx:4022-4034`) → `PageCreateDialog` (`components/pages/PageCreateDialog.tsx`),
  which wraps the shared new-session form `BuddyNewSessionForm` (folder, model, skip-permissions; it
  reads saved defaults including `skipPermissions` at `BuddyNewSessionForm.tsx:94-102`). On create,
  App adopts the session and closes the page view (`App.tsx:4036-4044`).
- **Precedent 2 — "Ask your assistant"** (document comments): a window event
  `youcoded:ask-in-new-session` with `{ cwd, initialInput }` opens the same dialog in that project
  (`App.tsx:734-749`).

So "open a new conversation in folder X with text Y waiting in the box" is **already a supported,
tested app action**. What is missing is (a) a way for a page to ask for it, (b) a check that the page
was allowed to, and (c) the card.

### 1.5 Existing approval/permission card UI

- Page approval card (above) — the closest fit and the one to reuse.
- Claude Code permission prompts / trust gate (`renderer/state/prompt-input.ts`, MAP row "Claude Code
  prompts") and native "Always allow" (`main/harness/permission-store.ts`) — these govern tools *inside*
  a session; the new session still gets them normally. Not reused for this card.

### 1.6 Android and phones

- **Standalone Android** has no Pages at all: every `pages:*` channel answers *not-implemented*
  (`app/src/main/kotlin/com/youcoded/app/runtime/SessionService.kt:4411-4439`) and the library shows
  "Pages are not available in this window".
- **A phone paired to the computer** (remote access) runs the same React screens over a socket; its
  `window.claude.pages` is `renderer/remote-pages-bridge.ts`, and `session:create` from a phone is
  allowed (only `provider: 'shell'` is refused, `main/ipc/session.ts:194-200`). The session is created
  **on the computer**, and the phone adopts it (`App.tsx:2709`).
- Android's own `session:create` (`SessionService.kt:959-1008`) does **not** forward `initialInput`
  (only `dev:open-session-in` does, `:3422-3450`) — irrelevant while Android has no pages.
- The Android rebuild plan forbids porting new desktop logic to Kotlin
  (`.claude/rules/android-runtime.md`; `docs/active/plans/2026-09-24-android-rebuild-plan.md`).

### 1.7 Does anything already plan this?

- **Pages scope §8 "Assistant tasks within pages"** and **phasing plan Phase 3**
  (`docs/active/plans/2026-09-16-youcoded-pages-phasing.md:274-286`): "A model task is a conversation
  the page owns, with the app's existing stop control, spending limit and permission prompts, and a
  'show conversation' link." That is a bigger thing (results shown *inside* the page). This design is a
  deliberately smaller first step: a **normal, visible conversation the person owns**; the page never
  sees its output. It should not foreclose Phase 3 (§3.5).
- Scope §10 "Background activity" requires visible activity and stop controls; satisfied here because
  the conversation is an ordinary one on screen.
- **The page-builder skill** (`~/.claude/plugins/marketplaces/youcoded/plugins/wecoded-pages-plugin/
  skills/page-builder/SKILL.md:49-50, 101`) still says "Connections come in a later phase" and "the app
  does not block a page from the internet yet" — both stale since Phase 2. The connections update is
  held on branch `session/youcoded-pages-phase2` (plugin 0.2.0; roadmap `other-features.md` "YouCoded
  Pages follow-ups (a)"). Nothing in the skill or any doc mentions starting sessions. The skill would
  need a paragraph for this ability when it ships.

---

## 2. Goals and non-goals

**Goals**
1. A page can ask to open a new conversation **in its own project** with a **declared** message.
2. The person approves once per page per computer, sees the exact project and message, and can
   remove the approval later.
3. The conversation is ordinary: on screen, in the session strip, stoppable, with normal permission
   prompts.
4. A page cannot use this to run anything unseen, to pick a different folder, or to flood the app.

**Non-goals (this round)**
- The page reading the conversation's replies (that is Phase 3's page-owned task).
- Scheduling (Frontier Lab spec says "Later: YouCoded Automations").
- Standalone Android.
- Personal pages (no project) — see question 4.

---

## 3. Proposed design

### 3.1 Manifest field

A new connection kind, so it rides the existing parse → fingerprint → approve → remove machinery:

```json
{
  "name": "Frontier Lab",
  "connections": [
    {
      "id": "weekly-update",
      "kind": "session",
      "label": "Run the weekly update",
      "prompt": "Run the Frontier Lab weekly update: follow .claude/skills/weekly-update/SKILL.md."
    }
  ]
}
```

Parsing rules (in `parseConnections`, same strictness as today):
- `kind: "session"` is accepted **only on a project page** (personal: dropped — question 4).
- `prompt`: required string, trimmed, 1–2,000 characters, no control characters except newline;
  otherwise the entry is dropped (never trimmed into something else).
- `label`: optional short text (≤ 60) for the card; never used as the message.
- At most 4 `session` entries per page.
- **The folder is never in the manifest.** It is always the page's own project (`home.path`), so a
  page cannot aim a conversation at another folder.
- `session` is not a network destination: it does not count as "credentialled" for the `open` mixing
  rule (the page cannot influence the text — see 3.3), and it does not change the CSP.
- **Fingerprint**: `session|<sha256 of prompt>`. Editing the message makes the page ask again; the
  folder is already part of the approval key (canonical project path), so moving the project asks again.

### 3.2 Page-facing API

```js
// Resolves; never throws.
window.youcoded.startSession({ id: 'weekly-update' })
  // → { ok: true }                         the conversation is open and on screen
  // → { ok: false, code: 'NOT_NOW' }       the person pressed Not now on the card
  // → { ok: false, code: 'NOT_DECLARED' }  no such id in page.json
  // → { ok: false, code: 'TOO_SOON' }      rate limit (3.6)
  // → { ok: false, code: 'UNSUPPORTED', message }   this window cannot (Android, old app)
```

- **By id, not by text.** The page names a declared entry; the app looks up the text itself. A page
  may also pass `{ prompt: '…' }` for compatibility with Frontier Lab's current call
  (`page.template.html:496`), but it is accepted **only if it matches a declared prompt exactly**;
  anything else is `NOT_DECLARED`. (Frontier Lab's call should switch to `{ id }`.)
- Feature detection stays `typeof window.youcoded.startSession === 'function'`; the bootstrap
  defines it only when the manifest declares at least one `session` entry, so Frontier Lab's
  copy-box fallback keeps working on older apps and pages without the field.
- Must be called from a click: the bootstrap records `navigator.userActivation.isActive` at call
  time and the host refuses a call without it (`NOT_FROM_CLICK`). *(unverified: that Electron's
  Chromium reports `userActivation` inside this sandbox — check in the build; the page could fake the
  flag, so it is a guard against accidents, and main's rate limit is the real limit.)*

### 3.3 Flow

```
page button ──postMessage youcoded:session:start {id, reqId, activated}──▶ PageHost (renderer)
  PageHost: e.source is this frame? activated? ──▶ window.claude.pages.startSession(pageId, id)
  main (pages-service): page exists, entry declared, rate ok →
        approved?  yes → { ok, cwd: home.path, prompt }       (text taken from disk, not the page)
                   no  → { ok:false, code:'NEEDS_APPROVAL', line }
  PageHost: NEEDS_APPROVAL → show the card (3.4); Allow → pages.approve → retry once
  PageHost → App (prop onStartSession, like onCreatePage) → createSession / dialog (question 1)
        with cwd = project, initialInput = prompt, skipPermissions per question 3
  App adopts the session, closes the page view, the chat shows with the message waiting
  PageHost answers the page { ok: true }
```

- **Main decides, the renderer obeys.** A new channel `pages:start-session` returns the project path
  and the message **as read from `page.json` on disk**, so nothing the page sends becomes the message.
  This mirrors `pages:fetch`, where main checks approvals (finding 17 of the Phase 2 review: the gate
  reads the loaded document, not a stale list).
- **Text arrives unsent** (`initialInput`), unless question 2 decides otherwise.

### 3.4 The first-use approval card

**Where:** a dialog over the open page (the shared `Dialog`, layer 3, like `PageCreateDialog`), shown
**when the page first asks** — not the in-place card that blocks the page from opening. Reason: the
page is fully useful without this ability; blocking Frontier Lab's reading view behind "wants to start
conversations" would be friction for something used once a week. This requires `needsApproval()` to
**ignore** `session` lines (`page-connections.tsx:171-173`). Question 5 offers the alternative.

**What it says** (draft copy, sentence built by `describeConnection` so the card, the connections
dialog and Settings say it the same way):

> **FRONTIER LAB WANTS TO START A CONVERSATION**
> This page would be able to:
> ┃ Start a new conversation in **Frontier-AI-Lab-Assistant** with this message:
> ┃ ┌──────────────────────────────────────────────────────────────┐
> ┃ │ Run the Frontier Lab weekly update: follow                   │
> ┃ │ .claude/skills/weekly-update/SKILL.md.                       │
> ┃ └──────────────────────────────────────────────────────────────┘
> ┃ *The message waits in the box until you send it. The conversation can do anything a
> ┃ conversation in that project can, with your usual permission prompts.*
> [ Allow and start ]
> [ Not now ]

- The project is shown by **name and full path** (path in dim text) so two clones are told apart.
- The message is shown **verbatim**, monospace, scrollable, never truncated without a "Show all".
- If the conversation would start with permission prompts off (question 3), the card says so in a
  separate line.

**Remembered:** in `page-connections.json` like any connection (per computer, never synced), keyed by
the project's canonical path + page slug + entry id, against the fingerprint. Approving on one
computer does not approve another.

**Revoked:** the page's connections dialog lists the line with **Remove** (existing UI,
`page-connections.tsx:539-581`); the next press asks again. Changing the message in `page.json`
(fingerprint moves) or moving the project (approval key moves) also asks again.

### 3.5 Relation to Phase 3 (page-owned tasks)

`kind: "session"` stays "a normal conversation the person owns; the page learns only that it opened."
Phase 3's page-owned tasks would be a different kind (e.g. `kind: "task"`) with result delivery,
spending limits and a "show conversation" link. Keeping them separate avoids one approval silently
meaning two different powers.

### 3.6 Limits (mechanisms, in main)

- **Rate:** at most **1 start per page per 30 seconds** and **5 per page per hour**, in memory beside
  `page-fetch.ts`'s gate. Over the limit: `TOO_SOON`, nothing opens.
- **One at a time:** while a start for a page is in flight (card or dialog open), further requests
  from that page are refused, so a page cannot stack cards.
- **Click required:** `NOT_FROM_CLICK` (3.2). A page cannot start one on load or on a timer.
- **Hidden page:** refused while the page view is closed or the frame is not visible.
- **Not now** counts toward the limit, so a page cannot re-show the card in a loop.

---

## 4. Security risks and answers

| Risk | What could happen | Answer in this design |
|---|---|---|
| **Spamming sessions** | A page opens dozens of conversations, each using your plan. | Click-only, 1 per 30 s, 5 per hour, one in flight; every conversation is visible in the strip. |
| **Prompt injection by a shared or marketplace page** | A stranger's page asks the assistant to do something harmful in your project ("delete…", "upload ~/.ssh…"). | The message is fixed in `page.json`, quoted word for word on the card before first use, re-asked if it changes, and **waits unsent** in the box each time (default). The page cannot change it at run time. |
| **Text from the internet becoming the prompt** | A page with an `open` or `public` connection reads a website and passes its text as the message. | Runtime text is refused; only declared text (3.2). |
| **Wrong folder** | A page starts a session in your home folder or another project. | Folder is always the page's own project, never in the manifest or the request. |
| **Silent behaviour change after approval** | The page's code changes (sync, an update) and it starts calling the ability more aggressively. | The ability is still limited to the approved message and folder, and rate limits hold. The existing "Code changed" note shows. |
| **Skip-permissions sessions** | If your saved default is "skip permissions", a page-started conversation would run tools without asking. | Question 3. Recommended: page-started conversations always start with normal permission prompts. |
| **Auto-send** | If the message is sent for you, the assistant starts acting before you look. | Default is "waits unsent" (question 2). If auto-send is ever allowed, only with normal permissions and only after the card. |
| **Forged messages from other frames** | Another sandboxed frame (an HTML file preview) posts a start request. | Host already accepts only its own frame's `e.source` (`PageHost.tsx:260`); main re-checks the page id and the approval. |
| **A phone approving** | A paired phone approves a start. | Allowed — no key material involved, same as reusing a saved key; the conversation opens on the computer and the phone. Question 6. |
| **Approval reuse across clones** | Two copies of a project share a grant. | Approval key uses the canonical project path (`connections-store.ts:78-81`). |

---

## 5. Unintended effects to watch (what Destin might notice)

1. **"Code changed since you allowed this" every week.** Frontier Lab's builder rewrites
   `page.html` weekly (data is baked in, Frontier Lab spec §5 Step 3). Once the page has any approved
   connection, the band will show that note after **every** weekly update until dismissed
   (`pages-store.ts:151`). Options: Frontier Lab moves its weekly data into `data.json` (written by the
   assistant through the existing `youcoded-pages` MCP, `main/claude-code-pages-mcp.ts`), or the note
   ignores pages whose only approvals are `session` lines (the message is the thing approved, not the
   code). Recommended: the second, because the approval is about the message, which is checked
   separately. Flag for the questions deck.
2. **Leaving the page.** Starting the conversation closes the page view and shows the chat (same as
   "Create a page"). The page's unsaved in-page state is lost (pages reload when reopened).
3. **The page cannot tell if the update finished.** It only learns "opened". Frontier Lab's
   freshness chip updates when the session rebuilds the page.
4. **Model choice.** A direct start uses your saved default model; a weekly update on an expensive
   model costs more. The dialog option (question 1) lets you pick.
5. **Not now** returns you to the page with nothing changed; the button can be pressed again later
   (subject to the rate limit).

---

## 6. Changes by file (for the build stage, not now)

- `shared/pages-types.ts` — `PageConnection` gains `{ id; kind: 'session'; label?: string; prompt: string }`;
  `PagesBridge.startSession?(id, entryId)`; result type.
- `main/pages/page-connections.ts` — parse `session` (project-only, bounds), fingerprint
  `session|sha256`, `covers()` false, `methodAllowed()` n/a.
- `main/pages/pages-service.ts` — `startSession(pageId, entryId, opts)`: declared? approved? rate?
  returns `{ cwd, prompt }` read from disk.
- `main/ipc/pages.ts` — `pages:start-session` entry (phone allowed); `preload.ts`,
  `remote-pages-bridge.ts`, `ipc-channels.test.ts` parity lists.
- `app/.../SessionService.kt` — add `pages:start-session` to the not-implemented list (one string,
  no logic; allowed under the rebuild plan).
- `renderer/components/pages/page-theme.ts` — bootstrap `startSession`, message constants, define
  only when declared.
- `renderer/components/pages/PageHost.tsx` — handle the message, call the bridge, show the card,
  call `onStartSession`.
- `renderer/components/pages/page-connections.tsx` — `describeConnection` sentence; first-use dialog;
  `needsApproval` ignores `session`; connections dialog shows the message.
- `renderer/App.tsx` — `onStartSession` prop wired to `createSession` or `setPageCreate`.
- Workbench fake (`renderer/dev/workbench/…`) — a fake page with a `session` entry and screens for the
  card (`shoot` names `pages/page/…#start-session`).
- Page-builder skill — document the field and the "message waits unsent" behaviour (ships with the
  held 0.2.0 update).

---

## 7. Android

- **Standalone Android:** no change in behaviour. Pages are not available there, so the ability is not
  either; add the channel name to the not-implemented list so the shared UI degrades instead of timing
  out. No Kotlin logic (rebuild plan rule).
- **Paired phone (remote access):** works through the computer. The page runs in the phone's screen,
  `pages:start-session` and `session:create` run on the computer, the new conversation appears on
  both. The card shows on the phone. `initialInput` reaches the phone via the create answer
  (`adoptCreatedSession`); verify the phone's InputBar fills it (untested today for remote — test plan
  item 9).
- **After the Android rebuild** (phone runs the computer's core): the same code serves it with no
  extra work, provided the desktop-only assumptions above stay in shared code.

---

## 8. Test plan

Unit (desktop, `npx vitest`):
1. `page-connections-manifest.test.ts` — `session` parsed on a project page; dropped on a personal
   page; dropped when `prompt` is missing, empty, too long or has control characters; max 4; does not
   trip the `open` mixing rule.
2. `page-connections.test.ts` — fingerprint changes when the prompt changes, not when `label` or `id`
   changes.
3. `pages-connections-service.test.ts` — `startSession`: unknown page / undeclared id → refused;
   unapproved → `NEEDS_APPROVAL`; approved → returns the **disk** prompt and `home.path`; prompt
   edited on disk after approval → `NEEDS_APPROVAL`; removed approval → `NEEDS_APPROVAL`.
4. Rate gate — 2nd call within 30 s refused; 6th within an hour refused; Not now counts; in-flight
   refusal.
5. `page-theme.test.ts` — `startSession` exists only when declared; posts the expected message;
   forged result for an unknown request id resolves nothing.
6. `PageHost` test — a message from another window is ignored; a call without user activation is
   refused; approved call invokes `onStartSession` with the project path and the disk prompt (not the
   page-supplied one).
7. `PageApproval.test.tsx` (or a new test) — the card names the project and shows the full message;
   `needsApproval` is false for a page whose only unapproved line is `session`.
8. `ipc-channels.test.ts` — `pages:start-session` in the table, preload, remote shim, and Android's
   not-implemented list.

Integration / manual (dev instance only, `bash scripts/run-dev.sh --label "Page start session"`; never
the installed app):
9. Paired phone: press Update now on the phone; card on the phone; conversation opens on computer and
   phone with the message waiting in the box.
10. Frontier Lab end to end: first press shows the card; Allow → chat opens in
    Frontier-AI-Lab-Assistant with the message waiting; second press → no card; Remove in the
    connections dialog → card returns.
11. Skip-permissions default on → the new conversation still starts with prompts (if question 3 is
    answered that way).
12. `shoot` screens for the card in light/dark and narrow viewport; `scripts/verify.sh`.

---

## 9. Build order (after the questions deck)

Questions deck → card mockups in the workbench → UX tester → review deck → contract → technical
design review → build (main check + channel, bootstrap, host, card, App wiring) → reviewers → grader →
acceptance deck. Short route possible only if Destin says so (`feature-flow.md` "Short route").

---

## 10. OPEN QUESTIONS for Destin

Written for the questions deck. Each one: what happens today, the choice, and what you would notice.

**1. When you press the page's button, should YouCoded open the "new conversation" window first, or
go straight to the conversation?**
- **A. Straight to the conversation** (uses your saved default folder-model-settings; folder is the
  page's project). *Pros:* one click, then Enter. *Cons:* you can't pick a cheaper or stronger model
  for this one run without changing it afterwards.
- **B. Show the new-conversation window every time** (the same one "Create a page" uses), with the
  project already chosen and the message waiting. *Pros:* you see and can change the model each time;
  doubles as a confirmation. *Cons:* an extra click every week.
- *Recommendation: A.* The approval card already confirms the first time, and the message still waits
  for your Enter, so B's extra window adds little safety.

**2. Should the message be sent for you, or wait in the box until you press Enter?**
- **A. Always waits** for Enter. *Pros:* nothing ever runs without you looking; a strange page can
  never act on its own. *Cons:* one extra key press.
- **B. Sent automatically**, after you allowed it once. *Pros:* truly one click. *Cons:* the assistant
  starts working before you read anything; a page from someone else becomes much more dangerous.
- **C. Your choice per page**, a checkbox on the approval card ("Send it for me next time"), off by
  default. *Pros:* convenience where you trust the page. *Cons:* one more thing on the card to
  understand.
- *Recommendation: A for now, C later if the extra Enter annoys you.*

**3. If your usual setting is "skip permission prompts", should a conversation started by a page skip
them too?**
- **A. Never** — page-started conversations always ask before risky actions. *Pros:* a page can't
  quietly start a conversation that runs commands without asking. *Cons:* a weekly update may stop
  more often to ask you.
- **B. Follow your usual setting**, and the card says so. *Pros:* consistent with your other
  conversations. *Cons:* with auto-send (question 2B) this would let a page start unattended work.
- *Recommendation: A*, especially if question 2 ever becomes B or C.

**4. Should pages that are not in a project (your personal pages) get this ability?**
- **A. No — project pages only.** *Pros:* the folder is always obvious and fixed. *Cons:* a personal
  dashboard can't start a conversation.
- **B. Yes, in your default folder.** *Pros:* works everywhere. *Cons:* "your default folder" can
  change, so the page's conversations could land somewhere you didn't expect.
- **C. Yes, and the card asks you to pick the folder once.** *Pros:* flexible and explicit. *Cons:*
  more card to design and remember.
- *Recommendation: A now*; Frontier Lab is a project page.

**5. When should the approval card appear?**
- **A. The first time you press the button**, as a window over the page. *Pros:* asked at the moment
  it makes sense; the page opens normally. *Cons:* differs from the other connections, which ask
  before a page opens.
- **B. Before the page opens**, together with any other connections. *Pros:* one familiar card,
  everything up front. *Cons:* Frontier Lab couldn't be read until you answer a question about a
  button you may not press.
- *Recommendation: A.*

**6. Can you allow it from your phone (when paired to the computer)?**
- **A. Yes.** *Pros:* the button works the same on the phone. *Cons:* a quick tap on a small screen is
  easier to do without reading the message.
- **B. Only on the computer;** the phone shows "Finish on your computer" like keys do. *Pros:*
  approvals happen on the bigger screen. *Cons:* the first use must be on the computer.
- *Recommendation: A* — no secret is involved, and the conversation opens visibly on both.

**7. How many times may a page start a conversation?**
- **A. 1 per 30 seconds, 5 per hour** (proposed). *Pros:* stops runaway pages; plenty for a weekly
  button. *Cons:* a page with several buttons used in a burst may say "try again shortly".
- **B. No limit beyond "only on a click".** *Pros:* simplest. *Cons:* a buggy page with a click loop
  could open many conversations.
- *Recommendation: A.*

**8. The "Code changed since you allowed this" note will appear after every weekly Frontier Lab
update. What should happen?**
- **A. Don't show it for pages whose only permission is starting conversations** (the message is
  checked separately). *Pros:* no weekly nag. *Cons:* you are not told when such a page's code changes.
- **B. Keep it**, you dismiss it weekly. *Pros:* consistent. *Cons:* a note you learn to ignore.
- **C. Change Frontier Lab** to keep its weekly data in its saved data instead of rewriting its code.
  *Pros:* the note then means a real code change. *Cons:* work in the Frontier Lab project; the page
  loads its data a moment later.
- *Recommendation: A, and consider C later.*

**9. Should a page be able to send its own message text (for example "update only the Papers
section"), instead of only the fixed messages in its settings file?**
- **A. No — fixed messages only** (proposed). *Pros:* what you approved is exactly what gets typed;
  website text can't sneak in. *Cons:* a page needs one entry per variation.
- **B. Yes, but always shown and waiting unsent.** *Pros:* flexible. *Cons:* the approval card can no
  longer tell you what will be typed; a page that reads websites could pass their words along.
- *Recommendation: A.*
