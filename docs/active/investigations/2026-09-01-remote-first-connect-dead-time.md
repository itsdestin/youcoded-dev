---
date: 2026-09-01
status: active
type: investigation
topic: remote first-connect is slow — ~2.5 s of scripted dead time is proven; the white-screen bottleneck is not
---

# Remote first-connect: what is proven and what is not

**Symptom.** A first connect from a phone sits on a white screen for seconds, and the
chat takes a further beat to fill in. Destin confirmed on his phone (2026-07-20) that the
Tier-1 byte-shaving merge (youcoded `0cbb72ba`) changed nothing he could feel on LAN.

## Proven: ~2.5 s of scripted dead time before chat replays (pay it on every connect)

`youcoded/desktop/src/main/remote-server.ts` → `replayBuffers()` sends the session list,
then `await this.requestSnapshot()` (2000 ms internal timeout — on timeout it costs the
full 2 s AND returns `degraded: true`), then a hardcoded `setTimeout(…, 500)` before it
replays PTY buffers and hook events. The comment above the timer concedes the worst case.
<!-- claim: {"path": "youcoded/desktop/src/main/remote-server.ts", "contains": "worst-case total delay before PTY/hook"} -->

Inside that timer the hook buffers are replayed **one WS frame per event**, up to
10,000 per session — batch them. This delay is post-auth, so it lengthens
time-to-first-CHAT, not necessarily time-to-first-PAINT; measure which one Destin is
seeing before assuming.

**Fix shape.** Have the client ACK `chat:hydrate` instead of guessing 500 ms; stop
serialising snapshot → PTY. This is the same change as commit 2 of the hydration plan —
see `docs/active/investigations/2026-09-01-remote-hydration-ordering-and-view-parity.md`.

## Unproven: the seconds of white before React mounts

Over LAN the whole critical path (HTML + CSS + 552 kB compressed entry chunk) lands in
~120 ms (CDP against the dev server), so bytes are not the LAN bottleneck. Likely
candidates: parsing/executing the 1,969 kB single-chunk bundle on phone-class CPU, plus
the WebSocket connect+auth gate that blocks `App` from mounting (`index.tsx` Root: no
`App` until `connected || hasConnectedOnce`). A 6× CPU throttle in headless Chrome did
NOT reproduce the sustained white (React mounted <100 ms), so emulation is not
representative — get a real trace off the device (`chrome://inspect` on Android, Safari
Web Inspector on iOS) before spending effort. **Do not repeat the Tier-1 mistake of
optimising a number without confirming it maps to wall-clock the user feels.**

## Keep (Tier 1, shipped `0cbb72ba`)

brotli/gzip with `Vary`; `immutable` on content-hashed `assets/`, `no-cache` on
`index.html` (else clients strand on a stale build); brotli **q5 not q11** (38 ms vs
4,719 ms on the entry chunk); compressed bytes cached per (asset, encoding); inline boot
skeleton. Pinned by `tests/remote-static-policy.test.ts`. Still worth having on
cellular / Tailscale-over-WAN.

## Tier 3 levers, if the trace points there

`serializeChatState` (`chat-types.ts`) is unbounded — full timeline, every tool call,
all `seenUuids`, every session, one frame; PTY buffers are 4 MB/session. Bundle has no
`manualChunks` (`SettingsPanel`/`MarketplaceScreen`/`GameLobby` are not lazy);
`MarketplaceProvider` mounts at app root firing 7 IPC calls; `theme-context.tsx` awaits
`theme:read-file` in a serial `for` loop; three `fetch`es in `skill-provider.ts` have
no timeout; `skills:list` is called three times on mount. Ruled out: the
`isFirstRun === null` gate — the shim stubs `firstRun.getState()` to resolve immediately.

**History.** Added 2026-07-20. Re-checked against `master` 2026-09-01: the 500 ms timer
and the per-event hook replay are unchanged.
