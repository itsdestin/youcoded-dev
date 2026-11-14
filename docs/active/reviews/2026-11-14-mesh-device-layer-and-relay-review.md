# Mesh device layer + relay meeting point: independent security review and white-hat test

Reviewer wrote none of this code. Nothing in either repo was edited or committed. All attack code lives in the reviewer's scratch folder
`/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/device-review/` (attack suites in `atk/`, raw results in `results.txt`,
off-switch probes in `off-*`). Everything ran against real code: the app's `MeshService` in-process, the real Worker relay under `wrangler dev --local`
(127.0.0.1, random ports, throwaway homes), and the real headless backend built and run in a bubblewrap jail with no network. Nothing under `/opt/YouCoded`
or real user data was touched. No stray processes remain.

Subject: app `d3b7dceaf`, `d91daae7c`, `32c7fb6a4` (minus `crypto/` and `store/`); Worker `898863c`, `1cc8f00`.

## Verdicts

| Question | Answer |
|---|---|
| SAFE TO MERGE SWITCHED OFF, app repo | **YES.** With the mesh off, a real headless boot loads two small files (`boot-hook.js`, `config.js`), reads one optional file, and nothing else: no folder, no socket, no timer. (Proven, finding 9 is a hardening item, not a blocker.) |
| SAFE TO MERGE SWITCHED OFF, Worker repo | **YES.** With production config (`MESH_RELAY_ENABLED=0`, mode `off`) every relay and meeting path answers 404 and no object is created; all `/parties/mesh-relay` spellings answer 400. One caveat: migration `v4` registers the new object class on the next automatic deploy (cannot be un-registered cheaply). Unverified against real Cloudflare. |
| SAFE FOR A LOCKED-DOWN TEST RELAY WITH THE DEVELOPER'S OWN DEVICES | **WITH THESE FIXES, not as it stands:** findings 1 (relay silently refuses add/remove after any rename), 2 (frames from a removed or hostile device freeze a device's sync for good), 5 (relay purges everything in a group 30 days after the group was made). They are not attacks; they would break the developer's own testing within a month and make removal unreliable. Findings 3, 4, 6, 7, 8 matter only once a second person or a compromised device is involved, so a test relay with only the developer's own devices can run with them listed as known. |

## Findings (severity, who can exploit, evidence, fix, demonstrated?)

### 1. HIGH: after a single rename entry the relay refuses every later add and remove; removal is silently half-applied, pairing breaks
- Who: nobody needs to attack; any device that has ever written a rename (the design has renames) triggers it.
- Evidence (R2, R2b, demonstrated): A renames itself once. Pairing a 4th device times out. `removeDevice(B)` succeeds in A's app but the relay answers `bad-ancestry`; the app only logs `relay-remove-refused`; B stays connected and "ready" at the relay and can still hold frames. The failed pairing leaves a phantom member on the host (host roster 4 to 5 entries, 4 active devices, joiner not in set, other devices see 3). Cause: the relay only knows entries it was told (add/remove); `seenForNextEntry` names the newest head, which is the rename the relay never heard of, so the ancestry walk cannot reach the signer's introduction.
- Fix: the statement's `seen` must be built from entries the relay knows (walk back to the last add/remove ancestor), or the relay must accept renames as ancestry-only statements. In the app: if the relay refuses a removal, retry/queue it and surface "device not yet cut off at the relay"; never mark the pairing done or leave a phantom `add` when the relay refused (append to the log only after the relay accepted, or roll forward with a compensating remove).
- Note: a retry of the same joiner after a phantom add probably fails because the verifier forbids a repeated device id. UNVERIFIED.

### 2. HIGH: one bad frame freezes a device's sync permanently (paused forever, survives restart)
- Who: (a) any paired device (malicious), (b) happens by itself when a removed device left frames at the relay.
- Evidence (S2, S5, demonstrated): (a) a member sends a removal frame with an unusable sealed secret. The victim's handler throws, the roster group is paused on that frame, and it stays so across a restart. A later legitimate removal of the attacker by another device never reaches the victim (victim removed-count 0 while the other device has 1). (b) C sends a note while A is offline, B removes C, A reconnects: A pauses the whole note group on C's frame ("unknown-signer", because removed devices count as unknown) and never receives later notes from B ("A inbox later: []"). The same happens to any newly paired device that meets an old frame from a removed device.
- Fix: a frame that cannot be verified because its signer is REMOVED (known and removed) must be dropped or judged by the removal cut-off rule, never "pause"; a frame whose handler fails permanently (bad content from a verified member) must be skipped after N tries and logged, with the cursor advancing. Pause only for "signer or generation not yet known AND roster may still arrive", with a timeout.

### 3. HIGH once chats exist (any paired device): a removal frame can overwrite or fork a victim's set secret
- Evidence (S1, demonstrated): a member sends a removal bundle with empty `entries`, `gen: 1` and a secret sealed to the victim. `onFrame` stores it with `secrets.set(b.gen, secret)`: the victim's generation-1 secret is replaced by the attacker's value. Result: the victim is deaf to the rest of the set, the victim's own later sends use the attacker's secret, and only the attacker can read them ("A inbox 0; B (attacker) inbox 1; C inbox 0"). That is a split of the set into two views by one member, plus a read of the victim's future messages.
- Also (S3, demonstrated): any member can remove any other member including the set creator (`B.removeDevice(A)`); A is then cut off at the relay (`removed`). The design lists decide rules as not built; this is the concrete cost.
- Fix: accept a new secret only when the same bundle carries a `remove` entry that verifies, is signed by an active member, and `gen` is exactly current+1; never overwrite an existing generation; add the decide rules (who may remove whom, and for the first versions require two devices or the creator).

### 4. HIGH (denial of service by a paired device): roster flood freezes the app and can freeze membership forever
- Evidence (S7, measured): `RosterStore.append` verifies the whole log on every entry, so cost is quadratic. 600 attacker-signed rename entries took 26 s per receiving device (two receivers in one process: 52 s), each append blocking the event loop for up to 127 ms and growing linearly. Extrapolated to the 8192-entry cap: about 1.7 s of blocked main process per entry for roughly 80 minutes per victim (extrapolation, not run). Entries are valid and cheap to produce with custom code. When the log hits 8192 entries `verifyRosterLog` throws `size` and nobody can ever add or remove a device again, including the attacker (code-proven, not run to completion).
- Fix: verify incrementally (extend the verified state by one entry), per-device quota and rate limit on roster entries, reject entries that change nothing (renames are cheap spam), compaction/checkpoint design before 8192.

### 5. HIGH (will bite the developer's own devices): relay purges a group 30 days after it was created, because the app never sends `line:true`
- Evidence: relay-room.ts:438 updates `last_line_at` only for `line:true`; `carrier-relay.ts`/`link.ts` never pass it; the alarm (relay-room.ts:916) empties any group whose `last_line_at` is over 30 days old and re-runs about every 60 s. So after day 30 of a set, every frame held in the `roster` group (adds, removal bundles with the new secret) is deleted within about a minute unless all devices already acknowledged it; an offline device gets a gap and permanently misses the new generation secret. First review finding 11 is still open and the tests only use `line:true` (mesh-relay-lifetime.test.ts:20,77). Not run (needs a clock jump; no faketime available); code-proven.
- Fix: roster/control groups must be exempt from the 30-day rule (or touched on every hold); pass `line` for chat lines; add a test with a non-line group.

### 6. MEDIUM: relay `roster-put` lets any member remove others at the relay or fill the 16 slots
Same root as finding 3 at the relay. Statements verify (signature, ancestry, ban) as designed; the relay cannot judge intent. Member-only. Fix with the decide rules (finding 3).

### 7. MEDIUM: a hostile relay can poison a device's saved read position for good
- Evidence (S8, demonstrated): a relay answers a fetch with `gap through: 9007199254740000` then one junk frame past it. The device saves the cursor to `link-state.bin`. After switching back to the honest relay, the device never receives a new note (B's note reached C but A got `[]`). The client accepts any number for `gap.through` and any `seq`.
- Fix: accept a gap only when `through <= last seq the relay ever told us - and monotone and bounded (for example through <= cursor + 1e6)`; ignore a frame with `seq` beyond what a sane relay could have issued; an operator reset ("reset read position") in the screen.

### 8. MEDIUM: a hostile relay can exhaust a device's memory with one fetch
- Evidence (S9, demonstrated): 100 junk 4 MiB `frame` replies to one `fetch-after` grew process memory by 1.75 GB; the client buffers every frame for the pending request with no limit (relay-client.ts onMessage). The real relay caps a page at 4 MiB, a hostile one does not. Same for a plain `ws://` network attacker if a non-TLS URL is ever allowed.
- Fix: cap frames and bytes per request (stop and close past FETCH_PAGE_BYTES plus slack); refuse `ws://` for non-loopback hosts in production.

### 9. MEDIUM (hardening, not a blocker): the headless boot (the Android path) is never "packaged", so environment variables can turn the mesh on and test mode on
- Evidence (real build run in a jail, demonstrated): with no switch file, `YOUCODED_MESH=1` alone creates `mesh/keys.bin` in a headless boot; adding `YOUCODED_MESH_TEST=1` plus a 32+ character `YOUCODED_MESH_TEST_TOKEN` opens a control server on 127.0.0.1 (random port announced on stdout) and stores keys in plaintext. The off-run (nothing set) loaded only `boot-hook.js` and `config.js`; a switch file alone turned it on (files `mesh/keys.bin`, no listener, no timer, because no relay URL exists outside test mode).
- Can a real phone reach it? The Kotlin launcher clears the environment and sets only fixed variables (BackendService.kt:184-185), so a stranger cannot set these on a phone; a desktop user running headless with inherited variables can. The assistant (any tool with the user's file rights) can also create `mesh-switch.json` in the profile; outside test mode that only creates a local identity file and connects to nothing.
- test-control.ts is not reachable in a packaged desktop build (config refuses test mode), not from the renderer or remote clients (no IPC or route references it), only with the test variables plus the token; it binds 127.0.0.1, refuses any request with an `Origin` header, compares the token in constant time. The token is inherited into terminals the backend starts (environment copy, test only).
- Fix: headless passes `packaged: true` unless a dedicated dev flag is set; test mode additionally requires a file in the profile that only the rig writes; never read test variables outside a build flagged as a rig.

### 10. MEDIUM before enabling on Android: the key-store rule cannot refuse on the phone
- Evidence: `electron-headless.ts:170` hard-codes `getSelectedStorageBackend: () => 'android_keystore'`; the Kotlin `SecretKeyStore` takes its key from `PairedDeviceStore.prefs`, which falls back to a plain legacy preference file when the encrypted store fails (PairedDeviceStore.kt:50-52). keystore.ts says the host must report truthfully; it does not. So the "refuse rather than store in plaintext" decision cannot trigger. Rig device D shows the shim path accepted.
- Fix: Kotlin passes whether the key really came from the Keystore; the shim returns `unknown` otherwise.

### 11. MEDIUM: pairing breaks once the roster is about 70 entries (builder said 40)
- Evidence (W, measured): largest pairing message is 936 B at 1 entry, 10 KB at 41, 13.4 KB at 56, 16.8 KB at 71, 23.7 KB at 101 (about 227 B per entry; real add entries with names and keys are larger). The meeting point closes a socket over 16384 bytes. Not run through the relay (finding 1 blocks that path); the size is measured on the real messages.
- Fix: send the welcome in chunks, or send a checkpoint instead of the whole log.

### 12. MEDIUM (member or relay operator): pairing can be denied cheaply
- M4 (demonstrated): one member opens two meetings and never joins; the owner's next pairing is refused (`too-many-meetings`) for up to 5 minutes, repeatable.
- M5 (demonstrated): someone who knows only the meeting id (the relay operator, nobody else; ids are 65 bits) connects 8 times with no message; the 9th (the honest guest) is refused `full`. Cost to the attacker: 8 connections. Stranger probing of random ids: 404 in every mode, no object (R1c, demonstrated).
- Fix: count a guest slot only after a first message, release a slot on close.

### 13. MEDIUM, inherent to a relay trusted for delivery: removal can be withheld
A dishonest relay can drop the removal bundle for one device and keep the removed device connected; the deceived device keeps sending under the old secret, readable by the removed one. There is no proof of roster freshness in frames. Reasoned, not demonstrated. Fix: put the sender's roster head(s) in the frame header or heartbeat so a device that cites a roster it has not seen knows it is behind, and show "not fully up to date" in the screen.

### 14. LOW-MEDIUM (local damage): a corrupted length in the middle of `roster.log` silently deletes the rest
- Demonstrated (T): flipping one byte of record 4's length in a 7-record log: load returns 3 entries and truncates the file from 1685 to 757 bytes with no error. The code treats an over-long length as a torn tail. Consequence: removals recorded after the damage are forgotten and the file is shortened for good. A whole-profile restore is also undetected (builder said so): worst concrete case is a device that comes back with old keys and cannot ever get the newer generation secret (finding 5 makes the relay forget it), so it must re-pair; duplicate delivery of already-handled frames.
- Fix: only treat the LAST record as torn (compare with file size and the check value of what follows), otherwise refuse and keep the file.

### 15. LOW: others
- Doorbell: carries only group and number; leaks nothing to strangers; one member can ring others at most 100 times per 10 s (R4, demonstrated: 100 stored, 200 refused). 
- Auth answers are identical for an unknown device and a real device with a bad signature (R1b, demonstrated): oracle fixed.
- Front-door allow-list: each stranger request to `/mesh/meet/<id>` costs up to 8 object calls (code-read; amplification x8, bounded by the per-address limiter 20 per minute and by the operator's list size). No object is created for unlisted rooms (8 of 8 random rooms 404, demonstrated). The limiter key is shared per address, so a person behind a shared address can be limited by a neighbour (CF-Connecting-IP is absent locally; every local request shared the key `unknown`).
- Relay roster statement replay after an idle erase: an operator can replay an old captured `add` into a re-created room (the first statement only needs `seen` of length 1). It admits a key at the relay that lacks the new secret; reads only ciphertext. Reasoned, not run.
- Relay accepts `seen` up to 16 entries, the app allows 64: a log with more than 16 heads cannot be put at the relay (edge).
- Roster file `roster.log` is opened for append and would follow a symlink in the profile (needs write access to the profile first; not exploited).
- Reconnect: a hostile relay that answers `auth-result ok` then hangs up resets the backoff every time, so a device redials about once a second; a relay that never answers is cut after 60 s of silence; requests time out after 15 s (code-read).
- Crashpad is on (local dumps only) and keys live unzeroed in memory, so a crash dump contains private keys; accept or add dump protection before enabling.
- `YOUCODED_MESH_TEST_TOKEN` inherited by terminals (test only).

## Re-check of the first-round relay findings
| # | Result |
|---|---|
| 1 /parties exposure | FIXED (demonstrated): 7 spellings incl. `%2D`, `_`, case, with injected `X-Mesh-*` headers all answer 400 |
| 2 allow-list fails open | FIXED (demonstrated): empty list, mode `open`, `Allowlist`, `test-open ` all 404; allowlist mode also needs a working limiter (503 otherwise) |
| 3 idle erase under a live socket | Code fixed (alarm refreshes `last_connect`); existing test passes; not re-run with a clock jump |
| 4 unauth cost/storage | Per-address limiter on every upgrade works (demonstrated: 20 pass, then 429); registers counted in the byte total (code); a global registry is still not built (public only) |
| 5 unauth slots | FIXED (demonstrated): 8 stranger sockets max, a member got in after about 2.8 s while 8 strangers sat there |
| 6 membership oracle | FIXED (demonstrated) |
| 7 resurrect after erase | Tombstone on `emptied` present (code); idle-erase replay in 15 |
| 8 unsigned roster | Signed `roster-put` (adversarial cases above); new gap finding 1 |
| 9 bandwidth | Output budget present (code) |
| 10 released broadcast | FIXED (code) |
| 11 30-day rule counts only lines | STILL OPEN, now worse: see finding 5 |
| 12 unauth message memory | Capped at 16 KiB before auth (code); fuzz run clean |
| 13 garbage keys | FIXED (curve check) |

Verifier match (V, run): the Worker's and the app's roster statement bytes were identical for 384 random statements across `at` from 0 to 2^53-1 and `seen` lengths 0 to 25. The encoders disagree only for values the relay's own `isCount` check rejects first (`at` 1.5, -1, 2^53, NaN).

Fuzz (run): 300,000 mutated inputs through the app's wire/CBOR parsers: no error other than the designed one. About 1,200 type-confused relay messages into a live relay client and meeting client: no uncaught exception. 2,106 structured fuzz messages from an authed member plus unauth and meeting sockets into the Worker relay: no `handler-error`, relay stayed healthy.

## Not broken (tried)
Forged sender and replay were not re-run (the frame class keeps keys private; covered by the crypto review). A stranger who knows only a room id learns nothing beyond "a room exists" (identical answers) and cannot create objects or join a meeting. Meeting ticket and host role cannot be taken by a guest (code). The no-secret-logging check: logs carry only event names, 8-hex room prefix and close codes (read from a rig run). Files: `keys.bin`, `roster.log`, `link-state.bin` are 0600, `mesh/` is 0700 (measured). The insecure plaintext key file cannot be selected in a packaged desktop build; the rig's own keys.bin was plaintext as expected in test mode.

## Plain-language answers for the owner
- Can messages be intercepted? Not by strangers or the network: messages are sealed with a secret only your devices hold, and the relay only ever saw encrypted blobs, public keys and ids (proven in the rig, nothing readable in the relay's saved data). The relay operator can see how many devices, when they talk and roughly how big messages are. One real way in exists today: a device you already paired can read your other devices' future messages by overwriting their secret (finding 3). A dishonest relay could also delay a removal so a removed device keeps reading (finding 13, not demonstrated).
- Can malicious assistant instructions or other content be injected? Not by strangers: every message is signed and checked, forgeries from outside were dropped. A device you paired and later lose control of can: freeze other devices' sync permanently (2), take over their secret (3), jam their app with junk entries (4), or remove your other devices (3). None of that can place text into a chat today because chats are not wired to this layer yet; the note feature is test-only.
- Can anything be stolen or harmed? Private keys are never logged or sent; on the files side they are protected (permissions), but on the phone the "secure store" check is a hard-coded yes (10) and a crash report would contain them. Harm that was demonstrated: frozen sync (2), permanent loss of read position by a hostile relay (7), a relay that crashes the app by memory (8), and removal that silently fails at the relay after one rename (1). Nothing outside the mesh folder was touched; with the switch off nothing runs.
- What is NOT proven: Windows, macOS, Android runs; real Electron secret storage; real Cloudflare behaviour (limits, migration, rate-limit key in production); the 30-day purge and the 8192 roster freeze were reasoned or extrapolated, not run to completion.

## Tests and tooling (item 7, item 8)
- `bash scripts/verify.sh youcoded`: "OK — all checks passed"; full suite `Test Files 1376 passed | 3 skipped (1379)`, `Tests 25228 passed | 78 skipped (25306)`; types, knip, lint, ast-grep all PASS.
- `npx vitest run tests/mesh`: `Test Files 11 passed | 1 skipped (12)`, `Tests 82 passed | 14 skipped (96)` (three runs, identical). `MESH_RIG=1 npx vitest run tests/mesh-rig`: `Test Files 1 passed (1)`, `Tests 14 passed (14)`, 45 s.
- Worker `npx vitest run`: first run `Test Files 1 failed | 55 passed (56)`, `Tests 1 failed | 663 passed (664)`; the failure is `test/presence.test.ts` multi-device (not mesh; it ran while verify.sh loaded the machine to a load average of 25). Alone it passes (`11 passed`). The seven mesh Worker files pass three times (`157 passed`). `npx tsc --noEmit`: no output (clean).
- Tests that cannot catch what they claim: the off-switch test spies `fs.promises` writes, `setInterval`, `listen` and `net` connect but not sync fs calls, `setTimeout`, `createWriteStream` or child processes (my process-level probe is stronger and also passes). The rig's "no secret in logs" check does look at every device log, desktop.log, the relay log and the relay's saved state with the real key values and has a working positive control (a planted note body), but it never searches for the typed code's two halves on their own (secret part, meeting part), the meeting ticket, or the six-digit matching number. The relay lifetime tests only use `line:true` groups, which is why finding 5 passes. No flaky timing seen in three runs; rig waits use polling loops with 20 s timeouts.
