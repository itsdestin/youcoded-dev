# Remote access — code review (fresh reviewer)

Branch `session/remote-mesh-roadmap` (13 commits) diffed against `origin/master`.
Inputs: the branch diff, `remote-access.contract.json` rows only, `.claude/rules/ipc-bridge.md`,
`.claude/rules/code-search.md`, `.claude/rules/feature-flow.md`, `.claude/rules/review-deck.md`.
No spec, plan, design review or transcript was read.

## verify.sh

```
verify: /home/destin/youcoded-dev/worktrees/sessions/remote-mesh-roadmap/youcoded (base origin/master)
  tests: related to 37 changed file(s) + 44 source-scanning guards

PASS  types (tsc --noEmit)
PASS  types in tests/ (tsc --noEmit, 57 file(s) still excluded)
PASS  tests (related)
PASS  dead code (knip)
PASS  lint (eslint)
PASS  invariants (ast-grep)

OK — all checks passed.
   Not covered: Android (./gradlew test), marketplace worker.
```

## Findings

- F1 accepted — fixed. `case 'remote:status'` added to the WS host, plus `remote-channel-parity.test.ts`, which fails when ANY channel the shim invokes has no case here, and a behaviour test that drives the channel through handleMessage.

  ORIGINAL: `desktop/src/main/remote-server.ts`:2382-2446 — `remote:status` has no `case` in the WS host, so it hits `default:` → `{unsupported:true}`; `SettingsPanel` puts `getStatus()` inside the mount `Promise.all` (`SettingsPanel.tsx`:2596), whose `.catch(() => setLoading(false))` then throws away config, Tailscale info AND the device list — a remote browser opens Settings → Remote Access to a blank panel — and because `remote:status` is also in `REHYDRATE_ON_RECONNECT` (`remote-shim.ts`:168) every reconnect re-fires it and raises the "not available over remote access" banner. — Confirmed: `rg -n "remote:status" desktop/` returns hits in `shared/types.ts`, `preload.ts` and `remote-shim.ts` (x2) and none in `remote-server.ts`; `applyResponse` (`remote-shim.ts`:379-388) rejects on `unsupported`, and `Promise.all` rejects on any member. Android DOES implement it (`SessionService.kt`, `"remote:status"` arm), so this is the desktop-host surface the ipc-bridge rule calls the fifth one.
- F2 accepted — both channels join `REJECT_ON_NOT_OK`, the Unpair button is gated on `hostOnly`, and the parity test now fails on any host refusal that is not in that set.

  ORIGINAL: `desktop/src/renderer/remote-shim.ts`:317-322 — `remote:devices:unpair` and `remote:devices:rename` were NOT added to `REJECT_ON_NOT_OK` (only `remote:set-password` and `remote:set-config` were), so the host's `{ok:false, error:'Change this on the computer itself.'}` resolves as an ordinary value; the Unpair button is not gated by `hostOnly` (`SettingsPanel.tsx`:1846) and `handleUnpairDevice` removes the row optimistically (`SettingsPanel.tsx`:2733) — on a remote browser a device appears to be unpaired, vanishes from the list, and still has full access. — Confirmed by reading all three: the host's refusal at `remote-server.ts`:2438-2446, the Kotlin mirror's identical `{ok:false}` arm, `REJECT_ON_NOT_OK`'s membership, and the unconditional `setClients(prev => prev.filter(...))`. This is the exact false-success class the branch's own comment above `REJECT_ON_NOT_OK` says it was fixing.
- F3 accepted as a lying comment, rejected as a behaviour change. A device arriving with only the password has lost its credential, and the host cannot know which earlier row it was — matching on a name would merge two people with the same phone. The comment now says that, and says not to "deduplicate" it.

  ORIGINAL: `desktop/src/main/remote-server.ts`:905 with `remote-devices.ts`:78-91 — the comment says "Re-authenticating reuses the record rather than minting another credential", but `pair()` unconditionally `crypto.randomUUID()`s a new record; any device that re-enters the password (cleared browser storage, a terminal 4004 close, a second browser) becomes a SECOND row in the list, and unpairing the visible row leaves the older record valid. — Confirmed by reading `pair()` in full: no lookup by name or by anything else, always `this.devices.set(device.id, device)`. Contract row R11 ("every device that has paired stays in the list … until you unpair it") is what makes the duplicates user-visible.
- F4 accepted — the queue drops anything older than the request timeout on flush. Not by classifying every invoke channel: the queue is what makes a first connect work at all (REHYDRATE only re-issues after a reconnect), and a message whose caller was already told it failed is the actual bug.

  ORIGINAL: `desktop/src/renderer/remote-shim.ts`:135-160 — `MESSAGE_KIND` classifies only `fire()` channels, so every `invoke()` request sent while the socket is down still falls through to `pendingSendQueue` and is flushed on the next `auth:ok`; a request that already timed out at 30 s and told the user it failed still executes minutes later — the precise behaviour the block comment above `MESSAGE_KIND` claims to have removed. — Confirmed by reading `send()` (`MESSAGE_KIND[msg?.type]` is `undefined` for every invoke channel → falls to `pendingSendQueue.push`) and `invoke()` (:262-274, which ignores `send()`'s boolean). The guard cannot see it: `remote-message-kinds.test.ts`'s `firedChannels()` scans only `/\bfire\('([^']+)'/`. R2's headline case (typing) IS covered; the general claim is not.
- F5 accepted — fixed. `stop()` takes an explicit `forRollback`; a user stop clears the reason and emits. Behaviour test, inverted and confirmed red.

  ORIGINAL: `desktop/src/main/remote-server.ts`:505 and 496-505 — `stop()` never clears `lastStartError`, and suppresses its own `emitStatus()` whenever that field is set; after a failed start (Tailscale down) the user turning the toggle back OFF leaves `getStatus()` answering `{state:'failed', reason:'Tailscale is …'}` for the rest of the process, with no push telling the panel it stopped. — Confirmed by reading `start()` (:328-345 sets `lastStartError` and throws before anything is bound), the IPC rollback path (`ipc-handlers.ts`:1770-1786 → `remoteServer.stop()`), and `stop()`'s trailing guard. Only a successful `listen` clears the field (:449).
- F6 accepted, and largely closed by F13: an `anon:` prefix can never equal a real deviceId, so the host now answers `unknown` for every pre-auth id instead of matching a shared ring.

  ORIGINAL: `desktop/src/renderer/remote-shim.ts`:263 — request ids are `${myDeviceId || 'anon'}:${gen}:${n}`, and the host keys its completed-request ring on `id.split(':')[0]` (`remote-server.ts`:2879-2890); every request issued before `auth:ok` therefore lands in a shared `anon` ring, so two browsers cold-starting produce identical ids (`anon:1:3`) and `remote:request-outcome` can report one device's request as "completed" for another. — Confirmed by reading both id generators; `messageId` is a per-page-load counter reset on reload, and the mount-time fetches that populate the queue always run before `myDeviceId` is set.
- F7 accepted — the comment claimed a UI that does not exist. Comment corrected; the unknown-outcome indicator is filed to the roadmap rather than invented here.

  ORIGINAL: `desktop/src/renderer/remote-shim.ts`:35, 226-231 — `OUTCOME_UNKNOWN_EVENT` has no listener anywhere in the tree, so the "Sent, no reply, timed out … The UI reads this to say so plainly" comment is false; nothing tells the user an action's fate is unknown. Related: `invoke()`'s timeout (:265-272) deliberately leaves the entry in `pending`, and only `reconcileUnknownOutcomes` (on a successful reconnect) or a host switch ever deletes it — a client that never reconnects accumulates entries and their reject closures indefinitely. — Confirmed: `rg -n "OUTCOME_UNKNOWN_EVENT|youcoded:outcome-unknown" desktop/src` returns only the definition and the dispatch; `rg -ln OUTCOME_UNKNOWN desktop/tests` returns nothing.
- F8 accepted — renamed to `shouldSlowConnection()`.

  ORIGINAL: `desktop/src/main/remote-server.ts`:2921-2930 — `connectionDelayMs()` returns a `boolean`, but its name and its own doc comment say "How long to wait before answering a new connection, in ms. Zero unless…"; the caller compensates (`:839`, `? HOST_SLOWDOWN_MS : 0`). A name that lies about its unit. — Confirmed by reading the signature and its only call site.
- F9 accepted, and the reason F1 shipped. Answered with the parity test and three behaviour tests rather than by rewriting the greps: the missing guard was cross-surface, not per-file.

  ORIGINAL: `desktop/tests/remote-rate-limit.test.ts`, `remote-tailnet-bind.test.ts`, `remote-devices-channels.test.ts` — these are `readFileSync` + `toContain` greps over source text: they prove that `HOST_FAILURES_BEFORE_SLOWDOWN`, `attemptsOnThisSocket` and `server.listen(this.config.port, this.bindAddress ?? undefined` appear in the file, not that the limiter bounds anything or that the listener refuses a second address. `remote-devices-channels.test.ts` also enumerates only the three `remote:devices:*` channels, which is exactly why F1's missing `remote:status` case passed every check. — Confirmed by reading all three files end to end. (No contract row is `checkedBy: mechanical`, so this is a guard-quality finding, not a broken contract promise.)
- F10 accepted as scope, rejected as a defect. R6 is `checkedBy: deck` and browser encryption is the OPTIONAL second level, deliberately mockup-only in this batch. Called out to Destin so nothing reads it as shipped.

  ORIGINAL: `desktop/src/renderer/components/SettingsPanel.tsx`:1616-1660, 1881-1890 — the browser-encryption screen and the yellow "This computer's name is added to a public list of issued certificates" box are both gated on `previewView && preview`, and `setShowEncryption(true)` is called only inside that gate, so `showEncryption` can never become true in the real app. Contract row R6 ("One yellow box asks you first, before this computer's name is published in a public record") exists as a workbench mockup only. — Confirmed by reading both gates and `MOCK_ONLY` (`mock-only.ts`:81, "Remote access secure setup — UI mockup only"). R6 is `checkedBy: deck`, so this may be the intended scope; flagging it so the grader is not told a shipped feature exists.
- F11 accepted — the row is removed only when the host says it removed it.

  ORIGINAL: `desktop/src/renderer/components/SettingsPanel.tsx`:2728-2735 — `handleUnpairDevice` ignores the boolean the host returns and removes the row (and decrements `clientCount`) regardless; `unpairDevice` returns `false` for an unknown or already-revoked id, so a stale panel silently drops a row for a device that is still paired. — Confirmed by reading `unpairDevice` (`remote-server.ts`:551-565) and the handler.
- F12 accepted — the kind is right, its definition was too narrow. A resize is safe to repeat; the comment now says so instead of claiming nothing changes.

  ORIGINAL: `desktop/src/renderer/remote-shim.ts`:150 — `'session:resize': 'read'` classifies a PTY resize as a read, under a comment that defines `'read'` as "safe to ask again, because asking changes nothing". A resize mutates host state; it is benign to repeat, but the label is wrong and the next channel copied from it may not be. — Confirmed by reading the host's `case 'session:resize'` (`remote-server.ts`:2768).
- F13 accepted — fixed. Outcome lookups are scoped to the asking device; behaviour test, inverted and confirmed red.

  ORIGINAL: `desktop/src/main/remote-server.ts`:2425-2431 — `remote:request-outcome` accepts any ids from any authenticated client and does not check that the `<deviceId>` prefix belongs to the asking socket, so a paired phone can learn whether another device's requests completed. Same section: `remote:devices:list` (:2432) hands every paired client the full list of device names, ids and last-seen times. Low impact (no secrets, no writes), but neither is scoped to the caller. — Confirmed by reading both cases; `client.deviceId` is available and unused in them.
- F14 accepted — the mock and the preview both carry `state`, so the two prerequisite screens can be seen in the workbench.

  ORIGINAL: `desktop/src/renderer/dev/workbench/mock-shim.ts`:1697 and `SettingsPanel.tsx`:1543 — the workbench `detectTailscale` mock and the preview's synthesised `tailscale` object both omit the new `state` field, so `renderPrerequisite`'s `'signed-out'` and `'stopped'` branches (`SettingsPanel.tsx`:1320-1332) can never render in the workbench; the preview always falls through to the generic "isn't connected" strip. The R5 copy most likely to be wrong is the copy the mockup cannot show. — Confirmed by reading the mock literal, the preview literal and the branch order.
- F15 accepted — connected, password set, no address is now its own line instead of falling through to "Not set up yet".

  ORIGINAL: `desktop/src/renderer/components/SettingsPanel.tsx`:1343-1348 — when Tailscale is installed and connected and a password IS set but `tailscale.url` is null (status JSON gave no IP and the `tailscale ip -4` fallback failed), the caller at :1716 falls into `renderPrerequisite`, which runs off the end and returns `notSetUp` — "Not set up yet." with a **Set up** button that re-enters the installer flow, for a machine that is already installed, connected and configured. — Confirmed by reading the gate at :1687 (`tailscale?.installed && tailscale.url && config?.hasPassword`) against the function's fall-through.
- F16 accepted as unverifiable here — R3 is `checkedBy: live-app` and needs the second device this batch has never had. Recorded as such for the grader rather than claimed.

  ORIGINAL: contract row R3 — nothing on this branch implements or guards "your phone stays on the conversation you were reading, even when the desktop moves to another one"; it rests on pre-existing behaviour (no `broadcastAction` call carries a session switch — the producers are `_SESSION_INITIALIZED`, `switch-view`, chrome measurements, tool cards and the trust gate). The branch does add a new reconnect path (`rehydrate()` + `chat:hydrate` replay), which is the half of R3's threshold most likely to have regressed. — Confirmed by `rg -n broadcastAction desktop/src/renderer` (13 call sites, none a session switch) and by reading the `chat:hydrate` handler (`App.tsx`:1675, dispatches `HYDRATE_CHAT_STATE` only). [PLAUSIBLE — verifying this needs the live-app run the row already calls for.]

Rows implemented and read as sound: R7 (`remote-devices.ts` keeps revoked records, `list()` filters them), R8 (two-step Unpair with "It must pair again to reconnect", `SettingsPanel.tsx`:1839-1846), R9 (the CGNAT auto-pair block and `isTailscaleIp` are both gone; `verifyPassword` is now unconditional), R10 (`server.listen(port, bindAddress)` with a hard refusal when Tailscale is down), R11 (`hasClients` derives from `deviceRows`, which includes offline devices) — subject to F3's duplicate-row problem.

One design note, not a finding: the host-wide slowdown (`HOST_FAILURES_BEFORE_SLOWDOWN` = 25, `HOST_SLOWDOWN_MS` = 2 s) never refuses, so an attacker who can reach the tailnet address gets unlimited password guesses at ~1 per 2 s per socket, in parallel across sockets. Given the bind is tailnet-only that is a defensible trade; I mention it because the code comments argue the lockout side of it and not this side.

## Not covered

- Android: `./gradlew test` was not run (verify.sh covers desktop only, and the brief's budget went to the main-process code). The Kotlin diff was read; its four new/changed `when` arms parse correctly and match the desktop type strings.
- `desktop/tests/remote-access-panel.test.tsx`, `remote-setup-flow.test.tsx`, `remote-recovery.test.ts`, `remote-devices.test.ts`, `remote-auth-devices.test.ts`, `remote-host-admin-desktop-only.test.ts`, `remote-status-channel.test.ts`, `remote-password-always-required.test.ts`, `remote-paths.test.ts` were not read line by line — only the four named in F9.
- The renderer panel's `SettingsPanel.tsx` diff is ~700 lines; I read the remote-access section, the two exported render helpers and the preview gating, not the surrounding settings refactor.
- `replayBuffers` / `chat:hydrate` behaviour on reconnect (the R3 risk in F16) was not traced into the reducer.
- No runtime verification of any kind: no dev instance, no browser, nothing was started or stopped.
