---
status: draft
---

# Remote access, batch 1 — secure connection and recovery

Revision 4, final. Three review rounds found 20, 17 and 8 problems; all 45 were accepted.
Reviews: `docs/active/reviews/2026-09-09-remote-access-design-review-{1,2,3}.md`. Round 3 is
the cap set by `.claude/rules/feature-flow.md`, so its four open decisions are made here
rather than sent to a fourth reviewer. They are marked **Decision** below.

Covers only batch 1 of `2026-09-09-remote-access-first-milestone.md`. Every "today" claim
was read against app HEAD `de69d60a` in this worktree. The signed-off user-facing promises
are the rows of `docs/active/design/2026-09-09-remote-access/remote-access.contract.json`;
where a row and this design disagreed, the row won (R2-1).

## What the user gets

Setup that says what is missing and asks before it publishes anything. A status that
reflects whether the server is really listening. Devices with names, where unpairing one
really removes it. A password that is always required. A message typed while the connection
is down that waits for you to send it, and never runs twice.

## 0. Nothing is trusted because of where it connected from

`remote-server.ts:2274` gates `remote:set-password` on `client.ip === '127.0.0.1'`. Behind
a loopback proxy every remote device arrives as 127.0.0.1, so that check would pass for all
of them (R1-1), and per-IP rate limiting collapses into one shared bucket that five failures
can lock for everyone (R1-2).

**Rules, landing with the bind change, not after it:**

- **Host administration never travels over the remote socket.** Refused there and desktop
  IPC only: `remote:set-password`, `remote:set-config` (`:2284` — today a phone can switch
  remote access off) and `remote:disconnect-client` (`:2306`), both ungated today (R2-6).
  Reading configuration stays remote; changing it does not.
- **A refusal rejects; it does not resolve.** Today the refusal replies `{ error: … }`,
  which the shim resolves as a *value* — so the password field shows success (R2-7). The
  refusal becomes `{ ok: false, code: 'host-admin-desktop-only', message }`, which the shim
  rejects on, and the panel shows the message.
- **Decision (R3-5) — host-only controls stay visible on a remote client, disabled.**
  Contract row R4 says Enabled, Password and Keep awake stay where they are, so they are not
  hidden on a phone; they are disabled with one line saying the change has to be made on the
  computer itself. A control that is present and always fails is the worse of the three
  options; a control that vanishes contradicts the row.
- **A client is identified by its device record, never by its address.** Device rows and
  log lines key on the device id.
- **Decision (R3-1) — rate limiting is per socket and per host, never per address.** The
  limiter runs at `remote-server.ts:751`, before the auth message, so no device id exists
  yet and after the loopback bind every peer shares one address bucket. Instead: a socket
  gets five auth attempts and is then closed, so a guesser must pay a new connection per
  five tries; and the host counts failed attempts across all sockets, slowing new
  connections above a ceiling rather than locking anyone out. Nothing can lock out another
  device, which is what the shared bucket would have done on upgrade day, when every
  retired credential fails at once. After auth, limits key on the device id.

## 1. Pairing becomes a device record

**Today.** `remote-server.ts:174` keeps `~/.claude/.remote-tokens.json`: a flat array of
opaque strings in the clear, no identity, no dates. `:805-806` mints a fresh token on every
password authentication, so one device accumulates several (R1-4). `disconnectClient`
(`:468`) closes the socket but never removes the token. The only invalidation is
`invalidateTokens()` (`:435`), which drops every device at once.

**Change.** The store becomes device records:

    { id, secretHash, name, createdAt, lastSeenAt, revokedAt | null }

- The client holds `id` + `secret` (32 random bytes); the host stores only
  `SHA-256(secret)`. A fast hash is right: the secret is high-entropy and machine-generated,
  so there is nothing to slow down, and bcrypt would add ~100 ms in the main process (R1-5).
  Nothing else in the app depends on the token being the secret — `client.token` is written
  and never read back, and the HTTP side authenticates nothing at all.
- No `admin` field. Round 2 was right that it could never be true given §0 (R2-17).
- **Auth message (R1-5, R2-14).** `{ type: 'auth', protocol: <n>, deviceId?, secret?,
  password?, deviceName? }`. With `deviceId` + `secret`, look up the record, reject if
  `revokedAt` or the hash mismatches, else refresh `lastSeenAt`. With `password` only,
  verify it, create a record named from `deviceName` (or "New device"), and return
  `{ deviceId, secret }` **once**. Re-authenticating reuses the record rather than minting
  another credential.
- Unpair sets `revokedAt` and closes the socket. The record is kept, so a returning device
  is told it was unpaired.
- **Two id spaces stay separate (R2-15).** The device id is durable and is what the list
  shows; the per-connection client id remains connection-scoped and never reaches the list.

**Migration — what actually happens to you (R1-4, R2-10).** Existing credentials are
unattributable: several per device, no names, no dates, in the clear. They are not carried
forward. Per platform, honestly:

- **Desktop browser:** the saved credential stops working. The page asks for the password
  again and pairs as a new device.
- **Android:** the app stores the password, so it re-pairs without asking, and the device
  appears under its own name.
- **An old client that has not updated** cannot be told anything useful: it prints its own
  generic "cannot reach" message. Round 2 was right that "old clients are told to update"
  was not achievable (R2-10). The host-side release note carries that, not the protocol.

**Proven by.** Pair → unpair → restart → the old credential is refused. Two devices paired,
unpair A, assert B is still valid **after a restart** (revision 1's version could not fail,
R1-20).

## 2. Both stores are per profile and injectable

**Today.** `remote-config.ts:21-25` scopes settings by `YOUCODED_PROFILE`;
`remote-server.ts:174` hardcodes the token path with no profile.

**Change.** One helper builds both paths and takes the profile as an argument rather than
reading `process.env` at module load — `const PROFILE` at `remote-config.ts:12` is evaluated
once per process, so two profiles cannot otherwise exist in one test (R1-12). The server
accepts a store path, so tests never write the real `~/.claude` (R1-11).

**Proven by.** Two servers, two profiles, one temp directory each; pairing on one leaves
the other untouched.

## 3. The listener binds to loopback — conditional on the feasibility gate

**Today.** `remote-server.ts:389` calls `server.listen(port, cb)` with no host.

**Change.** `server.listen(port, '127.0.0.1', cb)`, with §0's rules in the same change.

**Conditional, not decided (R1-18).** The milestone's transport-feasibility checkpoint is
not passed: nothing has proven Tailscale Serve carries WebSocket upgrades for this app. If
it cannot, this section returns as options rather than being silently substituted. Serve is
configured for the app's own route only; existing routes are read first and a conflict is
reported, never overwritten; Funnel is never enabled; if Serve is unavailable, remote access
reports that and stays off rather than falling back to the open listener.

**Endpoint change ships with it (R1-3).** `remote-shim.ts:780` builds `ws://host:port`; the
QR payload and the Android client store the same shape. All of them move to the canonical
HTTPS endpoint, with explicit protocol negotiation and no downgrade path.

**Origin policy, stated (R1-17, R2-11).** The upgrade handler accepts: the tailnet origin
the host is actually serving (discovered at start, not assumed), and `null` — which is what
Android's `file://` page sends. It rejects everything else, including
`http://localhost:<port>`, which is how an ordinary page in the host's own browser would
arrive. The accepted set is logged at startup so a wrong one is diagnosable.

**Proven by.** The bound host argument; a foreign `Origin` refused; `null` accepted. The
suite's `http` mock treats `listen`'s second argument as the callback (R1-10), so it is
updated in the same change or every `start()` test breaks.

## 4. The password is always required

**Today.** `remote-server.ts:757` — with `trustTailscale` on, a peer inside 100.64.0.0/10
is issued a token and sent `auth:ok` with no password. That range is carrier-grade NAT, not
one Tailscale owns. The setting defaults to false (`remote-config.ts:56`), so it is opt-in —
revision 1 overstated it (R1-7).

**Change.** The branch and the setting go, across main, preload, shim, renderer, the
workbench mock, the Android field and the tests that assert it. Round 2 counted ten sites in
`SettingsPanel.tsx` alone against revision 2's claim of four (R2-16), so completeness is not
asserted in prose: `knip` must report `isTailscaleIp` gone rather than orphaned, and a
source-scanning guard fails if the identifier survives anywhere.

**Proven by.** A connection from a 100.64/10 address is asked to authenticate; a saved
`trustTailscale: true` grants nothing; the guard and `knip` cover the removal.

## 5. Status reflects the listener

**Today (corrected, R1-8).** `start()` already rejects with the real OS error and the toggle
surfaces it (`SettingsPanel.tsx:1372`); `isRunning()` exists at `remote-server.ts:279` with
no caller outside tests. The gap is that nothing reports the listener's state *after*
startup — the indicator is derived from saved settings and Tailscale's state.

**Change, named concretely (R2-8).**

- Channel `remote:status`, request and push, payload
  `{ state: 'listening' | 'stopped' | 'failed', reason?: string, port: number }`.
- Emitted by the server on every transition; `ipc-handlers.ts` relays to the renderer,
  `preload.ts` exposes it, and `remote-shim.ts` grows the matching listener (R3-8); the
  Android mirror is `SessionService.kt`'s `remote:get-config` neighbour, which is hardcoded
  today and must learn the new channel.
- The panel's indicator reads this, not `config.enabled`. A failure shows the reason through
  `<ErrorState>`: specific when we have it, general with Report bug and Diagnose when we do not.

**Proven by.** The reported state follows a failed start; a renderer test that the indicator
reads the reported state; an IPC parity test for the new channel. The EADDRINUSE case is
already covered at `tests/remote-server.test.ts:410` and no duplicate is added (R1-9).

## 6. Nothing sends itself, and nothing runs twice

**Rewritten to match contract row R2 (R2-1)**: *a message typed while the connection is down
waits as a draft until you press Send yourself; nothing runs again on its own.* Revisions 1
and 2 kept a queue that auto-flushed on reconnect — the opposite of what was approved.

**Today.** `pendingSendQueue` (`remote-shim.ts:88`) holds raw messages and `flushSendQueue()`
(`:135`) drains it on the next `auth:ok`. `scheduleReconnect()` (`:646`) gives up after
`MAX_RECONNECT_ATTEMPTS`, throws the queue away, deletes the saved target and credential and
connects to `android-local`, which does not exist in a browser. `ws.onclose` does **not**
clear `pending` (only `:776`/`:824` do) — revision 2 claimed otherwise and was wrong (R2-3);
what removes an entry is `invoke()`'s own 30 s timer (`:154-159`). `session:input`,
`native:retry` and `native:interrupt` go through `fire()` and carry no id at all (R2-5).

### Decision (R3-3) — every outbound message is classified, and nothing is unclassified

One table in `remote-shim.ts` assigns each channel a kind. A channel missing from it fails a
build guard, so `native:send`, `session:resize`, `ui:action` and the rest are decided
explicitly rather than by omission.

- **`user-action`** — refused while disconnected. `fire()` gains a boolean return.
  `InputBar.tsx` already has exactly the mechanism this needs: per-session drafts, keep-the-text
  on a `false` return, and restore-on-failed-ack. What is missing is the signal, so the shim
  publishes connection state through the module that already carries `setConnectionMode`, and
  the composer reads it. Covers typing, retry and interrupt.
- **`read`** — safe to re-issue, and the only thing that may be.
- **`transport`** — auth and ping. Never queued, never re-issued.

### Decision (R3-2) — a named rehydration set replaces the flush queue

Deleting auto-flush would otherwise reintroduce the cold-start bug where installed plugins
never appear in the command drawer. On reconnect the shim re-issues one explicit constant
list, `REHYDRATE_ON_RECONNECT`: the skills and commands lists, remote config, and
`remote:status`. A test asserts every entry is classified `read`, so a write can never be
added to it by accident.

### Decision (R3-4) — outcome unknown has a channel and a place on screen

- Channel `remote:request-outcome`: request `{ ids: string[] }`, response
  `{ [id]: 'completed' | 'unknown' }`.
- The affected tool card or message shows an **outcome unknown** state: it says the action may
  or may not have run and that the conversation should be checked before trying again. It is
  specific and accurate rather than a general error, per `docs/error-message-standards.md`, and
  it offers no automatic retry.
- **The Android host answers `unknown` for every id.** It keeps no ring. That is stated here
  rather than hidden, because a phone hosting a session is a real configuration and pretending
  otherwise would be the invented-cause failure the standards forbid.

### The rest of the change

- **The ring, specified (R2-2, R2-4).** Ids today are `msg-N` from a per-page-load counter —
  not unique across clients or reloads, so a host ring could answer for the wrong device. Ids
  become `<deviceId>:<connectionGeneration>:<n>`. The host keeps the last 200 completed ids
  per device for 10 minutes, in memory. Anything older, or any id after a host restart,
  answers **unknown** — the milestone names host restart as a test case, so unknown is the
  designed answer there, not an omission.
- **The 30 s timer stops deleting silently.** A sent request whose reply never arrived becomes
  outcome-unknown and is never retried automatically.
- **Stale callbacks (R2-13).** Every socket carries a generation; a callback from an older
  generation is dropped. Without it a late `auth:ok` rebinds the current connection's handlers.
- **Liveness (R1-16).** There is no ping/pong in `remote-server.ts` today, so a half-open
  socket is invisible. Both ends ping on an interval and close on a missed deadline; that is
  what makes outcome-unknown fire promptly rather than at the 30 s timeout.
- **Stop conditions (R1-13, R2-9).** Retries back off to a ceiling and stop on a terminal close
  code: revoked, version-refused, **or credential retired** — the migration case, which is
  neither of the first two and would otherwise retry into the host's own lockout on upgrade
  day. The local-bridge fallback keys on an explicit capability, not a platform guess (R1-14).

**Proven by.** A draft is kept and nothing is sent on reconnect; the rehydration set is
re-issued and contains only reads; a sent request with no reply reads as unknown, never as
done; the host answers unknown after a restart; a revoked browser stops retrying and says why;
a retired credential does the same; a late `auth:ok` from an old generation is ignored; a
missed pong closes the socket; every channel in the table has a kind.

## 7. The setup flow (contract rows R1, R5, R6)

**Conditional on §3 (R3-7).** The certificate and Serve steps below exist only if the
feasibility checkpoint passes. If it does not, R5's "not set up yet" banner and R1's
end-of-setup check still stand; R6's consent step has nothing to consent to and is dropped
with the transport that needed it.

Round 2 was right that revision 2 had no section for the flow the decks actually approved
(R2-12).

- **R5 — the panel opens saying what is missing.** The banner's state comes from the
  prerequisite the host can observe: Tailscale absent, present but signed out, or ready. Each
  is one status line and one button, in the banner's existing shapes. It never opens with the
  other-device warning.
- **R6 — consent before publication.** Issuing a certificate publishes this computer's name
  permanently in public certificate-transparency logs. The approved yellow box states that,
  names the exact hostname, and no certificate is requested until the button is pressed.
  Renaming the machine later does not remove the record, so the copy does not imply it can.
- **R1 — guided, explains before it changes anything, checks at the end.** The check is a
  real one: after setup the host confirms it is listening and that the Serve route resolves,
  and reports `listening` or the reason. It never reports success from configuration alone.
  A device is not pretended to be tested — the panel says the phone has not been tried yet,
  because it has not.

## Cross-platform surface (R1-19, R2-8)

New protocol, not just new UI (R3-6):

- `remote:devices:list` → `{ devices: [{ id, name, online, createdAt, lastSeenAt }] }`
- `remote:devices:rename` → `{ id, name }`
- `remote:devices:unpair` → `{ id }`
- `remote:disconnect-client` is **removed**, not gated. It is the button that looked like it
  removed access and did not; unpair replaces it, and leaving both would put two buttons with
  near-identical labels and very different consequences next to each other.
- A device's initial name comes from the client at pairing — the browser and OS it is running
  in, or the Android device name — and is editable afterwards. It is never the IP address.

Plus `remote:status` from §5. Each needs a payload, a `preload.ts`
entry and a `SessionService.kt` case. `shim-parity.test.ts` compares shapes and will not
catch a missing Kotlin case, so Android is a task in this batch's breakdown, not a follow-up.

## Not in this batch

Conversation restoration ordering, file lists, previews and downloads, uploads, editing,
Android encrypted-preferences hardening, shared upload temp storage, and the shared
plugin/hook startup mutations that make a real process test unsafe.

## Still to prove at runtime

Serve carrying WebSocket upgrades, header and query fidelity, idle behaviour, phone wake and
network change, and coexistence with an existing Serve route. These need a runtime rig and
separate permission. No live-app attachment and no Serve configuration change has been made.
