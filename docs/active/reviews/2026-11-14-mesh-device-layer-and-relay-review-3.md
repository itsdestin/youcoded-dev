---
status: active
date: 2026-11-14
topic: Mesh device layer and relay, third independent security review (adversarial, re-run of rounds 1 and 2)
---

# Mesh device layer and relay: third review

Reviewer did not write the code. Both worktrees were read-only; every experiment ran on a copy of the committed HEAD under
`/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/device-review-3/` (node_modules symlinked), against a local relay only. App commits under review:
`1d155c2c2 ff64db800 07e5776c5 b39299727 9d3633194 67b08e9da`; Worker `efe152c`. `mesh/store/` was out of scope.
"RAN" = I executed it and saw the result. "UNVERIFIED" = read from code, not executed.

## Verdicts

1. **Safe to keep merged-off in the codebase: YES.** With the switch off the only thing that runs is a read of `<userData>/mesh-switch.json`
   (boot-hook.ts, config.ts); a packaged/official build ignores the environment variable; the Worker answers 404 and creates no object while
   `MESH_RELAY_ENABLED="0"` / mode off (the gate tests pass). RAN: 381 app mesh tests + 190 Worker mesh tests green on the final code, and the rig
   (real relay under `wrangler dev --local`, three jailed backends) 18/18.
   One caveat, not a blocker: any program that can write the profile folder (including the assistant the app runs) can create `mesh-switch.json` and
   turn the feature on at next start.

2. **Safe to put a TEST relay online for the owner's own Linux devices: YES WITH CONDITIONS.** I found no way for a stranger, or a relay, to read
   content, forge a member or learn a key. Every serious problem below needs a hostile device that is already paired (a stolen laptop is the realistic
   one) or a hostile relay operator. Conditions:
   - allow-list mode with one room; never `test-open` on a reachable host;
   - only devices the owner fully controls ever pair; no lent, borrowed or old devices;
   - **do not rely on "remove device" to protect anything yet.** Findings 1, 2 and 4 show a removed or lost device can stay, keep a copy of the
     next secret, or take the remover down with it. If a device is lost, throw the whole set away and start a new one;
   - no chats the owner would mind a lost device reading until findings 1, 2, 4 are fixed;
   - expect the whole set to die (and have to be re-paired) if two devices remove each other, or if one is removed while a stolen one is online.

## Findings by severity

### 1. HIGH. A hostile device that is "senior" can make itself impossible to remove (cap of 96 removals)
- Who: a paired device that was admitted before the one removing it. The set's FIRST device (the one most likely to be old and stolen) is senior to everything. A ghost it created can also outrank a later honest device.
- What happens: the thief signs 96 or more junk "remove" entries (against made-up ids; they need not even have effect). The roster considers only the first 96 removals, ordered most senior signer first (roster.ts:229, 415, 426, 450). Every junk entry sorts ahead of the honest owner's real removal, so the honest removal is never even looked at. All devices agree, permanently: the thief is a member for good, keeps getting every new secret.
- Reproduction (RAN, `tests/mesh/r3-spam.test.ts` in scratch): X creates the set, adds A; X signs N removals of random ids; A removes X. N=0, 50, 95: X removed. N=96 and N=120: **X NOT removed**, A not removed.
- Cost to attacker: 96 small entries, well inside the per-device allowance (512) and the per-hour delivery allowance (600).
- Fix direction: do not cap by position; cap by work (skip entries that cannot have any effect: unknown target, signer not a member) before ranking, and make the per-signer count the limiter, not a shared slice.

### 2. HIGH. Devices a hostile member adds ("ghosts") outlive its removal, receive the next secret, and more than 64 of them stop key renewal for everyone
- Who: a paired device. Third time this class is reported (round 2, N7: "countersign the add" was the proposed fix; not done). The new rules void only ghosts the removal had not seen; a ghost added earlier and synced stays.
- What happens: thief X adds G (named "Destin's Phone"). The owner removes X. G is still a member, appears only as a "pending" device, and **the new secret is sealed to G**; the thief keeps reading everything through G.
- RAN (roster level, both mutual rules): X adds G, A removes X, G is still active. RAN (device level, `r3-ghost`): after A removes X, the minted bundle is sealed to B and to G.
- Second consequence, RAN (`r3-gen64`): with 63 ghosts the new secret is made and parsed; with 70 ghosts (71 active) the bundle cannot be parsed ("malformed"): statement and sealed list are capped at 64 (generation.ts:23,63; wire.ts parseRemovalBody). The minting device thinks it has a current secret; nobody else can read its bundle. Renewal is stuck until the owner removes enough unknown devices to get back to 64, and removals themselves need a renewal. The relay's own 16-device cap does not help: ghosts never touch the relay.
- Fix direction: an add must be countersigned by the new device (carry the pairing proof into the entry); removing a member also removes what only it admitted; a device cap well under 64 enforced at roster time.

### 3. HIGH. Removal can cost the remover its own life (the "stash" version of mutual removal), and with the "earlier-admitted stays" variant a stolen first device wins
- Who: a paired device. It needs to have signed one entry before it is removed, kept off the network.
- What happens: X signs "X removes A" and keeps it. A removes X. X releases the stash: it is concurrent with A's removal, targets the remover, so the mutual rule applies. RAN (`r3-roster` E2): default rule, devices A, B, X: A removes X; after the stash, active = [B] only (A and X out). RAN (E2c) two-device set (creator X, A): active = [] (the set is dead, the relay erases it for good). RAN (E2b): if a SECOND honest device also removes X, the stash is void and nobody is lost. Variant "earlier-admitted stays": RAN (E2c) the stolen first device X stays and the honest A is the one removed.
- The author's claim (d) "cannot silently evict honest devices beyond the stated mutual-removal rule" is true only if "the stated rule" is read this broadly; no owner would call a pre-signed leftover "two devices removing each other at the same time".
- Fix direction: mutual removal must not apply to an entry whose signer was already known to be under removal by a majority, or to entries older than the removal by more than a short window; or require two removers. Neither default is safe today.

### 4. MEDIUM-HIGH (design). Any one paired device can remove every other device at once and become the only member
- Fuzz oracle (my own, 600 seeds x 2 rules): 61 cases in which a hostile member that is still in the set evicted honest devices; nothing in the rules prevents it, relay or app. After that the thief alone holds the set; the honest devices are "removed" on every device that heard.
- This is the trust model's price ("all members equal"), not a bug in code, but it contradicts "a hostile member's damage is bounded". The owner must be told in plain words: a stolen paired device is a full takeover until it is removed, and removal is unreliable (findings 1 to 3).

### 5. MEDIUM. One catch-up makes an honest device permanently deaf to another honest device (until app restart)
- Who: a paired device that inflates the log; also anyone who makes a long log.
- What happens: roster-store.ts:269-279 counts entries per delivering member (600 per hour) and then adds the member to `flagged`, which is never cleared (memory only). RAN (`r3-flag`): A holds 603 entries after X delivered them; B catches up from A (600 entries); A's very next entry (its removal of X) is "rejected-rate", A is flagged at B. After three hours pass, still `rejected-flagged`: B never learns A's removal of X and keeps sealing to X until B restarts.
- Fix direction: clear the flag when the hour passes; do not count entries relayed to catch a peer up; never refuse a `remove`.

### 6. MEDIUM. Availability: CPU freeze and filling the roster
- RAN (`r3-cost`): with 300+ removal entries and about 5,100 entries total, **every newly arriving entry costs about 2.5 s of CPU** (machine was heavily loaded; expect ~1 s idle) on the app's main process, because the whole state is recomputed synchronously (roster.ts compute(); up to 96 removals x 6 passes x a full pass). An attacker feeding frames freezes every honest device.
- RAN (`r3-roster` E3): one member with 15 ghosts, all signed offline, reaches 7,969 entries (16 signers x 512). Adding a 17th ghost passes the 8,128 line: from then on no device can be added, renamed or say hello, and there is no way to shrink the log. Removals still fit the 64 reserve.
- RAN (`r3-amp`): a 14-byte `heads` frame from any known member (removed ones included) makes an honest device send 55-100 KiB back, with no throttle. Forty frames fill an honest device's 4 MiB roster-group quota at the relay (UNVERIFIED end to end; Worker quota read from relay-room.ts hold()).

### 7. MEDIUM. A removed device keeps being able to read control traffic, and honest devices keep answering it
- Control frames are sealed under the oldest secret (device-core.ts `oldestLabel`), which every removed device still holds. `onMessage` accepts `heads` and `need` from removed devices (device-core.ts:405-406, 422-433) and answers with the full roster entries (names, platforms, device keys) sealed under that first secret. No chat content and no new key leaks. It matters only if the removed device can still reach honest devices (hostile relay, or the relay not yet told): then it learns every future roster change for ever. UNVERIFIED end to end; read from code.

### 8. MEDIUM. Relay and app disagree about removals; the relay's ban is permanent
- relay-room.ts keeps its own roster: a removed device is banned for good (handleAuth `removed === 1`) and only the "earlier-admitted" branch ever sets it back. The app can later decide a removal has no effect ("overridden-by-senior", "concurrent-with-own-removal") and treats the device as a member again ("goes quiet and can resume"). At the relay it can never reconnect. The relay's mutual rule is hard-coded "both" (`mutualRemovalWinner`) while the app has a switch, so changing the app's rule would leave the survivor banned. UNVERIFIED by run; code is unambiguous.

### 9. LOW-MEDIUM. Waiting-frame quota still keys on an unauthenticated claimed sender (admitted)
- link.ts:370-372, 394: junk frames naming a victim in the outside header and an unheld secret number cost no key; 17 of them push the victim's genuine waiting frames out ("wait-overflow"); the read position has already moved, so those messages are gone. Who: a paired device or the relay (the relay can already drop messages, so only the paired-device case is new). Chat lines only, and only those waiting at that moment. UNVERIFIED.

### 10. LOW. First-round finding 13 measured
- A relay that withholds a removal keeps the removed device connected and, if it also forwards, readable: everything a device that has not learned of the removal sends is under the old secret. This is unbounded in time (no liveness check forces a device to notice silence). Inherent to a relay trusted for delivery; the only mitigation is to tell the owner "removal is confirmed on N of M devices" (the service has `removalsPending`).

## Status of every earlier finding

| Earlier finding | Now |
|---|---|
| R1-1 rename breaks later relay statements | Held (relay follows renames; tests pass) |
| R1-2 one bad frame freezes a device | Held (soft position, junk rejected; tests pass) |
| R1-3 removal frame overwrites/forks a secret | Held (statement signed by minter, commit checked, removed-set must match) |
| R1-4 roster flood | Partly: log and per-device caps hold, but see 5 and 6 (cost and flagging) |
| R1-5 30-day purge of control groups | Held (control group by name, `line:true` refused; mutant killed) |
| R1-6 relay roster-put lets any member remove | By design; see 4 |
| R1-7/8 hostile relay position and memory | Held (tests; not re-measured) |
| R1-9/10 headless env switch, key store | Held for packaged/official builds; not re-run on a phone |
| R1-11 pairing breaks at ~70 entries | Held (welcome carries the log, 4 MiB) |
| R1-12 pairing denial | Open as before: a malformed first message costs a try, three burn the code; needs the meeting id, so relay or member only |
| R1-13 withheld removal | Inherent; see 10 |
| R1-14 corrupted length silently shortens log | Out of scope (store) |
| R2-N1 unsent entry blocks later ones | Held (anti-entropy `heads`/`need`; fuzz) |
| R2-N2 junk "from A" silences A | Held for entries (charged only after the signature checks); NEW variant: finding 5 |
| R2-N3 concurrent removals split the set | Held at the roster level (my fuzz: no disagreement in 1,200 runs; theirs 0 violations) but see 3 |
| R2-N4 waiting list flooding | Not fixed, only re-keyed; see 9 |
| R2-N5 roster group made a line group | Held (mutant W9 killed) |
| R2-N6 junk fills the set | Held at the relay (quotas; mutants killed); see 6 for the app log |
| **R2-N7 ghost devices** | **STILL OPEN; demonstrated again (finding 2)** |
| R2-N8 auto-removal | Held (removal is never automatic; pending devices stay listed) |
| R2-N9 position jump | Held (judged like any frame) |
| R2-N10 schema migration | Held (migrate() adds columns; tests) |
| R2-N11 build stamp | Held in code; not re-run |

## What held (tried and failed to break)
Order independence of the roster (my fuzz: shuffled vs id-sorted vs duplicated feeds identical, 1,200 runs; plus junk with a bad signature ignored); a duplicate add can never overwrite a key; entries a removed device signed after learning of its removal have no effect; a device that signs before being introduced has no effect; generation statements for the wrong set or a wrong commitment are refused; a removed device is not re-sealed the secret on request; relay forged-sender, signature, curve-point, replay, nonce and allow-list checks (all killed by mutants); the off switch.

## Fuzz
- Theirs, FINAL CODE, `convergence-fuzz.test.ts`, seeds 0..99,999 in 12 shards: **100,000 of 100,000 schedules completed, 0 violations** (12 shards, all summaries read). It passes because it checks convergence of honest devices; it does not model findings 1, 2, 5, 6 (junk-removal spam, ghosts that were seen, flagging, CPU).
- Mine (independent generator and oracle, `r3-myfuzz.test.ts`, roster-level only, saved to scratch): 2-5 honest devices + one hostile member with ghosts that signs arbitrary entries citing arbitrary old entries, withholds and releases a stash, deliveries lost/duplicated/reordered, crashes (rebuild from saved entries), both mutual rules. Properties: (a) every device that holds the union ends with the same members/removed/void sets whatever the order; (b) an honest device is removed only by an honest removal, or by a hostile signer that is itself removed and whose removal the remover had not seen only if the honest device had removed it first; (c) a hostile add made after its signer knew of its removal has no effect. Result: seeds 0..8,600 x 2 rules = 17,200 runs, **0 hard violations** (order-independence and honest-safety hold); 590 informational cases of a still-present hostile member evicting honest devices (finding 4). The ghost-outlives-removal and 96-removal cap faults are not caught by these properties, which is why I tested them directly.
- Not covered by my fuzz: relay and sealing, DeviceCore secrets (their fuzz does), real frames, timing.

## Mutation check (scratch copy, 38 mutants; "killed" = some repo test failed)
Killed by the normal suite or the fast fuzz slice: roster duplicate id, per-device quota, duplicate add overwrite, entry after own removal, introduction not required, seniority inverted, concurrent entry counts, unknown-target removal, generation label 1 creator-only, removed-in-members, commit unchecked, removed device re-sealed secrets (needed the fuzz), roster-store removed-signer, rate limit, and Worker W1 W2 W3 W5 W6 W7 W9 W10 W11 W12 W13 W14 W15 W16 W17 W18 (relay).
**Survived (untested lines):**
| Mutant | Meaning |
|---|---|
| M2 `verifyEntry` stops checking id = hash(content) | A relabelled entry would be accepted; no test edits only the id |
| M10 generation statement for a different set accepted | wrong-set statement not tested |
| M14 secret's minter need not be a current member | "a removed or ghost minter's secret is not trusted" is untested (fast fuzz too) |
| M15 bundle that names a removal we have not heard is accepted instead of waiting | untested |
| M16 removal bundle accepted from a removed signer | untested |
| M18 a removed device keeps minting secrets (quiet off) | untested |
| M21 frames from unknown senders accepted at the device-core door | untested (link layer also guards) |
| M22 per-sender cap on parked entries off | untested |
| M23 cap on stale secrets per minter off | untested |
| W4 relay: removed signer may add/rename | equivalent mutant (a later check refuses the same cases) |
| W8 relay: signer-knew-removal check off | untested |
| W19 relay: ancestry walk bound removed | untested |
Their 100,000-schedule fuzz may kill some of M14/M15/M16/M18 (see totals); I did not re-run those mutants against it.

## Weakening versus the pre-fix commit (cfd8d84ad / b11cffa)
Test counts per file are equal or higher (roster.test 38 to 42 tests, 88 to 103 expectations). Deliberate behaviour changes removed or rewrote about 14 assertions (refused became void; auto rollback of an unconfirmed pairing removed; `relay-bad-seq` counter removed; a roster count of exactly 2 became "at least 2"; one vacuous `toBeDefined`). The per-hour delivery allowance was raised 60 to 600 (roster-store.ts). No test was skipped or loosened to hide a failure; the only new `skipIf` are the opt-in long fuzz runs.

## Untested areas (nobody ran these)
Real removal with a delayed or lying relay end to end (finding 7, 8, 10 are code reads); the waiting-quota exploit (9); pairing with a hostile relay in the middle of two simultaneous pairings (crypto tests only); relay under real load; Android; restoring older `keys.bin`; the app UI text for a "pending" or "removal pending" state (what the owner actually sees after finding 1 is unknown: `removeDevice` may report `pending` forever).

## Plain-language summary for the owner
Strangers and the relay still cannot read chats or add devices. The danger is a device you already trusted: a stolen laptop can (1) make itself impossible to remove, (2) leave behind secret helper devices that keep reading after you removed it and can even jam the key change, (3) take the device that removes it down with it, or (4) remove all your other devices first. Until those are fixed, treat "remove device" as unproven and, if a device is lost, start a fresh set.
