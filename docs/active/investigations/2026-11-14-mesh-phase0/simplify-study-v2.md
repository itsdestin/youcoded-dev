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
simulators (simulator 1: 1,000,000 schedules with an honest relay and 400,000 with a relay lying 30% or 80% of the time, violations 0 and 0, replies lost 0; simulator 2: 900,000 and 320,000 schedules, violations 0 and 0). On "simpler" the honest answer is smaller than the first study said: it needs **22 rules, not 12**,
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
    (simulated as two referees: it multiplies double grants by about 8 times (16.8% of schedules against 2.1%) and still loses nothing, so the rule is for noise, not safety). *(Check 2.6 item 5.)*

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

1. **More visible "(copy)" rows in edge cases, some without any tap.** Today the same events give a "two versions" row; v2 gives a "(copy)" row. Whether v2 gives more or fewer rows than today on the same schedules was **not measured** (no simulator of today's rules was run on these schedules). Measured: of the Continue-here taps on an unreachable owner in the hostile mix, 2.8% were offered a copy by default (44,880 of 1,595,505); the in-place continues include 3.0% where the user pressed the second button
2. **You cannot always continue in place with one tap.** When the owner holds replies nobody else has, the default is a copy; in place needs the second button. Today it continues in place with a warning and a "second version" appears later.
3. **A new trust in the relay's note for ordering** (not for secrecy): a relay that lies or forgets causes double grants (simulated: all ended as copies, zero loss; section C) and more copies, not data loss. Today `decide` does not depend on the relay for who hosts.
4. **A splitting chat can swap which side holds the name** while its parts are still travelling (the tie-break reads lengths, which grow). Until the devices have met, the name can hop; after, it is stable. Rare; nothing lost.
5. **Copy-of-copy chains and storage**: each copy stores all its own lines (T3 F3); a long chat copied is a second long file.
6. **The mark costs one relay write per reply** and is not in the T7 relay cost model (checked as a gap, not measured).
7. **It reads a new thing**: "relay-confirmed beats local". An implementer who treats the relay's `ack` as "safe to delete" would lose replies with a lying relay; rule 8 forbids it, and a test must pin it.

### A.4 Comparison table (B v2 against the current design)

| | Today (design 5.4, 6.2) | B v2 | Better / worse |
|---|---|---|---|
| Rules for who owns a chat | 15 `decide` rules, 9 sub-bullets (about 28 items), plus register rule, tail table, tail retention | 22 numbered rules | **Worse in count.** Better in shape: each v2 rule is local; today's interact through `pending`, relations and clusters |
| Control-entry kinds | 16 (14 chat kinds plus `witness`, `cutoff`) | 11 (`own`, `bound`, `summary`, `renamed`, `flag`, `talk-only`, `format`, `deleted`, `restored`, `witness`, `cutoff`) | Better (gone: `claim`, `takeover` merged into `own`; `released`, `relation`, `version`, `segment`) |
| States a chat can be in | 10 (host, none, pending, two versions, tail waiting, set aside, parked, void, unbacked, checking) | 4 (owned, ownerless, has copies, void-for-removed-device) | Better |
| Ownership notices in the 2.7 table | 8 | 7 (chip; host off, nothing missing; went off mid-reply; may be behind, with two buttons; split saved as a copy; host removed; earlier part missing) | About the same; one fewer question ("archive the older one?") |
| Deck questions made moot | | C-3 (rule 19), C-9 (no `pending`), C-12 (lineage decides the original). C-11 shrinks to wording, C-8 to one sentence, C-10 already answered. **Not** moot: C-13 (cut-off kept), P-10 (still needed, simpler, B.4), P-13 (answered "as designed") | Mildly better. The first study's list of 8 over-counted: C-17 (format value) is unchanged by v2 and C-15/C-16 were not re-verified |
| New questions it creates | | 3 (section D) | Worse |
| Relay on the critical path for ownership | No (`decide` gives the same answer whatever a register said) | Yes for confirmation and for "first come"; never for safety | **Worse** |
| Data-loss argument | 15 rules agreeing in every interleaving; 340,000-run re-test planned | One local rule (never delete a line that is not on the chain; make a copy) plus the 21 rules that decide availability | Better, and simpler to test (about 215 dense lines for the main simulator) |
| Copies a user can see without tapping | "Two versions" row, archive question | "(copy)" row, one-line notice | Different. Not shown to be fewer (UNVERIFIED) |
| Continue in place with the owner gone | Always, with a warning; a second version may follow | Same chat only if the device holds everything through the mark, else a copy; or "anyway" | **Worse** (one extra tap in those cases) |
| Removed-device back-dating | Cut-off and witness | Same cut-off and witness (rule 21) | Same (the first study's "not needed" is withdrawn) |

### A.5 What changed in my own model while I attacked it (every violating seed, and the fix)

Findings from the seeds below came from my first draft of these rules, not from the check; each is now a rule or a model fix. "seed" is the simulator-1 seed on the mix named.

| Seed (simulator, mix) | What the oracle reported | What I changed |
|---|---|---|
| 3, 4 (simulator 1, hostile, development) | Two devices made the same copy with different entry ids; chains differed (P2) | A copy's own entry id is derived from the copy's id (rule 6) |
| 5; 3041, 6118 (hostile) | Replies hidden: a removed device's line was void and the honest lines built on it hung off it | An honest device's line backs everything under it (rule 21, "built on") |
| 4669 (removal) | A forged late line of a removed device reached other devices as the earlier part of a copy | The cut-off also applies to a copy's earlier part (my first draft exempted it: a real hole in my first rule 21) |
| 685, 6919 (removal) | Oracle false alarms: author re-paired; a late item accepted by design | Oracle tracks "accepted before learning" and the re-pair generation |
| 18898 (hostile) | A restore resurrected a removal that had been undone by re-pairing | Model fix: removals carry a generation (a re-pairing is a newer signed entry) |
| 17393 (hostile) | Two devices ended with different copies: a sender withheld lines that its own honest line vouched for | Send filter uses the same "built on" test (rule 21) |
| 488, 1016 (simulator 2, hostile) | ESC: no way to continue in place: the relay was behind on a different branch after a wipe | Publish a missing earlier take-over first (rule 4); when the relay is on another branch, go on unconfirmed (rule 4, 13) |
| First full run, final-code candidates: 1201046, 1233255 (hostile), 2255981, 2288459, 2300693, 2327884, 2333988 (removal), 3233336 (removal, lying 30%), 4636489 (no-check variant) | P2 diverged / P1 hidden, all with two removed devices where one built on the other's line | A line that is valid only because a witness covered it also backs the lines under it (rule 21) |
| First full run: 2753986, 2774216 (hostile, lying 80%) | R2/ESC orphan: a gap copy made while a removed device's lines were void was never topped up after re-pairing | A gap copy is topped up whenever more of its lines become valid (rule 18) |

After these changes the whole run was repeated from scratch (the numbers in C.2 are that run): no violating seed remains in either simulator.

## B. Removal

### B.1 What each option has to beat

The current design (`roster.ts`, round 3): the roster is a pure function of the **set** of signed entries; two removals that remove each other and did not see each other both stand; a removal is void if its signer was removed by an effective removal that had not seen it. The review's three real findings
(junk-removal spam, ghosts, the pre-signed "stash") are the round-3 targets. Its truth table (`tests/mesh/round3.test.ts`): with devices A, B, thief X, A removes X, X releases a stash "X removes A": A and X both go and B stands; with a second honest remover (A and B) the stash is void and A, B stay; with two devices the set dies.

### B.2 Option (i): relay-ordered removal, fixed

To fix the study's version I need: (a) a repeated refusal must carry proof (the signed entry that changed the roster) or be treated as silence; (b) a no-relay tie-break a thief cannot steer; (c) the stash to fail without a relay too. (a) is easy. (b) and (c) are **the built rule**: there is no signature-only rule that tells a pre-signed stash from a real concurrent removal (the built tests already prove this: `no third rule`). So fixed option (i) = built rule as the fallback + the relay as an optional tie-break. That is option (ii) with a receipt, so I evaluate them together as one design with a switch.

### B.3 The four rules, simulated

`roster-v2.mjs`, 500,000 runs per cell (2 to 5 devices; thief is the oldest device in 35% of runs; stash in 60%, live signing in 35%; second honest remover in half the runs with 3 or more devices;
thief grinds its entry ids half the time; relay honest / absent / withholding / blocking with a bare "look again" / colluding with the thief). Oracle: O1 the thief is out whenever an honest removal was signed and held by an honest device; O2 never "thief stays while an honest device is removed" except when the thief really reached the relay first (a race, counted apart);
O3 every honest device computes the same answer in any delivery order. Variants: `built` (the built rule "both"), `first` (the built rule "first-admitted"), `study` (the first study's relay-first rule; lowest id as the open tie-break), `recv` (built plus optional relay receipts for mutual pairs only).

| Rule | Relay | Runs with an honest removal | O1 thief stays (not a race) | O2 thief picks the loser | O3 disagree | Thief reached relay first (race) | Thief still in | Honest device lost with the thief | of which stash runs: honest lost / stash runs |
|---|---|---|---|---|---|---|---|---|---|
| built | honest | 455,399 | 0 | 0 | 0 | 0 | 0 | 145,063 | 48.6% |
| built | none | 471,209 | 0 | 0 | 0 | 0 | 0 | 128,312 | 41.1% |
| built | withhold | 463,288 | 0 | 0 | 0 | 0 | 0 | 139,373 | 45.7% |
| built | block | 471,159 | 0 | 0 | 0 | 0 | 0 | 127,687 | 41.0% |
| built | collude | 454,507 | 0 | 0 | 0 | 0 | 0 | 187,547 | 62.7% |
| first | honest | 455,399 | 67,087 | 66,473 | 0 | 16,054 | 83,372 | 18,539 | 5.4% |
| first | none | 471,209 | 75,873 | 75,045 | 0 | 0 | 75,873 | 13,223 | 3.8% |
| first | withhold | 463,288 | 70,035 | 69,386 | 0 | 10,834 | 81,033 | 16,269 | 4.7% |
| first | block | 471,159 | 75,636 | 74,798 | 0 | 0 | 75,636 | 13,186 | 3.8% |
| first | collude | 454,507 | 110,131 | 108,694 | 0 | 0 | 110,131 | 21,119 | 6.3% |
| study | honest | 457,192 | 0 | 0 | 0 | 27,290 | 27,290 | 17,009 | 4.0% |
| study | none | 471,209 | 31,214 | 6,219 | 0 | 0 | 31,214 | 121,584 | 38.7% |
| study | withhold | 464,249 | 665 | 0 | 0 | 19,032 | 19,697 | 9,645 | 2.2% |
| study | block | 471,159 | 471,159 | 0 | 0 | 0 | 471,159 | 0 | 0.0% |
| study | collude | 454,507 | 454,507 | 190,142 | 0 | 0 | 454,507 | 0 | 0.0% |
| recv | honest | 455,399 | 0 | 0 | 0 | 23,617 | 23,806 | 12,879 | 3.4% |
| recv | none | 471,209 | 0 | 0 | 0 | 0 | 0 | 128,312 | 41.1% |
| recv | withhold | 463,288 | 0 | 0 | 0 | 16,061 | 16,146 | 9,636 | 2.4% |
| recv | block | 471,159 | 0 | 0 | 0 | 0 | 0 | 127,687 | 41.0% |
| recv | collude | 454,507 | 124,005 | 122,648 | 0 | 0 | 124,005 | 64,899 | 21.0% |

Reading it:

- **`built` never fails O1, O2 or O3 in any relay behaviour, including a relay that refuses everything and a relay that works for the thief.** Its cost: when the thief has a stash aimed at the remover and there is no second honest remover, the remover goes too (48.6% of stash runs). Nothing is lost but the pairing; chats stay on both devices; the owner pairs again.
- **`first` (the older device stays) is rejected**: the thief stays in 16.1% (no relay) to 24.2% of runs because a stolen oldest device wins.
- **`study` fails the check's two regressions, as it said.** A relay that answers every removal with a bare "devices changed" blocks it for good (100% of signed runs; row `block`). With no relay and the open tie-break "lowest id", the thief stays in 6.6% of runs and steers the loser (O2 failures), because it can grind ids. With a colluding relay it fails every time.
- **`recv` (receipts) is the only variant that cuts the stash cost** (honest relay: the remover is lost in 3.4% of stash runs against 48.6% for `built`), and it never makes things worse than `built` unless the relay itself cooperates with the thief: **row `collude` shows O1/O2 failures in 27.3% of runs where `built` has none.** That is the exact price of trusting the relay's order.
- **Cross-check against the real code:** the `built` rule of my model agrees with the real `RosterVerifier` ("both") on 3,000 of 3,000 scenarios (0 differ, 0 of them the duplicate-removal quirk). The key pairs are random, so the count varies by run: in three runs 2, 1 and 0 of 3,000 scenarios differed, every one with a signer that had signed two removals of the same target, where the real code (`roster.ts`, one candidate per signer and target) considers only the first in canonical order, even if a later removal had seen more. Low severity (a removed device's own earlier removal is dropped); found by this check; not fixed (no app code touched).
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

| Run (simulator 1) | Schedules | Violations | Replies lost | "Inherent" (excused) | Schedules ending with a copy | with a stale-owner write | Copy offered by default / in-place continues | Gap copies | Double grants (schedules) |
|---|---|---|---|---|---|---|---|---|---|
| hostile-honest-500k | 500,000 | 0 | 0 | 89,873 | 63.3% | 16.9% | 44,880 / 1,550,625 | 0 | 10662 |
| poison-honest-100k | 100,000 | 0 | 0 | 0 | 27.8% | 15.5% | 13,511 / 310,308 | 0 | 0 |
| wipe-honest-100k | 100,000 | 0 | 0 | 0 | 51.3% | 13.9% | 6,926 / 292,182 | 0 | 7034 |
| restore-honest-100k | 100,000 | 0 | 0 | 40,527 | 23.6% | 18.6% | 8,238 / 300,916 | 0 | 5477 |
| removal-honest-150k | 150,000 | 0 | 0 | 0 | 47.5% | 23.1% | 11,350 / 479,064 | 0 | 0 |
| calm-honest-50k | 50,000 | 0 | 0 | 0 | 31.2% | 18.7% | 4,206 / 147,776 | 0 | 0 |
| hostile-ly30-100k | 100,000 | 0 | 0 | 19,808 | 64.8% | 19.2% | 10,179 / 313,271 | 129 | 2565 |
| hostile-ly80-100k | 100,000 | 0 | 0 | 23,331 | 65.6% | 20.4% | 17,233 / 307,795 | 224 | 2445 |
| poison-ly30-50k | 50,000 | 0 | 0 | 0 | 31.6% | 18.0% | 7,182 / 158,439 | 3 | 713 |
| wipe-ly80-50k | 50,000 | 0 | 0 | 0 | 54.0% | 16.6% | 8,769 / 144,261 | 9 | 1047 |
| restore-ly80-50k | 50,000 | 0 | 0 | 25,817 | 25.8% | 22.0% | 9,249 / 147,938 | 26 | 1733 |
| removal-ly30-50k | 50,000 | 0 | 0 | 0 | 50.4% | 25.1% | 4,202 / 160,846 | 9 | 574 |
| **total, honest relay** | **1,000,000** | **0** | | | | | | | |
| **total, lying relay** | **400,000** | **0** | | | | | | | |

| Run (simulator 2, study fork) | Schedules | Violations | Schedules with a copy | stale-owner write | copy offered to user | double grant | "Continue anyway" pressed | chats freed by removal | relay wipes | poisons | removals |
|---|---|---|---|---|---|---|---|---|---|---|---|
| hostile-honest-500k | 500,000 | 0 | 63.8% | 41.0% | 10.2% | 12392 | 26,730 | 32,213 | 280,288 | 49,463 | 220,655 |
| poison-honest-100k | 100,000 | 0 | 37.9% | 44.9% | 14.8% | 0 | 8,207 | 6,761 | 0 | 48,431 | 37,398 |
| wipe-honest-100k | 100,000 | 0 | 60.6% | 40.7% | 12.7% | 9156 | 6,852 | 0 | 661,397 | 0 | 0 |
| restore-honest-100k | 100,000 | 0 | 33.4% | 43.0% | 12.6% | 4705 | 6,699 | 0 | 268,158 | 0 | 0 |
| removal-honest-100k | 100,000 | 0 | 39.2% | 48.5% | 11.2% | 0 | 6,280 | 18,448 | 0 | 0 | 116,745 |
| hostile-ly30-100k | 100,000 | 0 | 63.8% | 40.8% | 10.2% | 2505 | 5,258 | 6,438 | 56,065 | 9,961 | 44,215 |
| hostile-ly80-100k | 100,000 | 0 | 64.0% | 40.9% | 10.3% | 2917 | 5,471 | 6,393 | 56,156 | 9,905 | 44,004 |
| poison-ly30-40k | 40,000 | 0 | 38.5% | 45.2% | 15.1% | 28 | 3,394 | 2,604 | 0 | 19,318 | 14,864 |
| wipe-ly80-40k | 40,000 | 0 | 60.3% | 40.1% | 12.7% | 3650 | 2,709 | 0 | 263,702 | 0 | 0 |
| restore-ly80-40k | 40,000 | 0 | 33.6% | 42.8% | 12.9% | 2097 | 2,835 | 0 | 107,333 | 0 | 0 |
| **total, honest relay** | **900,000** | **0** | | | | | | | | | |
| **total, lying relay** | **320,000** | **0** | | | | | | | | | |

Totals: chat schedules **2,620,000** (simulator 1: 1,000,000 honest and 400,000 lying; simulator 2: 900,000 honest and 320,000 lying). Every run ends with a full heal, then the oracle, then everybody paired again (R2), then the in-place continue test (ESC).
Violating seeds on the final code: **none**.

Tie-break (simulator 1, hostile mix, the same first 100,000 seeds for both): copies made by a tie (same counter, same confirmation): v2 rule (side that keeps more) 1,375, of which the losing side was longer at that moment 18.8%; the reviewer's old rule (lowest owner id) 2,533, 59.8%. Ties are decided on what a device holds at the time and copies persist after a later flip, so the v2 figure is an upper bound on how often the shorter side wins.
Chats whose mark nobody could meet at the end of a run (simulator 1, hostile): 8.3% of schedules had at least one; poison mix: 22.2%. In every one the ESC test continued the chat in place with nothing lost (`ESC` violations: 0), because rule 14's second button exists.
Baselines run unchanged for comparison: the reviewer's original simulator (v1 rules, same event mixes, 50,000 schedules each): hostile/honest violations 0, hostile/lying 80% {'ORPHAN': 54, 'LOSS': 6} (the 54 ORPHAN cases are the check's finding 5, rule 18 fixes them: 0 in v2), poison 0. The study's own rules in the study's fork with the new events, 100,000 schedules: 0.

### C.3 Mutants (each breaks one rule; the oracle must notice)

| Mutant (rule switched off) | Schedules | Oracle result | Meaning |
|---|---|---|---|
| nocopy | 20,000 | {'P1': 4294, 'R2-P1': 5762, 'ESC-P1': 5769} | rule 6 off: replies are hidden. The oracle catches loss. |
| nocut | 20,000 | {'CUT': 834} | rule 21 off: removed devices' late work wins. The check's regression (2.4) is real and caught. |
| nooverride | 20,000 | {'ESC': 2902} | rule 14 off: chats copy-only for good. Caught by ESC. |
| novacate | 20,000 | {'VAC': 806} | rule 15 off: a removed owner's chat offers only a copy. Caught by VAC. |
| nogap | 40,000 | {'ORPHAN': 11, 'R2-ORPHAN': 11, 'ESC-ORPHAN': 11} | rule 18 off: replies hang off a missing line, hidden. Caught (ORPHAN), only under a lying relay with restores. |
| (simulator 2) copy rule off | 20,000 | {'P0-live-loss': 750, 'P7-honest-relay-destroyed-data': 9} | live loss caught |
| (simulator 2) no override | 20,000 | 0 | **not caught by simulator 2** (its ESC phase forces the take-over); simulator 1 catches it |

Rules whose removal must change availability, not safety (the oracle must stay green; the numbers show what each buys):

| Variant | Schedules | Violations | Schedules with a stale-owner write | Copy offered / in place | Double-grant schedules | Gap copies |
|---|---|---|---|---|---|---|
| reference, hostile (v2) | 500,000 | 0 | 16.9% | 44,880 / 1,550,625 | 2.1% | 0 |
| no note check before replies (rule 10 off), hostile | 40,000 | 0 | 23.2% | 4,244 / 124,422 | 2.7% | 0 |
| old tie-break (lowest owner id), hostile | 100,000 | 0 | 17.0% | 9,116 / 310,625 | 2.1% | 0 |
| two note referees (rule 22 broken), hostile | 40,000 | 0 | 17.9% | 2,345 / 129,050 | 16.8% | 0 |
| no cached note (rule 13 off), wipe mix | 40,000 | 0 | 6.8% | 32,004 / 93,586 | 3.7% | 0 |
| upload not in order (rule 9 off), wipe mix | 40,000 | 0 | 13.8% | 2,742 / 117,091 | 7.0% | 13 |
| reference, wipe mix (v2) | 100,000 | 0 | 13.9% | 6,926 / 292,182 | 7.0% | 0 |

### C.4 Removal results

See B.3 (500,000 runs per cell) and the cross-check line there.

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

**What you would see, case by case** (new plan, "B v2").
- Laptop awake: tap the chip on your phone; the laptop finishes its reply and the phone takes over. Nothing new.
- Laptop asleep, everything it wrote already reached your other devices (the usual case): "Continue here" on the phone keeps the same chat.
- Laptop asleep or lost, and it wrote replies nobody else received: the phone says "Desktop may have newer replies", with two buttons: "Continue as a copy" (safe) and "Continue here anyway". If you continue anyway and the laptop later wakes with those replies, they appear as "Trip planning (copy)". Nothing is deleted.
- Laptop removed: its chats are freed ("Phone was removed. Continue this chat here?"). Replies it never sent stay hidden on it; if you pair it again they come back as a copy.
- No internet: Continue here still works from what that device last knew; if it might be behind you get the two buttons.
- YouCoded's relay off or down: same as no internet between devices. Two devices that both continued a chat in the dark end up with one chat and one "(copy)" when they meet.
**You get a "(copy)" when:** a device kept working after another took the chat over; you typed into Claude Code in a plain terminal on a device not running the chat; a computer was restored from an old backup; the relay forgot or misreported (rare); or you chose copy. Nothing is lost in any of these.
**What you can no longer do in one tap:** continue in place a chat whose laptop holds replies nobody else has (needs the second button). Copies never merge back; the original and the copy stay as two chats until you delete one. There is no "archive the older version?" question.
**Not changed:** a thief with an unlocked device of yours can still type into your chats until you remove it. Removing it has a small risk of taking your own removing device down too (decision 2); nothing is deleted, you pair again.
**Honest size of the saving:** fewer states, no "pending", no archive question, a smaller test. Not fewer rules (22 against about 28 today).
**Decisions for you (three):**
1. **Default button when the laptop may hold unsent replies.** A: "Continue as a copy" first, "Continue here anyway" beside it (recommended). Pro: safe, never a surprise; con: one extra tap, a few more copies. B: always copy. Pro: simplest; con: splits every chat of a sleeping laptop. C: continue in place by default as today. Pro: one tap; con: surprise duplicates later. I recommend A.
2. **A referee for removals.** A: none: if a thief pre-signed a removal against you, you may both go and you pair again (recommended now). Pro: nothing new to trust; con: that rare case costs a pairing. B: YouCoded's relay decides who was first. Pro: that case drops from about 49% to about 3% of the simulated thief cases; con: a hostile relay together with a thief could keep the thief in and remove you, and it needs a signing key on the relay.
3. **Adopt this for chats, or keep today's chat rules.** A: adopt (recommended), but first measure how often a real laptop goes dark with unsent replies. Pro: no "pending", no archive question, smaller to test; con: not fewer rules, relay joins the ordering. B: keep today's chat rules. Pro: nothing new to approve; con: "two versions" and the large re-test stay.
