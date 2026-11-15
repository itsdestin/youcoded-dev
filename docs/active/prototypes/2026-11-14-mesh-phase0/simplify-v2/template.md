---
status: active
date: 2026-11-15
topic: Mesh sync, simplification study version 2 - one writer per chat (variant B v2, rewritten after the independent check) and device removal (keep the built signature-only design); with simulators
---

# Simplifying "who writes a chat", version 2

Nothing in `design.md`, the first study, the check or any app/Worker code was changed. Everything numeric comes from simulators in
`docs/active/prototypes/2026-11-14-mesh-phase0/simplify-v2/` (`run-all.sh` reproduces every table in about 25 minutes, 4 worker processes;
raw results in `results/`). RAN = executed here. UNVERIFIED = argued, not executed. Sections for the owner are plain words (section D);
the rest is for the builder.

## 0. Verdict

**Chats: B v2 survives the check, with a different claim than the first study made.** On data safety it holds under two independent
simulators (@@SAFETY_LINE@@). On "simpler" the honest answer is smaller than the first study said: it needs **@@NRULES@@ rules, not 12**,
and it is not fewer rules than today's `decide` once sub-bullets are counted; what it removes is states (10 become 4), control-entry kinds
(16 become 11), the `pending` state, tails, relations and clusters, and what a reader has to hold in the head at once (each rule is local; today's rules
interact). It makes chats worse in four named ways (section A.3). **Recommendation: build B v2 for ownership, and keep three things from the current design:
the witness/cut-off for removed devices, the signed-acknowledgement rule for deleting anything, and the retention rules for set-aside copies.**

**Removal: keep the built design (option ii): the signed-entry-only roster (`roster.ts`, rule "both"), with no relay in the decision.** The study's
relay-first-come rule fails the check's two regressions in the simulator and cannot be repaired without keeping the built rule as its fallback anyway
(section B). The relay's only possible role is an optional, later "receipt" tie-break, and that one is **not** free: with a hostile relay plus a thief it is worse
than today (section B.4). The pre-signed-removal attack cannot be closed without trusting a referee; what must be trusted, and the one sentence to tell the owner, are in B.5.

## A. Chats: variant B v2

### A.1 The rules (one list; numbered; counted honestly)

Words used: **owner** (the one device that appends to a chat), **entry** (a signed ownership record), **note** (what the relay keeps per chat), **mark**
(the owner's "I have finished replies through N", with the hash of reply N), **copy** (a separate visible chat made from lines that do not fit).

*Ownership and order*

1. **One owner per chat.** Only the owner appends. Every other device holds a copy that only grows. (First study 1.)
2. **Ownership is a log of signed `own` entries with unique ids.** An entry carries: chat, counter, owner, `prev` (id of the entry it replaces), `start` (number of finished replies it
   keeps, plus the hash of the last kept one) and a kind (`create`, `hand-over`, `take-over`, `vacate`, `override`). Its id is a hash of its content. One device making two entries at the same counter
   (after a restore or a retry) makes two entries. *(Check 2.1 item 1.)*
3. **One total order, a pure function of the entries and lines held:** higher counter; then relay-confirmed over local; then the side that **keeps more** (`start` plus the lines written under it);
   then lower owner id; then lower entry id. The top entry is the owner. The chain is the path along `prev` from the top: entry E owns the lines from its `start` to the `start` of the entry after it. Never the shorter side first.
   *(Check 2.1 item 2, 4.* "never favours the shorter side".)
4. **Relay-confirmed beats locally accepted.** An entry is confirmed when the relay's compare-and-swap took it. An entry made while the relay was out of reach is published at reconnect if the relay's note is one of its ancestors;
   otherwise it stays local and loses ties. *(Check 2.1 item 3.)*
5. **Stale lines.** A line not on the top owner's lineage is stale. Its finished replies become a visible copy; an unfinished reply with no end is dropped (design 2.7). *(Check item 4.)*
6. **The one copy rule.** A copy's id is the original's id plus the first line of the run it holds; its own entry's id is derived from that, so every device that finds the same lines makes the same copy. A copy of a copy follows the same rule.
   Copies are never merged back, never deleted automatically, and a device that makes one tells the user in one line.

*The relay's note*

7. **The note per chat** is `{counter, owner, entry id, mark}`, changed only by compare-and-swap on (counter, owner). Only the registered owner can change the mark. The mark only goes up, except that a new owner's entry starts a new mark.
   The relay cannot read the chat.
8. **The mark is a claim, never a permission.** The owner refreshes it at the end of every reply, on quit and when told the computer is going to sleep. **No device deletes anything because of a mark or because the relay has a line;** deleting a line needs
   a signed acknowledgement from another device (design 5.6, unchanged). *(Check 2.5.)*
9. **Upload in order.** The relay takes line n only if it holds line n-1; a refused upload restarts from where the relay is. Acknowledgements are "through N without holes" (design 5.3, unchanged). *(Check item 6.)*
10. **Check the note** on waking, on reconnecting, and before every reply while connected (one read; the check measured stale writes by an online owner falling from 2,393 to 689 per 20,000 schedules). If the note moved, stop and let rule 5 keep the finished replies.
    *(Check item 7; design 2.6 "on waking, the host checks".)*

*Continuing a chat*

11. **Chip while the owner is on.** The owner finishes the running reply, writes the hand-over entry **before** it tells the taker (so a crash in between loses nothing: the taker finds the entry on its next sync), stops, and hands over. Works device to device with no relay.
12. **Continue here, owner unreachable.** In place only if this device holds every reply through the owner's mark. The mark comes from the relay's note, or if the relay is out of reach from the last note this device saw. The entry is a `take-over` at the last finished reply.
13. **No note.** Relay wiped, 90-day erase, or never registered: use the last note this device saw. Only a device that has *never* seen a note offers a copy. An owner re-registers its note first-come-first-served after a wipe; a second owner finds the place taken, its entry stays local, loses ties, and its extra lines become a copy.
    *(Check item 8: the first study's "no mark means copy" turned one unreachable-owner Continue in three into a copy after a wipe.)*
14. **A mark nobody can meet** (owner lost, owner poisoned the mark, owner ahead of everyone). The notice offers two buttons side by side: **Continue as a copy** (nothing can go wrong) and **Continue here anyway** (in place; if the owner ever returns with more replies,
    they appear as a copy). Who may set a mark: only the registered owner of that chat. So a hostile paired device can poison only chats it owns or has taken over, and the worst it can do there is make the second button appear for everyone else; it cannot make any chat copy-only for good,
    and it can already type into every chat anyway (design section 8). *(Check section 3 "hostile device sets a mark nobody can meet"; 2.6 item 1.)*
15. **Owner removed: the chat is freed.** Any device continues it in place whatever the mark says ("Phone was removed from your devices. Continue this chat here?", design 2.4 and 2.7, both stay true). The removed device's unsent replies stay hidden and kept; if it is paired
    again they come back as a copy by rule 5 (this is design 2.4's "lost unless it is paired again", unchanged). *(Check 2.6 items 1, 2.)*
16. **Owner gone but not removed** (dead, lost): rules 12 and 14 apply until the user removes it, or answers the 30-day offer.

*Safety nets*

17. **Writes by a device that is not the owner** (it did not hear it was replaced; offline owner; plain terminal on a non-owner; restored backup): its finished replies become a copy (rules 5, 6). A terminal write on a non-owner device is filed as a copy at once by the adapter
    watcher (UNVERIFIED against real files; design 5.3 INV-7/INV-8).
18. **Gap rule.** A line whose earlier line is missing everywhere, after every reachable device and the relay have been asked, is shown as a copy marked "earlier part missing". Never hidden. *(Check item 5: 40 and 82 per 100,000 schedules at 30% and 80% lying.)*
19. **Housekeeping lines** (`ai-title`, `last-prompt` and the rest) never make two copies differ (first study 10; T21). UNVERIFIED against real Claude Code files.
20. **Name, flags, minimum version, deleted, restored:** the latest wins per chat. A copy is its own chat for all of these. Deleting a chat leaves its copies (the owner's C-10 answer).
21. **The removed-device cut-off stays** (this replaces the first study's "no cut-off needed"). A removed device's lines and entries count only if a remaining device witnessed them when it first learned of the removal, **or** a device that is itself valid built on them
    (its hash chain vouches for everything under it). A device never forwards a line or entry it holds void. What this allows, stated plainly: a removed device can still push changes into a device that has not yet heard of the removal; it can never push anything into a device
    that has. This is exactly what the current design gives (5.1 "cut-off", threat model R-2); v2 changes nothing here. *(Check 2.4.)*
22. **One referee at a time.** A set without a super-host: the relay holds the notes. A set with a super-host: **the super-host is the only note referee; the relay then holds lines only** (design 2.5's fallback). While the super-host is out of reach, take-overs are local
    (rules 4 and 13) and are republished when it returns; first-come-first-served there, losers become copies. Changing keeper is a signed roster-level entry (design 5.1) and starts the new referee empty, exactly like a wipe. There is never a state in which two servers each grant the same note
    (simulated as two referees: it multiplies double grants by about @@TWOREF@@ and still loses nothing, so the rule is for noise, not safety). *(Check 2.6 item 5.)*

**Count: 22 rules.** The check's ten extra items are rules 2, 3, 4, 5, 9, 10, 13, 14, 18, 19; its eight "missing rules" plus two more it found are all inside the 22.
Today's design for the same ground: `decide` has 15 rules with 9 sub-bullets (rule 10 has four, rule 11 has five), plus the register rule, the tail table (4 rows), tail retention and the takeover reasons: about 28 items.
**So B v2 is not fewer rules than today. Do not present it to the owner as fewer rules.**

### A.2 Section 2 lines B v2 changes (quoted)

Every line of design section 2 that B v2 would change or that reads differently, with the proposed new wording. All need his approval; none is changed here.

| Section 2 line | Under B v2 |
|---|---|
| 2.1 "The host never changes by itself. It changes when you tap the chip, or when the host is offline and you tap Continue here." | Still true of the host. New: **a chat can split without a tap** (a copy appears when an offline owner returns and finds it was replaced). A one-line notice says so. |
| 2.1 "Deleting a chat deletes it everywhere and stops a reply running in it." | Add: "Copies of it stay." (his C-10 answer) |
| 2.4 "Removing a device locks it out of everything new and frees the chats it was hosting. ... Anything it wrote and had not sent is lost unless it is paired again." | **Stays true** (rule 15, rule 5). |
| 2.5 "With a super-host the relay stores nothing for that user, except while the super-host cannot be reached; the user can switch that fallback off." | Add: "While the super-host is off, continuing a chat on another device is allowed from the last note that device saw, and may end as a copy." (rule 22) |
| 2.6 "On waking, the host checks it is still the host before a reply does anything further." | Stays; widened to "and on reconnect and before each reply while connected". |
| 2.7 "When the old host returns it learns it is no longer the host and discards its half." | Becomes: "... it learns it is no longer the host; its unfinished reply is discarded and its finished replies are saved as 'Trip planning (copy)'." |
| 2.7 "If two devices tap Continue here at once, the first to be heard becomes host..." | Stays when the relay (or super-host) or the other device is in reach. With neither, both may; the later one becomes a copy. |
| 2.7 "With no connection at all, Continue here still works, with a warning." | Stays true **only because of the "Continue here anyway" button** (rule 14); the default button may read "Continue as a copy". |
| 2.7 notice "This device may be behind: ... Continuing here could create a second version." | "Desktop may have newer replies. Continue as a copy, or continue here anyway." |
| 2.7 notice "This device is known to be behind: ... Button: 'Continue from here as a new version'." | One notice with the same two buttons; the old "new version" button becomes "Continue as a copy". |
| 2.7 notice "On the old host, when it returns" and "Two versions found: ... Keep both, or archive the older one?" | Merged into one: "Desktop's part of this chat was saved as 'Trip planning (copy)'." No archive question. |
| 2.7 "Versions. Accidental duplicates are prevented." | **Too strong.** The check's calm mix (honest relay, no terminal use, no restore, no wipe) still ended with a copy in about 31% of schedules. Say: "A chat can occasionally split; nothing is lost and the split part is kept as a copy." |
| 2.7 notice "Host was removed: Phone was removed from your devices. Continue this chat here?" | **Stays true.** |

### A.3 Where B v2 is worse than today (honest list)

1. **More "(copy)" in edge cases, and some without any tap.** Today: a "two versions" row. B v2: a "(copy)" row. In the same event schedules B v2 makes **more** copies than a today-like register-only model would not be measured here (UNVERIFIED: no simulator of today's rules was run against these schedules); what is measured: of every 100 Continue-here taps on an unreachable owner in the hostile mix, @@TAPCOPYPCT@@ were offered a copy (and the "anyway" button was available for all of them).
2. **You cannot always continue in place with one tap.** When the owner holds replies nobody else has, the default is a copy; in place needs the second button. Today it continues in place with a warning and a "second version" appears later.
3. **A new trust in the relay's note for ordering** (not for secrecy): a relay that lies or forgets causes double grants (simulated: all ended as copies, zero loss; section C) and more copies, not data loss. Today `decide` does not depend on the relay for who hosts.
4. **A splitting chat can swap which side holds the name** while its parts are still travelling (the tie-break reads lengths, which grow). Until the devices have met, the name can hop; after, it is stable. Rare; nothing lost.
5. **Copy-of-copy chains and storage**: each copy stores all its own lines (T3 F3); a long chat copied is a second long file.
6. **The mark costs one relay write per reply** and is not in the T7 relay cost model (checked as a gap, not measured).
7. **It reads a new thing**: "relay-confirmed beats local". An implementer who treats the relay's `ack` as "safe to delete" would lose replies with a lying relay; rule 8 forbids it, and a test must pin it.

### A.4 Comparison table (B v2 against the current design)

@@COMPARE@@

### A.5 What changed in my own model while I attacked it (every violating seed, and the fix)

Findings from the seeds below came from my first draft of these rules, not from the check; each is now a rule or a model fix. "seed" is the simulator-1 seed on the mix named.

@@SEEDS@@

## B. Removal

### B.1 What each option has to beat

The current design (`roster.ts`, round 3): the roster is a pure function of the **set** of signed entries; two removals that remove each other and did not see each other both stand; a removal is void if its signer was removed by an effective removal that had not seen it. The review's three real findings
(junk-removal spam, ghosts, the pre-signed "stash") are the round-3 targets. Its truth table (`tests/mesh/round3.test.ts`): with devices A, B, thief X, A removes X, X releases a stash "X removes A": A and X both go and B stands; with a second honest remover (A and B) the stash is void and A, B stay; with two devices the set dies.

### B.2 Option (i): relay-ordered removal, fixed

To fix the study's version I need: (a) a repeated refusal must carry proof (the signed entry that changed the roster) or be treated as silence; (b) a no-relay tie-break a thief cannot steer; (c) the stash to fail without a relay too. (a) is easy. (b) and (c) are **the built rule**: there is no signature-only rule that tells a pre-signed stash from a real concurrent removal (the built tests already prove this: `no third rule`). So fixed option (i) = built rule as the fallback + the relay as an optional tie-break. That is option (ii) with a receipt, so I evaluate them together as one design with a switch.

### B.3 The four rules, simulated

`roster-v2.mjs`, @@ROSTERRUNS@@ runs per cell (2 to 5 devices; thief is the oldest device in 35% of runs; stash in 60%, live signing in 35%; second honest remover in half the runs with 3 or more devices;
thief grinds its entry ids half the time; relay honest / absent / withholding / blocking with a bare "look again" / colluding with the thief). Oracle: O1 the thief is out whenever an honest removal was signed and held by an honest device; O2 never "thief stays while an honest device is removed" except when the thief really reached the relay first (a race, counted apart);
O3 every honest device computes the same answer in any delivery order. Variants: `built` (the built rule "both"), `first` (the built rule "first-admitted"), `study` (the first study's relay-first rule; lowest id as the open tie-break), `recv` (built plus optional relay receipts for mutual pairs only).

@@ROSTER@@

Reading it:

- **`built` never fails O1, O2 or O3 in any relay behaviour, including a relay that refuses everything and a relay that works for the thief.** Its cost: when the thief has a stash aimed at the remover and there is no second honest remover, the remover goes too (@@BUILTLOST@@ of stash runs). Nothing is lost but the pairing; chats stay on both devices; the owner pairs again.
- **`first` (the older device stays) is rejected**: the thief stays in @@FIRSTSTAYS@@ of runs because a stolen oldest device wins.
- **`study` fails the check's two regressions, as it said.** A relay that answers every removal with a bare "devices changed" blocks it for good (100% of signed runs; row `block`). With no relay and the open tie-break "lowest id", the thief stays in @@STUDYNONESTAYS@@ of runs and steers the loser (O2 failures), because it can grind ids. With a colluding relay it fails every time.
- **`recv` (receipts) is the only variant that cuts the stash cost** (honest relay: the remover is lost in @@RECVLOST@@ of stash runs against @@BUILTLOST2@@ for `built`), and it never makes things worse than `built` unless the relay itself cooperates with the thief: **row `collude` shows O1/O2 failures in @@RECVCOLLUDE@@ of runs where `built` has none.** That is the exact price of trusting the relay's order.
- **Cross-check against the real code:** the `built` rule of my model agrees with the real `RosterVerifier` ("both") on @@XCHECK@@. The key pairs are random, so the count varies by run: in three runs 2, 1 and 0 of 3,000 scenarios differed, every one with a signer that had signed two removals of the same target, where the real code (`roster.ts`, one candidate per signer and target) considers only the first in canonical order, even if a later removal had seen more. Low severity (a removed device's own earlier removal is dropped); found by this check; not fixed (no app code touched).
  My model of `first-admitted` differs from the real one in cycles (51 of 3,000), irrelevant because it is rejected.

### B.4 Decision

**Recommend (ii): keep the built signature-only design with rule "both". Do not make the relay part of the decision now.**

Why: (1) it meets every oracle with every relay behaviour; (2) it needs no new trusted party and no relay signing key; (3) the cost it leaves (a stash aimed at the remover takes the remover down too) loses no data, only a pairing, and requires a thief who pre-signs before being noticed;
(4) the relay receipt that would reduce that cost adds a signing key to the Worker, pinning it in the roster, key rotation, equivocation proofs and a relay-change flow, and **in exchange makes a hostile relay plus a stolen device worse than today** (the thief stays, an honest device goes).

Add to the built design, whichever way: the relay's own ban list must be computed by the **same function** as the app (review finding 8: today it is hard-coded "both" and permanent), and a refusal from the relay never delays signing or delivering a removal on every other path (it is only the relay's door, not the roster's decision).

### B.5 What must be trusted if the owner wants the stash closed, and the one sentence for him

The pre-signed removal cannot be told from a real concurrent removal by anything inside the entries, so closing it needs **an order referee**: either the relay (or the super-host) says which removal arrived first, or a second honest device must agree before a removal counts. The referee has to be trusted not to side with the thief. Nothing else closes it.

Smallest honest statement for the owner: **"If someone steals one of your unlocked devices, removing it from another device can, in rare cases, take your removing device down with it; nothing is deleted, and you pair the devices again. With only two devices, the set is dissolved and you start it again."**

## C. Simulation

### C.1 What was built

Three programs, all new files in `simplify-v2/`; the first study's, the check's and the review's folders are untouched.

1. `sim-check-v2.mjs`: **the reviewer's `sim.mjs` adapted to the v2 rules** (several chats, entries with counters, a relay note, 2 to 5 devices, 60 random events then a full heal). Its oracle is the reviewer's (P0 live loss, P1 hidden, P2 diverged, ORPHAN) plus: CUT (a removed device's late work is on no chain), R2 (after everybody is paired again nothing is hidden), ESC (on every chat any device can continue in place with no loss, whatever the mark says), VAC (a chat whose owner was removed is freed). New events: poison mark, relay wipe, relay eviction, restore from backup (kept), device removal, a removed device that forges a back-dated take-over and writes after removal, re-pairing, a device that never returns.
2. `sim-own-v2.mjs`: **a fork of the first study's `own-sim.mjs`** (register and epochs model; written by someone else's rules, so a different encoding of the same questions) extended with wipe, poison, removal, never-returns, re-pairing, the v2 tie-break, the override and the removed-owner rule, and R2/ESC phases. It does not model gap lines, in-order upload, entry ids or the cut-off.
3. `roster-v2.mjs` (removal) and `crosscheck/` (the removal rule against the real round-3 `RosterVerifier`, run with the app's own vitest from outside the repo).

Oracle in plain words: no reply that was shown is lost or hidden; any divergence ends as a visible copy; after everybody is paired again nothing is hidden; an honest removal of a hostile device takes effect whenever any honest path exists; a thief cannot pick the loser. **Excluded, as in the first study and the check:** replies that only a lying or evicting relay held, after the other holder lost its copy (counted: "inherent" below), and replies that only a removed or dead device held (kept there; R2 checks they return when it is paired again).

### C.2 Chat results (final code)

@@CHATRESULTS@@

### C.3 Mutants (each breaks one rule; the oracle must notice)

@@MUTANTS@@

### C.4 Removal results

See B.3 (@@ROSTERRUNS@@ runs per cell) and the cross-check line there.

### C.5 What the models do not cover (read before trusting any number)

- My own models, with my own oracle for the new properties. The reviewer's oracle (P0/P1/P2/ORPHAN) is reused unchanged in simulator 1 and the study's (P0 to P7) in simulator 2, so no property is only mine, but **a third generator on real code at the Phase 5 exit is still the right test.**
- Counts of schedules that end in a copy are **not rates of what a user would see**: the mixes are hostile by design (a restore, a wipe, a plain terminal, a relay that lies, all within 60 events). The one thing I can say about everyday frequency is that it is unmeasured; the calm mix still produced copies in roughly a third of schedules.
- Real files, real hashes and signatures, Claude Code housekeeping lines, Android, clocks, the 30- and 90-day rules, the live lane and project files are not modelled. The plain-terminal watcher (rule 17) and the housekeeping rule (19) are assumptions: **UNVERIFIED**.
- `conf` (relay-confirmed) is set only by a real accepted swap; a hostile paired device forging a confirmation is not modelled. Effect if it could: it wins ties against honest sides, the loser becomes a copy, nothing is lost. A hostile paired device can already type into every chat.
- Removal: signatures, the unlock, key rotation, ghosts, junk-entry floods and CPU cost are not modelled (the third review covers them). My `first-admitted` model is approximate.
- The two removal sims are not the real code except for the cross-check, which compares final membership only.
- The check's finding that a stolen device can push changes into devices that have not yet heard of the removal is **real and unchanged** (rule 21). The simulation shows the cut-off works for devices that have heard.
- Super-host: simulated only as "the note referee is gone" (same as a wipe) and as two referees. The real hand-over between relay and super-host is UNVERIFIED.

## D. For the owner

@@OWNER@@
