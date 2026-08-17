---
status: shipped
date: 2026-08-16
shipped: 2026-08-16 (youcoded merge `28d3f82e`)
revised: 2026-08-16 (review round 2 — see "What changed in this revision")
type: spec
repos: [youcoded]
tags: [native-runtime, harness, chat-ui, attention, error-handling]
relates:
  - docs/archive/handoffs/2026-08-12-tool-streaming-visibility.md
  - docs/archive/specs/2026-08-12-tool-arg-streaming-visibility.md
---

# A stalled turn waits for you — it never dies on its own

## The problem

On 2026-08-16 a native session (`3e39db4a`, DeepSeek V4 Flash via OpenRouter)
was killed mid-turn by the streaming watchdog. The model had written one
sentence — *"Now I'll dispatch independent read-only specialists…"* — and was
about to emit four subagent briefs. The wire went silent, and 75 seconds later
the turn was over.

The turn's work up to that point (six minutes of repo recon, a seven-item plan)
survived only because Destin could scroll back and read it. Continuing meant
re-sending everything.

**The watchdog was right about the facts and wrong about the remedy.** The
stream really was silent — verified three ways:

- YouCoded's main process wrote its 30-second session heartbeat on schedule
  throughout the dead window (15:58:31, 15:59:01, 15:59:31, zero drift, four
  other sessions interleaved). The app was awake; nothing was arriving.
- No network events in the window. Nearest was a WiFi access-point hand-off
  fourteen minutes earlier, which the session survived.
- The "maybe the model was quietly writing tool arguments" theory is dead: a
  live probe of this exact model logged argument text arriving in 39 chunks,
  max gap 1.0s (`docs/archive/handoffs/2026-08-12-tool-streaming-visibility.md`).
  Any chunk re-arms the clock.

So the cause was outside our code — either the provider's upstream hung, or the
connection died silently somewhere between the laptop and OpenRouter. From
inside the app those are indistinguishable, and **they will stay
indistinguishable.** This is the second recorded instance; the first was
2026-08-12, mid-file-write.

Since we cannot tell "dead forever" from "slow, will recover," the app must
stop guessing on the user's behalf.

## The change in one sentence

At the exact moment the watchdog would kill the turn, it stops killing it: a red
**"Provider may have stalled"** card appears with **Retry** and **Stop**, counts
up indefinitely, and lights the session's status dot red. The turn ends only
when the model responds or the user acts.

**No timing changes anywhere.** The card appears where the death used to happen.

## §1 The two clocks

The watchdog judges silence by whether anything has arrived yet in the current
step. Both clocks share one two-stage timer.

| | Clock 1 — nothing has arrived yet | Clock 2 — arrived, then went quiet |
|---|---|---|
| Stage 1 (warn) | 240s + 20ms/prompt-token, capped 15 min | 60s |
| Stage 2 (grace) | +15s | +15s |
| **Today: at the end of stage 2** | auto-retry if safe, else kill the turn | auto-retry if safe, else kill the turn |
| **After: at the end of stage 2** | **unchanged** | auto-retry if safe, else **stalled card, turn stays alive** |

Nothing above the last row moves. Constants at `harness-session.ts:437-438`
(`STALL_WARNING_MS = 60s`, `STALL_RETRY_COUNTDOWN_MS = 15s`) are untouched, and
every existing test keeps its numbers.

Stage 1 is unchanged for both clocks: the existing amber "This is taking a
while, something may be wrong… Retrying in 15s…" line still appears at 60s.
That reads correctly under Destin's dot rule (§4) — amber is "I don't know" —
and now escalates to red at 75s instead of ending the turn.

**Clock 1 is deliberately untouched** (§8). This change is Clock 2 only.

**Any chunk re-arms the clock** — visible text, hidden reasoning, or tool-call
argument fragments. Unchanged, and it is what makes the silence meaningful.

> **Rejected: raising Clock 2 to 90s and dropping the grace.** Considered and
> dropped. Once the card cannot kill anything, appearing early is nearly free —
> a false alarm clears itself the moment the next chunk lands. Moving the
> number buys nothing and costs a constant change plus re-pinned test timings.

## §2 The stalled state machine

```
        silence begins
              │
              ▼
   ┌──────────────────────┐   chunk arrives
   │  normal spinner      │◄──────────────────┐
   └──────────┬───────────┘                   │
              │ 60s silent                    │
              ▼                               │
   ┌──────────────────────┐                   │
   │  amber warning       │  (unchanged copy) │
   └──────────┬───────────┘                   │
              │ +15s silent                   │
              ▼                               │
   ┌──────────────────────────────────────┐   │
   │ SILENT AUTO-RETRY (unchanged)        │   │
   │ only if nothing streamed this step   │───┘
   │ AND no retry spent yet. User sees    │
   │ nothing.                             │
   └──────────┬───────────────────────────┘
              │ not available
              ▼
   ┌──────────────────────────────────────┐
   │ 🔴 STALLED CARD                       │
   │ "Provider may have stalled —          │
   │  no response for 2m 14s"              │
   │           [Retry]  [Stop]             │
   │ counts up forever                     │
   └───┬───────────┬──────────────┬───────┘
       │ chunk     │ Retry        │ Stop
       ▼           ▼              ▼
   card clears,  unfinished     turn ends now,
   turn          text erased,   everything written
   continues     step re-runs   so far is kept
```

The silent auto-retry stays exactly as it is. When re-running is provably safe
(nothing on screen yet, first attempt) asking the user would be noise. The card
appears only when that escape hatch is spent or unavailable — which is the
2026-08-16 case.

**The auto-retry is available once per step, ever.** A manual Retry re-runs the
step as a non-first attempt, so if it stalls again the card comes back rather
than silently retrying behind the user's back. The user is already engaged;
acting without telling them would be the wrong instinct there.

## §3 How "the turn stays alive" actually works

This is the load-bearing mechanical change and it is small.

Today, when the stall timer fires, `runStreamOnce` **hangs up**: it releases the
stream reader, swallows the terminal promises, and either returns the retry
sentinel or throws. The dead socket is gone, which is why a late chunk could
never rescue the turn.

After this change, on the path that used to throw:

1. **Do not hang up.** Keep awaiting the same read. A chunk that arrives ten
   minutes later still lands, clears the card, and the turn carries on. This is
   what makes "waits for you" true rather than cosmetic.
2. **Emit the stalled heartbeat** and keep waiting.
3. **Race a third participant.** The stream read is already raced against the
   user-interrupt signal; Retry adds a second signal alongside it. Retry must
   **not** reuse the interrupt signal — interrupt ends the whole turn, which is
   the opposite of what Retry means.

That third racer also settles the race the earlier draft worried about: a chunk
arriving between the click and the teardown. The step is either still waiting
(the retry signal lands and wins) or has already moved on (nothing is listening,
the click does nothing, and the card is already gone). No generation counter
needed.

## §4 What Retry does — and the unfinished sentence

**Retry re-runs the current step. It does not re-send the user's message.**
Everything completed earlier in the turn — tool calls, their results, previous
assistant text — is intact and stays intact. Only the stalled step re-runs.

**The unfinished sentence must be explicitly erased first.** This is the part
the first draft asserted without a mechanism, and it is the part most likely to
ship as a visible bug.

The model's own memory is already clean: partial text only enters the
conversation history in `send()`'s error catch (`harness-session.ts:1817`), and
the parked path never throws. So the half-sentence exists in exactly two places
— the on-screen bubble, and the store's in-memory buffer for the open part.
Both must be dropped before the re-run, or the retry's text merges into the same
bubble and the user reads the sentence twice. (The SDK's part id falls back to
the literal `'text-0'`, so a repeat is the *likely* outcome, not a corner case.
The comment at the retry sentinel, `harness-session.ts:447`, says exactly this —
it is why the automatic retry refuses to run after content has streamed.)

**Mechanism:** one new display-only transcript event, `assistant-part-dropped`
carrying `{ partId }`, emitted immediately before the re-run.

- Reducer: remove that part from the timeline.
- `SessionStore`: `this.open.delete(sessionId)` — discard the buffer without
  writing it.
- Never persisted. Same discipline as the existing preparing-card withdrawal
  (`toolPreparing … cleared: true`).

This is the only genuinely new plumbing in the design.

**Consequence the user sees:** the half-written sentence disappears and is
rewritten, possibly with different wording. In the incident that was *"Now I'll
dispatch independent read-only specialists…"*

The alternative — feeding the partial sentence back and asking the model to
continue from it — needs assistant-prefill support that OpenAI-compatible
providers (which is what OpenRouter and every local engine speak here) do not
offer reliably. Rejected as unreliable, not as undesirable.

## §5 What Stop does

**Stop is exactly ESC.** It routes through the existing interrupt path: the turn
ends, `user-interrupt` is emitted, the partial assistant text is pushed to the
conversation history, and the store flushes the open part to disk. No new
mechanism, no new channel.

It exists because a card with one button against a provider that is genuinely
dead leaves the user only one thing to press, and each press re-sends the whole
conversation (~108k input tokens in the incident — §12). ESC does this today and
nothing on screen says so; the audience for this card is someone watching a red
box count upward. *Wait for it* or *give up and keep what I have* are both
first-class answers, so both get a button.

Stop is also the design's **save** path — see §6.

## §6 Persistence: what survives, and the one case that doesn't

`SessionStore` writes a still-streaming assistant part to disk only at a turn
boundary (`session-store.ts:55`, KNOWN LIMITATION). Every exit from the card
lands on the right side of that:

| Exit | What happens to the unfinished text |
|---|---|
| Chunk arrives | Part continues normally, flushed at turn end |
| Retry | Deliberately erased (§4) — from the screen, the model's memory, and the still-buffered part on disk |
| Stop | Turn boundary → flushed to disk, kept on screen |
| **App quit while parked** | **Lost** |

**One caveat on the Retry row.** The store buffers *one* open part at a time and
flushes it whenever a different part begins — a tool call, or a reasoning block
giving way to text (the normal shape on the model in the incident). If the
abandoned attempt had already opened a second part, its earlier text was
committed to the transcript before the stall, and the erase cannot reach back
and unwrite it. The screen stays correct; a reload can show that earlier text
twice. The transcript is append-only and rewriting committed lines is out of
scope. Recorded in a comment at the erase site so it isn't rediscovered as a bug.

**The earlier draft's "flush when the card is raised" is dropped.** It broke a
pinned test — `session-store.test.ts` → *"a stall-warning heartbeat does NOT
flush the open streaming part"* — whose comment gives the exact reason: a
watchdog heartbeat is not a turn boundary, so flushing early splits one
paragraph into two on disk. This design makes the stream resuming *more* likely,
not less, so that invariant matters more here than it did before. It also
contradicted §4: you cannot both save the unfinished sentence and erase it.

**Named residual:** quitting the app while a turn is parked loses the trailing
partial. Today that same stall ends in `session-error`, which does flush, so
this is a narrow regression for users who quit instead of pressing Stop. Judged
acceptable — the card is red, both buttons are visible, and the loss window is
identical to the hard-crash window the store already accepts. The clean general
fix (flush open parts on app shutdown, which also closes the pre-existing
limitation) is separable and deliberately out of scope here.

## §7 Typing during a stall — unchanged

`InputBar` queues messages sent while a turn is in flight (up to 10). **That
behavior is untouched.** Queued messages are already visible in the docked strip
above the composer, each with cancel and edit (`ChatView.tsx:981`), so nothing
is parked silently.

What happens to a message queued during a stall:

- Chunk arrives or Retry succeeds → delivered when the turn completes, as normal.
- Stop → turn ends, queue flushes, message sends.

> **Rejected: making Enter perform Retry while stalled.** The first draft
> proposed it on the premise that a queued message would park "silently" —
> which is false, the strip shows it. Its cost was real: text the user typed
> would be deleted with no undo. Deleting a user's words to perform an action
> they didn't ask for is the worst trade in this document.

## §8 Clock 1 stays as it is — decided

Aligning Clock 1 (waiting for the first byte) was raised and **declined**
(Destin, 2026-08-16). Clock 1 keeps its budget, keeps `StreamStallError`, and
keeps ending the turn when the budget expires.

The case for aligning it was consistency; the case against is that Clock 1 has
not actually hurt anyone since its budget was fixed on 2026-07-26. It already
waits four minutes at minimum and up to fifteen, it already shows a live
prompt-reading readout on local models, and no incident since has been traced to
it. Clock 2 is where the two recorded turn-killings happened.

**One carve-out, found while planning the implementation.** Retry re-runs the
step from the top, which lands it back on Clock 1 (nothing has arrived yet).
Left alone, pressing Retry against a genuinely dead provider would sit for the
full prefill budget and then kill the turn with Clock 1's "didn't begin
responding" error — four minutes after the user asked for the opposite, and with
copy about slow local prompts that is simply wrong for a stalled cloud provider.

So: **once a turn has parked, that turn never dies on its own again**, on either
clock. It parks, and parks again, until the user chooses. A *fresh* turn's
Clock 1 is untouched, which is what §8 decided.

The flag is per-**turn**, not per-step — it is cleared only when a new turn
starts. So after any park, *every later step in that turn* parks on Clock 1
instead of erroring, not just the step the user retried. That is deliberate: a
turn the user has already been asked about should not start dying silently three
steps later.

Consequences, stated plainly so nobody rediscovers them as bugs:

- **The two clocks now behave differently at their deadline.** Clock 2 waits for
  you; Clock 1 gives up. A user cannot tell from the screen which clock they are
  on. Accepted for now — revisit if Clock 1 ever kills a real turn.
- **After a Retry the wait before the card returns is Clock 1's, not Clock 2's**
  — up to four minutes, because the retried step is genuinely waiting for a
  first byte again. The card returns rather than an error, but not quickly.
- `StreamStallError`'s `'streaming'` phase becomes unreachable; its `'prefill'`
  phase stays live. The class is not deleted.
- `tests/prefill-watchdog.test.ts` is untouched by this work.

**No discriminator field is needed on the existing warning event.** Both clocks
keep emitting the same stage-1 `stallWarning` payload, and the new stalled card
rides a *separate* payload (`stalled: { since }`) that only Clock 2 ever emits.
The renderer distinguishes them by which field is present.

## §9 Copy

**Card, first line** (count-up, updates every second; the renderer counts from
`since`, so no repeated events are needed):

> Provider may have stalled — no response for **2m 14s**

**Card, actions:** `Retry` · `Stop`

**Why not name a cause.** We cannot distinguish a hung upstream from a dead
socket and never will (§ Problem). "May have stalled" is general and
non-committal, and pairs with actions — the shape
`docs/error-message-standards.md` requires when the cause is genuinely unknown.
Naming OpenRouter would be a guess, and the same card serves local models.

**Existing `StreamStallError` streaming copy becomes unreachable.** Its text —
"The model stopped responding… send your message again to retry" — asserts a
cause we haven't verified and instructs the user to do the one thing that
duplicates work. The class is **not** deleted: its `'prefill'` phase still fires
for Clock 1 (§8).

## §10 Status dot

Destin's rule, adopted verbatim:

> **Amber** = "this is taking a while and something may be wrong, but I don't
> know." **Red** = "something definitely needs your attention."

Red intentionally overlaps with the permission prompt. Both mean *act now*.

**10a — required by this change:**

| Attention state | Means | Dot |
|---|---|---|
| `stalled` *(new)* | Silent past the grace, turn still alive | 🔴 |

This also fixes a live bug: today the stall-warning heartbeat sets
`attentionState: 'ok'` (`chat-reducer.ts:731`), so during the entire countdown
the dot stays **green** — the app asserts health while telling the user it may
be hanging. After this change the stage-1 warning sets `stuck` (amber, "may be
wrong, I don't know") and stage 2 sets `stalled` (red).

Dot priority becomes: red (permission **or** stalled) → amber (`stuck`) → green
(working) → blue (unseen) → gray (idle).

**The card must render even when a tool card is on screen.** A preparing tool
card — the model composing a Write's arguments — is stored with status
`running`, and the chat view hides its status area whenever any tool is running.
A stall mid-arguments is exactly the 2026-08-12 incident, so `stalled` has to
bypass that gate the way the terminal states already do. Without this the red
card would be invisible in one of the two recorded cases.

**10b — separable, ships as its own commit:** `session-died` and `error` move
from amber to red. `AttentionBanner` already draws a red destructive ring around
both (`DESTRUCTIVE = ['session-died', 'error']`) while `useSessionAttention`
colors their dots amber — the banner and the dot currently disagree. Both are
"the turn is over, act now," which is what red means under the rule above.

This is correct but **has nothing to do with stalls**, and landing it inside
this feature means two dots change color for reasons Destin can't trace back to
the work he asked for. Separate commit, separate line in the release notes.

## §11 Surfaces and parity

Retry needs a new channel — **`native:retry`** — because no existing one does
"re-run the stalled step." It carries `{ sessionId }`, fire-and-forget, and
mirrors `native:interrupt` exactly. Stop needs no channel (it is `native:interrupt`).

| Surface | File | Behavior |
|---|---|---|
| Main handler | `ipc-handlers.ts` | route to `NativeSessionHost` → `HarnessSession` |
| Preload | `preload.ts` | `NATIVE_RETRY: 'native:retry'` + `native.retry()` |
| Remote shim | `renderer/remote-shim.ts` | `fire('native:retry', …)` |
| Remote WS | `remote-server.ts` | `case 'native:retry'` |
| Android | `runtime/SessionService.kt` | add to the not-implemented-on-mobile list |

**Android is genuinely unaffected.** It hosts Claude Code sessions only — every
`native:*` channel already replies not-implemented-on-mobile
(`SessionService.kt:3705-3723`, verified), and the streaming watchdog exists
nowhere outside `desktop/src/main/harness/`. Android bundles the same React
renderer, so the card compiles and renders; it simply never fires there. Being
fire-and-forget (no `msg.id`), `native:retry` no-ops there exactly as
`native:send` and `native:interrupt` already do.

**Remote (phone → desktop) is affected and must work.** Native sessions are
fully live over the WebSocket bridge, so a stall on the desktop must show the
red card with working Retry and Stop on a phone.

**Claude Code sessions are untouched.** They run the real CLI in a separate
worker process with its own retry and error reporting. Nothing here reaches
them.

**Specialist sub-sessions deliberately do NOT park.** A specialist child is a
full native session, so it would inherit parking for free — and that is a trap.
A child's heartbeats are filtered out of the parent's view (only its tool calls,
results, and text are re-emitted), so a parked child has no card to park into:
the user would see a spinning Agent card, the child's turn would never end, and
the parent's `Task` call would wait on it forever with nothing on screen
explaining why. Nothing caps a specialist run on wall-clock either. So a child
keeps the old behavior — it ends with the stall error, and the parent receives a
failure report and carries on, exactly as before this change.

Surfacing a stalled child's card *inside* the parent's Agent card, with its own
Retry, is a real feature and a reasonable follow-up. It is not attempted here.

## §12 What is NOT changing

- Every watchdog constant and threshold (§1).
- The stage-1 amber warning and its copy.
- The silent auto-retry (§2).
- The provider-error backoff — 3 tries at 1s/2s/4s for 429/5xx/ECONNRESET,
  honoring `retry-after` (`harness-session.ts:2383`). Silence is not an error,
  so it never engaged; that is correct and stays.
- Clock 1 in every respect (§8).
- The message send queue and its docked strip (§7).
- ESC / interrupt, which already ends any turn at any moment.
- The `stuck` attention state and its amber dot.
- Android behavior.
- Claude Code behavior — **with one declared exception, added 2026-08-16 after the
  whole-branch review.** The composer's square Stop button used to require
  `attentionState === 'ok'`, so the stall warning (which sets `stuck`) hid it for
  the 15s countdown — a turn no phone user could stop, since `StopButton` exists
  precisely for touch users with no ESC key. The gate now excludes only the two
  states that mean the turn is already over (`session-died`, `error`). `stuck`
  has two indistinguishable producers — the native stall warning and Claude
  Code's PTY classifier — so the fix necessarily reaches Claude Code too: a CC
  session the classifier flags as stalled now shows the Stop button where master
  hid it. Kept rather than special-cased, because it is the same defect (the CC
  session was equally un-stoppable from a phone) and the click is byte-identical
  to ESC on a button that sits *beside* Send rather than replacing it. Pinned in
  both directions by `useStreamingGate.test.tsx` and `InputBar.test.tsx` so a
  later edit cannot flip one path silently.

## §13 Tests

**Changed — `tests/harness-stall-watchdog.test.ts`** (5 cases today). Exactly one
inverts:

- *"stall AFTER content already streamed: does NOT retry, errors immediately"*
  → raises the **stalled card**, turn alive.

The rest are unchanged and must stay green — including *"stall on BOTH the first
attempt and the retry … ends in session-error"*. That case's stream never emits
a single part, so both attempts are on the **first-byte clock**, which §8 leaves
alone; it still ends the turn. A change that makes it park has stopped
distinguishing the two clocks. (The first draft of this spec listed it as
inverting. That was wrong, and the Task 1 implementer caught it.)

**Changed — `tests/session-store.test.ts`:** the two existing stall-heartbeat
cases stay green **unchanged** (that is the point of dropping the flush).
Add a sibling asserting the new `stalled` heartbeat is likewise never persisted
and does **not** flush the open part — the store's filter keys off
"assistant-thinking with no text and no partId," and that file's own comment
warns that adding a field is exactly how it silently regresses.

**New:**

- The card raises at the same moment the turn used to die (warn + countdown),
  not earlier.
- A chunk arriving after the card is up clears it and the turn completes
  normally — proving the reader was never released (§3).
- Retry re-runs the step and preserves earlier tool results from the same turn.
- Retry erases the unfinished part: the retry's text does not merge with the
  abandoned text, and nothing is left buffered in the store (§4).
- Retry while the step has already moved on is a harmless no-op.
- A manual retry that stalls again raises the card again — it never silently
  auto-retries (§2).
- Stop ends the turn, keeps the partial text on screen, and flushes it to disk.
- The parked turn never reaches `session-error` and the model's conversation
  history is unchanged by a Retry.
- `stalled` maps to a red dot; `stuck` stays amber.
- `native:retry` channel parity across the five surfaces
  (`tests/ipc-channels.test.ts`).

**Untouched:** `tests/prefill-watchdog.test.ts`. Clock 1 is unchanged (§8), so
every assertion in it — including the `StreamStallError` `'prefill'` phase copy
— must stay green exactly as written. A change there means this work leaked
into Clock 1.

## §14 Risks

**A stalled turn parked overnight.** The card counts up forever and the dead
socket stays open. Bounded in practice: one socket per stalled session, the dot
is red, and Stop and ESC both work. Accepted — this is the point of the design.

**Retry can be pressed repeatedly against a truly dead provider.** Each press
re-sends the full conversation and costs input tokens (~108k in the incident).
The card does not put a number on that; the mitigation is that Stop sits beside
Retry, so "give up and keep what I have" is one click and doesn't cost anything.
A cost estimate on the card is deliberately out of scope.

**Quitting while parked loses the trailing partial** (§6) — named, accepted, and
separately fixable.

**Two clocks, two different endings.** Clock 2 waits for you forever; Clock 1
still kills the turn (§8). Nothing on screen distinguishes them, so a turn that
dies at the fifteen-minute mark will look like the new design failing rather
than the old one still running. If that happens once, align Clock 1.

**A model that is legitimately silent for >75s.** Some providers hide reasoning
entirely, so a long think looks identical to a stall. Today that kills the turn;
after this change it raises a card the user can ignore while the model finishes.
Strictly better — and it is why the threshold did *not* need to move.

---

## What changed in this revision

Review round 2 found four defects and two pieces of scope that don't belong.

1. **§4 and §6 of the first draft contradicted each other** — one saved the
   unfinished sentence to disk, the other threw it away. Resolved in favor of
   erasing it, with the flush dropped entirely (§6).
2. **Retry's central claim was the one thing the current code refuses to do.**
   The automatic retry only fires when nothing has been written yet, precisely
   because re-running after text has streamed duplicates it — and the incident
   is the duplicating case. The erase mechanism (§4) is new in this revision.
3. **The disk flush broke a pinned test** (`session-store.test.ts`) whose
   comment states the exact reason it exists. Dropped.
4. **The Enter-hijack was justified by a false claim** ("parks silently" — the
   queue strip has been visible with cancel/edit since Task 12). Dropped (§7).
5. **The 60→90s threshold move and grace removal bought nothing** once the card
   stopped killing turns, and cost a constant change plus re-pinned timings.
   Dropped (§1).
6. **Recoloring `session-died` and `error`** is correct but unrelated; split
   into its own commit so the color change is traceable (§10b).

Added: the **Stop** button (§5) — the escape hatch, the discoverable form of
ESC, and the save path for the unfinished text all at once. Added: an explicit
account of how "stays alive" works mechanically (§3), which the first draft
described only by its behavior.

Writing the implementation plan surfaced two more holes, now folded in: a
retried step would have died on Clock 1 four minutes later (§8 carve-out), and
the card would have been invisible when the stall lands mid-tool-arguments
(§10) — which is one of the two incidents this design exists for.

Plan: `docs/active/plans/2026-08-16-stalled-turn-never-dies.md`.
