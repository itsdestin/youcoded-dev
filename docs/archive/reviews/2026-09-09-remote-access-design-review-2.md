---
status: active
---

# Remote access batch 1 — technical design review, round 2

Reviewed: `docs/archive/specs/2026-09-09-remote-access-batch1-technical-design.md`
**revision 2**, against
`docs/active/specs/2026-09-09-remote-access-first-milestone.md`, the signed UI
contract `docs/archive/design/2026-09-09-remote-access/remote-access.contract.json`,
round 1's findings, and app HEAD `de69d60a` in this worktree. This reviewer did not
write the design or round 1. Every line number below was opened in this worktree.

Paths are workspace-relative; `youcoded/desktop/src/` is abbreviated where the
context is unambiguous.

## Verification of revision 2's own corrected "today" claims

All four of the claims round 1 forced revision 2 to restate are **true at the cited
lines**:

- §4 `remote-config.ts:56` — `trustTailscale: false` is the default; the field is
  only turned on through `SettingsPanel.tsx:1722`. Revision 2's "opt-in, not on by
  default" is accurate.
- §5 `remote-server.ts:279` — `isRunning()` exists. A repo-wide search for callers
  finds only `tests/remote-server.test.ts:402,417` plus two unrelated same-named
  functions (`main/hook-relay.ts:201`, `renderer/utils/tool-group-summary.ts:149`).
  "No caller outside tests" holds.
- §5 `SettingsPanel.tsx:1372` — `isFullyConnected = … config?.enabled &&
  tailscale?.installed && tailscale?.connected`. Correct locator, correct claim.
- §6 "no ping/pong anywhere in `remote-server.ts`" — a search for
  `ping|pong|isAlive|heartbeat` across `remote-server.ts` returns only unrelated
  prose in comments. True.

Other locators re-checked and correct: `remote-server.ts:174, 279, 389, 436, 468,
757, 805, 2274, 2286`; `remote-config.ts:12, 21-25, 56`; `remote-shim.ts:35, 88,
135, 150, 646, 780`; `tests/remote-server.test.ts:30` (the `listen((_port, cb))`
mock), `:408-416` (the existing EADDRINUSE test).

Sections I consider **sound as written**: §2 (profile-injectable paths — the
`resetModules` problem in R1-12 is correctly dissolved by passing the profile in),
§3's conditionality framing (R1-18 is genuinely answered: the bind is gated on the
feasibility checkpoint rather than assumed), and §4's removal decision (the list is
undercounted — see R2-16 — but the decision itself is made).

## Round-1 findings: resolved, or only mentioned?

| Finding | Verdict in revision 2 |
|---|---|
| R1-1 | **Resolved by decision.** §0 removes the source-IP test entirely rather than fixing it. But see R2-6: only `remote:set-password` is named. |
| R1-2 | **Resolved.** §0's second rule keys limiting and device rows on the device record. |
| R1-3 | **Resolved in principle**, §3 paragraph 3 — canonical HTTPS endpoint, version negotiation, no silent downgrade. See R2-10 for what "old clients told to update" actually looks like. |
| R1-4 | **Resolved by decision.** Not migrated; retire and re-pair. See R2-9, R2-10. |
| R1-5 | **Partly words.** The hash is now named (SHA-256, with a correct justification). The auth-message fields, the lookup rule, the browser's stored shape and Android's stored shape are still absent — exactly the three things R1-5's fix asked for. See R2-14. |
| R1-6 | **Resolved as a decision**, undercounted as an inventory. See R2-16. |
| R1-7 | **Resolved.** Verified above. |
| R1-8 | **Words, not a decision.** See R2-8. |
| R1-9 | **Resolved.** The unfalsifiable test is dropped and replaced with an assertion on reported state. |
| R1-10 | **Resolved.** The mock update is named in §3. |
| R1-11 | **Resolved.** Store path injectable. |
| R1-12 | **Resolved.** |
| R1-13 | **Resolved for revoked/version-refused, and the migration case falls outside it.** See R2-9. |
| R1-14 | **Resolved by decision** ("an explicit local-bridge capability, not a platform guess") though the flag is unnamed — acceptable at design altitude. |
| R1-15 | **Named but not implementable as written.** See R2-2, R2-3, R2-4, R2-5. |
| R1-16 | **Resolved by decision.** Ping/pong both ends, close on missed deadline. |
| R1-17 | **Words.** "Validates `Origin`/`Host`" with no policy. See R2-11. |
| R1-18 | **Resolved.** |
| R1-19 | **Partly.** The batch now owns the Android side, but no channel names, payloads or preload entries appear — and the device-id / connection-id collision is new. See R2-15. |
| R1-20 | **Resolved.** The restart-then-assert-B test can now fail. |

## Findings

Triage by the implementing session, 2026-09-09: **all accepted.** R2-1, R2-3 and R2-6
were re-opened line by line first — the contract row, `ws.onclose` not clearing `pending`,
and the two ungated handlers all check out. Nothing rejected, nothing already handled.

- **R2-1 — §6 contradicts the signed UI contract on the one behaviour the contract — **accepted**
  spells out.** Contract row R2
  (`docs/archive/design/2026-09-09-remote-access/remote-access.contract.json`,
  `steps[0].rows[1]`) reads: "A message typed while the connection is down waits as
  a **draft** until you press Send yourself; nothing runs again on its own."
  §6 keeps the opposite mechanism: `send()` (`renderer/remote-shim.ts:115-130`)
  pushes into `pendingSendQueue` whenever the socket is not connected, and
  `flushSendQueue()` (`:135-145`) transmits the whole queue automatically on
  `auth:ok` (`:574`). Revision 2's only change is a per-message deadline — so a
  message typed ten seconds before a successful reconnect is still sent by the app,
  not by the user. The approved UI is the backend's contract; this section
  overrides it silently. Fix: state that composed-but-unsent user input leaves the
  send queue entirely and becomes renderer draft state, and confine the deadline
  rule to internal requests (`skills.list` and the like) that the queue exists for.

- **R2-2 — The host's "ring of completed request ids" cannot be keyed on the id the — **accepted**
  client sends; ids are not unique across clients or page loads.**
  `renderer/remote-shim.ts:153` mints `const id = \`msg-${++messageId}\`` from a
  module-scoped counter (`:34`) that starts at 0 on every page load, in every
  client. Two phones both send `msg-7`. A browser that reloads sends `msg-1` again.
  The host echoes the id back unchanged (`respond()` in `remote-server.ts`) and
  keeps no per-client namespace — `addClient` (`:829`) generates a fresh
  `randomUUID()` per *connection*, which the id is not derived from. As designed,
  device B asking "did `msg-7` execute?" can be answered "yes" from device A's
  entry, and a reloaded browser can be told a brand-new request already ran. Fix:
  make the client id globally unique (device id + monotonic counter, or a UUID) and
  key the host ring on the pair `(deviceId, requestId)`, and say so.

- **R2-3 — The mechanism's premise about `pending` is wrong, and the thing that — **accepted**
  actually destroys the id is the request timeout, not the socket close.** §6 says
  "`pending` entries survive the socket close instead of being cleared". They
  already do: `pending.clear()` appears only at `remote-shim.ts:776`
  (`connectToHost`) and `:824` (`disconnect`), neither of which is on the
  `ws.onclose` → `scheduleReconnect` path (`:600-636`, `:646`). What removes the
  entry is `invoke()`'s own 30 s timer (`:154-158`), which calls
  `pending.delete(id)` and rejects. Reconnect backoff runs 1 s → 30 s
  (`:40-41`, `:648-678`), so a reconnect after the second or third failure lands
  *after* the entry is gone and the client no longer knows which id to ask about.
  Fix: change the timeout's behaviour, not the close's — on expiry move the entry to
  an "outcome unknown" set that survives until the reconnect query answers it, and
  say which surface displays that set.

- **R2-4 — The ring has no size, no retention window, and no answer for host — **accepted**
  restart — which is one of the milestone's named test cases.** §6 says only "a
  short ring of recently-completed request ids" and "if the id has aged out, the
  answer is unknown". Nothing in `remote-server.ts` persists anything about
  completed requests, so a host restart empties the ring and every in-flight request
  becomes "unknown" — and host restart is exactly the case the milestone's
  acceptance list names ("Test … host restart"). A design that answers "unknown" for
  the whole restart class should say so out loud rather than leave it implied by an
  unstated ring lifetime. Fix: name the ring size, the retention window, whether it
  survives restart, and state plainly that host restart yields "unknown" if that is
  the decision.

- **R2-5 — The busiest action channel carries no request id at all, so the — **accepted**
  outcome-unknown mechanism cannot see it.** `session:input` — typing into a Claude
  Code session — is `fire()`, not `invoke()`: `remote-shim.ts:951`, and `fire()`
  (`:282-284`) sends `{type, payload}` with **no id** and creates no `pending`
  entry. So do `native:retry` (`:1833`), `native:interrupt` (`:1831`),
  `session:resize` (`:952`) and `ui:action` (`:1260`). Chat sending is safe
  (`native:send` is an `invoke`, `:1827`), but the PTY typing path is not: a
  `session:input` delivered and executed while the reply hop is lost is invisible to
  both ends, and the same text re-typed by the user runs twice with no uncertainty
  shown. Fix: either give `fire()` an id and route it through the same ring, or
  state explicitly that fire-and-forget channels are out of scope for batch 1 and
  name what protects them instead.

- **R2-6 — §0's rule is written for one handler and leaves two others open.** — **accepted**
  "Host administration never travels over the remote socket at all" names
  `remote:set-password`. But `remote:set-config` (`remote-server.ts:2284-2291`) has
  **no** local check today and lets any authenticated remote client set
  `enabled: false` — a phone can switch off remote access and strand every device,
  including itself — or change `keepAwakeHours`. `remote:disconnect-client`
  (`:2306-2310`) likewise has no check and lets one device throw another off; under
  §1 the equivalent unpair operation would be strictly more destructive. Revision 2
  never says whether either counts as "host configuration". Fix: enumerate every
  `remote:*` case in the switch and mark each allowed or refused. If keep-awake is
  meant to stay reachable from a phone, split the handler rather than leaving the
  question open.

- **R2-7 — Refusing an operation "on the remote transport" does nothing unless the — **accepted**
  refusal has the right shape; today's refusal renders as a green ✓.** The existing
  refusal at `remote-server.ts:2274-2277` responds `{ error: '…' }`.
  `responseOutcome()` (`remote-shim.ts:235-240`) treats a payload as a failure only
  when `unsupported === true` or when `ok === false` *and* the channel is in
  `REJECT_ON_NOT_OK`; a bare `{ error }` is neither, so `applyResponse` **resolves**
  it (`:276-278`). `handleSetPassword` (`SettingsPanel.tsx:2402-2414`) then sets
  `hasPassword: true` and `passwordStatus: 'saved'`, drawing "✓". Today only a
  host-local browser reaches this handler, so the false success is a corner case;
  §0's rule makes it the designed path for **every** remote device. Fix: specify the
  refusal payload (`{ unsupported: true }`, which already produces the "not
  available over remote access" notice) and say that the Remote Access panel's
  password field and Enabled toggle are hidden on a remote client — the panel is
  rendered there today, because the shim sets `__PLATFORM__` to the host's
  `'desktop'` on `auth:ok` (`remote-shim.ts:577-582`, note at
  `SettingsPanel.tsx:778`).

- **R2-8 — §5 is still words where R1-8 asked for a decision.** R1-8's fix was — **accepted**
  "name that channel and its payload, and say that the Android bridge's
  `remote:get-config` (`SessionService.kt:1502-1512`) must answer the new field
  too." Revision 2 says "exposed over IPC and pushed on change" and names neither
  the channel, the payload, nor the Android site. That site is real and hardcoded —
  `SessionService.kt:1504-1512` answers `remote:get-config` with a literal
  `JSONObject` — so a renderer that reads a new field gets `undefined` on Android
  and the indicator silently reads "not listening". There is also no existing
  main→renderer push for remote state, so "pushed on change" implies a new preload
  `on…` entry, a shim listener and a Kotlin emitter that are not named anywhere.
  Fix: name the channel, the payload, and the three sites.

- **R2-9 — The migration lands every existing paired browser in exactly the retry — **accepted**
  loop R1-13 was accepted to prevent.** §1 retires the token file; §6's stop
  condition fires on "a *terminal* close code — revoked, or version-refused". A
  credential from the retired file is neither: it is simply unknown, so
  `remote-server.ts:797` fails the lookup, `:815` calls `recordFailedAttempt`
  and closes 4001 "Auth failed". On the client, `ws.onclose`'s pre-auth branch
  rejects, and `scheduleReconnect` (`:646-678`) retries up to
  `MAX_RECONNECT_ATTEMPTS = 10` (`:43`). Five failures inside 60 s trips the 4029
  lockout (`:751`, `RATE_LIMIT_MAX_FAILURES` at `:80`) — and once §3's loopback bind
  lands, that bucket is shared by every device unless the limiter has already been
  moved to device ids, which it cannot be for a device that has no record. So on
  upgrade day the owner trying to re-pair can be locked out by their own stale
  browser tab. Fix: give "credential no longer recognised" its own terminal close
  code with the same stop-and-explain treatment as revoked, and state that the
  rate limiter falls back to a per-connection allowance (not a shared IP bucket)
  for clients with no device record.

- **R2-10 — The re-pair story is not honest per platform, and "old clients told to — **accepted**
  update" is not something the host can do.** Three different experiences hide
  behind "every device pairs once more":
  - **Android** stores the *password*, not a token —
    `SessionService.kt:1786-1806` persists `{name, host, port, password}` — and
    `connectToHost` re-sends it (`remote-shim.ts:780-786`). Retiring the token file
    costs an Android user nothing; changing the endpoint costs them re-adding the
    device with a new address.
  - **Browser** holds one opaque string in `localStorage['youcoded-remote-token']`
    (`remote-shim.ts:577`). It loses that and must retype the password. The new
    credential is `id` + `secret`, so the stored shape changes too — unnamed in §1.
  - **"Old clients told to update and re-pair"** cannot happen as written. The
    message an out-of-date client shows comes from its own code:
    `remote-shim.ts:614` renders "Cannot reach host at ws://…. Check the host, port,
    and network (VPN/firewall)." A host that has moved to `wss://` and refuses the
    old handshake cannot rewrite that sentence, and there is no in-app updater for a
    sideloaded APK. Fix: say what each platform's user actually sees, and say
    plainly that pre-upgrade clients show a generic unreachable error until the user
    updates the app themselves.

- **R2-11 — "Validates `Origin`/`Host`" has no policy, and the obvious policies — **accepted**
  break real clients.** `remote-server.ts:321` constructs the `WebSocketServer` with
  no `verifyClient`, so the whole policy is new. Three constraints collide and
  revision 2 names none of them: (a) the Android WebView loads from `file://`
  (`remote-shim.ts:549`, `:629`), and a Chromium `file://` page sends `Origin: null`
  or omits it, so a strict allowlist denies Android its own paired-desktop
  connection; (b) a browser arriving through Serve carries the tailnet hostname as
  its origin, which the host does not know until Serve is configured — it comes back
  from `RemoteConfig.detectTailscale` (used at `SettingsPanel` via
  `tailscale?.url`), so the allowlist has to be built at runtime, not from a
  constant; (c) Serve is a proxy hop, so the `Host` header will not be
  `127.0.0.1:9900` and a "Host must be loopback" test would refuse every legitimate
  remote client. Fix: state the allowlist and its source, state what happens when
  `Origin` is absent, and note that the named test ("a foreign `Origin` is refused")
  proves little if absent origins must pass.

- **R2-12 — Three rows of the signed contract have no section in the design.** — **accepted**
  `remote-access.contract.json` rows R1, R5 and R6 cover the setup flow: guided
  setup that "explains every change before it happens, and checks the connection at
  the end"; a panel that opens saying remote access is not set up yet; and "one
  yellow box asks your permission before this computer's name goes into a public
  certificate record." The design's only trace of any of this is the opening
  sentence of "What the user gets". No section specifies prerequisite detection, the
  consent gate before certificate issuance (which the milestone also lists under
  "Certificate issuance/setup consent"), the post-setup connection check, or which
  IPC carries them. Fix: add a section, or state explicitly that the setup flow is a
  separate batch and that batch 1 ships none of R1/R5/R6.

- **R2-13 — Stale socket callbacks are a named milestone requirement and revision 2 — **accepted**
  never mentions them.** The milestone's acceptance list says "stale socket
  callbacks must not corrupt a newer connection." There is no generation or epoch
  guard anywhere in the shim: `ws` is a single module-level variable (`:33`), and
  the handlers installed in `connect()` close over the *variable*, not the socket
  they were installed on. Concretely, the auth branch at `remote-shim.ts:586`
  does `ws!.onmessage = (e) => handleMessage(...)`, so a late `auth:ok` from a dead
  socket rebinds the **current** connection's message handler and calls
  `setConnectionState('connected')` and `resolve(token)` for a connection that is
  not the one it belongs to; and `ws.onclose` (`:600-636`) calls
  `scheduleReconnect` unconditionally, so an old socket closing after a new one has
  connected schedules a spurious reconnect against live state. `reconnectAttempts`,
  `reconnectDelay` and `reconnectTimer` (`:39-43`) are likewise global across
  targets. Fix: give each connection attempt a generation number, ignore every
  callback whose generation is not current, and name the test.

- **R2-14 — R1-5's substance is still missing: the wire format.** §1 says "The — **accepted**
  client holds `id` + `secret`" and names the hash, which was the smaller half of
  R1-5. The auth message today is `{ type: 'auth', token }` or
  `{ type: 'auth', password }` (`remote-shim.ts:549-558`), matched at
  `remote-server.ts:797-803`. Revision 2 never states the new message's fields, never
  states that lookup is by `id` then one hash compare, and never states what the
  client persists (browser `localStorage` key and shape; Android's
  `android:save-paired-device` record). Every one of those is a code change in this
  batch. Fix: write the auth message down.

- **R2-15 — Device ids and connection ids are two different id spaces feeding one — **accepted**
  list, and revision 2 does not reconcile them.** `getClientList()`
  (`remote-server.ts:458-464`) returns `{id, ip, connectedAt}` where `id` is the
  per-*connection* `randomUUID()` from `addClient` (`:829`), and
  `SettingsPanel.tsx:2480-2484` passes that id straight to
  `remote.disconnectClient`. §1's list, rename and unpair operate on the *device*
  record's id. One device with two open tabs is two rows with two ids and one
  record; a paired-but-offline device has a record and no row. Revision 2's
  cross-platform section says the channels exist but not what replaces
  `remote:disconnect-client`, whether connected rows are merged into device rows, or
  which id the UI holds. Fix: decide that the list is device-shaped with a connected
  flag, say what happens to `remote:disconnect-client`, and name the payloads.

- **R2-16 — §4's site count is understated in the same way R1-6 was.** §4 says "four — **accepted**
  sites in `SettingsPanel.tsx`". A repo-wide search finds ten in that file alone —
  `trustTailscale` at `:81, :1357, :1722, :2428` plus the `onToggleTailscaleTrust`
  prop chain at `:1290, :1315, :1721, :1757, :2426, :2551`, which must be removed
  together or the file will not typecheck. "The existing tests that assert it" is
  three files, not an unnamed set: `tests/remote-config.test.ts`,
  `tests/remote-server.test.ts`, `tests/remote-access-panel.test.tsx`. Minor, but
  R1-6 was accepted precisely because a short list read as complete. Fix: cite the
  count or drop the number.

- **R2-17 — `admin` is a field that can never be true. (Minor.)** §1 adds — **accepted**
  `admin: false` and calls it "the seam that stops §0's rule from being
  re-litigated", but §0 says host administration never travels over the remote
  socket **at all** — so nothing can ever read `admin` as true, and no code path
  sets it. A flag with no writer and no reader is dead data that `knip` and review
  will keep asking about, and it does not in fact prevent re-litigation; §0's own
  sentence does. Fix: drop the field, or soften §0 to "no remote device is admin
  today" and give the field a reader.

## On the specific questions asked

**Is the SHA-256 decision sound, and does anything else depend on the token being
the secret?** The decision is sound. The secret is 32 machine-generated random
bytes, so there is nothing for a slow KDF to protect, and bcrypt at 10 rounds
(`remote-config.ts:11`) in the Electron main process would cost ~100 ms per
reconnect on the UI thread. Nothing else in the app depends on the token being the
secret: `this.tokens` is read only at `remote-server.ts:265, 274, 429, 437, 759,
797, 805-806`; `client.token` is stored by `addClient` (`:829`) and never read
again; and the HTTP side authenticates nothing at all — `handleHttpRequest`
(`:621-633`) serves the static bundle to any caller with no credential check. The
bcrypt path stays where it belongs, on the human password. Two things the design
should still say: the compare is a fixed-length hash comparison (no per-record
scan), and the client's own storage of the secret is unchanged in kind (browser
`localStorage`, Android encrypted prefs) — see R2-14.

**Does "host administration never travels over the remote socket" break a real user
flow?** Almost none, but not for the reason the design implies. `remote:set-password`
over the socket is reachable today only from a browser on the host machine itself
(the `client.ip === '127.0.0.1'` gate at `:2274`), and that user has the Electron app
in front of them. On Android as host the same channel is already a no-op stub that
answers `true` without doing anything (`SessionService.kt:1548-1550`). And no
unauthenticated client can reach it at all, because auth fails outright when no
password is configured (`:788-792`). So the flow lost is negligible. What the design
misses is not the flow but the **surface**: the panel that offers the operation is
rendered on remote clients, and the refusal currently reads as success — R2-7. It
also stops one handler short of the rule it states — R2-6. A wording note: §0 says
"desktop IPC only", which is not right for a cross-platform product where Android is
also a host; "the host's own local bridge" is the accurate phrasing.

**Is the outcome-unknown mechanism implementable?** The host half has a genuinely
good single seam — every reply in `remote-server.ts` goes through one `respond()`
call, so recording completed ids is one insertion point, not two hundred. The client
half as described is not implementable: the ids are not unique (R2-2), the entry it
relies on is deleted by the request timeout before reconnect (R2-3), the ring's
lifetime and restart behaviour are unstated (R2-4), and the highest-traffic action
channel has no id to record (R2-5).

## Verdict

**Revision 2 is not buildable as written.** §§1–4 are close: a competent session
could implement pairing records, profile-scoped paths, the loopback bind and the
`trustTailscale` removal from this document plus the code, with only R2-16's
undercount and R2-14's missing wire format to fill in. §5 and §6 are not
implementable without decisions the document does not contain — the state channel
and its payload (R2-8), and four separate holes in the outcome-unknown mechanism
(R2-2 … R2-5). Two problems sit above the section level and should be settled before
the task breakdown: §6 contradicts the approved UI contract (R2-1), and three
contract rows about setup have no design at all (R2-12).
