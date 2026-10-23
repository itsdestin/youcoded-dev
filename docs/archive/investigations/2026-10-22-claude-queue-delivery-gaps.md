---
status: active
---
# Claude Code message queue (1.3.2): reported gaps, findings, proposals

Scope: the durable host queue that now carries every ordinary Claude Code chat send
(`desktop/src/main/claude-queue*.ts`, `claude-control-*`, `pty-worker.js` queue lanes,
`renderer/state/submit-outgoing.ts`, `renderer/components/QueuedMessagesStrip.tsx`).
Delivery model: host claims the head item, the native plugin inside Claude Code
`prompt.fill`s the composer with the prepared "wire" text, reads it back, and only on an
exact match the host's worker presses one owned Enter. Code paths below are in
`youcoded/desktop/src/`.

## Issue 1 — a message sits in the terminal box, never sends, shows "Unconfirmed"

**Reported:** text appeared in Claude Code's input area as if pasted, did not send, and the
queue strip showed it "Unconfirmed" though nothing was ahead of it.

**Findings (evidence: `~/.claude/desktop.log` 2026-10-23T05:06:53Z, queue journal
`~/.config/youcoded/claude-queues/abf84d76….json`, transcript `e3dec0a3….jsonl`):**
- `Native delivery classification kind=revoked ageMs=40 entered=false beforeAdmission=true
  composerSafe=false detail="cleanupLength=37; trimEqual=false"`.
- The message was a quote-chip message; its transcript copy (sent 27 s later by a manual
  Enter in the terminal, outside the queue) is exactly 37 chars:
  `⦃“Still open: should the firs…”⦄ what` (contains U+00A0 ×4, no zero-width chars).
- Cause: `InputBar.tsx:912` passes `originalText: effectiveMessage` — the raw composer
  draft whose chips are DRAFT tokens (`⦃` + zero-width key `[​‌]+⁠` +
  label + `⦄`, `compose-ref.ts:makeDraftToken`). `sendViaHostQueue`
  (`submit-outgoing.ts:84`) prefers `originalText` over `ptyText`, so the queue never sees
  `expandDraftTokens()` output. Claude Code's composer drops the zero-width characters on
  fill → plugin readback ≠ wire (`claude-queue-plugin.ts` `queueStage`) → throw →
  `queueRevoke` → box text ≠ wire → refuses to erase ("might be a human draft") →
  `composerSafe:false` → host `queue.uncertain()` → strip label "Unconfirmed".
- Second-order: the model would also have received only the truncated chip label, not
  the full reference marker, had it gone through.
- "Unconfirmed with nothing ahead": idle sends go through the queue as `immediate` items
  that are hidden from the strip (`claude-queue-runtime.ts:75`) until they go wrong.

**Proposal:**
1. Queue `originalText` = `expandDraftTokens(effectiveMessage)` (same text the legacy path
   sends). Keep the draft-form text only for the composer-restore path, or make restore
   re-tokenize expanded markers (`composer-draft-recovery.ts` already does this for drafts).
2. Defense in depth in `prepareClaudeQueueInput`: remove characters Claude Code's composer
   is known to drop (zero-width U+200B–U+200D, U+2060, U+FEFF) from the wire, so a future
   path that leaks them cannot re-create the stuck state. (Must not change the hash
   semantics: hash is of the final wire.)
3. Plugin: after `prompt.fill`, the worker still owns keyboard input (`queue-acquire`
   holds ordinary writes), so whatever `prompt.read()` returns right after OUR fill is
   ours. Record that readback; on mismatch, clear the box only if it still equals that
   recorded readback, and report `revoked … composerSafe:true` with a distinct detail
   (`stage:readback-mismatch`). Host then marks the item NOT SENT (definitive: never
   admitted, box clean) and pauses it with a plain issue ("Couldn't place this message in
   Claude Code's box…") instead of "Unconfirmed", and must not auto-retry the same wire
   in a loop.

## Issue 2 — "Read this entire file" applied to attachments, not just `@file`

**Reported:** meant only for `@file` references; it also shows up for pasted images and
files.

**Findings:** `claude-queue-input.ts:prepareClaudeQueueInput` adds every entry of
`attachments` (pasted images, dropped/picked files) to the file list, and any non-empty
list prepends `Read this entire file: "<abs>"` lines + a "Use Read before answering…"
paragraph. Confirmed in transcripts (two pasted PNGs, 2026-10-23T04:58Z/04:59Z). Owner's
decision (archive `design/2026-10-19-claude-queues/claude-queues.input-scope.answers.json`
Q-5) was for `@file` mentions only. The broadening came from a probe where a LEADING bare
path, sent mid-turn, was deferred to after the turn
(`archive/investigations/2026-10-19-claude-queue-timing/FILE-INSTRUCTION-AND-ADMISSION.md`).
Also: the chat bubble for such a message comes from the transcript and therefore shows
the instruction wording (no mapping back to what the user typed).

**Proposal:** attachments go at the END of the wire as plain lines
`Attached: "<absolute path>"` (one per file, after a blank line); `@file` mentions keep
the read instruction. Prove with the offline fake-API real-CLI harness
(`test-conpty/test-claude-queue-transport.mjs`, needs its CLI path updated — it pins
2.1.303, which is no longer installed) that a trailing-Attached message sent mid-turn is
admitted into the running turn, not deferred. Map transcript lines back to what the user
typed (see Issue 4's sendId mapping) so bubbles show the user's text plus file chips,
never the wire additions. Fallback for history older than the journal's tombstones:
strip a trailing `Attached:` block / the known instruction prefix when displaying.

## Issue 3 — no way to recover from "Unconfirmed"

**Reported:** the chat UI offered no real recovery; it "just kinda broke".

**Findings:**
- Strip buttons for an `uncertain` item: "Check Delivery" (`send-now` → `transport.reconcile`
  → for a live lease, re-issues the same native revoke, which re-runs the same failed
  cleanup check → stays uncertain) and "Dismiss" (`transport.dismiss` → abandon; the
  plugin preserves a box it cannot prove it owns, so the text stays in the terminal box;
  nothing returns to the chat box).
- `ClaudeQueue.uncertain()` sets `r.paused = true` (`claude-queue.ts` ~340), and
  `ClaudeQueueTransport.offer()` refuses while any attempt is un-accepted. So one
  Unconfirmed item silently stops every later message in that conversation; after
  Dismiss the runtime deliberately does not resume ("pre-existing waiting intent stays
  paused"), so the rest show "Paused" until each is "Resume and Send Now"-ed.

**Proposal:**
- Most occurrences disappear with Issue 1's fixes (and #3 of it turns the mismatch case
  into a definite "not sent").
- Unconfirmed row copy says what is known: "Claude Code may not have received this. Check
  the conversation above." Actions: **Send again** (explicit user intent: re-enqueue the
  same text/attachments as a NEW send after dismissing the uncertain attempt) and
  **Dismiss** (abandon; if the chat composer is empty, put the text back in it so nothing
  is lost). Drop "Check Delivery" from the live-lease case (it cannot learn anything new);
  keep it only for the restart case where the read-only evidence query can prove delivery.
- Resolving the uncertain item (Dismiss / Send again) un-pauses the queue and wakes it, so
  later messages continue by themselves. Rationale: the pause guards against delivering
  behind an unknown; once the user resolves the unknown, holding everything else is a trap.

## Issue 4 — visible delay between Send and the bubble (1.3.2 regression)

**Reported:** messages used to appear on Send (optimistic); now there is a gap.

**Findings:** legacy path `sendToClaudeLegacy` dispatches `USER_PROMPT` (pending bubble)
immediately. `sendViaHostQueue` dispatches nothing ("host strip/transcript only"); idle
`immediate` items are hidden from the strip; the bubble appears only when the transcript
line arrives (enqueue → native offer → stage → Enter → Claude Code writes JSONL → watcher).
The reducer rule today: `sendEpoch` rows never match an echo; a queued send writes no
pending bubble ("Task 12").

**Proposal:**
- Renderer draws a pending bubble at Send time when the conversation is idle (not thinking,
  no visible queue rows), carrying `sendId` and `sendTransport:'queue'`. When Claude is
  busy, behaviour is unchanged (the strip shows the queued row).
- Confirmation by identity, not wording: every attempt journals `wireHash` BEFORE staging.
  The transcript watcher (main) hashes each user/queued-command prompt text it reads, looks
  up a matching attempt (live item or tombstone) in the session's queue, and emits the
  user-message event with `sendId`, the user's `displayContent` and `attachments`. The
  reducer confirms the pending bubble whose `sendId` matches; otherwise it falls back to
  the existing content match. This also fixes Issue 2's bubble wording on every device and
  after a reload while tombstones last.
- Error cases: enqueue failure → remove the pending bubble and restore the text (existing
  `RESTORE_UNSENT_EVENT`); the item appears in the strip (`QUEUE_SYNCED` lists its
  `sendId`: delayed, paused, uncertain) → remove the pending bubble so it is never shown
  twice; dismissed → bubble gone. Never auto-resend.

## Issue 5 — switching to terminal view with a stacked queue stops auto-send

**Reported:** queued messages stop sending after switching to terminal view; "Interrupt
and Send Now" forces each one; auto-send never recovers. Rows showed "Queued" (not
"Paused"), so the queue was not in the Issue 3 paused state.

**Findings so far:** `offer()` requires `inputSafe` = `SessionScreens.queueInputSafe`
(headless screen copy must parse as `message-box`, no pending writes, no card); no
transport warnings were logged, consistent with offers being silently declined.
"Interrupt and Send Now" bypasses that (`send-now` → revoke + Esc + prioritize +
requestIdle). Root cause under reproduction (resize-to-terminal-size layout vs
`readInputFocus`/`boxAt`; xterm focus/terminal-reply input during worker ownership; no
re-trigger of an idle offer after safety returns).

**Proposal:** fix the confirmed cause; plus a general liveness guarantee — whenever
`queueInputSafe` flips back to true (already signalled via `onQueueInputReady` → `wake`)
and waiting items exist, request an idle offer; and a slow host-side heartbeat that wakes a
non-paused queue with waiting items while Claude Code is idle, so no single missed signal
can strand it.

## Other notes found on the way
- `test-conpty/test-claude-queue-transport.mjs` hard-codes CLI 2.1.303, which is no longer
  installed (2.1.307–2.1.309 are); the "re-run the smoke on CLI upgrade" rule in
  `docs/cc-dependencies.md` cannot be followed as written.
- `cc-dependencies.md` must gain entries for anything new that depends on Claude Code
  behaviour (composer dropping zero-width chars; transcript text == staged wire text).

## What was built (branch `session/queue-delivery-fixes`, app + workspace)

Independent review of this plan changed it in places; measurements replaced guesses.

- **Measured (CLI 2.1.309, offline fake API, `test-conpty/probe-composer-fill.mjs`):** the composer always drops
  U+200B, U+200E, U+2060, U+FEFF, U+00AD, U+034F and C0 controls; drops U+200C/U+200D only outside a real joining
  context (kept in emoji ZWJ sequences, Persian, Indic); turns CR/CRLF into LF. NBSP, tabs, 3,000-character and
  40-line text are kept. **Mid-turn admission (`probe-queue-attachment-wording.mjs`):** every wording — trailing
  `Attached:`, a leading bare path, the read instruction — reached the running turn, recorded as a `queued_command`
  attachment equal to the wire. The 2026-10-19 deferral did not reproduce.
- **Issue 1:** queue gets the expanded chip text; host strips the always-dropped set; the plugin accepts a read-back
  equal to the wire minus measured drops as its own and admission submits the exact original bytes (so emoji/Persian
  joiners still reach the model). Proposal 3's "not placed" path was dropped as unnecessary (reviewer B1's loop risk
  disappears with it). Real-CLI smoke mode `joiner` fails without the fix (the stuck message) and passes with it.
- **Issue 2:** `Attached: "<path>"` lines at the end; read instruction for `@file` only; the transcript watcher
  strips both back off (`shared/claude-queue-wire.ts`) so bubbles show the person's words with file chips everywhere.
  Retained clipboard/upload copies keep their original file name after the hash, so those chips read sensibly.
- **Issue 3:** reviewer B2's narrower rule: `pauseCause` records the attempt that paused a running queue; dismissing
  exactly it resumes and wakes the queue; restart/Clear/identity pauses clear the cause and stay paused. Dismiss
  returns the words to the clicking screen's empty message box. The row explains itself ("may not have reached Claude
  Code… Dismiss puts the words back"). "Send again" was not added: Dismiss + the restored words gives the same result
  without an extra button or a confirm step for a possible double send. Reviewer B3: text in Claude Code's own box is
  now "waiting for the message box in the terminal to be empty", never Unconfirmed.
- **Issue 4:** instant pending bubble for idle sends (`canDrawSendNow`, not slash commands), `sendTransport:'queue'`
  (excluded from the renderer's retry Enter), confirmed by the host's published `bound` sendId→transcript uuid list
  (reviewer S3: identity, not hashing), removed if the host lists the send in the strip (spinner lowered), removed on
  refusal/fallback; same-sendId bubbles deduplicate. Hidden idle items reveal in the strip after 8 s.
- **Issue 5 (reproduced mechanism, ~40 real-CLI runs):** no permanent stall reproduced; confirmed a lost wake — a wake
  that arrives during an attempt was dropped, and a failed attempt on an idle Claude Code then waited the 20 s idle
  poll per message (terminal view's larger screen raises the "not safe" fraction 3.3 % → 8.2 %). Fixed: wake latched
  and answered when the attempt ends; an ask/card closing wakes the queue; backstop poll 3 s while runnable work
  waits; a busy screen at release time defers the worker release (retried on wake) instead of failing the event, which
  produced spurious "Unconfirmed" in 3/8 fuzz runs; each silent decline now logs its reason (rate-limited).
- **Harness:** the transport smoke runs `$CLAUDE_CLI` or the newest installed CLI (2.1.303 was pruned); its
  `failed-admitted` mode had failed on every version (it waited for one of two equivalent not-invoked wordings).
  All nine modes pass on the final code.
