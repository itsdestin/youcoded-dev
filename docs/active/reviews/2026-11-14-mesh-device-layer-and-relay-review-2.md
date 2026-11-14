# Mesh device layer + relay: second-round independent security review and attack test

Reviewer wrote neither the code nor the fixes. Nothing in either repo was edited or committed (`git status` of both repos and the workspace is unchanged apart from the owner's own untracked deck file; `scripts/verify.sh` wrote its normal logs under the workspace's git-ignored `scratch/`).
All attack code lives in `/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/device-review-2/`:
`atk/` (app-side suites run against the real `MeshService` and the real Worker under `wrangler dev --local` on 127.0.0.1, throwaway homes), `wmut/w/` (a COPY of the Worker with extra attack tests and the mutation runs for item 4), `results.txt` (raw output of the app-side runs). No process of mine is left running; nothing under `/opt/YouCoded` or real user data was touched; no network beyond localhost.

Subject: app `cfd8d84ad` (vs `32c7fb6a4`, store/ ignored), Worker `4c611bf`, `b11cffa` (vs `1cc8f00`).

## Verdicts

| Question | Answer |
|---|---|
| SAFE TO MERGE SWITCHED OFF, app repo | **YES.** Nothing in this round touches the off path except `config.ts`, which now fails safer (`OFFICIAL_BUILD` joins `packaged`). `verify.sh`: OK, all checks passed. |
| SAFE TO MERGE SWITCHED OFF, Worker repo | **YES.** Source changes are confined to `src/mesh/`; the flag-off 404/400 tests pass inside the full suite (57 files, 679 tests). One caveat carried over: relay objects created by older code are not migrated (finding N10); none exist in production. |
| SAFE FOR A LOCKED-DOWN TEST RELAY WITH THE DEVELOPER'S OWN DEVICES | **WITH THESE FIXES.** N1 (an entry that never left the device makes every later removal/add from that device unusable on its peers, and nothing heals it: triggered by quitting the app after a rename or by a crash during pairing) and N8 (the host auto-removes a good device it did not happen to see within the wait). Both need no attacker. Everything else needs a hostile or compromised paired device, or a dishonest relay, and can run as "known" while only the developer's own devices and own relay are involved. |

## 1. First-round findings re-run against the new code

| # | First-round finding | Result | Evidence (this round) |
|---|---|---|---|
| 1 | Rename blocks later add/remove at the relay | **FIXED** | R2 re-run: after one rename, a 4th device paired and the removal reached the relay (`B relay state: removed`, no `relay-remove-refused`). Worker accepts `rename`; its own test passes. |
| 1b | Failed pairing leaves a phantom member | **FIXED by design, residual in N1/N8** | Pairing now tells the relay first and rolls back by removal. My old R2b script no longer shows a phantom; it shows B never learning of D because the entry was never published (that is N1). |
| 2 | One bad frame freezes sync | **FIXED** | S2: A learned of the later removal (`A knows B removed: 1`, survives restart). S5: A received both later notes (`["B-after-removal","B-after-removal-2"]`). |
| 3 | Member overwrites a victim's secret | **FIXED for overwrite** | S1: injected bundle accepted by relay but A's gen-1 secret unchanged (`replaced: false`), A and C still exchange notes. **Still true:** any member may remove any member including the creator (S3: `A relay: removed`), and see N3 for concurrent removals. |
| 4 | Roster flood: quadratic CPU, freeze at 8192 | **PARTLY** | Verification is now incremental; the attacker's own log stops at 512 entries (S7: `bad-roster: device quota`); receivers allow 60 entries/hour per signer. But the "flag" is forgeable (N2) and the cap can still be filled with ghost members (N7). |
| 5 | 30-day purge of the roster group | **FIXED for honest use, bypassed by a member** | Control groups are exempt, but any member can make `roster` a "line" group (N5, demonstrated). |
| 6 | Any member removes others at the relay | **NOT FIXED (policy)** | Unchanged: no decide rules. |
| 7 | Hostile relay poisons read position | **FIXED** | S8b (with a real saved state): evil relay answered a gap of 9e15; `link-state.bin` held no huge cursor; back on the honest relay A received `after-evil-1`. |
| 8 | Hostile relay exhausts memory | **FIXED (code-proven, run shows hang-ups)** | Client stops at the first frame over 1 MiB or past one page plus one frame, hangs up (7 `relay-oversize-answer` in 6 s with the evil relay flooding), `maxPayload` now 1 MiB-class. The in-process RSS I can measure (448 MB) is the evil relay's own buffers; per-request client memory is bounded at about 5 MiB by the code. |
| 9 | Headless env vars turn mesh/test mode on | **FIXED when stamped** | Both release workflows run `stamp-official-build.mjs` before the build (desktop-release.yml:77, android-release.yml:98, before `build-web-ui.sh` and before Gradle compiles the backend). `config-official.test.ts` passes. **Fails open if a stamp is missed** (default is `false`): see N11. |
| 10 | Android key-store claim is hard-coded | **FIXED, by refusing everywhere on Android** | The word now comes only from the host's stdin line; the Kotlin app sends no `keyStore` word at all (`BackendService.kt:180-185`, `rg keyStore` finds nothing in Kotlin), so the mesh refuses to start on a phone until Kotlin is taught to say it truthfully. Fails safe. |
| 11 | Pairing breaks at about 70 entries | **FIXED** | W run over the real relay: 71 and 101 entries both completed (`joiner in set: true`), host messages now up to 1 MiB. |
| 12 | Pairing denial (M4, M5) | **FIXED** | M4: honest A opened a meeting while B held two (`opened`). M5: nine silent guest connections, then the honest joiner completed (`host events: pake1, confirm-ok, prompt`). |
| 13 | Withheld removal / no roster freshness | **NOT FIXED (deferred)** | See section 3. |
| 14 | Corrupt middle of `roster.log` silently truncates | **FIXED** | T: `refused: mesh roster log: record-damaged`, file 1685 B before and after. |
| 15 | Low items | Mixed | Fixed: first-statement replay (date window, Worker test), `seen` 64, `O_NOFOLLOW`, redial reset, token deleted from env. Unchanged: doorbell flood (R4: 100 stored, 200 refused, A got 100 bells), x8 front-door amplification, shared-address limiter key. |

Also re-verified: 384-statement byte match between the app and Worker statement encoders (V, same one-sided cases only for values the Worker rejects first).

## 2. New findings

Severity key: HIGH = breaks sync/removal or leaks to a removed device in a realistic path; MEDIUM = needs a hostile member or relay; LOW = hardening.

### N1. HIGH (no attacker needed): an entry that never left the device makes that device's later removals and adds unusable on its peers, permanently
- Who: any honest user (quit or crash after a rename, or after a pairing whose roster frame was still in memory); a dishonest relay can also drop one frame.
- Why: `renameSelf`, pairing (`afterAdded`) and `resume` publish roster entries through the in-memory outbox and send only the NEW entry. Receivers need the whole causal chain; a missing earlier entry means "signer's previous entry not yet seen" and the frame waits, then expires after a day. Nothing ever re-sends a missing ancestor (no catch-up, no request).
- Demonstrated (T1): A goes offline, renames, app quits (outbox lost), restarts, removes C. Result: A removed C and holds gen 2; B (honest, online) shows `removed known: 0`, `gens [1]`, `waitingFrames 1`; B's notes reach A, A's notes never reach B (`B inbox []`). Same mechanism in the first-round R2b: B stayed at roster size 3 while D was a full member.
- Fix: persist the outbox for roster frames, or put the missing ancestors (or the whole log tail since the last acknowledged entry) in every roster/removal bundle, or let a device that sees a gap ask for it. Show "not in sync" in the screen.

### N2. HIGH (any member, or the relay): unsigned junk "from A" silences A's real entries, so A's removal of a hostile member is ignored
- Why: `RosterStore.limitRemote` counts arrivals against the CLAIMED signer before any signature is checked (by design: "refused BEFORE any signature is checked"). 61 junk entries claiming A's id inside one legitimate roster frame flag A on the receiver. A flagged signer's entries are refused, in memory only, so the attacker simply repeats after any restart.
- Demonstrated (T2): hostile B sends one roster frame of 70 forged entries naming A. At C: `flaggedDevices 1`, `{"invalid-bad-entry":60,"rejected-rate":1,"rejected-flagged":9}`. A then removes B (A: done). At C the removal is rejected `removal-without-entry`: C does not know B was removed and never gets generation 2 (`gens [1]`). B (cut off at the relay) is harmless to C only because the relay honoured the removal; with a dishonest relay B stays in C's set.
- Fix: count and flag only entries whose signature verifies (or key the budget on the authenticated frame sender, the member who delivered the frame, not on the claimed signer); never let invalid entries consume another member's budget.

### N3. HIGH (concurrent removals; a leaving member can plant its own secret): two removals at the same time split the set, and a removed device can know the new current secret
- Why: a generation number is `2 + removals seen`, so two members acting concurrently both mint gen 2 with different secrets; the second is rejected `generation-already-held`. A removal bundle is also sealed to every device that is still a member in the SENDER's view, including one the other removal just removed. A removed or about-to-be-removed member's bundle is accepted by an offline device that has not yet seen its removal.
- Demonstrated (T3, five devices): A removes C and B removes D at once. A holds gen 2 `97a543`, B holds `3971c1`, E holds A's. Notes: A received only E's, B received nothing, E received only A's. Permanent; no repair path. C (removed by A) was sealed B's gen-2 secret.
- Demonstrated (T3b, four devices): B removes C; A, without having read B's bundle, removes B; offline D reads B's bundle first. D adopted B's secret (`530530fb`, identical to the removed B's), A holds its own (`d9523ef5`); A and D can no longer read each other (both inboxes empty). A removed device therefore knows the secret an honest device now uses.
- Fix: when a device sees two different secrets for one generation (or a bundle sealed to a device it knows is removed) it must start a fresh generation itself so everyone converges on the higher one; reject a bundle whose signer has been removed by an entry the receiver already holds; the sender should re-seal on seeing a concurrent removal; or serialize removals with the decide rules.

### N4. MEDIUM (any member or the relay): flooding the "waiting" list evicts legitimate frames for good
- Why: unknown-generation and unknown-signer frames are parked BEFORE any signature or decryption check (`frames.ts` order: set, `to`, generation, signer), so no authentication is needed to fill the 64-slot FIFO. Overflow rejects the oldest as `wait-overflow`; the read position and acknowledgement have already moved past it.
- Demonstrated (T5, Link layer): a real member's frame under generation 2 waits; 70 junk frames (gen 99) follow; waiting stays 64, 7 evicted. When the generation-2 secret then arrives, the legitimate frame is NOT delivered. After `resetReadPosition()` it was delivered, but only because my in-memory carrier keeps frames; the real relay deletes a frame once every device acknowledged it, so recovery works only while another device has not yet acknowledged.
- Fix: bound waiting slots per claimed sender and per generation; do not acknowledge a waiting frame to the relay until it has been judged; park only frames whose claimed signer is on the roster, or whose generation is within one of the highest known.

### N5. MEDIUM (any member): marking the roster group as a "line" group makes the relay purge it
- Why: `has_line` becomes 1 on the first `line:true` hold to ANY group, including `roster`. Marked groups are subject to the 30-day rule and to set-full release. The test "a group first held without line and later with line becomes a line group" pins exactly this behaviour.
- Demonstrated (W1, Worker): honest roster frame unacknowledged by offline C; hostile member holds one junk frame to `roster` with `line:true`; 31 days later C fetches `["gap:2"]`: both frames gone, so C never receives a removal bundle or the new secret.
- Fix: the relay must refuse `line:true` for control group names (fixed reserved names such as `roster`), or require the group's first hold to decide its class permanently and refuse a later change.

### N6. HIGH only with a hostile member: unmarkable junk fills the set and nothing can ever free it
- Why: the fix for first-round 5 makes every group that never saw `line:true` immune to release, expiry and set-full eviction; it is freed only when every ACTIVE device acknowledges. Devices acknowledge only the groups they follow, so junk groups are never acknowledged, and a removed member's frames stay.
- Demonstrated (W2, Worker with a small cap to keep the test short): member B fills the set with frames to 13 junk groups; B is removed at the relay (`ok`); an honest hold to `roster` is still refused `over-limit/set`, `usage 4800 of 5000`; unchanged 200 days later after an alarm run. At real scale the cap is 900 MiB and a member can write 100 frames of up to 1 MiB per 10 s, so a few minutes of effort. After that no removal bundle can be stored, so a removal cannot be distributed.
- Also: a device that is on the roster but dead pins control frames forever (small, but unbounded in time).
- Fix: cap bytes per group and per writer for non-line groups; free a removed writer's unacknowledged frames at removal; restrict group names to a fixed pattern (`roster`, `chat:<id>`); let an operator reset a set.

### N7. MEDIUM (any member): ghost devices
- Why: `add` carries no proof that the added key belongs to a real device, and any member may add. A hostile member can add devices whose private keys only it holds. The ghosts then count against the log cap, may each sign 512 entries, and after the member is removed they remain active members that every later removal bundle is sealed to.
- Demonstrated (G1): B adds 20 ghosts in one frame; A and C both show 23 active devices; A removes B (done); both show 22 active devices (ghosts stay) and generation 2 is sealed to them. Ghosts cannot connect to a relay that does not know them, so today the leak is toward a colluding relay or operator only.
- At the cap: 16 ghosts (512 entries each) fill the 8,192-entry log in a few hours at the receiver rate limit; then only 64 removals remain, so a set with more than 64 ghosts can never be cleaned and no device can be added. No honest set gets near it (an honest long-lived set uses a handful of entries per year per device).
- Fix: an `add` must be countersigned by the new device (the pairing already proves possession in the welcome: carry that proof into the entry); remove ghosts and the removed member's own adds together; compaction (still not built).

### N8. MEDIUM (no attacker needed, or a dishonest relay): a good, paired device is auto-removed
- Why: a pairing is "unconfirmed" until the host sees the new device online or receives a verified frame from it. If the host's own link is down at that moment (or the relay withholds presence), the timer (15 minutes in production) fires and the host removes the device with an ordinary removal. After a host restart older than the wait, `rollBackJoin` runs immediately, before the relay is ready, so it cannot find the device and removes it.
- Demonstrated (T6, 4 s wait): host's relay link dropped right after sending the welcome; D joined and connected; host back online later: D `relay: removed`, host `active 1, removed 1`. The removed D still holds every generation up to then (the welcome carries all of them).
- A relay that withholds the removal confirmation cannot keep a removed device out of the removal's effect on the app side, but it can keep it connected (inherent, finding 13).
- Fix: never remove automatically; mark "not seen yet, remove?" in the screen. If kept, do the final presence check only after the relay is ready, and extend the wait when the host itself was offline.

### N9. MEDIUM latent: a relay position jump over 100,000 is refused even when honest, and reset cannot help
- Why: sequence numbers only rise; once the oldest retained frame of a group is above the device's position by more than 100,000 (a new device, or a busy chat group after acknowledged frames were deleted), the answer is judged hostile. `resetReadPosition()` sets the position to 0 and gets the same answer.
- Demonstrated (L1): an honest relay whose first retained frame is numbered 150,000: not delivered, `relay-bad-seq` counted, again after `resetReadPosition()`.
- Not reachable with the roster group; reachable by a long-lived chat group once chats exist.
- Fix: allow the jump when the relay's own `gap`/`released_through` marks justify it, or bound it by what the relay says the group's head is rather than a fixed 100,000.

### N10. LOW: no schema migration for relay objects created by older code
- Demonstrated (W3): an object holding the old `groups` and `meets` tables (created by `CREATE TABLE IF NOT EXISTS` before this change) answers the first hold with `handler-error` and closes the socket 1011; `meet-open` likewise. Failure is loud, not silent. No production object exists (flag off, no creation path). Any earlier test-relay object must be wiped.

### N11. LOW: build stamp fails open, and one build path is unstamped
- A missing stamp leaves `OFFICIAL_BUILD = false`, which leaves environment-driven test mode available on headless boots (the desktop installers are still `packaged: true`; the phone launcher clears its environment). `android-test-build.yml` and `desktop-test-build.yml` never stamp (intended). Suggest a test that fails a release build that is not stamped.

### N12. LOW (read from code, not run)
- A pending removal blocks the serial operation chain: a second removal or a rename waits on `resumeRemoval()`, which waits for the relay, so while offline nothing else in that chain proceeds.
- A removal bundle is sent under the OLD generation and the device keeps sending under it until the bundle is stored; anything sent in that window is readable by the removed device if a dishonest relay feeds it.

## Not found / held
- Roster quotas: a hostile member cannot stop a good member removing it (64 reserved slots, per-signer 512); the relay's own per-signer 512 total and 30/hour hold (Worker tests). Exhaustion needs ghosts (N7).
- Per-opener meeting limits and the 1 MiB host welcome: host messages are relayed, not stored; whole meeting capped at 4 MiB; guest and unjoined sockets stay at 16 KiB. No amplification or storage abuse found.
- A removed device after an ordinary (non-concurrent) removal cannot read anything sent after it, apart from N3, N12 and the inherent dishonest-relay case.
- Rollback races: killing at each step is covered by the new tests I read and ran (service-review and rig suites pass); relays that lie at every step reduce to "removal can be withheld" (13) and N8.
- Flag-off inertness of the Worker is intact: only `src/mesh/` changed.

## 3. The three deferred items

| Deferred item | Worst case | Blocks a locked-down test relay with the developer's own devices? |
|---|---|---|
| No roster freshness proof in frames | A dishonest relay withholds a removal; devices that have not seen it keep sending under the old secret, and the removed device (kept connected) reads it. | No. The developer is the relay operator. Blocks only a relay run by someone else. |
| Crash dumps contain private keys | A local crash dump (Crashpad, never uploaded: `uploadToServer: false`, no URL) holds device keys and set secrets; anyone who can read the user's folder, backups or a shared dump gets full impersonation and decryption. | No. The same file already holds the app's other secrets. Needs a rule before dumps are ever sent or attached to reports. |
| Shared-address rate-limit key | Everyone behind one public address shares 20 upgrades a minute; a neighbour who knows a room id (members only, because the allow-list answers 404 before the limiter) could lock out the developer's phones behind the same address. | No. Strangers cannot reach the limiter with an allow-listed relay. |

## 4. The four non-mesh Worker tests (item 4)
`presence.test.ts` and `presence-hidden.test.ts` now record every message from the moment a socket is accepted and `nextMessage` takes the first matching message already received (or waits); timeouts for positive waits went from 2 s to 15 s; negative waits keep their explicit short timeouts (500 ms). `games-records.test.ts` and `sync-hub.test.ts` only raise timeouts (2 s to 15 s, one test limit 5 s to 60 s). Assertions are unchanged.
Weakening check by mutation: I copied the Worker, broke the shipped feature in six ways (no `user-joined`, no `user-status`, no `user-left`, hidden sockets announced, hidden sockets allowed to act, hidden leave announced) and ran the OLD (`1cc8f00`) and NEW tests side by side. Every mutation was caught by both versions, by the same tests (for example `no-user-left`: 5 old and 5 new failures; hidden mutations: 2/2, 4/4, 4/4). The one structural change that could weaken a positive wait (a stale message already in the buffer satisfying it) did not mask any of the six. Verdict: not weakened. Residual risk: a future test that waits for a message of a type that an earlier, unconsumed message of the same type already satisfies.

## 5. Test runs (exact summary lines)
- `cd worker && npx vitest run`: `Test Files  57 passed (57)` / `Tests  679 passed (679)`.
- `cd worker && npx tsc --noEmit; echo exit=$?`: `exit=0`, no output.
- `cd desktop && npx vitest run tests/mesh`: `Test Files  14 passed | 1 skipped (15)` / `Tests  122 passed | 18 skipped (140)`.
- `MESH_RIG=1 npx vitest run tests/mesh-rig`: `Test Files  1 passed (1)` / `Tests  18 passed (18)` (58 s).
- `bash scripts/verify.sh youcoded`: `OK — all checks passed.` (types, test types, full suite `Test Files 1380 passed | 3 skipped (1383)`, `Tests 25314 passed | 82 skipped (25396)`, knip, lint, design lint, ast-grep all PASS; machine load reached 27 at the end, no flake seen).

## 6. Plain-language update for the owner

- Can messages be intercepted? Strangers and the network: no, as before (sealed with a secret only your devices hold; the relay sees only encrypted blobs, counts and timing). What is new: in a race between two removals, a device that has just been removed can end up knowing the secret an honest device now uses (N3), and removing a hostile device does not remove ghost devices it added (N7). Both only matter if the relay operator (or a device you have lost) cooperates, because a removed device is also cut off at the relay.
- Can malicious content be injected? Not by strangers; every message is signed. A device you paired and later lose control of can now do less: it can no longer overwrite secrets, freeze sync or make the relay forget your roster after a rename. It can still silence your honest device's removal of it on your other devices by sending forged entries (N2), make two of your devices unable to read each other by removing at the same moment (N3), push legitimate messages out of the waiting list (N4), and fill the relay so nothing more can be stored (N6). None of these places text in a chat; chats are still not wired to this layer.
- Can anything be stolen or harmed? Keys are not logged or sent and the phone path now refuses instead of guessing. Harm shown this round: a quit or crash after a rename can leave your devices permanently out of step (N1), and the host can remove a perfectly good new device it did not see in time (N8). Nothing outside the mesh folder was touched; with the switch off nothing runs.

## 7. UNVERIFIED
- Windows, macOS, Android runs; real Electron secret storage; real Cloudflare behaviour (migrations, limits, the shared-address key in production, the 30-day alarm on a real clock).
- N6 at the real 900 MiB cap and real rate (scaled-down cap used); N7 at the cap (16 ghosts times 512 entries: arithmetic from the code, not run to completion).
- S9 client memory in isolation (the evil relay shared the test process; the code bound is what is relied on).
- N12 items and the claim that a pending removal blocks other operations (read from code).
- Kill at every byte/step of pairing and removal: covered by the shipped tests I ran, not re-injected by me at each step.
- Whether the real relay ever returns a frame numbered more than 100,000 past a device's position in normal use (N9 is demonstrated against an honest-looking carrier, not against a long-lived real group).
