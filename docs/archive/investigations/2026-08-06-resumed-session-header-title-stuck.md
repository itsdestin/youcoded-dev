# Investigation: resumed-session header title stuck on "Resuming…"

> **SHIPPED — and two claims below are WRONG. Read the Corrections section at the
> bottom before trusting §5 or §7c.** Fixed by youcoded PR #286
> (`fix/native-resume-title-reapply`); plan at
> `docs/archive/plans/2026-08-06-native-resume-title-reapply.md`.

**Date:** 2026-08-06 · **Status:** Investigation only (no fix implemented)
**Location:** `desktop/src/` — renderer (`App.tsx`), main (`ipc-handlers.ts`,
`native-title-feeder.ts`, `native-session-host.ts`, `session-manager.ts`,
`session-id-mapping.ts`, `conversations/service.ts`, `conversations/store-core.ts`,
`session-browser.ts`).

---

## 1. Reported symptom

Resumed sessions — **mostly native**, but *sometimes* Claude Code — have their
name in the header bar (session pill) stuck on `Resuming…` / `Resuming...`
instead of filling in with the correct session name.

---

## 2. How the header name works (the mechanism)

The session pill in the header reads `sessions[i].name`
(`desktop/src/renderer/components/SessionStrip.tsx`), fed from App state.

On resume, the renderer creates the session **with a placeholder name**:

| Runtime | Placeholder | Site |
|---|---|---|
| Claude Code | `'Resuming...'` | `App.tsx:2396` |
| Native | `'Resuming…'` | `App.tsx:2358` |
| (fresh session) | `'New Session'` | `App.tsx:2242` |

The pill is renamed **only** when the renderer receives a `session:renamed`
event (`App.tsx:1315`, which maps `{...s, name}` over the sessions array).
So the bug is: **a real rename event never arrives** (or arrives late) after a
resume.

Where those rename events come from — there are exactly two producers:

1. **CC topic-file watcher** (`ipc-handlers.ts` `startWatching`, ~2531):
   watches `~/.claude/topics/topic-<claudeId>`, fed by the CC auto-title hook.
   Pushes a rename on initial read / file change. Only wired up for a session
   when the app sees a CC `SessionStart` **hook event** (keyed off
   `sessionIdMap`, see `session-id-mapping.ts`).
2. **Native title feeder** (`native-title-feeder.ts`) → `onTitle`
   (`ipc-handlers.ts:2270`): generates a title from the bound model at first
   `turn-complete`, then broadcasts a rename. **Only fires when a NEW title is
   generated** — never re-pushes an existing one.

---

## 3. Why native sessions get stuck (structural)

Three facts combine:

1. On resume, the renderer names the session `'Resuming…'` and there is **no
   other producer** of a rename for a native session.
2. The native title feeder only ever *writes* a rename inside `onTitle`, which
   runs **only when it generates a new title** at first `turn-complete`.
3. The feeder's guard short-circuits the moment a real title already exists:

   ```js
   // ipc-handlers.ts:2260 — hasTitle
   const rec = await getConversationStore()?.get('native', sessionId);
   if (rec?.title && rec.title !== 'Untitled') return true; // already titled → skip
   ```

Result: on a **fresh** session, the first `turn-complete` generates and pushes a
title. On any **later** resume of an already-titled session (very common), the
guard says "already titled, nothing to do," and **nothing re-pushes the stored
name onto the live pill.** The placeholder is the last name written → stuck.
Also affected: a resumed session with no new turn yet, or a provider/binding
hiccup during generation.

That's why it's "mostly native" — a *structural* gap, not a race.

## 4. Why Claude Code is "sometimes" stuck (conditional)

For CC sessions the topic watcher *can* re-push a title, but it depends on:

- the `SessionStart` hook event arriving and wiring up `startWatching`
  (`ipc-handlers.ts:2611`), and
- the topic file being present and differing from what's already tracked.

If the hook event is missed/late, or the topic file naming is gated by the
`source` logic in `session-id-mapping.ts` (a `startup` on an already-mapped
session is deliberately refused), the watcher isn't (re)bound to a topic and no
rename arrives → pill stays stuck. So CC is hit-and-miss rather than always.

---

## 5. Key finding: the name is already available at resume time

The mechanism for the header pill and the source for the Resume Browser are the
**same data**, and it's already loaded during a native resume.

- The **Resume Browser** name comes from `session-browser.ts` `readTopic()`
  precedence: `topic file → synced conversation index → transcript-derived
  fallback` (`session-browser.ts:165`, `:364`), plus the store record for native
  sessions. It consistently shows a real name.
- The **native resume handler** already fetches that same record:

  ```js
  // ipc-handlers.ts:579
  const rec = await getConversationStore()?.get('native', opts.resumeSessionId);
  // rec.title is right here, already in hand
  ```

So for native there's **no new lookup needed** — the record (and its real,
non-placeholder `rec.title`) is fetched as part of resolving the resume target.
Re-applying the name is the same two calls the feeder already makes:
`sendForSession(id, SESSION_RENAMED, id, title)` + `broadcastRename(id, title)`
(which is what updates the pill via `App.tsx:1315`).

---

## 6. Is there a recorded reason we DON'T re-apply? (No)

Searched git history and docs for a deliberate "don't re-hydrate the name on
resume" decision. The closest related work is commit `7711cc48`:

> `fix(conversations): reserved-name guard + placeholder-title re-apply guard`

But that guard does the **opposite** of what we'd want here — it prevents a
*placeholder* (`'Untitled'`) from **clobbering a real title** during store
upserts (plus a Windows reserved-device-name guard). It is about **storing**
titles, not about **re-applying a stored title to the live session pill on
resume**. There is no rationale recorded against re-applying on resume — the
absence of a re-apply path appears to be an **oversight/gap**, not a design
choice.

There IS one convention a fix must respect — the codebase already carefully
distinguishes **real** titles from **placeholder** strings (`''`, `'New
Session'`, `'Untitled'`) across `store-core.ts` (`realTitle`),
`session-browser.ts:165`, `reconciler.ts:78`. Any re-apply must use the same
rule so a placeholder is never planted over a real name.

---

## 7. Recommendations

### 7a. Native (highest value, cleanest fix)

On native resume, after the record is fetched (or after the host resume
succeeds), if the record has a **real** (non-placeholder) title, broadcast a
rename — the same `sendForSession(id, SESSION_RENAMED, id, title)` +
`broadcastRename(id, title)` the feeder already uses. This fills the pill on
every resume, including already-titled sessions the feeder correctly skips.

Simplify/align `hasTitle` so the *generation* path and the *re-apply* path
share one definition of "real title" (reuse the existing `realTitle` convention
in `store-core.ts`).

### 7b. Claude Code (secondary)

Extend the same idea: on CC resume, re-apply the name from the usual
topic-file → index chain (the same `readTopic`-style lookup the Resume Browser
uses) when the topic watcher can't be relied on to fire. This closes the
"sometimes stuck" CC case. (Note the `source` gating in `session-id-mapping.ts`
is load-bearing for foreign-process safety — keep it intact; add a resume-time
re-apply rather than loosening the mapping.)

### 7c. Guardrails to keep

- **Only plant real titles** — never `''` / `'New Session'` / `'Untitled'` /
  `'Resuming…'`. Reuse `realTitle` everywhere so the pill, the store, and the
  Resume Browser can't drift.
- If a session genuinely has no title yet (first run, turn not complete),
  re-applying is a harmless no-op — the normal generation path fills it in later.
- Verify both platforms after any change (desktop + Android share the renderer /
  rename channel) per the IPC-parity / verify-both-rule.

### Suggested next step

This is investigation only. If you want, I can scope a minimal fix —
starting with **7a native resume re-apply** (smallest surface, fixes the
reported "mostly native" symptom) — and decide whether to also cover the CC
path (7b) in the same change or a follow-up.

---

## Corrections (2026-08-06, written at implementation)

Three things this document got wrong. They were caught while planning and
reviewing the fix; recorded here because an archived investigation gets read by
future sessions as if it were true.

### §5 is wrong on the common path — the record is NOT already in hand

§5 claims the store record is fetched during native resume at
`ipc-handlers.ts:579`, so re-applying "needs no new lookup." That line sits
inside the **`else` branch** — it runs only when `opts.cwd` is absent, foreign,
or holds no transcript for the id. The happy path (local resume: `opts.cwd`
exists *and* `nativeTranscriptExists`) never reads the store at all.

Consequence for anyone acting on this doc: hanging the re-apply off that
existing `rec` variable fixes only the cross-device / foreign-cwd resume — the
*rare* case — and leaves the reported symptom untouched. The shipped fix does
its own store read.

### §7c is backwards — re-applying is NOT a harmless no-op for untitled sessions

§7c says that if a session has no title yet, "re-applying is a harmless no-op —
the normal generation path fills it in later." The generation path was **blocked
for exactly that case**, which is a second, independent bug this document
missed entirely.

`hasTitle` (`ipc-handlers.ts:2259`) fell back to
`!!session?.name && session.name !== 'New Session'`. `session-manager.ts:86/149`
copies the renderer's `opts.name` straight into `SessionInfo`, so on resume that
name is literally `'Resuming…'` — not `'New Session'` — so `hasTitle` answered
**true** and the feeder skipped generation on every `turn-complete`, forever. A
resumed, never-titled native session could never get a title at all.

The root cause of both bugs is the same and this document didn't name it:
`'Resuming…'` was a placeholder that no part of the codebase *recognized* as
one. The fix introduces `shared/session-title.ts` as the single definition.

### §2's "exactly two producers" was right, but the mechanism has a third failure mode

Not an error in the doc, but a gap: a native conversation with **no stored
title** is named in the Resume Browser from a *derived* title (its first user
message, `harness/session-store.ts:220-228`), which the store-based re-apply
does not read. Such a session still shows `Resuming…` until its next completed
turn. Tracked on the ROADMAP rather than fixed, because planting derived
first-message text on the pill is a copy decision.

### What shipped

Native only. §7b (Claude Code) was deliberately left out — its topic-file
watcher is a working producer whose failure is conditional on hook timing and
the `source` gating in `session-id-mapping.ts`, which is load-bearing for
foreign-process safety. Separate diagnosis.

Review of the fix also turned up an unrelated, worse bug in the same handler: a
native session created or resumed from a **second main window** was delivered to
window 1, because `assignSession` ran after the native branch's `await`s while
the `session-created` forward drained on `process.nextTick`. Fixed in the same
PR, pinned by `tests/session-create-ownership-order.test.ts`.
