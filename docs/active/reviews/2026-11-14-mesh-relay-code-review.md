# Mesh relay code review: commit 30ca2fe (independent, adversarial)

Reviewer did not write the code. Nothing in the repo was edited; a scratch probe test was copied into worker/test, run, and removed (git status clean). Scratch copy: /tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/relay-review/probe.test.ts. Existing mesh tests: 88/88 pass, three consecutive runs.

## Verdicts

- SAFE TO MERGE FLAG-OFF: **yes** (one low-severity side effect on an existing path, finding 1).
- SAFE AS A LOCKED-DOWN TEST RELAY: **with these fixes**: findings 2 (allow-list must fail closed), 3 (idle erase must not hit a live set), 4 (account-wide cost/storage guard, or at least a documented one-room allow-list), and 8 (decide on unsigned roster changes only if a second person ever gets a device; fine for one owner).
- Public: not safe. See section "Before the public".

## Findings

### 1. LOW: new binding changes the answer on an existing path (/parties/...), flag does NOT cover it
Evidence: partyserver's routePartykitRequest (src/index.ts:186 calls it for every /parties/ path) auto-exposes EVERY Durable Object binding by kebab name, so `MESH_RELAY` is now reachable as `/parties/mesh-relay/<name>` regardless of MESH_RELAY_ENABLED. Probe: WebSocket to `/parties/mesh-relay/ABCDEF` returns 401 "sign-in ticket missing..." (it is stopped by the games ticket check, `isRoomCode` plus a ticket whose game must be connectfour or chess, src/games/tickets.ts). No Durable Object is created, and no ticket for game "mesh-relay" can be issued (isRoomGame). So it is not an entry to the relay. But: (a) "flag off means every relay path is 404" is false for this path; (b) before this commit an unknown namespace answered 400 "Invalid request", now it answers 401/400 differently, a tiny change to an existing route; (c) any future loosening of the games ticket code silently exposes the relay. Demonstrated: yes (401).
Fix: in index.ts onBeforeConnect/onBeforeRequest, refuse any lobby whose party is not connectfour/chess/presence/etc (explicit allow-list), or add a test that /parties/mesh-relay/* never reaches the object. Add that test regardless.

### 2. MEDIUM: allow-list fails open
Evidence: routes.ts:22-25 `if (!raw) return true`. A typo, an unset var, or a deploy that drops the var turns a "locked-down test relay" into an open one (every valid-hex room id wakes a new Durable Object). MESH_ALLOWED_ROOMS is also absent from wrangler.toml, so nothing records that it should be set. Demonstrated: by reading; the gate test only checks the empty case returns true (that test pins the unsafe behaviour).
Fix: when the flag is "1" and the list is empty, answer 404 (closed). Provide an explicit separate "open" setting for the public later. Pin with a test.

### 3. MEDIUM: 90-day erase can wipe a set that is in use
Evidence: relay-room.ts:531 erases when `last_connect` is older than 90 days; `last_connect` is only written on authentication (throttled hourly, :300). A device that stays connected (or an app that never reconnects) for 90 days has a live authenticated socket, yet the alarm erases the whole set and closes it with 4004. Probe: set with one live authed socket, alarm run with clock +91 days, socket closed with 4004 (set erased). Demonstrated: yes. In practice platform restarts reconnect devices far more often, but nothing guarantees it, and the consequence is total data loss.
Fix: in alarm(), if any authenticated socket exists, refresh last_connect and skip the erase. Add that test.

### 4. HIGH for public, MEDIUM for a locked test relay: unauthenticated cost and storage are unbounded account-wide
Evidence: (a) with the flag on and no allow-list, any request with a 64-hex room creates a Durable Object and runs `CREATE TABLE` (probe: 5 unauthenticated connects created 5 objects). Never-authenticated objects are never erased (no alarm armed until auth succeeds, :301). (b) Set creation needs only a valid self-made key; the only limit is the shared EVENT_RATE_LIMITER (20/min per address, per location, :283, fails open, absent in tests, shared namespace with analytics, workers.dev hostname does not matter for a binding). Each created set may hold 100 MiB of frames pre-pairing (PRE_PAIR_CAP) plus up to 4096 x 16 KiB = 64 MiB of registers that are NOT counted against any cap (relay-room.ts:461 limits count only). So roughly 164 MiB per set x 20 sets/min per address = multi-GB per minute from one address; many addresses scale linearly. There is no global byte ceiling or set counter (builder lists this). (c) Per-request cost: a request with a valid-hex room costs a Worker request plus a DO request and a WebSocket; on the free plan 100k requests/day are shared with the marketplace and sign-in, so a flood of unauthenticated connects can exhaust the daily quota for everything (T7 risk is real). Demonstrated: DO creation yes; storage/quota math by reading, UNVERIFIED against live limits.
Fix before any online test relay: keep the allow-list (finding 2) so strangers never reach a DO, and add a cheap Worker-side gate before touching the DO (rate-limit by address on ANY relay upgrade, not only creation). Before public: a global registry (one coordinating object) counting sets and bytes, hard refusal at a set count, count registers in the byte total, make the limiter fail closed, and a separate limiter namespace from analytics.

### 5. MEDIUM: connection slots can be held by a stranger who knows a room id
Evidence: relay-room.ts:129-134. Idle unauthenticated sockets count toward MAX_SOCKETS=64 for 30 s and are swept only when ANOTHER connect arrives. An attacker holding 64 fresh sockets and re-opening every 30 s keeps the room returning 503 to its real devices. Room ids are not secret from anyone who has ever seen one (they are in app state and logs the user shares). Demonstrated: the existing test shows the 503 at 64; the sustained attack follows. Fix: reserve slots for authenticated devices (cap unauthenticated sockets at e.g. 8 per room), close unauthenticated sockets from an alarm-based timer, not only on the next connect.

### 6. LOW: membership oracle through different failure answers
Evidence: auth returns `bad-signature` when the claimed device id is on the roster (:273) versus `not-on-roster` otherwise, and `removed` (:272) before verifying any signature. Anyone who knows a device id (a hash of a public key) can learn whether it is in that room and whether it was removed. Connecting itself is identical for existing and non-existing rooms (good). Fix: verify the signature first against the stored key, answer one generic refusal for all failures.

### 7. LOW: first-device can re-create a set after a total erase; removed first device can resurrect a room
Evidence: room id derives only from the first device's key (auth.ts:102). After the last member is gone or 90 days erase, a banned former first device (ban list is deleted with the set, deleteAll) can re-create the same room id. Builder knows. Safe for a test relay used by the owner; before public, add a creation epoch/nonce or a signed set certificate so the owner can retire a room id.

### 8. MEDIUM before more than one human is involved: roster add/remove are plain messages from any member
Evidence: relay-room.ts:486-521. Any authenticated device can add any key (up to 16) and remove any other device including the owner's first device; there is no signature and no approval. A compromised device, once authenticated, takes the set over and can remove every other device (erasing the set when empty). Acceptable only for the owner's own devices on a private relay. Fix: signed roster entries chained to the first key, verified by the relay and by devices.

### 9. LOW/MEDIUM: hostile member can push others' stored frames out, and flood members' bandwidth
Evidence: makeRoom (:357) frees the writer's own groups first, then others'; `pass` and `fetch-after` have no output limit beyond 300 incoming messages per 10 s (a fetch can return 4 MiB per reply; 300 per 10 s per connection, 64 connections). Members only. Fine for the owner's devices; before public, cap outbound bytes per connection and per set.

### 10. LOW: eviction path can discard data without telling anyone
Evidence: :333-334 `makeRoom` empties groups, then if the frame still does not fit it returns over-limit and the `released` broadcast (:343) is skipped. By the arithmetic at :331 it should be unreachable unless byte accounting drifts, but registers and overhead are outside `total_bytes`, so drift under the platform limit is possible. Devices would still learn through `gap` on next fetch. Fix: broadcast releases before the over-limit reply.

### 11. LOW: group lifetime counts only "line" frames
Evidence: :338 updates last_line_at only when `line === true`; a group that receives only non-line frames expires 30 days after its creation, even while in use. Behavioural question for the app; confirm intent.

### 12. LOW: unauthenticated message memory
Evidence: size check (:190) runs after the platform has buffered the message (up to 32 MiB); 64 simultaneous 32 MiB messages could exceed the object's 128 MB and reset it (room-local only). UNVERIFIED (not run). Fix: cap unauthenticated sockets (finding 5) so the worst case is bounded.

### 13. LOW: garbage keys can be added to the roster
Evidence: roster-add checks only 64 hex characters (:488). A non-curve key permanently occupies one of 16 slots (the device can never authenticate). Member-only. Fix: verify the key imports as Ed25519.

### 14. INFO, clean items verified
- Migration: tag `v4` follows v1-v3 in order, uses `new_sqlite_classes` (valid on free and paid), mirrored binding in `[env.test.durable_objects]`, migrations correctly NOT repeated in env.test. Class exported from src/index.ts. Nothing evaluated at module load beyond a regex and TextEncoders. No dry-run deploy was executed (UNVERIFIED against Cloudflare itself; CI order `migrations` then `deploy` per worker-backend rule).
- Flag-off: `meshRelayEnabled` is checked before the path is parsed (routes.ts:32); exact "1" only; gate test covers `0`, empty, `true`, `yes`, `01`, ` 1`, `1 `, undefined and spies that no namespace is touched. I could not find a /mesh/ path that slips through (only finding 1 via /parties/).
- Authentication: nonce is per socket, single use, cleared before verification, 30 s TTL; the signed message covers audience host, room, nonce and device id under a protocol-specific prefix, so cross-room, cross-relay and cross-protocol reuse fail. Whether the app checks that the challenge's `aud` equals the host it dialled is client-side: UNVERIFIED. First-device registration is self-certifying (room and device id both hash from the presented key) and re-checked after awaits, so squatting someone else's room id needs their private key. Removed devices: row flagged, sockets closed, every message re-checks the roster, re-add is refused ("banned"), reconnect refused. Sender is stamped from the connection; sequence abuse limited to the member's own numbering.
- SQL: every statement uses bound parameters; no string interpolation. Counters are validated safe integers; sizes bounded.
- Hibernation: per-connection state in socket attachments; only flood counters in memory (reset on wake, acceptable).
- Logging: one console call, event name plus 8-character room prefix, structurally pinned by a test. Error messages carry only error names and fixed strings. Frame bodies, keys and full ids never logged. One residual: the 8-character room prefix plus timing is visible to the operator (acceptable).

## Test quality (item 6)
- Solid: gate matrix, hostile-input sweeps, logging pin, structural console check.
- Still racy under load: "answers holds beyond 100 in 10 seconds" (hostile test, ~l.105) depends on all 130 messages landing inside one 10 s window of the relay's real clock; the longer waits fix only the client side. If processing stretches past 10 s the window slides and more than 100 can store. Fix: make the clock injectable (`r.now` already exists, but `flood()` uses it only via this.now(); set it fixed inside the room for that test).
- The 300-message close test has the same dependence but asserts only a close code; fine.
- Tests that pin unsafe behaviour: allow-list empty means open (finding 2).
- Missing cases: /parties/mesh-relay path (1), idle erase with a live socket (3), sustained unauthenticated slot hogging (5), erase then re-create by a banned device (7), a roster-add of a malformed key (13), register bytes counted toward cap (4), limiter failing closed.

## Builder's "not implemented" list (item 7)
| Item | Locked-down test relay (owner devices only) | Before public |
|---|---|---|
| Global byte ceiling / registry | Acceptable ONLY with a one-room allow-list in place (findings 2, 4) | Must have |
| Weak per-address creation limit | Acceptable behind allow-list | Must replace: fail closed, own namespace, per-address limit on all upgrades |
| No pairing meeting points | Fine (one owner adds keys by hand) | Needed for real users |
| Roster add/remove unsigned | Fine for one human, own devices | Must be signed (finding 8) |
| Acks unsigned | Fine | Should be signed (a member can only ack for itself, so lower risk) |
| After 90-day erase only first device's key can re-create | Fine | Revisit (finding 7) |
| Hostile member can push others' frames out | Fine | Must bound (finding 9) |
| 900 MiB ceiling | Fine; but registers (up to 64 MiB) and overhead are uncounted, so real use can exceed 900 MiB total; stay under 1 GiB per object | Count everything |

## Must fix before ANY test relay goes online
1. Allow-list fails closed (2) plus a one-room list actually configured.
2. Idle erase respects live sockets (3).
3. Guard /parties/mesh-relay explicitly and test it (1).
4. Per-address limit on every relay upgrade before the object is touched, and a plan to watch the account request quota (4).
Recommended also: cap unauthenticated sockets (5), generic auth failure answer (6).
