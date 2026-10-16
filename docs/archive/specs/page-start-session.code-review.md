---
date: 2026-10-14
status: active
type: code-review
topic: Page start session — code review
app_branch: session/page-start-session (itsdestin/youcoded), commit 70b5e781b, base eac33bb80
---

# Page start session — code review

Reviewer: fresh agent, read-only. Focus: security of an untrusted page asking the app to open a session.

## verify.sh

```
PASS  types (tsgo --noEmit)
PASS  types in tests/ (tsgo --noEmit, 47 file(s) still excluded)
PASS  tests (related)            — 18 changed files + 72 source-scanning guards
PASS  dead code (knip)
PASS  lint (oxlint)
PASS  design lint (oxlint --max-warnings ratchet)
PASS  invariants (ast-grep)
PASS  screens open (shoot --check)
PASS  journeys (click paths)
OK — all checks passed.   Not covered: Android (./gradlew test), marketplace worker.
```

**Verdict: no Critical findings. Two Important findings to fix (or put to Destin) before merge.**

## Findings

### Important

- F1 — `desktop/src/renderer/components/pages/PageHost.tsx:314` — "the message is shown in full" is the only safety, but the prompt is passed on as-is. Invisible characters (Unicode tag characters U+E0000–E007F, zero-width U+200B–U+200F / U+2060–U+2064 / U+FEFF, bidi overrides U+202A–U+202E / U+2066–U+2069) reach the model but show nothing (or show reordered text) in the composer. A page can hide instructions ("…and also delete X") inside a harmless-looking message, and the person sends it with Enter. — Confirmed by reading: the host check is only `typeof`/`trim`/length; `startSessionRequest` → `initialInput` → `InputBar.tsx:376` `setText` with no filtering, and `rg` finds no invisible-character filter anywhere in `src`. — Fix: in the PageHost check, refuse (`answer(false)`) any prompt matching `/[\u{E0000}-\u{E007F}\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/u` (refuse, not strip, so the page author finds out); add a host test with a tag-character prompt.

- F2 — `desktop/src/renderer/App.tsx:4048` with `PageCreateDialog.tsx:58` — a second request while the window is already open silently replaces it. Because the form is keyed on `initialInput + cwd`, it also remounts, putting back the default folder, model and skip-permissions toggle the person just changed. A page on a timer can therefore (a) swap the message while the person is choosing, so the message they glanced at is not the one waiting, and (b) reopen the window right after every Cancel, which makes the app hard to leave (the dialog is a modal over the page). — Confirmed by reading the call chain (`onStartSession` → `setPageCreate` unconditional; PageHost has no in-flight or open check). — Fix: drop a page request while `pageCreate !== null` (answer `{ ok: false }`), and ignore requests from the same page for a short time (e.g. 2 s) after a Cancel. Design Q-6 said "no rate limits", so the cooldown part needs Destin's yes; the ignore-while-open part is a plain bug fix.

### Minor

- F3 — `PageHost.tsx:317` — after the async folder read, only the page id is re-checked, not the approval. If the person presses Remove on the session line during that read, the window still opens once. — Read. — Fix: re-check `loadedPageRef.current?.connections?.some(c => c.kind === 'session' && c.approved)` there.
- F4 — `PageCreateDialog.tsx:55-66`, `InputBar.tsx:385` — the window itself never shows the message; the person picks folder, model and the skip-permissions toggle first and reads the message only in the composer after Start, with the caret at the END (a long message shows its tail; the top is scrolled off). Nothing is sent before Enter, so this is not a hole, but the card's "You'll see the message and choose the project before anything is sent" reads as if the message is shown first. — Read. — Fix (design call): show a scrollable read-only preview of the message in the window, or place the caret at the start for page-sourced prompts.
- F5 — `page-connections.ts:302` — `session` may sit beside `open`. An `open` page can fetch its message from any server at run time, so the approval keyed to the manifest (not the code) means the message's content is fully remote-controlled with no re-ask. Acceptable if F1 is fixed (the person still reads it); worth one sentence in the design.
- F6 — `PageHost.tsx:93-107` — the suggested-folder match is exact-case and slash-sensitive (Windows `C:\Users\…` vs `c:/users/…`). Fails safe (saved default), so only a missed suggestion.
- F7 — tests: no test for a session line that is declared but NOT approved (`approved: false`) in either the bootstrap (`page-theme.test.ts`) or the host (`page-start-session.test.tsx` only uses an empty list); no test that dismissing "code changed" leaves the session record hash-less (`pages-service.ts:263`). Add both — they pin the two lines most likely to regress.
- F8 — paired phone: `remote-shim.ts:2641` has `folders.list` and `session:create` is phone-allowed, so the path works on paper; the phone's composer prefill is still unverified by hand (build report step 5). Standalone Android: no Pages, unaffected.

## Checked and fine

- Only its own frame: the shared `e.source !== frameRef.current?.contentWindow` check (PageHost.tsx:291) runs before the new branch; the test sends from `null` and `window` and both are ignored.
- Approval comes from main (`pages-store` fingerprint match), not from the page; bootstrap only defines `startSession` for an approved line, and the host re-checks.
- Size cap enforced in both bootstrap (page-theme.ts) and host, with the same shared constant; exact-limit and over-limit tests.
- Folder can't be steered: project page always `home.path`; personal page only to an entry of the person's own `folders:list`; picker still editable.
- No new IPC or main channel; `covers` and `methodAllowed` refuse `session`; no credential; CSP unchanged.
- Code-change checks for other kinds are not weakened: `pages-store.ts` drops only ids of current `session` lines, whose fingerprint must still match, and a key line cannot be relabelled as `session` without a re-ask. Test pins the mixed page.
- Fetch/Plaid answers cannot settle a session promise, and vice versa (bootstrap `session` flag).

## Not covered

Android Gradle tests (no Kotlin changed); manual dev-instance run; the page-builder skill text (outside this repo).
