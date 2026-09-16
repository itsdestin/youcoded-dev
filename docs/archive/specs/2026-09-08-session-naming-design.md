---
status: shipped
date: 2026-09-08
---

# Session naming — design and implementation record

Destin asked for automatic session naming that is simpler and more reliable,
refreshed as a conversation progresses, and — the point of the request — that
never replaces a name he chose himself. Questions deck, six visual review
rounds and the contract deck are in
`../design/2026-09-08-session-naming/`; the contract's twelve rows are the
acceptance list. This document is the final design: what was decided, what was
built, and what is still not proven.

## What the user gets

**Assistant settings → General → Session naming**, three choices:

| | What it does |
|---|---|
| Off | Keeps existing names. Nothing is generated, nothing is updated, no model is asked. You can still rename by hand. |
| Basic (default) | Names a new conversation after your opening request. No model call ever. It keeps that name, and it never touches a conversation that already had one. |
| AI | Names after reply 1, refines after reply 3, then reviews every 25 completed replies. Reviews may keep the current name. Uses the conversation's own model, or a model you pick. |

**Renaming.** An active session's menu has *Rename session* above *Move to new
window*. A saved conversation's name in the Resume Browser carries the file
viewer's pencil and dotted underline, always visible, and clicking anywhere on
the name opens the same dialog. The dialog offers only Cancel and Save name.

**A name you save is yours.** It survives every later automatic pass, a
restart, a resume, and a sync from a device that generated something else.
Saving the same text still takes ownership — that is the button for someone who
likes the generated name and wants it to stop moving. A blank name is refused.

**There is no way back to automatic naming.** Review 3 removed that action
("get rid of that button. it's dumb"), so a renamed conversation stays renamed
until you type something else. The generated name is still remembered, so if
that turns out to be wrong, offering it back later costs no model call. Filed
on `docs/roadmap/chat-data.md` rather than built against the contract.

## How it is built

`session-namer.ts` holds the whole policy for both session kinds and replaced
`native-title-feeder.ts` (one bound-model call at the first `turn-complete`,
native only).

- **A reply is a transcript `turn-complete`.** Both tailers emit it only when
  the model finished answering — the CC one requires `stop_reason !==
  'tool_use'` — so a turn that ran twenty tools counts as the one reply it is.
- **The schedule is a cursor, not an equality test.** `replies >=
  nextReviewAt(reviewed)`. A replayed completion (the takeover/resume hand-off
  delivers two) is filtered by transcript uuid; a missed one still reviews at
  the next reply rather than skipping the mark forever.
- **Which model.** The chosen naming model wins. Otherwise the session's own —
  which a Claude Code session does not have, because its model lives inside the
  CLI. That case is handed to the bundled Auto-Title hook: the conversation's
  own model, in-session, free. No paid provider is ever substituted silently.
- **Ownership is re-checked after the model call**, inside the write lock,
  because that is the window in which the user renames. The commit refuses and
  the broadcast is skipped, rather than raced. Changing the mode or the model
  invalidates every generation in flight.
- **Failure is silent.** A provider that is down or a model that was removed
  leaves the name on screen untouched and retries next reply, three times per
  scheduled review, then waits for the next one.

### Ownership storage — and why it is a second store

`ConversationRecord.title` cannot carry ownership. `store-core.ts`'s
`parseRecord` rebuilds a fixed whitelist of fields, so an older client that
reads and rewrites a record drops anything it has never heard of — which is
exactly the mixed-version case ownership exists to survive. And `title` merges
with conversation ACTIVITY, so a rename made on an idle laptop loses to a
busier phone's newer turn.

So: `Personal/ConversationNames/<provider>/<id>.json`, a directory no older
build opens, scans or rewrites, holding `manual` / `auto` with a timestamp
each, plus the `replies` / `reviewed` schedule counters.
`ConversationRecord.title` stays the compatibility PROJECTION, so every
existing reader — Resume Browser, chatsearch, remote, peers on old builds —
shows the right text without knowing the sidecar exists.

The merge is a content-tiebroken lattice join: commutative, associative, and
per-slot rather than activity-ranked. A CLEAR is a real event carrying its own
timestamp, so "I handed this back on my laptop" beats "I named it yesterday on
my phone" instead of losing to it. `replies`/`reviewed` merge by max, so a
device that was closed for ten replies cannot rewind the schedule. Sync
conflict copies are folded through the same merge before the copies are
deleted.

### The Auto-Title hook, and the waste it was causing

The hook now reads two files the app writes: a one-word mode file under the
app instance's own `userData`, found through the `YOUCODED_NAMING_MODE_FILE`
environment variable every session inherits, and `~/.claude/topics/ask-<id>`.
The mode is per-instance on purpose: `~/.claude/topics` is shared by every
YouCoded process on the machine, so a fixed path there would have let a dev
instance set to Off silently switch off auto-titling in the installed app. Off and Basic stop it from asking
at all — the cost is not the title, it is interrupting a reply to demand one —
and AI asks only at a scheduled review. That closes the roadmap item "the
auto-title reminder fires about six times per conversation — 277 wasted round
trips across 46 sessions".

A MISSING mode file keeps the original 120s/600s timer. That is deliberate:
the same script ships to Android, whose runtime does not schedule reviews, and
a hook that went silent there would stop naming phone conversations
altogether.

### Legacy conversations

Provenance for a name written before this feature existed is unknowable, so
nothing guesses. Basic refuses to touch a conversation that already has a name.
No migration runs, and no conversation is named in bulk — naming only ever
acts on a live reply.

## Platforms

- **Desktop:** everything above.
- **A phone or browser driving the desktop:** everything above. The five
  channels run the same implementation as the local path, injected into the
  remote server, so a remote rename cannot bypass a gate the local one enforces.
- **Android running Claude Code locally:** not supported, and it says so. It
  has no provider registry, no ownership store and no naming preference. The
  channels answer not-implemented, and the remote shim reads naming capability
  off the auth handshake, so the settings card, the Rename item and the
  saved-session pencil render nothing at all rather than appearing and then
  failing. Android conversations keep being named by the hook's own timer.

## Evidence

`bash scripts/verify.sh --full` green — types, the full desktop suite, knip,
lint, ast-grep. Android `./gradlew test`: 741 passed, 0 failed.

Covering, specifically: rename during generation (both via the namer and via a
record written from elsewhere); disable during generation; duplicate and
replayed completion events; missed completions; restart; a store write that
fails; an empty model reply; a provider that is down; blank-name refusal; the
clear-vs-rename merge in both directions; conflict-copy folding, including an
unparseable copy; and the hook's gate ordering.

## Reviewed

A fresh code reviewer with none of this context read the branch against the
contract: `../reviews/2026-09-09-session-naming-code-review.md`. Twelve
findings, all accepted, all fixed, re-verified. Two of them meant renaming did
not visibly work in the shipping app at all — both hidden by the design
workbench, whose fake dispatched an update event the real code never did. That
is the durable lesson from this feature: a workbench review proves the design,
never the wiring.

## Not proven

- **Cross-device sync of the ownership record.** It needs two real devices and
  two real builds. The merge is unit-tested and the file is inside the Personal
  sync space; that the engine carries it, and that the two devices converge, is
  Destin's check.
- **Android**, beyond "it compiles and refuses honestly". Its 741 tests pass;
  none of them exercise naming, because there is nothing there to exercise.
- **The generated names themselves.** No model evaluation has run. If the
  naming prompt is tuned, the harness evaluator is the tool, and a paid run is
  Destin's decision.
