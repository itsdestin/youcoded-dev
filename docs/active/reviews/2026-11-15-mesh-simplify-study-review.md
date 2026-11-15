---
status: active
date: 2026-11-15
topic: Independent adversarial review of the mesh "one writer per chat" simplification study (variant B) and its removal rules
---

# Review of `simplify-study.md`

Reviewer did not write the study. I wrote my own simulator from the study's plain rules (sections 2, 4, 7) before opening
`own-sim.mjs`, with my own oracle. Scratch: `/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/simplify-review/`
(`sim.mjs` chat model, `roster.mjs` removal model, `out/*.json` results). RAN = executed. UNVERIFIED = argued from the text, not executed.

## Verdict

**The data-safety core of B holds up under independent attack. B as written is not ready for the product owner.**
My simulator agrees with the study on its headline: no acknowledged reply was lost or silently hidden in 600,000 schedules. But
four study claims are wrong or too strong, there are at least eight rules the study does not list, and one security claim
(no cut-off needed after removal) reopens a hole the current design closes. Fix the list in section 5 first.

## 1. My simulator and how it compares

Model: 2 to 5 devices, 1 to 5 chats per run (copies are chats), a relay holding one note per chat (owner, counter, all-sent mark)
changed only by compare-and-swap, 60 random events per schedule, then a full heal, then the checks. Events: writes, partial replies,
chip taps and Continue here, sleep and wake, going offline, relay down/up, direct links, syncs, plain-terminal write on a non-owner,
housekeeping lines, restore from an old backup, relay wiped (notes and lines), relay lines evicted, device that never returns,
removal and re-pairing of devices (including the owner and a sole holder), crash in the middle of a hand-over (entry saved, message lost),
refresh of the mark skipped, direct hand-over racing a relay take-over. Oracle: after every event no shown reply has vanished from
every device and the relay (inherent losses after a restore or relay wipe are counted apart); after a full heal every shown reply is
in a visible chat on every device, and all devices hold the same lines per chat.

RAN, all with 0 failures unless stated:

| Run | Schedules | Result |
|---|---|---|
| Hostile mix, honest relay | 200,000 | 0 lost, 0 hidden, 0 diverged. 0 double grants. 64% of schedules ended with a copy; 23% had a write by a device that no longer owned the chat |
| Calm mix (no terminal, no restore, no wipe) honest | 100,000 | 0 lost. 40% of schedules still ended with a copy |
| Hostile, relay lying 30% | 100,000 | 3 lost, 40 hidden-behind-a-lost-ancestor (see 2.5) |
| Hostile, relay lying 80% | 100,000 | 20 lost, 82 hidden-behind-a-lost-ancestor |
| Calm, relay lying 30% | 100,000 | 0 lost |
| Ablation: copy rule off | 3,000 | 5,125 hidden replies: the oracle bites |
| Ablation: skip the mark check | 20,000 | still 0 lost (more copies): safety comes from the copy rule, the mark only buys availability |
| Honest relay that forgot its state (wiped) | 50,000 | 178 schedules (0.36%) with two owners for one counter, all ended as copies, 0 lost |

All 23 losses I replayed involved a backup restore of the only other holder plus the relay deleting its lines: the study's own
exception, same size of problem. The study's "0 lost" is reproduced; my numbers do not contradict any of its zeros.

Where my model differs from the study's (read after finishing mine): the study models one chat, has no relay wipe, no device that
never returns, no owner removal, no hostile paired device, and lets the relay "fence" lines by registered owner, which contradicts
rule 2 ("the relay only compares the counter and cannot read the note"). Those gaps are where my extra findings come from.

## 2. Attacks on the claims

### 2.1 "8 of 15 decide rules go away": true as a count, misleading as a saving
The eight listed rules do disappear. But B needs rules the study does not count. My simulator failed until I added each of these:
1. **Hand-over entry identity.** One device can take over the same counter twice (after a restore or a retry). An entry keyed by
   (counter, owner) collided and devices ended with different chains (found at seed 219). Entries need a unique id.
2. **Order between two entries with the same counter.** Needs a total order. Mine: counter, then relay-confirmed, then lowest owner,
   then start. A plain "lowest id" is steerable by a thief who grinds a stash until its hash is lowest.
3. **Relay-confirmed beats locally-accepted** (the study's corner case 3, but not stated as a rule for hand-overs made while the
   relay is unreachable).
4. **Which lines are stale**: a line is stale if a stronger entry whose start is at or before it exists. This is today's rules 1, 7, 8
   in a smaller form, not their removal.
5. **Lines whose ancestor is gone** (restore plus relay deletion): the later replies exist but hang off a missing line and are
   invisible. 40 and 82 per 100,000 schedules at 30% and 80% lying. Needs a "gap copy" rule or a visible "chat is missing a part".
6. **Upload order.** The relay must receive a chat's lines in order; one-line-at-a-time uploads create orphans.
7. **Reconnect check.** The study reads the note on waking only. Reading it before every reply when connected cut stale writes by
   an honest owner that was online from 2,393 to 689 per 20,000 schedules (-71%). The study lists "wake" (rule 9) but not "reconnect".
8. **Relay note missing** (wipe, 90-day erase, never registered). Study: "no mark means Continue as a copy". That forces a copy for
   every unreachable-owner continue until the owner reconnects and re-registers; in my hostile mix a wipe converts about 1,500 of
   4,700 offered copies (about one in three) that would have been in-place.
9. **Mark nobody can meet** (see 3 and 4): needs a clear/escape rule.
10. **Housekeeping lines:** not exercised by the model in any meaningful way (they are leaves ignored by the chain walk). My result
    there is "no copy caused", which is by construction, not a test. UNVERIFIED against real Claude Code files.

So the study's "five corner-case rules" is at least ten. Still much smaller than 15 decide rules; but "a builder can hold it in one
head" and "about a third of Phase 5" are not demonstrated.

### 2.2 "A lying relay alone can only delay" (removal): wrong as written
- Delay can be indefinite. The study defines a fallback only for "no relay". A relay that is reachable and always answers
  "devices changed; look again" with nothing new (a signed roster entry cannot be forged, but a refusal can simply be repeated)
  blocks every removal for ever. Nothing says when a device may stop believing a repeated refusal. This is a permanent block.
  RAN: with a withholding relay (50% of submissions) the thief's old signed removal got confirmed first in 13,805 of 21,071 runs where
  the honest removal had not reached the relay, so the relay alone decides which genuine entry wins whenever the two overlap.
  The study concedes this ("relay chooses which arrives first"), but then states "alone can only delay".
- A relay alone also chooses the winner between two honest devices' simultaneous removals. Small harm, but it is a power.

### 2.3 "The stash attack is closed": only while the relay is the referee (RAN, `roster.mjs`)
Three to five devices, one thief, a removal pre-signed at step 0 and released after the honest removal of the thief:

| Relay | Honest removal already confirmed at relay | Honest device removed anyway |
|---|---|---|
| Honest | 85,318 runs | **0** (study reproduced) |
| Honest, but honest removal made while that device was cut off from the relay | 3,062 runs | 2,639 (the old stash is first to reach the relay: first come wins) |
| None (user turned relay off) | 88,521 runs | **82,978 (94%)** and the thief stays in 53,850 |
| Withholding relay | 21,071 runs | 13,805 |

Without a relay, a device that lags one step accepts the stash. When devices meet, the study's only rule is for removals that remove
each other. Any other same-step conflict needs a tie-break, which is not specified and can be ground by the thief. Finding 3 of the
security review is therefore still open whenever there is no relay and three or more devices. (Two-device sets are safe: the honest
device is already past the stash's step.) The numbers are inflated by my arbitrary tie-break; the direction is not.

### 2.4 "No cut-off or witness is needed" (UNVERIFIED by simulation; argued from design 5.1)
The cut-off exists to void lines and entries a removed device signs after its removal and back-dates. With ordering by roster step,
"earlier signed work stays" is decided by the step the signer writes into the line. A thief holding the key writes any step it likes.
A device that has not heard of the removal accepts such lines; every device then keeps them as earlier work. Result: a removed device
can keep injecting lines, including into chats it owned, which another device will later continue from. Under B these lines hit
the owner's chain (an owner's lines are valid by definition), not the copy path. This is a regression from the current design.
Needs either lines bound to something the thief cannot forge, or the witness/cut-off kept for removed-device lines.

### 2.5 "The current design has the same exposure" for relay-only-held replies: true only if B keeps today's rule
Today a writer keeps a line until another device has acknowledged it with a signature (design 5.6); a relay "ack" does not permit
eviction. The study's all-sent mark says "sent". If an implementer reads "sent" as "relay has it", a lying relay plus a phone on
"recent" mode loses replies with no device restore involved. RAN: in my model loss needs a restore plus relay deletion, which equals
the study. Keep the signed-acknowledgement rule and say so in the mark's definition.

### 2.6 "No conflict with section 2": five lines it breaks that the study does not list
1. 2.4: "Removing a device locks it out of everything new and **frees the chats it was hosting**." Under B a chat whose owner's mark is
   beyond what any other device holds is not freed; only a copy can be made (the study's own rule 12 says "under rule 5 or 6" while
   its state list says "anyone may continue": these disagree).
2. 2.7 row "Host was removed": "Phone was removed from your devices. **Continue this chat here?**" becomes "Continue as a copy"
   in that case.
3. 2.1: "The host never changes by itself. It changes when you tap the chip, or when the host is offline and you tap Continue here."
   Still true, but a chat can also split without a tap (a copy appears when an offline owner returns). Visible new event.
4. 2.7 "Versions": "**Accidental duplicates are prevented.**" My calm mix (honest relay, no terminal, no restore, no wipe) ended with a
   copy in 40% of schedules and in 12% had an honest online owner write after being superseded. The mix is hostile by design, so
   this is not a rate, but "prevented" is too strong. Study item 2 in section 5 quotes this sentence and says the first two
   sentences "fit B exactly".
5. 2.5: "A super-host ... With a super-host the **relay stores nothing** for that user, except while the super-host cannot be
   reached." The note referee is then two different servers (super-host, relay) with no shared order: a hand-over granted by one
   while the other is thought down is a double grant by design. The study never mentions the super-host. UNVERIFIED (not simulated).

Also 2.1 "Deleting a chat deletes it everywhere": copies stay (already Destin's C-10 answer, but the sentence should change).

## 3. Security: what the relay gains, and who can do what

New power: the relay becomes the **authority** for who writes each chat and (variant) which removal wins. Today it is a hint holder.
It still cannot read or forge. Each case, B against the current design:

| Question | Verdict for B | Compare |
|---|---|---|
| (a) Relay silently keeps a removed device in | It can withhold the removal; the removed device keeps relay access until a device can show the signed entry. Same | Same |
| (b) Relay hands a chat to a stolen device | Cannot create the take-over. It can say "owner is offline" (presence comes from the relay) or serve an older note so a device takes over, producing a second writer that ends as a copy. A stolen paired device can take over any unreachable owner's chat in both designs | Same |
| (c) Relay permanently blocks a hand-over or removal | Hand-over: no, the device can fall back to the last mark or a copy. **Removal: yes**, a repeated refusal has no defined exit (2.2) | Worse for removal. Today removal by "oldest wins" needs no relay |
| (d) Relay causes loss instead of a copy | Only with a restore of the sole other holder (my 23 replays), same as study. 40 to 82 per 100,000 schedules also hide later replies behind a lost one | Same, plus the hidden-behind-a-gap case which B has no rule for |
| Hostile paired device sets a mark nobody can meet | It becomes owner, writes mark 999 and goes away. RAN: unreachable marks (no live device holds that much) doubled, 1,697 to 3,268 chats per 70,000 in the poison run. Everyone else is offered only "Continue as a copy" for that chat, also after the device is removed, if rule 12 means "under rule 5 or 6" | **Worse**: today no mark gates a take-over, so one hostile device cannot block the others |
| Hostile paired device races to remove everyone | One signed removal per step, chained, each accepted in turn. Honest devices cannot answer. A stolen device with its unlock wins | Same as finding 4; the study says so |
| Hostile paired device uses a stash | Closed with a relay (RAN 0 of 85,318), open without one and with a lagging third device (2.3) | Better with relay, same without |
| Hostile paired device back-dates lines after removal | Open under B (2.4) | **Worse** |

## 4. Availability: what a user can no longer do, and the copies they would not have had

Cannot do in place that they could before (always possible today, with a "second version" later):
1. Continue on the phone a chat whose laptop holds replies the phone has not received, when the laptop is asleep or lost. B offers a copy
   (study agrees; it measured 17% of unreachable-owner taps in its mix; my mixes gave 11% calm, 15% hostile, all unmeasured as real rates).
2. Continue a chat whose relay note is missing: after a relay wipe, a 90-day idle erase, or turning the relay off and on, until the owner
   reconnects. The study counts this as "no mark" but not as a cost.
3. Continue in place after the owner was lost or removed when its last replies never reached anyone. RAN: 8% of hostile schedules (1,624
   of 20,000) ended with at least one chat whose mark no live device could meet, so it is copy-only for good (my mix includes devices that
   never return).
4. Continue in place while the relay is unreachable and two devices act on stale marks: both may, and the later one becomes a copy.
5. Remove a device when the relay refuses repeatedly (2.2).

Copies they would not have had (today's design shows a "two versions" row; B shows a "(copy)"): an owner that writes after being
superseded (offline, or online but not yet checked), a restored device, a double grant after a relay wipe, any terminal write on a
non-owner, and a user "Continue as a copy". Two further user-visible side effects I measured:
- In the symmetric case (both took over from the same mark) the loser by tie-break can be the longer side: in 6% of hostile schedules
  a copy of 3 or more replies was made out of a side longer than what stayed as "the chat". A better tie-break (longer or later side
  stays) is cheap to add.
- A chat whose original can no longer be continued stays in the list as a zombie next to its copies; the study does not say how it ends.

## 5. Is variant B sound enough for the product owner, and what must be fixed first

**Sound enough to show him the choice: yes, with the changes below.** The idea "never merge, never discard, anything that does not
fit becomes a visible copy" is safe by construction and my independent runs confirm it. The study's recommendation of B over B0 is
reasonable. It is **not** sound as "this removes the complexity and the removal fixes": the removal half has two real regressions.

Fix or state before putting it in front of him:
1. **Removal without a relay (2.3) and a repeated-refusal exit (2.2).** Define the same-step tie-break for non-mutual conflicts
   without anything a thief can grind, and define when a device stops believing a relay's refusals.
2. **Back-dated lines from a removed device (2.4).** Keep a cut-off or bind lines to an unforgeable position. Retract "no cut-off or
   witness is needed".
3. **Mark escape hatch.** Say what happens to the mark when its owner is removed, dead for N days or poisoned, so a chat cannot stay
   copy-only for ever; reconcile "anyone may continue" with "under rule 5 or 6".
4. **Super-host.** Name where the note lives when a super-host is the keeper.
5. **Rewrite the study's claims:** "five corner-case rules" (at least ten, section 2.1); "never two writers" (never two *grants* with an
   honest, non-amnesic relay; two writers still happen, section 1); "lying relay alone only delays" (2.2); "nothing else in section 2
   changes" (five lines, 2.6); "relay cannot read the note" versus the fence in its own simulator.
6. **Add the cheap checks to the rules:** read the note before every reply when connected (reconnect check), upload lines in order, a
   rule for lines hanging off a missing ancestor, entry ids, and the signed-acknowledgement definition of "sent".
7. **Measure, do not argue,** how often a real host goes dark with unsent replies before he picks B over B0; neither of us can
   currently say. The study already lists this; keep it as a gate.
8. Run a second generator on real code at the Phase 5 exit, as the study says. This review is a second generator of the model only.

## 6. What I did not do

- Real signatures, hashes, files, Claude Code semantics (including terminal files and housekeeping lines), Android, clocks, 30 and 90 day
  timers, the live lane and project files: not modelled. The terminal watcher the study assumes is the data-loss review's INV-7/INV-8; I
  did not test it.
- The roster sim is mine and rough (arbitrary same-step tie-break, devices meet in random order); it shows direction, not rates.
- I did not run the study's simulators.
