---
date: 2026-10-14
status: active
type: build-report
topic: Page start session — build report
spec: docs/active/specs/2026-10-14-page-start-session-design.md
app_branch: session/page-start-session (itsdestin/youcoded), commit 70b5e781b, pushed
---

# Page start session — build report

## In plain words

A page can now have a button that opens YouCoded's normal new-session window with a message
already filled in. The page asks once, on the usual approval card, before it opens. After that,
rebuilding the page or its data never asks again. Nothing is sent until you press Start and then
Enter in the chat.

## Files changed (app repo, `youcoded/desktop/`)

| File | What changed |
|---|---|
| `src/shared/pages-types.ts` | New connection kind `{ id; kind: 'session' }`; `MAX_PAGE_SESSION_PROMPT = 20_000` |
| `src/main/pages/page-connections.ts` | Parses `session` (no settings, one per page); fingerprint is the constant `session`; reaches no address and allows no request; not a credential, so it never trips the whole-internet mixing rule |
| `src/main/pages/pages-service.ts` | Allowing a `session` line records no code hash; dismissing "code changed" never gives it one; no credential |
| `src/main/pages/pages-store.ts` | The "code changed" check skips `session` approvals; the "last updated" band needs at least one network line |
| `src/renderer/components/pages/page-theme.ts` | `window.youcoded.startSession({ prompt, project? })` exists only when an approved `session` line is present. It always resolves `{ ok }` and refuses an empty or over-20,000-character message without posting. New messages `youcoded:session:start` / `:result` |
| `src/renderer/components/pages/PageHost.tsx` | Relays the request from its own frame only. Checks the approval and the message again, picks the folder, calls the new `onStartSession` prop and answers `{ ok: true }` (window opened) |
| `src/renderer/components/pages/PageCreateDialog.tsx` | `startSessionRequest()`: "Start a conversation" / "From <page>", with the prompt as the composer text |
| `src/renderer/App.tsx` | Wires `onStartSession` to the existing new-session window (2 lines) |
| `src/renderer/components/pages/page-connections.tsx` | Card sentence: "Open a new-conversation window with a message this page writes. You'll see the message and choose the project before anything is sent." |
| `src/renderer/dev/workbench/{fixtures/pages.ts, screens/pages.ts, mock-shim.ts}` | Fake project page `page-weekly-briefing` with a `session` line and an "Update now" button; screen `pages/page/page-weekly-briefing`; the mock's Allow gives no "updated" time to a session-only page |
| `line-budgets.json` | `App.tsx` 4677 → 4679 (the two-line prop; the request shaping was moved out of App) |
| Tests | `page-connections-manifest`, `pages-connections-service`, `page-theme`, `PageApproval` (extended); `page-start-session.test.tsx` (new, PageHost) |

## Tests run

- RED first: 17 new tests failed before any code was written (`npx vitest run` on the 5 files).
- GREEN: the same 5 files plus 7 neighbouring Pages test files: **12 files, 165 tests passed**.
  The new PageHost file was run 3 times in a row, green each time.
- `bash scripts/verify.sh <worktree>/youcoded`: **all checks passed**: types (src and tests),
  related tests plus source-scanning guards (about 3,880 tests in 164 files), knip, oxlint,
  design lint, ast-grep, `shoot --check` (the new screen opens) and journeys.
- Not run: Android (`./gradlew test`). The design changes no Kotlin, and standalone Android has no Pages.

## Deviations from the design, and why

1. **A personal page's `project` is used only when it matches one of the person's saved project
   folders.** Otherwise the window starts on the saved default. Why: the page's own script writes
   that path. A folder the person never added (`/etc`, a hidden settings folder) should not be
   preselected where a quick Start could miss it. The picker still lets him choose any folder.
2. **A page whose only line is `session` shows no "last updated" time in the band.** The design
   says nothing about this. Without the change, such a page (Frontier Lab) would show "Not
   updated yet" forever, because it never fetches anything. A page that also has a network line
   keeps the band as before.
3. **A project page ignores the page's `project` suggestion and always starts in its own
   project.** The design says this for project pages. Noted here so the test that pins it is not
   a surprise.
4. **The page-builder skill was not edited.** It lives in `wecoded-marketplace`
   (`wecoded-pages-plugin/skills/page-builder/SKILL.md`), which is outside this worktree. The text
   to add is below.
5. **Frontier Lab itself was not changed.** It is its own project, outside this task: add the
   field there and call `startSession({ prompt })`.

### Text for the page-builder skill

Put it after the "Saved data goes through `window.youcoded`" bullet in "Building a page", step 3:

> - **Starting a conversation from the page.** To give the page a button that opens a new
>   conversation with a message already written, add
>   `"connections": [{ "id": "start-session", "kind": "session" }]` to `page.json` and call
>   `window.youcoded.startSession({ prompt: '…' })`. It opens YouCoded's new-session window with
>   the message in the box. The person checks the project, model and permission toggle, presses
>   Start, and the message still waits until they press Enter. It resolves `{ ok: true }` when the
>   window opened, otherwise `{ ok: false }`, and never throws. Keep the message under 20,000
>   characters. A project page always starts in its own project. A personal page may pass
>   `project: '<folder path>'`, which is used only if it is one of the person's saved project
>   folders. Check `typeof window.youcoded.startSession === 'function'` first and keep a fallback,
>   such as a box with the message to copy, for older apps. The person allows this once, on the
>   page's approval card. Editing the page or its data later never asks again.

## How to try it in a dev instance (never the installed app)

From the workspace worktree `/home/destin/youcoded-dev/worktrees/sessions/page-start-session`:

```
bash scripts/run-dev.sh --path /home/destin/youcoded-dev/worktrees/sessions/page-start-session/youcoded --label "Page start session"
```

1. **Fast look without real pages:** `bash scripts/run-workbench.sh`, then open
   `?openPage=page-weekly-briefing`. You should see the card with the new line. Press Allow and
   open, then Update now. The "Start a conversation · From Weekly briefing" window opens.
2. **Real page (dev instance):** in a project folder's `Pages/<slug>/page.json`, add
   `"connections": [{ "id": "start-session", "kind": "session" }]`. Give `page.html` a button
   that calls `window.youcoded.startSession({ prompt: 'hello' })`. Open the page and the card
   shows first. Press Allow. Then press the button and the window opens in that project. Press
   Start and the chat opens with "hello" waiting, unsent. Press Enter to send it.
3. Edit `page.html` or `data.json` and reopen the page. There should be no card and no "code
   changed" note.
4. Personal page: the window starts on the saved default folder.
5. Paired phone: same as step 2. Check that the phone's message box fills (spec §6). This is not
   verified yet.

## Fix round (2026-10-14) — code review findings

App commit `b83b8af3e` on `session/page-start-session` (pushed). Review:
`page-start-session.code-review.md`. Tests were written first and failed, then passed.

- **F1, hidden characters:** a message with format characters (zero-width spaces and joiners,
  word joiners, text-direction marks, U+FEFF, soft hyphen: all of Unicode Cf) or the tag block
  U+E0000–E007F is refused in the page bridge and in PageHost, with a plain reason. The cost is
  that an emoji built with a zero-width joiner (👩‍💻) is refused too.
- **F2, one window:** while the window is open, a page's request is turned down, never swapped
  in. This holds for two requests in the same instant too.
- **F2, real click (no rate limit):** the bridge needs the page frame's own "just clicked"
  signal. PageHost needs the app window's signal, which a click inside the page also sets, and
  needs the page to still hold the focus. So a timer cannot open the window, and a page cannot
  reopen it straight after Cancel (Cancel moves the focus off the page). Noted in design §2 as the
  same rule as "you press Start yourself".
- Every refusal now says why: `{ ok: false, reason }`.
- **F3:** the approval is checked again after the folder lookup.
- **F5:** one sentence added to design §3.
- **F6:** a suggested folder now matches regardless of upper/lower case or slash style. The answer
  is still the person's own saved entry.
- **F7:** new tests cover a declared line that is not yet approved (in the bridge) and dismissing
  "code changed" (the session line stays without a code hash). A host-side test for an unapproved
  line is impossible because such a page is never framed: it shows the approval card.
- **Left:** F4, showing the message inside the window or putting the caret at its start. That is a
  UI design call and needs a review deck. F8, the paired-phone prefill, still needs a run by hand
  (step 5 above). Also new and unverified on the phone: the "just clicked" signal needs a browser
  that supports it (Safari 16.4+), and without it the call is refused.

verify.sh: all checks passed (types, tests, knip, lint, design lint, ast-grep, shoot --check,
journeys). Android and the Worker are not covered; no Kotlin changed.
