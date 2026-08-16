---
status: draft
date: 2026-08-16
revised: 2026-08-16 (Clock 1 left as-is — see §8)
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

The mid-stream watchdog stops ending turns. At 90 seconds of silence it flips
the thinking indicator to a red **"Provider may have stalled — [Retry]"** card
that counts up indefinitely, and lights the session's status dot red. The turn
ends only when the model responds or the user acts.

## §1 The two clocks, before and after

The watchdog judges silence by whether anything has arrived yet in the current
step.

| | Clock 1 — nothing has arrived yet | Clock 2 — arrived, then went quiet |
|---|---|---|
| **Today: threshold** | 240s + 20ms/prompt-token, capped 15 min | 60s |
| **Today: grace** | +15s countdown | +15s countdown |
| **Today: outcome** | auto-retry if safe, else kill the turn | auto-retry if safe, else kill the turn |
| **After: threshold** | unchanged | **90s** |
| **After: grace** | none — the card is the outcome | none |
| **After: outcome** | **unchanged** — auto-retry if safe, else kill the turn | **stalled card, turn stays alive** |

**Clock 1 is deliberately untouched** (§8). This change is Clock 2 only.

Constants live at `harness-session.ts:437-438` (`STALL_WARNING_MS`,
`STALL_RETRY_COUNTDOWN_MS`) and are already overridable per-session for tests.

**Any chunk re-arms the clock** — visible text, hidden reasoning, or tool-call
argument fragments. That is unchanged and is what makes a 90-second silence
meaningful.

## §2 The stalled state machine

```
        silence begins
              │
              ▼
   ┌──────────────────────┐   chunk arrives
   │  normal spinner      │◄──────────────────┐
   └──────────┬───────────┘                   │
              │ 90s silent                    │
              ▼                               │
   ┌──────────────────────────────────────┐   │
   │ SILENT AUTO-RETRY (unchanged)        │   │
   │ only if nothing streamed this step   │───┘
   │ AND first attempt. User sees nothing.│
   └──────────┬───────────────────────────┘
              │ not available, or the retry also stalled
              ▼
   ┌──────────────────────────────────────┐
   │ 🔴 STALLED CARD                       │
   │ "Provider may have stalled —          │
   │  no response for 2m 14s"  [Retry]     │
   │ counts up forever                     │
   └───┬──────────────────────────┬────────┘
       │ chunk arrives            │ user clicks Retry
       ▼                          ▼
   card clears, turn        dead stream dropped,
   continues normally       step re-run, spinner returns
```

The silent auto-retry stays exactly as it is. When re-running is provably safe
(nothing on screen yet, first attempt) asking the user would be noise. The card
appears only when that escape hatch is spent or unavailable — which is the
2026-08-16 case.

**Race:** a chunk can arrive between the click and the abort. The retry is
guarded by a per-step generation counter; if the step advanced, Retry is a
no-op and the card is already gone.

## §3 What Retry actually does

**It re-runs the current step. It does not re-send the user's message.**

This matters. Everything completed earlier in the turn — tool calls, their
results, previous assistant text — is intact and stays intact. Only the step
that stalled is re-run.

`HarnessSession` already knows how to do this: it is the same internal path the
silent auto-retry uses (`STALL_RETRY` → `consumeStep` re-runs `runStreamOnce`).
The manual retry reaches that path from outside, and is **not** limited to one
attempt the way the automatic one is.

**Correction to an earlier estimate.** The unwired button in `ChatView.tsx:954`
carries a TODO pointing at `native-send.ts`. That helper sends a **new user
message** (`native:send`), which would append a visible user bubble and fork the
conversation. It is the wrong target for a stall retry. The button's *rendering*
is reusable; its intended wiring is not.

**Consequence the user sees:** a half-written sentence is discarded and
rewritten. In the incident that was *"Now I'll dispatch independent read-only
specialists…"* — the model would write it again, possibly with different
wording.

The alternative — feeding the partial sentence back and asking the model to
continue from it — needs assistant-prefill support that OpenAI-compatible
providers (which is what OpenRouter and every local engine speak here) do not
offer reliably. Rejected as unreliable, not as undesirable.

## §4 Status dot semantics

Destin's rule, adopted verbatim:

> **Amber** = "this is taking a while and something may be wrong, but I don't
> know." **Red** = "something definitely needs your attention."

Red intentionally overlaps with the permission prompt. Both mean *act now*.

| Attention state | Means | Dot today | Dot after |
|---|---|---|---|
| `stuck` | Claude Code's spinner froze ≥10s — might be fine | 🟠 | 🟠 unchanged |
| `session-died` | The process exited mid-turn | 🟠 | 🔴 |
| `error` | Provider returned an error, turn is dead | 🟠 | 🔴 |
| `stalled` *(new)* | Silent ≥90s, turn still alive | — | 🔴 |

This resolves a contradiction already in the code: `AttentionBanner` draws a red
ring around `session-died` and `error` (its `DESTRUCTIVE` list) while
`useSessionAttention` colors their dots amber. After this change the banner and
the dot agree, and exactly one amber state remains — the one that means "I don't
know," which is precisely what amber is for.

**A bug this fixes on the way past.** Today the stall-warning heartbeat sets
`attentionState: 'ok'` (`chat-reducer.ts:731`), so during the entire 60-second
countdown the dot stays **green** — the app actively asserts health while
telling the user it may be hanging. The new `stalled` state replaces that lie.

Dot priority becomes: red (permission **or** stalled/died/error) → amber
(`stuck`) → green (working) → blue (unseen) → gray (idle).

## §5 Copy

**Card, first line** (count-up, updates every second):

> Provider may have stalled — no response for **2m 14s**

**Card, action:** `Retry`

**Why not name a cause.** We cannot distinguish a hung upstream from a dead
socket and never will (§ Problem). "May have stalled" is general and
non-committal, and pairs with an action — the shape
`docs/error-message-standards.md` requires when the cause is genuinely unknown.
Naming OpenRouter would be a guess, and the same card serves local models.

**Existing `StreamStallError` copy is retired for Clock 2 only.** Its text —
"The model stopped responding… send your message again to retry" — asserts a
cause we haven't verified and instructs the user to do the one thing that
duplicates work. The class is **not** deleted: its `'prefill'` phase still
fires for Clock 1, which is unchanged (§8). Only the `'streaming'` phase
becomes unreachable.

## §6 Persistence: don't lose the last thing on screen

`SessionStore` writes a still-streaming assistant part to disk only at a turn
boundary — `turn-complete`, `user-interrupt`, or `session-error`
(`session-store.ts:58`, and the KNOWN LIMITATION note above it). This design
removes the boundary, so quitting during a parked turn would lose the trailing
text the user is looking at.

**Fix:** flush the open part when the stalled card is raised. Not a turn
boundary — the turn continues — just a flush, the same way `session-error`
flushes without persisting its own line.

## §7 Typing during a stall

`InputBar` **queues** messages sent while a turn is in flight (up to 10). With
turns that never end, typing "continue" into a stalled session would park the
message forever, silently.

**Fix:** while the stalled card is showing, Enter performs the Retry action —
the message is discarded and the step re-runs. This makes the obvious instinct
do the obvious thing.

Rejected alternative: send the typed text as a new user message. That forks the
conversation mid-turn, which is the exact hazard the send queue exists to
prevent.

## §8 Clock 1 stays as it is — decided

Aligning Clock 1 (waiting for the first byte) was raised and **declined**
(Destin, 2026-08-16). Clock 1 keeps its budget, keeps `StreamStallError`, and
keeps ending the turn when the budget expires.

The case for aligning it was consistency; the case against is that Clock 1 has
not actually hurt anyone since its budget was fixed on 2026-07-26. It already
waits four minutes at minimum and up to fifteen, it already shows a live
prompt-reading readout on local models, and no incident since has been traced to
it. Clock 2 is where the two recorded turn-killings happened.

Consequences, stated plainly so nobody rediscovers them as bugs:

- **The two clocks now behave differently at their deadline.** Clock 2 waits for
  you; Clock 1 gives up. A user cannot tell from the screen which clock they are
  on. Accepted for now — revisit if Clock 1 ever kills a real turn.
- `StreamStallError`'s `'streaming'` phase becomes unreachable; its `'prefill'`
  phase stays live. The class is not deleted (§5).
- `tests/prefill-watchdog.test.ts` is untouched by this work.

## §9 Surfaces and parity

Retry needs a new channel — **`native:retry`** — because no existing one does
"re-run the stalled step." It carries `{ sessionId }`, fire-and-forget, and
mirrors `native:interrupt` exactly.

| Surface | File | Behavior |
|---|---|---|
| Main handler | `ipc-handlers.ts` | route to `NativeSessionHost` → `HarnessSession` |
| Preload | `preload.ts` | `NATIVE_RETRY: 'native:retry'` + `native.retry()` |
| Remote shim | `renderer/remote-shim.ts` | `fire('native:retry', …)` |
| Remote WS | `remote-server.ts` | `case 'native:retry'` |
| Android | `runtime/SessionService.kt` | not-implemented-on-mobile |

**Android is genuinely unaffected.** It hosts Claude Code sessions only — every
`native:*` channel already replies not-implemented-on-mobile
(`SessionService.kt:3703-3723`), and the streaming watchdog exists nowhere
outside `desktop/src/main/harness/`. Android bundles the same React renderer, so
the card compiles and renders; it simply never fires there.

**Remote (phone → desktop) is affected and must work.** Native sessions are
fully live over the WebSocket bridge, so a stall on the desktop must show the
red card and a working Retry on a phone.

**Claude Code sessions are untouched.** They run the real CLI in a separate
worker process with its own retry and error reporting. Nothing here reaches
them.

## §10 What is NOT changing

- The silent auto-retry and its one-attempt limit (§2).
- The provider-error backoff — 3 tries at 1s/2s/4s for 429/5xx/ECONNRESET,
  honoring `retry-after` (`harness-session.ts:2383`). Silence is not an error,
  so it never engaged; that is correct and stays.
- Clock 1 in every respect — threshold, countdown, and its turn-ending
  outcome (§8).
- ESC / interrupt, which already ends any turn at any moment and remains the
  way to abandon a stalled one without retrying.
- The `stuck` attention state and its amber dot.
- Any Claude Code or Android behavior.

## §11 Tests

**Changed** — `tests/harness-stall-watchdog.test.ts` (5 cases today). Two invert:

- *"stall on BOTH the first attempt and the retry: second warning is non-retry,
  ends in session-error"* → ends in the **stalled card**, turn alive.
- *"stall AFTER content already streamed: does NOT retry, errors immediately"*
  → raises the **stalled card**, turn alive.

Two are unchanged and must stay green: the happy-path auto-retry, and *"a stream
that keeps emitting (slower than the warn window) NEVER trips the watchdog."*

**New:**

- The card raises at 90s, not 60s or 75s.
- A chunk arriving after the card is up clears it and the turn completes
  normally.
- Retry re-runs the step and preserves earlier tool results from the same turn.
- Retry is a no-op if a chunk landed first (generation guard).
- The open assistant part is on disk once the card is raised (§6).
- `stalled` maps to a red dot; `session-died` and `error` do too; `stuck` stays
  amber.
- Enter while stalled retries instead of queueing (§7).
- `native:retry` channel parity across the five surfaces
  (`tests/ipc-channels.test.ts`).

**Untouched:** `tests/prefill-watchdog.test.ts`. Clock 1 is unchanged (§8), so
every assertion in it — including the `StreamStallError` `'prefill'` phase copy
— must stay green exactly as written. A change there means this work leaked
into Clock 1.

## §12 Risks

**A stalled turn parked overnight.** The card counts up forever and the dead
socket stays open. Bounded in practice: one socket per stalled session, the dot
is red, and ESC always works. Accepted — this is the point of the design.

**Retry can be pressed repeatedly against a truly dead provider.** Each press
re-sends the full conversation and costs input tokens (~108k in the incident).
Not free. The card does not warn about this; adding a cost estimate is
deliberately out of scope, but it is why the card says "Retry" and not
"Try again automatically."

**Red gets busier.** Two states that are amber today become red (§4). If red
starts appearing often enough to be ignored, the rule needs revisiting — but
the states that moved are both "turn is over, act now," which is what red means
under Destin's rule.

**Two clocks, two different endings.** Clock 2 waits for you forever; Clock 1
still kills the turn (§8). Nothing on screen distinguishes them, so a turn that
dies at the fifteen-minute mark will look like the new design failing rather
than the old one still running. If that happens once, align Clock 1.

**A model that is legitimately silent for >90s.** Some providers hide reasoning
entirely, so a long think looks identical to a stall. Today that kills the turn;
after this change it raises a card the user can ignore while the model finishes.
Strictly better, and the reason the threshold moved up from 60s at all.
