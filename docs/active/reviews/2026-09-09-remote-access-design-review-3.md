---
status: active
---

# Remote access batch 1 — technical design review, round 3 (final)

Reviewed: `docs/active/specs/2026-09-09-remote-access-batch1-technical-design.md`
**revision 3**, against the signed contract
`docs/active/design/2026-09-09-remote-access/remote-access.contract.json`, the approved
scope `docs/active/specs/2026-09-09-remote-access-first-milestone.md`, rounds 1 and 2,
and the app worktree at HEAD `de69d60a` (`SettingsPanel.tsx`, the workbench mock files
and `desktop/src/renderer/components/remote/` are modified/untracked in this worktree —
line numbers below are what is on disk now, which is what an implementer will edit).

This reviewer wrote neither the design nor rounds 1 and 2. Every line number was opened.
Paths abbreviate `youcoded/desktop/src/`.

## Revision 3's new claims, verified

All four claims the brief singled out are **true at the cited lines**:

- §0 `remote:set-config` (`main/remote-server.ts:2284-2291`) — no gate of any kind; it
  writes `enabled`, `trustTailscale` and `keepAwakeHours` and saves. A phone can switch
  remote access off today. True.
- §0 `remote:disconnect-client` (`:2306-2310`) — no gate; passes straight to
  `disconnectClient` (`:467-477`). True.
- §0 "a refusal resolves as a *value*" — `remote-server.ts:2276` responds `{ error: … }`;
  `responseOutcome` (`renderer/remote-shim.ts:234-239`) returns `'value'` for that shape
  (it only reports failure on `unsupported === true`, or `ok === false` for a channel in
  `REJECT_ON_NOT_OK`), and `applyResponse` (`:264-281`) resolves it. True.
- §6 "`ws.onclose` does not clear `pending`" — `pending.clear()` occurs only at
  `remote-shim.ts:776` (`connectToHost`) and `:824` (`disconnect`); `ws.onclose`
  (`:600-636`) clears neither. The 30 s timer at `:151-157` is what deletes the entry.
  True.
- §6 "`session:input`, `native:retry`, `native:interrupt` carry no id" — all three are
  `fire()` (`:951`, `:1833`, `:1831`), and `fire()` (`:282-284`) sends `{type, payload}`
  with no id. True. (`session:resize` `:952` and `ui:action` `:1260` are the same shape;
  see R3-3.)

Other locators re-checked and correct: `remote-server.ts:174, 279, 321, 389, 435, 458-464,
751, 757, 797, 805-806, 2274`; `remote-config.ts:12, 21-25, 56`; `remote-shim.ts:34, 35,
88, 115, 135, 150, 646, 780`; `SettingsPanel.tsx:1372` (`isFullyConnected`), `:1722`
(`trustTailscale` toggle); `SessionService.kt:1502-1512` (hardcoded `remote:get-config`),
`:1551-1556` (`remote:set-config` / `remote:disconnect-client` stubs);
`tests/remote-server.test.ts:30-31` (the `listen((_port, cb))` mock). R2-16's count of ten
`trustTailscale`/`onToggleTailscaleTrust` sites in `SettingsPanel.tsx` still holds
(`:81, :1290, :1315, :1357, :1721, :1722, :1757, :2426, :2428, :2551`).

## Round-2 findings: resolved by a decision, or still words?

| Finding | Verdict in revision 3 |
|---|---|
| R2-1 | **Resolved by decision.** §6 is rewritten to the contract: user input becomes a draft, the auto-flush path goes. What replaces it for non-user traffic is unmade — R3-2. |
| R2-2 | **Resolved.** Ids become `<deviceId>:<connectionGeneration>:<n>`; the ring keys per device. |
| R2-3 | **Half words.** The timeout's new behaviour is decided ("outcome unknown", never auto-retried). R2-3's fix also asked "say which surface displays that set"; no surface is named — R3-4. |
| R2-4 | **Resolved.** 200 ids per device, 10 minutes, memory only, "unknown" after restart, stated out loud. |
| R2-5 | **Resolved by decision** for the three named fire-and-forget channels — they are refused rather than tracked. How a `fire()` caller *learns* it was refused is unmade, and two more fire channels plus `native:send` are unclassified — R3-3. |
| R2-6 | **Resolved.** All seven `remote:*` cases are accounted for: three refused by name, the rest are reads. |
| R2-7 | **Half words.** "A refusal rejects; it does not resolve" is a decision, but the payload shape that makes it reject is unstated, and the second half of R2-7's fix — the panel surface on a remote client — is dropped — R3-5. |
| R2-8 | **Resolved**, apart from one missing site — R3-8. |
| R2-9 | **Half resolved.** "Credential retired" gets terminal treatment (§6). The rate-limiter half of R2-9's fix is not answered, and §0's replacement rule cannot run where the limiter runs — R3-1. |
| R2-10 | **Resolved.** Per-platform, and honest about what an un-updated client shows. |
| R2-11 | **Resolved.** Allowlist = discovered tailnet origin + `null`; `localhost:<port>` rejected; accepted set logged. |
| R2-12 | **Resolved for R1/R5/R6** by §7. R7/R8 now have the same gap R2-12 described — R3-6. |
| R2-13 | **Resolved.** Per-connection generation, stale callbacks dropped, test named. |
| R2-14 | **Resolved.** The auth message, the lookup rule and the "returned once" rule are written down. |
| R2-15 | **Half words.** The two id spaces are separated (the decision R2-15 asked for), but the payloads are still unnamed and `remote:disconnect-client`'s fate is unstated — R3-6. |
| R2-16 | **Resolved.** The number is dropped in favour of `knip` plus a source-scanning guard. |
| R2-17 | **Resolved.** The field is gone. |

## Findings

Triage by the implementing session, 2026-09-09: **all accepted.** This was round 3, the
cap set by `.claude/rules/feature-flow.md`, so the four open decisions are made in
revision 4 rather than sent to a fourth reviewer.

- **R3-1 — §0's rate-limiting rule cannot run where the limiter runs, and clients with — **accepted**
  no device record — the whole of upgrade day — are left unlimited or unspecified.**
  §0 says "Rate limiting, device rows and log lines key on the device id."
  `isRateLimited(ip)` is called at `main/remote-server.ts:751`, in `handleConnection`,
  **before the auth message is read** (`:775`) — at that moment there is no device id and
  cannot be one. Two of the three cases that must be limited never have a device id at
  all: a password pairing attempt (`:800`, the brute-force case the limiter exists for)
  and a retired credential (§1's migration, whose lookup fails). R2-9's accepted fix said
  the limiter must "fall back to a per-connection allowance (not a shared IP bucket) for
  clients with no device record"; revision 3 states the device-id rule and drops the
  fallback. Once §3's loopback bind lands, the only remaining key is `127.0.0.1` — one
  bucket, `RATE_LIMIT_MAX_FAILURES = 5` per 60 s (`:79-80`), which is exactly the R1-2
  lockout the rule was written to remove.
  **Fix:** split the rule in two and say both halves: what the pre-auth connection gate
  limits (per-socket allowance, or a global failure budget with a stated size) for clients
  that have not identified themselves, and what device-keyed limiting covers after
  identification. Name where the pre-auth check moves to, since it cannot stay at `:751`
  and see a device id.

- **R3-2 — §6 deletes the auto-flush path and names nobody who re-issues the reads it was — **accepted**
  carrying, which restores a documented cold-start bug.** §6 says user actions "are never
  queued … This deletes the auto-flush path rather than bounding it", and separately that
  "Reads may be re-issued, because re-reading is harmless." Nothing re-issues them.
  `send()` (`renderer/remote-shim.ts:115-131`) queues whenever the socket is not
  `OPEN && connected` — which covers a second state besides "the user is disconnected":
  the cold-start window where the socket is open but auth has not completed. The comment
  at `:78-86` records why: mount-time fetches (`skills.list` and friends) that raced the
  handshake "silently disappeared, leaving contexts empty for the app's lifetime. Visible
  on Android as installed plugins never appear in the command drawer." Those callers fire
  once on mount; there is no retry, no refetch-on-connect, and `flushSendQueue()`
  (`:135-146`, called only from the `auth:ok` branch at `:574`) is the entire mechanism.
  Delete it with nothing named in its place and that bug comes back on every Android and
  browser launch.
  **Fix:** say which of the two the design means — the queue survives for reads and
  flushes on `auth:ok` (with user-action channels excluded from it), or the queue is
  deleted and a named mechanism re-issues reads on connect (which callers, driven by
  what). Either is fine; the document has to pick one.

- **R3-3 — "Refused while disconnected, the composer keeps the draft" has no refusal path — **accepted**
  for the channels it names, no signal reaching the composer, and no classification rule
  for everything else.** Three separate gaps in one bullet:
  (a) **The refusal cannot be returned.** All three named channels are `fire()`
  (`remote-shim.ts:951, :1831, :1833`), which returns `void` (`:282-284`). The PTY chat
  send is one of them — `native-send.ts:76` calls `session.sendInput(sessionId, ptyText +
  '\r')` for the `claude` provider — and `InputBar.tsx:739-750` clears the textarea
  *synchronously* on `sendMessage()` returning `true`. So on today's code the draft is
  gone before anything could refuse it.
  (b) **Nothing tells the composer.** The good news: the composer does own the draft
  (`InputBar.tsx:291` per-session `draftsRef`, `:500` `sendMessage` returns `false` to mean
  "refused, keep the draft", `:600-625` restores the draft when a native ack fails), so
  the mechanism the contract needs already exists. What does not exist is the input: the
  only consumer of connection state in the renderer is `index.tsx:173`, and
  `onConnectionStateChange` (`remote-shim.ts:96`) assigns a **single** callback
  (`:38`) — a second subscriber replaces the first. And after one successful connection
  `index.tsx:205` keeps rendering `<App/>` regardless of state, so a remote client
  mid-disconnect looks identical to a connected one: there is no banner, no indicator,
  nothing. A user whose Send does nothing is told nothing.
  (c) **Only three channels are classified.** `native:send` (`:1827`) — the chat send for
  every native session, and the literal subject of contract row R2 — is an `invoke` and is
  not in the refused list. `session:resize` (`:952`) and `ui:action` (`:1260`) are fire
  channels and are unmentioned. And the split "user actions refused / reads re-issued"
  has no home for the third class: non-read writes that are not typing (`models:settings`,
  `engine:set-config`, `sync:set-config`, session creation). Every channel needs a side;
  the code has no property that says which.
  **Fix:** (a) state how a refusal reaches a `fire()` caller — `fire()` returns a boolean,
  or the composer gates on state before calling; (b) make connection state a multi-listener
  subscription and name the surface a remote client shows while disconnected (the contract
  promises the draft waits, which only works if the user can see why); (c) state the
  classification as a rule with a default — e.g. an explicit re-issuable-read allowlist
  and "everything else is refused while disconnected" — and name where the list lives, the
  way `REJECT_ON_NOT_OK` (`remote-shim.ts:203-223`) already does for a similar decision.

- **R3-4 — "Outcome unknown" still has no surface, no query channel and no Android host.** — **accepted**
  §6 decides the mechanism (30 s timer marks unknown, never auto-retries, client asks the
  host on reconnect, ring answers or says unknown) but three implementable pieces are
  missing. (a) R2-3's accepted fix said "say which surface displays that set"; §6 says only
  that a request "reads as unknown", and the milestone requires "show uncertainty and a
  safe next step" (`…first-milestone.md:72-74`). No surface is named anywhere in revision
  3. (b) The reconnect query is a new protocol message with no name and no payload, while
  the Cross-platform section enumerates `remote:devices:*` and `remote:status` precisely.
  (c) Android is also a host — `SessionService.kt:1495-1560` answers the `remote:*` block
  itself — so the ring and the query need a Kotlin answer, or an explicit statement that
  the local bridge is exempt and why.
  **Fix:** name the surface (and what its "safe next step" is), name the query channel and
  both payloads, and say what the Android host does with it.

- **R3-5 — The refusal's shape is unstated, and the controls that will now always fail are — **accepted**
  still on screen on a remote client.** §0 says "the refusal becomes an error the caller
  throws on, and the panel shows it", but `applyResponse` (`remote-shim.ts:264-281`)
  rejects for exactly two shapes: `unsupported === true`, or `ok === false` **and** the
  channel is in `REJECT_ON_NOT_OK` (`:203-223`). Those two produce different user
  experiences — `unsupported` fires `noteUnsupported` and the app-wide "not available over
  remote access" notice (`:242-252`), `ok:false` throws the handler's error string to the
  caller — so this is a real choice, not a detail. Separately, R2-7's fix had a second half
  that revision 3 drops: the Remote Access panel renders on remote clients (the shim sets
  `__PLATFORM__` to the host's `'desktop'` on `auth:ok`, `:577-582`; note at
  `SettingsPanel.tsx:1350-1357`), so after §0 lands, a phone still shows a Password field,
  an Enabled toggle and Keep awake controls (`:1721-1738`, `:2428`) of which all three can
  now only fail. Keep awake in particular works from a phone today and stops working, with
  nothing in the design acknowledging the loss.
  **Fix:** state the refusal payload, and state what the panel does on a remote client —
  hide the three controls, or show them disabled with the reason. Check that answer against
  contract row R4 ("Enabled, Password, Keep awake and Add Device stay exactly where they
  are"), which reads as a promise about the host panel; say so explicitly if a remote
  client is meant to differ.

- **R3-6 — Contract rows R7 and R8 have the gap R2-12 was raised about: backend decided, — **accepted**
  no renderer, no payloads, no device names.** §1 decides the device record and the two id
  spaces, and the Cross-platform section says `remote:devices:list|rename|unpair` "each
  needs a payload, a `preload.ts` entry and a `SessionService.kt` case" — which names the
  work, not the payload. R2-15's fix asked for the payloads and for what happens to
  `remote:disconnect-client`; neither is stated, and §0 refuses that channel over the
  socket without saying whether it survives at all. On the renderer side nothing owns rows
  R7/R8: the panel today lists *connections* — `SettingsPanel.tsx:1640-1657` renders
  `client.ip` as the title, `timeAgo(client.connectedAt)` as the description and a
  **Disconnect** button calling `onDisconnectClient(client.id)` (`:2481`) with the
  per-connection `randomUUID()` from `remote-server.ts:829`. The Unpair label, the
  confirmation copy and the offline rows exist only inside the `previewView` mock branch
  (`:1652-1653`), so shipping the backend alone leaves R7 and R8 unmet. Finally, §1 names a
  device from the client's `deviceName` "or 'New device'", and never says what a browser
  sends — with the browser being the platform R7's "listed by name" is most visible on.
  **Fix:** name the three payloads and the `remote:disconnect-client` decision; state that
  the panel's device section moves from `getClientList()` to the device list with an
  online flag, Unpair and the confirmation copy; and say what a browser supplies as its
  device name.

- **R3-7 — §7 is written as unconditional work on top of §3, which the same document says — **accepted**
  is not decided.** §3 is explicitly conditional: "The milestone's transport-feasibility
  checkpoint is not passed … If it cannot, this section returns as options." §7 then
  promises a post-setup check that "the Serve route resolves" (R1) and a consent gate
  before a certificate is issued (R6) — both of which exist only if Serve is the answer.
  There is no Serve or certificate code in the app at all (a search across
  `desktop/src/main` for `tailscale serve` / `tailscale cert` returns nothing;
  `remote-config.ts:250-317` installs Tailscale and runs `tailscale up`, and stops there),
  so all of it is new work sitting behind an unpassed gate. A task breakdown cannot tell
  which §7 tasks are safe to schedule.
  **Fix:** mark in §7 which items are gated on the §3 checkpoint and which are not (the
  prerequisite banner of R5 is not; the route check and the certificate consent box are),
  and say what the panel shows for R1's end-of-setup check if Serve turns out not to be
  the transport.

- **R3-8 — §5's site list omits the one site that makes the indicator work where the — **accepted**
  panel is actually being read. (Minor.)** §5 names the server emit, `ipc-handlers.ts`,
  `preload.ts` and `SessionService.kt`. It does not name `renderer/remote-shim.ts`, whose
  `remote` surface (`:1251-1260`) is a flat list of `invoke()` wrappers with no listener
  entry at all — so on a phone or browser, which is where the Remote Access panel is
  rendered as if it were desktop (R3-5), `remote:status` would arrive with nothing
  subscribed and the indicator would keep reading whatever it defaults to. R2-8's fix
  listed "a new preload `on…` entry, a shim listener and a Kotlin emitter".
  **Fix:** add the shim listener to §5's list of sites.

## Verdict

**Not buildable as written — but the gap is now narrow and specific.** Revision 3 turned
almost all of round 2 into decisions: §§1–5 and §7 could go to a task breakdown today with
only R3-6's payloads and R3-8's missing site to fill in, and R3-5 and R3-7 are answerable
in a sentence each.

Two places still need a decision the implementer would otherwise have to invent:

- **§0's rate limiting (R3-1).** The stated rule cannot run where the limiter runs, and the
  case it must cover most — upgrade day, when nobody has a device record — has no rule.
  This is a security control and the one thing that decides whether the owner can re-pair.
- **§6 (R3-2, R3-3, R3-4).** The new model is right and matches the contract, but three
  things it depends on are unspecified: what carries the reads the deleted queue was
  carrying, how a refusal reaches a `fire()` caller and what the user sees when one
  happens, and where "outcome unknown" is displayed and asked about.

Settle those four and the document is an implementation contract.
