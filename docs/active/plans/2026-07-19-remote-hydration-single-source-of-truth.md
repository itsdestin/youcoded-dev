---
status: draft
date: 2026-07-19
kind: plan
---

# Remote-access state sync: issue summary + proposals

Condensed from the full investigation:
`docs/active/investigations/2026-07-19-remote-access-ui-state-hydration.md`

## The problem

Remote-access UI state is often buggy and rarely matches the desktop UI.
Initial chat hydration on connect feels janky.

## Root cause

The remote client has **two competing sources of truth that race**:

1. The **live event stream** (PTY output, transcript events, hooks) — arrives
   incrementally, starts flowing the moment auth succeeds.
2. The **full-state snapshot** (`chat:hydrate`) — arrives later and blindly
   replaces the entire chat state map.

The existing 500ms `setTimeout` in `replayBuffers()` and the blind replace in
`HYDRATE_CHAT_STATE` are earlier patches over this same race. The design
(snapshot + event stream) is sound — it was just never finished, so the two
halves don't agree on ordering or identity.

## Findings (severity order)

1. **Message-ID collisions.** Timeline IDs come from a module-level counter
   (`msg-1`, `msg-2`…) that is NOT in the snapshot. A hydrated client restarts
   at 0 while its history already holds `msg-1…msg-N` → new live messages reuse
   existing IDs → React mis-reconciles → wrong/jumping UI after connect.
2. **Empty snapshot silently blanks chat.** Host snapshot times out after 2s
   and resolves `{ sessions: [] }` — a *valid* hydrate payload that replaces
   live state with nothing. No error surfaced.
3. **Hydration ordering race.** Client builds live state for ~500ms+, then the
   snapshot wipes it (the visible flash/jank); events applied in the window are
   lost; the snapshot itself can be ~2s stale and is applied as gospel.
4. **Whole category of UI state never synced.** Snapshot carries only the chat
   reducer. Active session (remote lands on `list[0]`), per-session view mode
   (chat vs terminal), etc. live in `App.tsx` useState with no sync channel.
5. **Terminal replay is one multi-MB synchronous blob**, blocking the renderer
   on connect; capped at 4MB so long sessions can never fully match.

Ruled out: uuid dedup (correctly serialized), session-id mapping (consistent),
pre-auth message drops (already fixed).

## Proposal A — Finish the snapshot design (recommended, ~1–2 days)

Make hydration the **exclusive entry point**; eliminate the race structurally:

- Client renders nothing until `chat:hydrate` arrives (gate first paint on it,
  not on `connected`).
- Server sends `chat:hydrate` **first**, before replay; client buffers live
  events until hydration completes. One ordering, enforced by a state machine
  (`connecting → hydrating → live`), not a wall-clock timer.
- **Collision-proof message IDs** (nanoid) so hydrated and live messages can
  never share a key.
- Hydrate becomes a **merge with a snapshot version/sequence number**; late or
  empty snapshots are rejected instead of wiping state.
- (~3 files: `chat-reducer.ts`, `remote-shim.ts`, `remote-server.ts`; plus
  serialization in `chat-types.ts`.)

Fixes findings 1–3 at the root. The sequence number is also the seed of any
future delta-sync protocol, so no work is thrown away.

## Proposal B — True state-sync protocol (future, ~1–2 weeks, high risk)

Replace snapshot+replay with a **versioned, delta-synchronizing protocol**:
host holds canonical state with a monotonic sequence; clients request
"everything after seq N"; host pushes deltas. UI state (active session, view
mode) joins the shared store so desktop and remote are *the same state*.

- Real payoff: devices feel like one app (fixes finding 4 properly).
- Cost: rewrite of the sync layer touching reducer, server, shim, **and** the
  Android bridge (`SessionService.kt`) — the riskiest class of change.

## Recommendation

Do **A now** — it fixes ~80% of the pain for ~10% of B's cost/risk, and isn't
"patching a shitty system": the underlying architecture is fine, it just needs
to be finished. Treat **B as a separate ROADMAP feature** ("devices feel like
one app"), specced deliberately — not backed into as a reaction to this bug.

## Verification points

- Reducer hydrate + counters: `chat-reducer.ts:14-27, 274-285`
- Serialization: `chat-types.ts:539-604`
- Server ordering: `remote-server.ts:515-569` (`replayBuffers`)
- Client dispatch order: `remote-shim.ts:367-405` (`auth:ok` → `handleMessage`)
- Client mount/gating: `index.tsx` (Root), `App.tsx:1468-1514, 1644-1675`
