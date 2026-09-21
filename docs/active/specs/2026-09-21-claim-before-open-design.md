---
date: 2026-09-21
status: draft
type: spec
topic: Claim-before-open — atomic conversation admission (deck Q-1/Q-2/Q-3), replacing open-then-acquire
source-deck: docs/active/design/2026-09-21-lease-handoff/lease-handoff.questions.json
audit: docs/active/investigations/2026-09-21-conversation-lease-handoff-audit.md
---

# Claim-before-open: atomic conversation admission

## What was decided (deck answers, 2026-09-21)

- **Q-1 — claim before opening**, with two riders: (a) measure the real claim round-trip first
  (DONE — elapsed-ms now logged on every `[lease]` op, `c1b5e8f4`; read it off the two devices
  before committing the order), (b) **an escape hatch: a claim that cannot run never blocks
  opening a conversation.**
- **Q-2 — losing device gets a message + Try again**, not the other copy opened for it, not a
  forced-takeover offer.
- **Q-3 — waking device yields** to the device that kept working, with a take-over-on-this-device
  affordance that runs the existing takeover in reverse.

## Why this shape (from the audit + code facts, all verified 2026-09-21)

1. **The gate already pays a hub round trip today.** `resume-lease-gate.ts` runs `leaseQuery`
   (`op:get` → DO) before any session is created. Today's order is *query → open → acquire*
   (two hub round trips + a race between the last two). Claim-first is *acquire → open* —
   one round trip, and the race window disappears because the lease is held before the session
   exists.
2. **The never-block escape hatch already exists in the transport.**
   `sync-hub-socket.ts request()` (169–179) resolves `null` immediately when not connected, on a
   5 s timeout otherwise. `lease-client.acquire()` already treats `null` as "hold optimistically"
   (comment at 429–431). So "claim can't run" degrades to today's optimistic hold **with no new
   code** — the rider is satisfied by reusing that contract, not by inventing one.
3. **Acquire is already atomic at the DO.** `room.ts` denies a second acquire (the audit's H4
   loser denial). What's missing is only that the *client* opens the session before it asks —
   which is the thing this change stops doing.
4. **Denied acquire must now be loud.** Today a denial is swallowed and the session opens anyway
   (audit H1: `.catch(() => {})`, unconditional `return {outcome:'acquired'}`). Under
   claim-before-open a denial happens BEFORE any session exists, so it becomes the Q-2 message
   instead.

## The flow

### Normal resume (holder elsewhere or free)

1. `handleResumeSession` → `runLeaseTakeoverGate` runs as today.
2. When the gate decides "resume", the session's **first hub op is `acquire`**, awaited
   (5 s cap via the socket), BEFORE `session:create` / session object creation.
3. `acquire` ok → create the session. The post-start acquire the code does today is dropped
   for this path (it is the race).
4. `acquire` denied (someone holds) → **Q-2 message**: "This conversation moved to your other
   device." Buttons: Try again / Leave it. No session is created. Try again re-runs step 2.
5. `acquire` null (hub down / timeout / socket absent) → **proceed as today** — the lease
   client holds optimistically; today's post-start acquire still runs on this path only, so
   the hub gets the claim when it can. No new UI. (Q-1 rider: never block.)

### What is explicitly NOT changed

- The takeover dialog's three phases (`confirm`/`force`/`undeliverable`) — those fire when the
  gate SEES another holder, before this flow starts. Unchanged.
- The holder side (`createHolderTakeover`), `pushMoved`, `MovedGate`, renewals, expiry sweeps.
- Never-block semantics end-to-end: a hub that answers nothing leaves behaviour exactly as
  today (optimistic hold + post-start acquire).
- Android: out of scope (Q-9 — copy says so; the shared gate already proceeds on Android's
  stub-reject).

## The waking-device rider (Q-3) — second slice, same branch

Mechanism today: a holder sleeps past the 300 s TTL; the DO lazily clears the record; another
device acquires cleanly. The old holder only notices on its next renew, and tears down.

Q-3 adds, on the OLD holder's renew-discovery path (already exists in `lease-client.ts`
323–365): when a renew learns the lease was lost to another holder AND the local session is
still live — before stepping aside — offer the reverse takeover (interrupt/flush/release flow
in reverse: request `takeover` against the CURRENT holder, wait for their release, re-acquire,
keep writing). This is the "take back over / resume on this device" Destin described. The
affordance must be dismissable — the default is still yield (Q-3's chosen winner), so a device
left unattended never fights back on its own.

Design detail to settle in review: whether the affordance is a dialog (blocking) or a
non-blocking pill with an action button. Leaning pill-with-action: a modal on wake contradicts
"the device that stayed awake never sees its conversation pulled out from under it" only if the
old device grabs back automatically — a pill that waits for a human is fine. Second reviewer
may overrule.

**RESOLVED 2026-09-21 (build): no new UI is needed.** The existing MovedGate pill IS the
affordance, non-blocking by construction: renew-discovery tears down (Q-3's yield-by-default)
and the session's pill re-renders as the Moved gate ("This session was taken over on <device>")
whose **"Resume on this device"** button now runs the NEW claim-first gate: claim → denied
(holder is the other device) → Try again → still held → falls through to the takeover dialog
(confirm → hand-off → force). That is the reverse handoff this section described — the holder
releases, the waking device re-acquires, the conversation continues here — with no third
surface to design, and the deny-first gate guarantees nothing is created before ownership is
settled. Pinned by `resume-lease-gate.test.ts` "Try again + still denied falls through to the
takeover gate" and its decline-release companion. The pill-vs-dialog open question therefore
dissolves: the pill is the entry, the takeover dialog (Q-2's module) is the ask.

## Tests to add (pinning the decisions)

- `resume-lease-gate.test.ts`: claim-before-open — `session:create` is NOT called when acquire
  is denied; the Q-2 phase is surfaced with Try again.
- `lease-client.test.ts`: null-acquire path still opens the session (escape hatch pin).
- `lease-client.test.ts`: renew-discovers-loss keeps the session and surfaces the affordance
  only when a live local session exists.
- `requester-takeover.test.ts`: unchanged flows still pass (takeover/force paths untouched).

## Honest limits (stated, not hidden)

- Claim-first adds ONE blocking step to resume on a HEALTHY hub: the 5s-capped acquire. The
  `leaseQuery` it replaces already costs a round trip today; net latency is expected flat, and
  the Q-1 rider's `[lease] …ms` log is how we verify that on real devices before shipping.
- The race is narrowed to the optimistic-hold path (hub down), where it already exists today
  and is accepted (never-block). A healthy hub no longer has the H1/H4 window at all.
- H5's TTL-expiry race is narrowed to "sleep past TTL, second device acquires in the
  expired-but-unrenewed window" — the Q-3 affordance covers the old holder's side when it
  wakes; it does not prevent the window itself (that would need server-side fencing/epoch,
  a separate decision — filed on the roadmap already via the admission item).
