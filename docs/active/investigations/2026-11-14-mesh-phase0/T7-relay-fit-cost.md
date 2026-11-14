---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0, T7 relay fit and cost (Durable Object storage vs object storage, limits, monthly cost, abuse)
---

# T7: Relay fit and cost

## 1. Verdict

**PARTIAL.** The relay design fits inside the platform's limits and the prototype passed every operation in 6.4 (hold, fetch-after, received, released, registers with compare-and-swap, presence, pass-through, both alarm rules). Monthly cost is a few dollars on the paid plan, as numbers below. **But the design's "free plan today" claim does not hold past a handful of users, and "1 GB per set, no sign-in" is not safe against abuse on either plan.** Pass line ("inside platform limits; cost as numbers") is met for the paid plan, not the free plan.

## 2. What was done

- Read the existing Worker (`wecoded-marketplace/worker/`): `wrangler.toml`, `src/sync/room.ts` (335 lines), `src/sync/routes.ts`, `.github/workflows/worker-deploy.yml`.
- Fetched current Cloudflare limits and prices on 2026-11-14 (URLs in section 3).
- Built a throwaway relay in `docs/active/prototypes/2026-11-14-mesh-phase0/T7/` (SQLite-backed Durable Object, hibernatable WebSockets). Ran it only under `wrangler dev --local` (wrangler 4.157.0 from the Worker's own `node_modules/.bin`, 127.0.0.1, random port, no login, nothing deployed). State went to the scratchpad and was deleted afterward; all my processes were stopped by pid.
- Files: `src/relay.js` (the relay), `src/index.js` (router), `wrangler.toml`, `lib.mjs` (harness), `bench.mjs` (scenarios), `smoke.mjs`, `cost-model.mjs` (cost arithmetic), `results/` (raw outputs of the 1 GB, 300 MB, LRU, acks and cost runs).
- Re-run: `cd T7 && node bench.mjs <roster|bulk|small|bigchat|lru|live|alarms|acks|hibernate>`; `bulk` takes `<frameBytes> <totalMiB> <groups>`; `node cost-model.mjs`.

## 3. Findings

### 3.1 The existing Worker

1. Durable Objects are already **SQLite-backed** (`new_sqlite_classes` for all four classes), which works on the free plan: `wrangler.toml` migrations v1 to v3, comment "SQLite-backed (new_sqlite_classes) works on both free and paid plans".
2. Existing bindings: D1 (`DB`), Workers AI (`AI`), Analytics Engine, KV (`CATALOG_KV`), a `ratelimit` binding (`EVENT_RATE_LIMITER`, added through `unsafe.bindings`), DOs `PRESENCE`, `SYNC_HUB` (`SyncGroupRoom`), `CONNECTFOUR`, `CHESS`. **No R2 binding exists.**
3. `SyncGroupRoom` already uses `acceptWebSocket` (hibernation API) and `state.storage` key/value calls; it uses no alarms (`room.ts:81`, grep for `alarm` found nothing).
4. CI deploys on push to master touching `worker/**` (`worker-deploy.yml`: typecheck, test, D1 migrations, `wrangler deploy`). No plan information is in the repo. "Free plan today" rests only on Destin's 2026-11-08 correction in `connection-options.md:29`. **UNVERIFIED** which plan the account is really on; I have no account access.
5. The whole API (sign-in, marketplace, themes, games, analytics) shares one Worker on `api.youcoded.ai` and the `workers.dev` address, so it shares the account's daily request quota with the relay.

### 3.2 Platform limits and prices (all fetched 2026-11-14)

Sources: [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/), [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 get started](https://developers.cloudflare.com/r2/get-started/), [WebSocket best practices](https://developers.cloudflare.com/durable-objects/best-practices/websockets/), [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [spend management](https://developers.cloudflare.com/durable-objects/platform/spend-management/), [Rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/), [Rate Limiting binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

| Item | Workers Free | Workers Paid |
|---|---|---|
| DO storage per account (SQLite) | **5 GB total** | unlimited |
| DO storage per object | **1 GB per the FAQ; the limits table says 10 GB (the page contradicts itself; I treat 1 GB as the safe reading)** | 10 GB |
| Row / blob / key+value size | 8 MB | 8 MB |
| WebSocket message received | 32 MiB | 32 MiB |
| Per-object requests per second | soft 1,000 | soft 1,000 |
| DO requests | **100,000 per day** | 1 M/month included, then $0.15 per million |
| DO duration | 13,000 GB-s per day | 400,000 GB-s/month, then $12.50 per million |
| SQLite rows read | 5 M per day | 25 B/month, then $0.001 per million |
| SQLite rows written | **100,000 per day** | 50 M/month, then $1.00 per million |
| SQLite stored data | 5 GB | 5 GB-month, then $0.20 per GB-month |
| Worker requests (all routes, whole account) | **100,000 per day** | no limit |
| CPU per request | 10 ms (Worker); DO page says it follows Workers limits | default 30 s, up to 5 min |
| Base price | $0 | $5/month minimum |

- Incoming WebSocket messages bill 20 to 1 as requests; outgoing messages and protocol pings are free. A hibernation-eligible object is **not billed for duration while idle**; duration bills the full 128 MB while it is active. Auto-response ping/pong (`setWebSocketAutoResponse`) does not wake the object or bill duration. In-memory state is reset on hibernation; per-socket data survives only via `serializeAttachment` (16,384 bytes max).
- Every index update counts as an extra row written. Alarms: one alarm slot per object (the docs imply it; they do not say so outright), up to a minute late during maintenance.
- **R2:** free tier 10 GB-month, 1 M Class A, 10 M Class B per month; $0.015/GB-month, $4.50 per million writes, $0.36 per million reads; **egress free**. It needs an "R2 subscription" through a checkout flow (the page does not say whether a card is demanded; UNVERIFIED).
- **When the free daily quota runs out:** DO operations "will fail with an error" until 00:00 UTC (pricing page). For the Worker's 100,000 daily requests, Free accounts get error 1027 (fail-open routes bypass the Worker, fail-closed routes show the error page). **Because the relay and the marketplace API share one account, a relay flood can take the sign-in and marketplace API down for the rest of the UTC day.** Raised by a bigger account, not by a separate Worker script: the quota is per account.
- **Paid plan spending limit:** account-level, covers requests, duration, rows (not stored data). At the limit new DO requests are rejected, SQL writes and new alarms fail, already-open sockets keep passing messages, and **a held alarm older than 7 days is deleted** (my alarm design re-arms on every wake, so it recovers).
- **Rate limits available:** Free-plan WAF rate-limiting rule: 1 rule, counted by IP, 10-second window, path-only expression. The `ratelimit` Workers binding (already used here) is per Cloudflare location, approximate, and its docs advise against IP keys. Neither stops one patient client from filling its own set.

### 3.3 Can a free account hold 10 sets of 1 GB? No.

The account cap is 5 GB total (and the per-object FAQ figure is 1 GB). 10 x 1 GB = 10 GB. At best 5 sets, with every other Durable Object (presence, games, sync rooms) sharing the same 5 GB. Also my measured 1 GiB of payload produced a 1.0045 GiB database (finding 4), so a "1 GB" cap would hit the per-object limit first if the free per-object limit is 1 GB (decimal 10^9 is only 0.93 GiB). **Safe free-plan cap: about 900 MiB per set, and only 5 sets account-wide.**

### 3.4 Prototype measurements (local; workerd + SQLite on this machine, 32 cores, shared with other agents, so speeds are noisy)

4. **1 GiB of frames stored for real** (1,024 x 1 MiB frames over 100 groups, 4 in flight): 4.6 s (about 220 MB/s). Database file 1,078,571,008 bytes for 1,073,741,824 payload bytes: **0.4% overhead**. Rows written per hold: **3.1** (frame row, group row, set-total row). `results/bulk1g.json`. Production speed will differ; the point is the layout works at 1 GiB with no row-size or memory problem.
5. **One 300 MB chat** (300 x 1 MiB, one group): upload 2.2 s; downloaded by another device in 75 reply rounds of up to 4 MiB, 10.5 s total (about 28 MB/s), slowest round 439 ms; resume from frame 100 returned frames 101 onward. 901 rows written for the whole upload. `results/bigchat.json`.
6. **Message size:** a 16 MiB message was received; 33 MiB closed the connection (consistent with the documented 32 MiB inbound limit). A 1 MiB + 1 byte hold was refused by my own frame cap. Outbound message limit: UNVERIFIED (not documented on the pages I read).
7. **`reg-list` with 2,000 chats x 3 registers (6,000 registers, 300 B head / 600 B host / 600 B del): full list in about 90 to 110 ms, one 3.0 MB message, 6,001 rows read.** Writing all 6,000 took 2.4 s. With a set-wide revision counter and an index, "what changed since revision N" returned 0 registers reading 2 rows (3 ms) and 5 changed registers reading 6 rows. Without the index the same question read all 6,000 rows (measured, then fixed). A register write costs 3 rows (meta revision, register, index). Compare-and-swap: a stale token got `conflict` with the current value and token back; two devices racing on a new key got one `reg-ok` and one `conflict`.
8. **LRU release** (cap 100 MiB, 10 chats of 9 MiB, one older chat touched again, then a new chat written past the cap): exactly one group released, the least recently used one that was not the group being written; the touched chat survived. All connected devices got `released {group, throughSeq}`; a device asking for the released stretch got `gap{through}`; new lines for the released chat were accepted (next seq 10) and fetching past the mark returned them; a group growing past the cap was refused at the 101st MiB (`over-limit`). `results/lru.json`.
9. **"Every roster device has received":** table `recv(group, device, through)`; a frame is deleted when every roster device has a row and `min(through) >= seq`. Test with three devices: after the writer and one device reported, nothing was dropped; after the third reported through 6, frames up to 6 were dropped (10,000 to 4,000 bytes); after through 10, 0. **A roster device that has said nothing blocks the drop**, so the client must send `throughSeq = head` for chats it does not want ("recent" rule in 5.6). `results/acks.json`.
10. **Live words:** 4 messages a second for 60 s (batches every 250 ms, 600 bytes) from one device to two watchers: 239 in, 478 out, **0 rows read or written**. Cost to the platform: 4 incoming messages a second = 14,400 an hour = **720 request-units per hour of continuous streaming, about 12 per 60-second reply**; outgoing is free. Burst test (20,000 messages as fast as possible to two watchers): all delivered, 426 messages a second on a busy machine (the object stayed responsive; this is a ceiling test, not the design's rate).
11. **Hibernation:** after 25 s idle the object was evicted and rebuilt (its construction time changed). Presence still answered correctly (derived from socket attachments), the free auto-response answered "pong", and a hold after waking worked. So nothing the relay needs may live only in memory; the prototype keeps none.
12. **Alarms:** first alarm armed 30 days out. With the clock skewed: a chat with its last line at day 20 survived day 31, the chat with no new line was released (devices told via `released`, later fetch got `gap`), registers survived, the next alarm was set 19 days out (day 50). With the clock at 125 days and nobody connecting, the 90-day rule erased everything (registers, roster, groups) and closed the old sockets. **Bug found and fixed in the prototype:** after `deleteAll()` the object stays alive but its tables are gone, so every later request hung. The schema must be recreated right after an erase (now `init()`).
13. **Small frames:** 4 KB frames: 3 rows written, about 5 rows read per hold; speed varied 156 to 1,879 holds a second between runs (machine load). 64 KB frames: 3 rows per hold as well. **Billing is per row, not per byte, so fewer, larger frames cost less.** In at least 3 long runs (4 KB x 20,000 holds, 4 KB x 30,000 holds, and the 20,000-message live burst) the object instance was replaced mid-run (counters reset; no error in wrangler's log). Cause UNVERIFIED (possibly local resource pressure), another reason to keep zero state in memory.

### 3.5 Storage layout (what the prototype implements)

Durable Object storage (SQLite), one object per set, tables with no hidden row ids:
- `frames(group, seq, size, bytes)`, primary key `(group, seq)`. **Frame = at most 1 MiB payload** (platform allows 8 MB per row and 32 MiB per message, but the isolate has 128 MB and every copy of a payload is another allocation). Senders chunk big extras and bundles into 256 KiB to 1 MiB chunks (the design's `extra-chunk` and `bundle-chunk` already do). Replies to `fetch-after` are bursts of at most 4 MiB, then `more`.
- `groups(group, next_seq, bytes, last_line_at, last_touch, released_through)`: per-group accounting, LRU order, and the "released" mark.
- `recv(group, device, through)`: unsealed receive progress.
- `regs(key, value, token, rev)` plus an index on `rev`; a set-wide `rev` counter in `meta`.
- `roster(device)`, `meta(key, value)` (set total bytes, last connect, revision).
- **30-day rule:** one alarm. On each wake an early alarm is harmless: it releases groups whose last line is older than 30 days, announces each, and re-arms for the oldest remaining group's expiry. Arming costs one `getAlarm` per object wake. **90-day rule:** same alarm; if the last device connection is older than 90 days, close sockets, `deleteAll()`, recreate the schema.
- Presence = the authenticated hibernatable sockets (attachment holds device id); nothing stored. "Last connect" is written at most once an hour.

### 3.6 Durable Object storage vs object storage (R2): decision = Durable Object storage

| | DO SQLite (chosen) | R2 with DO as index |
|---|---|---|
| Free-plan fit | Yes, within 5 GB account / 1 GB object caps | Needs an R2 subscription (checkout) |
| Cost of storage | $0.20 per GB-month beyond 5 GB | $0.015 per GB-month beyond 10 GB |
| Consistency | Frame, accounting and release in one transaction | Two stores; crash between them leaves orphans; erase must delete objects one by one |
| Per-set isolation and erase | `deleteAll()` | list and delete through the API |
| Speed measured | 220 MB/s ingest locally | not tested (no account, nothing deployed) |
| Per-set size ceiling | 10 GB paid, about 1 GB free | none |
| Moving parts | none new | new binding, new deploy config, new failure modes |

Reasons: nothing new to enable, accounting and release are atomic, and the numbers are already low. R2 would matter only for storage cost (the worst-abuse storage bill below) or for sets above 10 GB; keep it as a later option for frames of project bundles.

### 3.7 Monthly cost (paid-plan figures from section 3.2 prices; `cost-model.mjs`, `results/cost-model.txt`)

**Assumptions (mine, not measured):** 3 rows written per hold when held plus about 3 more when the last device reports and the frame is deleted (so 6 per hold cycle; measured 3, the rest follows from the schema). Handler time 3 ms per message at 128 MB billed. Devices connected about half the day, heartbeat every 10 s unless stated. Heavy user = 4 devices, about 50 MB/day, 3,000 holds/day, 6 h/day with a watcher receiving words (30% of that time actually streaming, 4 messages/s), 2,000 chats. Mix for 1,000 users: 50 heavy, 250 medium (about 10x lighter), 700 light. "Parked" storage assumes a sleeping device makes data pile up toward the cap.

| Scenario | Requests/month | Rows written/month | Held storage | **Paid plan, total** | Free plan |
|---|---|---|---|---|---|
| (a) one heavy user, typical | 79 k | 594 k | 0.5 GB | **$5.00** ($0.71 if every unit were billed at list overage) | 20% of daily rows-written limit, 2.6% of requests, 10% of storage: fits |
| (a) worst: words streaming all 6 h, 1 GB parked | 169 k | 594 k | 1 GB | **$5.00** ($0.84 at list) | fits (storage 20%) |
| (a) heartbeat every 30 s | 61 k | 594 k | 0.5 GB | $5.00 | fits |
| (b) 10 users, all heavy | 788 k | 5.9 M | 5 GB | **$5.00** ($7.14 at list) | **breaks: rows written 198% of the daily limit, storage 100%** |
| (b) 10 users, 2 heavy / 4 medium / 4 light | 295 k | 1.5 M | 1.2 GB | **$5.00** | fits (rows written 49%) |
| (c) 1,000 mixed | 18.6 M | 51.5 M | 41 GB | **about $16** (requests $2.6 + rows written $1.5 + storage $7.2 on top of $5) | **breaks badly**: requests 6x, rows written 17x, storage 8x |
| (c) 1,000 mixed, heartbeat 30 s | 9.5 M | 51.5 M | 41 GB | about $15 | breaks |
| (c) 1,000 mixed, every set parks its cap (335 GB) | 23 M | 51.5 M | 335 GB | about $76 | breaks |

The $5 base is a flat account fee that would also cover the rest of the Worker.

**Free plan: how many same-type users fit before the first limit breaks** (`cost-model.mjs`): heavy 5 (rows written per day; also 5 by storage if each parks 1 GB), medium 50 (rows written), light 224 (requests, from heartbeats). **The first thing to break on the free plan is rows written per day (100,000), then the 5 GB storage cap.** On the paid plan nothing breaks at 1,000 users; the first cost to grow is storage when sleeping devices park data, then request charges from heartbeats.

Not measurable here: real billed duration, real per-message CPU, 128 MB memory behaviour (local workerd did not enforce it), production latency.

### 3.8 Is "1 GB per set, no sign-in" safe against abuse? No.

- Anyone can create a set (first key signs itself onto an empty roster) and park up to the cap. The WAF rule (1 rule, IP, 10 s window) and the binding limiter (per location, approximate) can slow set creation; neither limits bytes per set.
- **Free plan:** 5 sets filled by one person fill the account's 5 GB; every other Durable Object then fails to write, including real users' relays, presence and games. Cost to the attacker: about 5 GB of upload (minutes).
- **Paid plan, attacker creates 1,000 sets of 1 GB:** 1 TB parked = (1,000 - 5) x $0.20 = **about $199 a month** while it lasts. The 30-day rule empties a set 30 days after its last line, so the attacker must keep writing; 90 idle days erases the set; spending limits do not cover stored data.
- Cheap protections that fit "no account": (1) a new set gets a small allowance (suggest 100 MiB) until a second device has completed pairing, then the full cap; (2) a tiny registry Durable Object keeps a global total of sets and bytes, refuses new sets above a ceiling (suggest 100 GB, $20/month) and feeds the existing hourly attack alarms (`src/security/alarms.ts`); (3) per-address limit on set creation with the already-used `ratelimit` binding; (4) a small proof-of-work on creating a set (weak alone). A sign-in stays the real fix, kept in reserve as the design says.

## 4. What this changes in the design

**2.5, third bullet.** Replace "It is free at the limits below (payment is open, O2)." with: "It is free to run only for the first few users: the platform's free tier allows 100,000 changes and 5 GB for the whole service. Before it opens to everyone it moves to the $5-a-month plan (about $5 to $20 a month up to 1,000 users); payment by users stays open, O2."

**2.5, 1 GB bullet.** Keep 1 GB on the paid plan; add: "On the free plan the relay lets go at 900 MB per set."

**5.6 Cost bullet.** Replace "free plan today." with: "Paid plan ($5/month) before public release; measured and modelled cost in T7-relay-fit-cost.md. Live words batched every quarter second pass through at 720 billed requests per hour of streaming. Frames are at most 1 MiB; the Durable Object holds everything (object storage was compared and rejected for now)."

**5.6 item 3 (Hold).** Add after the first sub-bullet: "A frame is at most 1 MiB; larger things are chunked by the sender. Devices send fewer, larger frames where they can (billing is per row, not per byte; a hold costs 3 rows written, and about 6 once deleted)."

**5.6 item 4 (Registers).** Add: "`reg-list` takes the revision it last saw and returns only what changed; a full list of 6,000 registers is 3 MB and about 100 ms."

**5.6, Limits with no account.** Replace with: "new sets start with 100 MiB until a second device has paired, then 1 GB; a global ceiling on sets and bytes refuses new sets and raises an alarm; new sets rate-limited per network address (approximate); during the build only an allow-list of test sets."

**5.6, new bullet:** "**State lives in storage.** The relay's object is evicted when idle; it keeps nothing only in memory. Presence is read from the open connections. After an erase the tables are recreated. Keepalive uses the platform's automatic ping, which costs nothing."

**6.4.** `reg-list` becomes `reg-list { sinceRev }` returning `{ rev, regs[] }`; `received` unchanged; add the `over-limit` reason (`frame`, `group`, `set`, `register`). Registers over 16 KiB are refused.

**5.2 (Presence).** The 30-second offline rule needs a numbered beat every 10 s from a device only while it is being watched or hosting; idle devices 30 to 60 s. Relay cost of beats: each is 1/20 of a request, 0.4 to 1.7 thousand requests a day per heavy user. The relay cannot tell a silently dead socket from a quiet one (the automatic ping never wakes it), so presence cannot rely on the relay noticing: UNVERIFIED whether Cloudflare closes dead sockets promptly.

**12.7 and O15.** Replace "T7 reports before the limits are treated as fixed" with the results above; O15 stays open for Destin until payment and sign-in are decided.

## 5. Needs Destin

1. **The relay is free only for roughly a handful of heavy users** (5 heavy, 50 medium, or a couple of hundred light ones), not for everyone. To give it to all users, the service needs the $5-a-month Cloudflare plan (about $5 to $20 a month up to 1,000 users, more if people park data). Users see no difference; you pay. Decision: move to the paid plan before the relay goes public, or accept the free-plan ceiling and a small waiting list.
2. **If the free daily allowance runs out, the relay stops for everyone until midnight UTC, and the sign-in and marketplace API go down with it** (same account). On the free plan this is a real chance once a few heavy users are on. Users would see devices not catching up through the relay and, worse, the marketplace failing.
3. **"1 GB per set" would show "Relay full" at about 900 MB on the free plan.** On the paid plan it stays 1 GB (the platform allows 10 GB).
4. **Abuse without a sign-in:** a stranger could park up to 1 GB per set. My recommendation is a small starting allowance (100 MiB) until a second device has paired, and a global ceiling. A person with one device only, who pushes more than 100 MiB before pairing a second, would see "Relay full" earlier; I expect no one to notice because there is nobody to sync to yet. Say if you prefer a sign-in now instead.
5. **Presence:** a phone shown "offline" within 30 seconds needs a heartbeat about every 10 seconds; that costs a little battery and about $0 to the platform, but it is the figure behind V3.

## 6. Could not test here

- Real Cloudflare behaviour: billing, 128 MB memory limit, per-message CPU, production latency, quota-exhaustion errors, and how free-plan per-object storage (1 GB vs 10 GB) is really enforced. Nothing may be deployed and there is no account access.
- Whether the account is really on the free plan, and what the marketplace Worker already uses of its 100,000 daily requests (the dashboard has it; I have no access).
- Whether Cloudflare closes dead WebSockets promptly; outbound message size limit.
- Phones and other platforms (Linux only here). The cause of the mid-run object replacement seen locally in at least 3 long runs.
- Message and frame behaviour with real sealed frames (these used random bytes, 4 KB to 1 MiB).
