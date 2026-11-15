---
status: active
date: 2026-11-15
topic: Mesh sync - can "who writes a chat" be made simple enough that the two-versions machinery mostly disappears? (design study, no app code changed)
---

# Simplifying "who writes a chat"

Question from Destin (round-15 notes on C-3, C-8, C-9, C-11, C-13, C-15, C-16, P-9, P-10): "it feels like we're really
overengineering for a bunch of error cases that could be either prevented or handled much more simply." This study
checks whether he is right. Nothing in `design.md` or any app code was changed. Sections for him are written in plain
words; sections marked **For the builder** are technical.

Everything numeric below comes from two simulators I wrote for this study (scratch folder
`/tmp/claude-1000/-home-destin-youcoded-dev/1d94ee8c-71e6-4c05-afdb-68b45dbe9211/scratchpad/simplify-study/`: `own-sim.mjs`, `roster-sim.mjs`,
`run-all.sh` reproduces every table in about two minutes; raw output in `results/`). They are my own models judged by my own
checks. Section 6 says exactly what they do not cover.

---

## 1. Verdict

**He is right, with four honest limits.**

Why the current design is complicated: it lets any device take over a chat at any moment, with nobody in charge, and then
repairs the resulting clashes afterwards. Every possible clash needs its own rule. That is where the 15 `decide` rules, the
tails, "pending", "released", "relation", version ids and aliases come from. The simulator for those rules had to be fixed
three times (the first version lost a finished reply in 4,114 of 20,000 runs; the last two fixes were found by the last two
test campaigns, per T12b), and the plan still asks for a 340,000-run re-test in the real code.

What the simpler model does: one device writes a chat; the chat only moves when the writing device agrees, or when the relay
(which is single-threaded and can say "first come, first served") says so; and **one rule covers everything that still
does not fit: it is kept as a separate, visible chat called "... (copy)", never merged and never thrown away.**

Results of the simplified model in my simulator (details in section 6):

- **0 finished replies lost in 1,000,000 random schedules with an honest relay** (six event mixes, three models) **and in
  200,000 more with the relay lying 30% and 80% of the time** (apart from replies the relay alone held and then deleted;
  section 6).
- The same simulator **does** catch loss when I switch the copy rule off (5,333 of 20,000 schedules lose a reply), so a zero
  means something.
- The relay never gave one chat to two devices in the honest runs (0 of 1,000,000), and in the lying-relay runs the
  double-grant (59 and 400 per 100,000 schedules) always ended as a visible copy.

What goes away (counted against section 5.4 and 6.2 of the design):

| | Today | Simplified |
|---|---|---|
| `decide` rules | 15 | 8 vanish (3 host candidates, 4 takeover parents, 5 relations, 6 clusters, 9 chat with no host entry, 10 tail and who owes it, 11 setting lines aside, 15 duties written once); 4 shrink to one line (1 order, 7 host of a version, 8 version ids, 13 deleted per version); 3 stay (2 the roster part, 12 copy only from members, 14 latest name/flag wins) |
| Control-log entry kinds | 14 chat kinds (`claim`, `takeover`, `released`, `relation`, `version`, `bound`, `segment`, `summary`, `renamed`, `flag`, `talk-only`, `format`, `deleted`, `restored`) plus `witness` and the removal `cutoff` | 8 (`own` replaces `claim` and `takeover`; `summary`, `renamed`, `flag`, `talk-only`, `format`, `deleted`, `restored`, `bound` stay). Gone: `released`, `relation`, `version`, `segment`, `witness`, `cutoff` |
| States a chat can be in | host, none, pending, two versions, tail waiting, set aside, parked, void, unbacked, checking | owned, ownerless (anyone may continue), and "has copies" |
| Deck questions he would no longer have to answer | | C-3, C-9, C-10, C-11, C-12, C-15, C-16, C-17 |

**The four limits (what no design can remove).** Claude Code is someone else's program, so these four can always happen,
and all four end the same way (a visible copy):

1. Someone runs `claude --resume` in a plain terminal on a device that is not running the chat.
2. A device is rolled back to an older disk image and carries on from there.
3. The relay lies or loses its memory (rare, but it is a company server).
4. The device that was running the chat kept working while it was off the internet, after another device took over
   (this is the price of letting your phone continue a chat whose laptop is asleep).

**The simple model is not trivial.** Building the simulator found five corner cases I had not seen in the reasoning (listed
in section 6). Each took one small rule to fix. The model is simpler than today, and it is not "no rules".

---

## 2. Recommended model, in 12 plain rules

(The user-facing wording below is mine and needs the review-deck flow before it is shown to users.)

1. **Every chat has one owner device.** Only the owner adds to the chat. Every other device holds a copy that only ever grows.
2. **The relay keeps one small locked note per chat:** who owns it, a counter that goes up each time the owner changes, and
   "everything through reply N has been sent" (call it the *all-sent mark*). The relay only compares the counter and swaps
   the note, so the first device to ask wins. The relay cannot read the note. (Today's design already has a `host` and a
   `head` register of this kind; this uses them as the authority instead of a hint.)
3. **The owner refreshes the mark at the end of every reply**, when the app quits, and when it is told the computer is going
   to sleep.
4. **Tap the chip while the owner is on:** the owner finishes its reply, stops, and hands over everything. Nothing can be
   lost and there is nothing to reconcile. This works device-to-device even with no relay.
5. **"Continue here" while the owner is off or asleep:** if this device holds everything up to the owner's all-sent mark,
   it becomes the owner at the last finished reply (the unfinished reply is dropped, as 2.7 already says). The chat is the
   same chat; the divider is the one 2.7 describes.
6. **If it does not hold everything, or there is no mark:** the button is "Continue as a copy". It starts a new chat from
   what this device has. The original stays with its device and is never merged back.
7. **No relay and nothing in reach:** the same rule 5 or 6 using the last mark this device saw, with the warning 2.7 already
   promises.
8. **One rule for everything that does not fit.** Lines that cannot join the chat's one history (written by a device that
   turned out not to be the owner, typed in a plain terminal, from an older restored copy, from the loser of a rare double
   grant) are saved as "Trip planning (copy)", owned by the device that wrote them. The copy's id is fixed by its first
   line, so two devices that find the same lines make the same copy. A half-finished reply with no end is dropped, as 2.7
   already says.
9. **Waking up:** before doing anything, the owner reads the note. If the chat moved, it stops, and rule 8 keeps its finished
   replies. A command approved before sleep that finishes after waking counts as the old owner's writing (T19 finding 4).
10. **Claude Code's housekeeping lines (title, last prompt) are ignored when comparing copies.** Only the conversation
    counts (T21 already found this; it also answers C-3).
11. **Name, flags, "complete", deleted, minimum app version: the latest one wins**, per chat. A copy is its own chat for all
    of these.
12. **If the owner device is removed, the chat has no owner:** any device continues it under rule 5 or 6.

---

## 3. What the user experiences, case by case

Plain words, one sentence each. "Today" is what the current design would do.

| Situation | What he sees | Today |
|---|---|---|
| Laptop is on; you tap the chip on your phone | The phone takes over after the laptop's running reply ends. Nothing odd. | Same. |
| Laptop asleep in a bag, had sent everything; you tap Continue here on the phone | The same chat carries on, with the "Now hosted on Phone" divider. | Same. |
| Same, but the laptop's last replies never reached anyone | "Desktop may have newer replies. Continue as a copy from the last reply this phone has." The original chat stays on the laptop. | You continue in place with a "may create a second version" warning, and a second version appears later. |
| You continued on the phone; the laptop had secretly kept working offline (a plane, a tunnel) and comes back | A new chat appears: "Trip planning (copy)", holding exactly what the laptop wrote. A one-line notice says so. Nothing lost. | A "two versions" row with "keep both or archive the older one?" |
| You typed into the chat in a plain terminal on a device that is not running it | The terminal's replies appear as "Trip planning (copy)". Nothing lost. The chat window cannot "pick them up" because the app is not in that conversation. | "Kept as a separate version" (C-8). Same result, more machinery. |
| You open and close a chat on a second computer, nothing typed | Nothing. The title and last-prompt lines Claude Code adds are ignored. (This is not a fork; it is Claude Code housekeeping, seen in 5 of your 1,364 chats.) | A "two versions" question (C-3). |
| A computer is restored from an old disk image and you keep chatting | What it writes after the old point is saved as a copy when it meets the others. Replies that only that computer held and that were rolled back are gone, as with any restore. | Version rules. |
| The relay is switched off, or down, and the phone is out of reach | Continue here works from the last all-sent mark the phone saw, with the warning; otherwise it offers a copy. | Always continues, with a warning. |
| Two devices tap Continue here at the same moment | The first one the relay hears wins; the other sees "Phone just took over this chat" and stays a watcher. | Same, but through the register plus `decide`. |
| The relay lies or loses its memory | Rarely, two devices both think they own the chat; the one whose history is shorter or later ends up as "(copy)". You are not told the relay was at fault. | Version rules. |
| A command you approved before the laptop slept finishes after it wakes | If nobody took the chat over meanwhile, it just continues the chat. If someone did, its output is saved as a copy. | A tail and `released` entry. |
| You remove the laptop and a chat was running on it | The chat has no owner; any device continues it. If the laptop's unsent replies come back (it is paired again), they appear as copies. | Tails, `released` on behalf, "unknown". |
| Clocks are wrong on a device | Nothing changes: no step compares times. | Same (no clock in `decide`), but 30-day timers still need INV-17. |

---

## 4. Candidates compared

Candidates: **A** relay-held single owner, no copies (a stuck chat stays stuck); **B** = A plus the all-sent mark plus
"Continue as a copy" (this is the model in section 2; in the simulator it is called `AB`); **B0** = B without the mark shortcut
(any Continue here on an unreachable owner makes a copy; simulator `copyonly`); **C** = today's design; **D1** = ownership by a
lease with an expiry; **D2** = no ownership at all, only the copy rule (simulator `ungated`: anyone may take over any time,
losers become copies).

### 4.1 Which clash situations become impossible, which remain

| Situation | A | B (recommended) | B0 | C today | D1 lease | D2 no owner |
|---|---|---|---|---|---|---|
| Two devices both write one chat while everybody is honest and the relay is honest | Impossible (a takeover needs the owner's yes or the relay's single "first come") | Impossible at the relay (0 double grants in 1,000,000 honest-relay runs). Remains: the owner writes offline while another device took over on the strength of its mark | Impossible (0 owner-writing-while-another-owns in 100,000 runs, except after a disk rollback) | Allowed, then repaired by rules | Remains whenever a lease runs out while the owner is offline or asleep | Allowed always (35 to 40% of simulated schedules) |
| Relay lies, goes down, or loses its memory | Two owners possible; no rule says what happens | Two owners possible; visible copy; 0 losses. Relay down: continue from the mark or copy | Same, but fewer takeovers | `decide` is independent of the relay: same class of outcome | Lies about time or lease: more double owners | Unaffected (never trusted) |
| Device restored from an old image (a backup restore is a *fresh set* per 2.4, so this means a disk rollback) | Stale owner writes; no rule | Detected when it syncs (its lines do not extend the relay's); becomes a copy | Same | Version rules | Same | Same |
| Claude Code adds housekeeping lines on open | Not a clash (compared by conversation lines, T21) | Same | Same | Same fix needed (T21) | Same | Same |
| `claude --resume` in a plain terminal on a non-owner device | Cannot be prevented by any design | Becomes a copy at once | Same | Version/tail via the watcher | Same | Same |
| Command approved before sleep finishes after wake (T19) | Only a problem if another device took over while the laptop slept, which A forbids: impossible | Possible only if someone took over in place during the sleep; then it is a copy | Impossible (no in-place takeover during sleep) | Needs T12/T13 to include it | Likely (lease expired while asleep) | Likely |
| Removed or stolen device | Same as today: a stolen device is trusted until removed (can take over a chat whose owner is unreachable) | Same | Same | Same | Same | Same |
| Clock problems | Not used | Not used | Not used | Not used in `decide`; 30-day timers still need INV-17 | The lease is a clock: new hazard | Not used |
| Two takers at once, relay reachable | One wins | One wins | One wins | One wins via register, `decide` settles the rest | One wins | One wins, other forks |
| Two takers at once, no relay and out of reach of each other | Cannot happen (neither can take over) | Both can; the second to meet becomes a copy | Cannot happen | `decide` | Both | Both |

### 4.2 What each candidate costs the user

| Situation | A | B | B0 | C | D1 | D2 |
|---|---|---|---|---|---|---|
| Laptop asleep in a bag (all sent), phone wants the chat | **Cannot continue** unless the relay shows the all-sent mark; otherwise waits | Continues in place | Always a copy | Continues in place | Continues once the lease expires | Continues |
| Laptop asleep and had unsent replies | Waits | Copy offered | Copy | Continues, second version later | Continues, copy later | Continues, copy later |
| Plane, no internet, working on a chat this device owns | Works | Works | Works | Works | Works until the lease lapses, then may lose ownership silently | Works |
| Plane, no internet, wants a chat owned elsewhere | Cannot | In place from the last mark seen, else a copy | Copy | In place with a warning | Cannot | Yes |
| Relay switched off (allowed by 2.5) | Hand-over only when both devices are on | Hand-over; or from the last mark; else copy | Hand-over; else copy | Takeover any time | Lease needs a shared clock and a place to hold it | Takeover any time |

How often will a user hit "cannot continue the same chat" under B? **I do not know.** The Phase 0 work never measured how
often a host goes dark with replies it did not send. It needs a host that finished a reply while offline, and 2.6 already
keeps a computer awake for a running reply and sends every line as written, so I expect it to be rare. The simulator
cannot tell: its schedules are deliberately hostile. What the simulator does show is the *relative* effect of the all-sent
mark: in the "everyday" mix, of 53,515 Continue-here taps on an unreachable owner, 44,654 (83%) continued in place and
8,861 (17%) were offered a copy; the mark also cut surprise copies by 14% (17,465 against 20,204 with no gating) and by 18%
in the calm mix (38,976 against 47,328). The "after building: what to measure" list (design section 11) should count real "Continue
as a copy" offers.

### 4.3 The other items (rules, log entries, questions, security, data loss, size)

**(3) What becomes unnecessary under B.** Decide rules 3, 4, 5, 6, 9, 10, 11, 15; rules 1, 7, 8, 13 shrink; log entries
`released`, `relation`, `version`, `segment`, `witness`, `cutoff` go, `claim` and `takeover` merge into `own`. Deck questions
C-3, C-9, C-10, C-11, C-12, C-15, C-16, C-17 stop being questions. C-8 and C-13 shrink to one sentence each. C-1, C-2, C-4,
C-5, C-6, C-14 are untouched. P-10 is answered by the removal rules in section 7; P-13 still needs his answer.
(Why each goes: there is no second host to reconcile (3, 4), no pending state because two entries never need comparing (5, 6,
9), no tail to owe because the writer saves its own tail as a copy the moment it learns (10, 11, 15), and a copy is just a chat
(8, 13).)

**(5) Conflicts with section 2.** See section 5. None contradicts the experience he approved except two notice rows.

**(6) Data-loss risk compared with today.** Lower in design, equal in the worst case. Today's safety rests on 15 rules
agreeing in every interleaving (and a 340,000-run test). B's safety rests on one local rule: never delete or overwrite a line
that is not in the agreed chain; save it as a copy. The rule uses only the device's own data and no ordering, so it cannot be
broken by message order or by a lying relay. What does stay lost: unfinished replies (by design, 2.7), replies that exist only
on a device that is then lost (as today), and data that only the relay held when the relay deletes it (lying relay together
with a device that lost its own copy: 534 and 1,296 replies in 100,000 schedules at 30% and 80% lying; zero loss of anything
else).

**(7) Effect on security.** The relay already holds the `host` and `head` registers; B makes the host note the authority
for *exclusivity* instead of a hint. It learns nothing more (the note is sealed and signed by the owner; it sees the counter
move, which it already sees). A hostile relay can: refuse (the user can still make a copy), grant twice (visible copy), serve
an older note (a takeover that ends as a copy), or delete lines it alone holds. It cannot forge a line, an owner or a
signature, and it cannot make a reply disappear that any device still holds. The current design is *more* independent of the
relay for who-hosts (decide gives the same answer whatever a register said), and *less* able to promise exclusivity. B's
no-loss guarantee does not depend on the relay either.

**(8) Rough build size.** Judgment, not measurement. My whole simulator for B is 320 lines; T12b's `decide.mjs` plus `sim.mjs`
for today's rules is 1,011 lines (400 + 611). The copy rule itself, the reconcile and fork code, is 24 lines in my
simulator. In the real code I would expect the chat-ownership part of Phase 5 to be about a third of today's plan. The
test burden falls more: today's plan asks for a 340,000-run re-test in the real code plus an independent generator;
a one-property fuzz like mine runs 100,000 schedules in under a minute.

---

## 5. What he gives up, and what in section 2 needs his approval

### What he gives up (the pros and cons)

**Pros**
- Almost all the "two versions" notices go away; what is left is one plain sentence: "Desktop's part was saved as 'X (copy)'."
- There is no archive-the-older-one question; a copy is an ordinary chat he can delete.
- No "pending" or "checking" states, so no case where the phone sits silently doing nothing (C-9).
- Nothing in the clash handling reads a clock.
- A builder can hold the whole mechanism in one head, and the test is a short property.

**Cons**
1. **Continue here is not always "the same chat".** When the old device had unsent replies, or no all-sent mark, the phone
   offers a copy instead. Today the phone continues in place and a second version appears later. *I recommend this: the copy
   is chosen by the user at the moment, instead of discovered later.*
2. **Surprise copies still happen**, now with a one-line cause. They happen only when an owner worked offline while another
   device took the chat over from its mark, after a plain-terminal use, an old-image restore, or a lying relay.
3. **Copies are never merged back.** Two chats stay two chats until he deletes one. (Today's design also keeps both, so this is
   the same in practice.)
4. **A copy duplicates the earlier part of the chat in storage** (T3: a fork has to store all its own lines). Rare, but a big
   chat copied is a big file.
5. **Exclusivity needs the relay or a device in reach.** With neither, two devices could both take over from a stale mark;
   the second to meet becomes a copy. (2.7 says "With no connection at all, Continue here still works, with a warning.")
6. **The relay is on the critical path of "who owns this chat" for the common case.** If it is down, only the all-sent mark a
   device last saw is available.

**The single most important decision for him.** *When the laptop is asleep and he taps Continue here on the phone, should it
continue the same chat, accepting that very rarely a separate "(copy)" appears later because the laptop had been working
secretly offline (this is B)? Or should it always make a copy (B0), so a chat never has two writers at all, at the price of
splitting the chat every time the laptop is asleep?* I recommend B: it keeps the promise in 2.1 and 2.7, and B0 gives up the
most common case to remove a rare one.

### What in section 2 would need his approval (quoted)

1. **2.7, "Two versions found" row:** "This chat was continued on both Desktop and Phone while they could not reach each other.
   There are now two versions. Keep both, or archive the older one?" would become a plain notice ("Desktop's part was saved as
   'Trip planning (copy)'") with no archive question. *Visible change.*
2. **2.7, "Versions":** "Accidental duplicates are prevented. The one unavoidable case is two devices continuing the same
   chat while neither can reach the other or a keeper; it is caught when they meet and the older one is offered for archiving.
   Deliberate forks are equals, grouped in the resume browser." The first two sentences fit B exactly; "offered for
   archiving" goes; "grouped in the resume browser" would now be "copies are grouped under the chat they came from" (card
   243 territory).
3. **2.7, "This device is known to be behind" row:** "Desktop has 120 newer lines and is offline." Button: "Continue from
   here as a new version". Becomes "Continue as a copy". Same meaning, new word. *Visible change.*
4. **2.7, "This device may be behind" row:** "Continuing here could create a second version." Under B it would say "Desktop may have
   newer replies. Continue as a copy, or wait." because B does not guess. *Visible change.*
5. **2.7, "With no connection at all, Continue here still works, with a warning."** Holds in B and not in B0. If he picks B0
   this line changes.
6. **2.7, "If two devices tap Continue here at once, the first to be heard becomes host..."** Holds when the relay or a device
   is in reach. With no relay and nobody in reach, two devices could both take over; the later one becomes a copy. Same words,
   weaker promise in a rare case.
7. **2.7, "When the old host returns it learns it is no longer the host and discards its half."** Only the unfinished half is
   discarded; finished replies are kept as a copy. (Today's design already keeps finished replies; the line was always
   loose.)
8. **2.4, "Anything it wrote and had not sent is lost unless it is paired again."** Not touched by this study; P-13 proposes
   changing it, and B fits P-13 (unsent replies stay on the removed device and return as copies on re-pairing).

Nothing else in section 2 changes. The two lines marked "(unconfirmed reading)" are unaffected.

---

## 6. Simulation results

### What was built

`own-sim.mjs` is a fresh simulator, not an adaptation of T12b: T12b's `sim.mjs` is welded to `decide()`, and this model deletes
`decide()`. It keeps T12b's spirit: seeded random schedules, every device acts only on its own beliefs, only the oracle sees
the truth. One chat, 2 to 5 devices, one relay, direct links, 60 random events per schedule (writing, partial replies, chip
taps, sleep and wake, going offline, relay down, direct links, syncing, peer syncing, plain-terminal writes, disk rollbacks).
Each schedule ends with a "heal" (everybody on, relay honest) and then checks the properties.

Properties:
- **P0**, after every single event: no finished reply that was shown to a user vanishes from all devices and the relay.
- **P1**, after healing: every shown reply is in some chat on every device. A copy counts.
- **P2**, after healing: every chat has the same lines on every device.
- **P3**, honest relay: exactly one device believes it owns each chat, and all agree.
- **P4**, honest relay: the relay never gave the same counter to two devices, and its chain never forked.
- **P5**, heal ends. **P6**, copies appear only after a known cause (stale-owner write, in-place takeover, disk rollback, terminal use,
  user choice). **P7**, an honest relay never destroys data.

### Results (final code, fresh seeds 50,000,000 and up; `results/*.json`)

| Run | Schedules | Failed any property | Notes |
|---|---|---|---|
| **B (recommended), honest relay, hostile mix** | 200,000 | **0** | 70,410 schedules had a write by a device that was no longer the owner (all ended as copies); 0 double grants; 0 relay-chain forks; 137,803 schedules ended with at least one copy |
| B0 (always copy, honest) | 100,000 | **0** | 0 stale-owner writes except in 972 schedules that included a disk rollback |
| D2 (takeover any time + copy rule, honest) | 100,000 | **0** | 40,727 schedules with a stale-owner write |
| **B, relay lying 30% of the time** | 100,000 | **0** | 59 double grants, 1,474 relay-chain forks, all ended as copies. 1 chat ended with nobody believing it owned it, 11 with devices disagreeing about the owner; chains still equal; Continue here is always available |
| **B, relay lying 80%** | 100,000 | **0** | 400 double grants, 3,821 forks, 23 ownerless, 106 disagreeing |
| B, calm mix (no terminal, no rollback), strict P6 | 100,000 | 12 (P6 only) | see "known wart" |
| B0, calm mix, strict P6 | 100,000 | 15 (P6 only) | same wart |
| B, "everyday" mix, strict P6 | 100,000 | 3 (P6 only) | same wart |
| Check that the test bites: copy rule off | 20,000 | **5,333 lose a reply** (980 caught live by P0), 20 an honest relay destroyed data | proves the oracle catches loss |
| Copy id by device instead of first line | 20,000 | 0 | costs only duplicate copies (23,897 copy chats against about 23,342 expected for 20,000 schedules, +2%), so the fixed id is hygiene, not safety |
| No register read before writing | 20,000 | 0 | safety does not depend on the wake check; it only reduces stale writes |

**Counts that matter for the question "never two owners except a lying relay."** Honest relay: 0 double grants and 0 forks of
the relay's chain in 1,000,000 schedules. What does happen with an honest relay is **an owner writing while another device took
over on the strength of its all-sent mark** (B) or **after a disk rollback** (all models): the system calls that a stale write
and keeps its finished replies as a copy. In B0 the first kind is 0 by construction (0 of 100,000 outside disk rollbacks).

**Under a lying relay:** double grants are real (59 and 400 per 100,000) and always ended as a visible copy. Not "never lost":
534 (30%) and 1,296 (80%) acknowledged replies in 100,000 schedules were destroyed by the relay when the relay was their only
holder and the writing device had lost its own copy by a disk rollback. No design that keeps data on a server can prevent a
hostile server deleting it; the current design has the same exposure. Everything else: 0 lost.

### Corner cases the simulator found in my own first design (each is one small rule now)

1. A copy's id taken from its first line collided when two different continuations shared that line; the fix is the same rule
   one level down (a copy of the copy), not a bigger id.
2. A chain of hand-overs made while offline needs the owner-counter ancestry, or the relay mistakes a legitimate chain for a
   rival.
3. If a rival's higher counter descends from a swap the relay refused, the relay's confirmed value beats it, otherwise devices
   argue about the owner for ever after a restore.
4. The relay may hold only an unfinished reply when a new owner takes over; that must not count as a clash.
5. A hand-over request answered "not mine any more" must fall through to the unreachable-owner path, or the chat is stuck
   (found under the lying relay: an ownerless chat nobody can continue).

### Known wart (not fixed)

In about 0.01% of schedules (12 and 15 of 100,000 calm runs, 3 and 4 in the everyday mix) a device that fetches the relay's
older chain before the relay has heard of a direct device-to-device hand-over files an unnecessary copy. Nothing is lost;
it is one extra copy of text that also lives in the real chat. I tried skipping the fork when the relay is behind and it
deadlocked after a disk rollback, so I left it. A real implementation should fix it with a signed hand-over entry the relay
and devices can show each other (which the model has as the counter's ancestry).

### What the simulation does not cover (read this before trusting any number)

- It is my own model judged by my own oracle. T12b had the same weakness and still found real holes late; a second
  generator by someone who did not write the rules is the right exit test.
- One chat only (no per-project effects, no extras, no chat deleted while another device has a copy).
- No real files, hashes, signatures, key rotation, relay limits, 30/90-day rules, Android backgrounding, or real sleep.
- Claude Code behaviours are assumed: housekeeping lines are ignored by the conversation compare (T21); a plain terminal
  write is seen by the adapter and filed as a copy at once (untested; the data-loss review D-7 already requires such a watcher).
  Whether the app can stop `claude --resume` on a non-owner device by not placing a working file there is **UNVERIFIED**.
- The event mix is arbitrary. "70,410 of 200,000 schedules had a stale write" does not mean 35% of users see one. The
  numbers are for comparing models, not for predicting how often a person sees a copy. That frequency is unmeasured.
- Time in the model is steps, not clocks; a wrong clock is not simulated (the model has no clock to be wrong).
- Device removal is a separate small simulator (section 7), not part of the chat runs.
- Evidence from real data: T21 found 28 real split pairs in his own chat history, all from two-way GitHub sync with no
  owner. That shows clashes do happen when nothing prevents them; it is not a rate under the new model.

---

## 7. The removal part (P-10 and the third security review)

Source: `docs/active/reviews/2026-11-14-mesh-device-layer-and-relay-review-3.md`.

### What goes wrong today (his P-10 note: "confusing as fuck")

The review found: (1) a hostile "senior" device can make itself unremovable by signing 96 junk removals; (2) devices it added
("ghosts") outlive its removal and receive the next secret; (3) a pre-signed "X removes you" entry kept off the network (the
"stash") and released after you removed X takes **you** down too, and in a two-device set kills the whole set; (4) any one
device can remove every other device; (8) the relay and the app can disagree about who is removed, and the relay's ban is
permanent. Four of these (1, 3, 5, 8) come from the same cause: **removals are ordered by who joined first, which nobody can
prove, and which a thief holding the oldest device wins.**

### The simpler rule set

1. **A removal is a signed entry that names the roster state it was made on** ("remove Phone, made when the roster was
   at step 7").
2. **The relay accepts it only if the roster is still at step 7 and both devices are members** (compare-and-swap, first
   come, first served). Otherwise it refuses, and the removing device is told "devices changed; look again", and can
   retry on the new state.
3. **Removing a device and the new secret travel as one unit,** so the roster can never be ahead of the secret.
4. **It needs the removing device's own unlock,** as 2.4 already says.
5. **No relay:** two removals made on the same step that remove each other both stand (both devices go), with a single extra
   rule: a removal whose signer is also being removed by two different devices is void.
6. **A removed device's earlier signed work stays;** later work is refused because the relay refuses it and devices see it was
   not a member at that step. No cut-off or witness is needed (they existed because without an order nobody could tell which
   of a removed device's lines came first).

### What this prevents

- **Two devices remove each other at the same moment:** with a relay, whichever reaches it first stays, the other is removed.
  No tie rule, no seniority, no "both removed" surprise. Without a relay, both are removed (the security review's choice; the
  chats stay on both and the user pairs again).
- **The stash:** a stash is signed on an old roster step; once any roster change lands it is refused. In 27,428 simulated
  runs the relay refused a stash that would have removed an honest device.
- **96-junk-entries:** refused entries are never stored, so they cannot crowd out a real removal.
- **The relay and the app disagreeing:** the relay's step is the roster's step.

### What it does NOT prevent

- **A thief who can sign** (has the unlock) can still race. If the thief reaches the relay first, it removes the honest
  device. In my simulation that is the whole of the loss: 44,850 of 100,000 runs where the thief's entry arrived first, and
  0 of 55,150 where the honest removal did. This is the "all paired devices are fully trusted" price (review finding 4) and
  needs the thief to have the unlock. An optional later hardening is a second approver when there are three or more devices.
- **Ghosts (finding 2)** are a separate rule: a new device must countersign its own `add`, and removing a device should list
  and offer to remove the devices only it added. That is unchanged and still needed.
- **A relay that withholds a removal (finding 10)** keeps a removed device connected until it is told. Unchanged; show
  "removal confirmed on N of M devices".

### Trust in the relay

It needs the relay for **order**, not for secrecy or truth. A relay cannot invent a removal; it can only choose which of two
genuine signed removals arrives first, or withhold one. A lying relay **alone** can delay (as today). A lying relay **plus a
thief** can let the thief win a race it would otherwise lose, which needs two parties. Today's "oldest device wins" lets one
party (a thief with the oldest device) win without any help from the relay, so the new rule is no worse and arguably better.
With no relay the rule falls back to "both go", which is also the security review's recommended choice.

### Simulation (`roster-sim.mjs`, 100,000 random removals each)

| Mode | Honest removal first | Thief's entry first | Devices disagree at the end |
|---|---|---|---|
| Relay orders | thief removed, 0 honest lost (0 of 55,150) | honest removed in all 44,850; thief stays only if no second honest remover (12,581) | 0 |
| No relay, mutual removal both go | 27,079 of 55,150 lose an honest device (the thief targeted the remover, so both go); thief always out | 19,816 of 44,850 lose an honest device; thief always out | 0 |
| No relay, plus "two removers void the signer" | 12,764 of 55,150 lose an honest device; thief always out | 12,581 of 44,850; thief always out | 0 |

(The simulator does not model the unlock, key rotation, ghosts, junk-entry spam, or a thief not yet known to be one. The
numbers compare rule sets; they are not a rate of attack.)

### What this means for his two deck items

- **P-10** becomes one plain sentence: "If two devices remove each other at once, whichever the relay hears first stays. With
  no relay, both are removed and you pair again." This replaces the three-option question and drops O22. It needs his yes
  because it is a visible rule.
- **P-13** (removal never deletes unsent replies) is still his to answer; it fits B.

---

## 8. Open risks

1. **Test is mine.** A second, independent generator should re-run it on real code (Phase 5 exit, as already planned).
2. **The all-sent mark must really be written at the end of every reply.** If a connection drops between the last line and the
   mark, the taker sees a stale mark and the old owner's finished reply becomes a copy. Seen in simulation; harmless; but the
   mark's write cost (one more register write per reply) is not in the T7 relay cost model. Check it.
3. **The "relay behind" wart** (section 6) needs a real fix.
4. **Plain-terminal use is only contained, not prevented.** If the file-removal idea works (UNVERIFIED), the app could prevent
   it on non-owner devices; the cost is that a plain terminal there would no longer list those chats.
5. **Claude Code, Windows, macOS and Android are untested** (round-14 Q-7). The copy rule has no platform dependence, but the
   adapter's file watcher does.
6. **Copies cost storage** (a copy of a long chat is a second long file).
7. **Lying-relay end states:** a chat may end with no device believing it owns it (1 to 23 per 100,000 at 30% to 80% lying).
   Continue here always works (rule: a "not mine" answer falls through to the unreachable path), but the notice text for
   that state is undesigned.
8. **A relay that deletes what only it holds** (534 to 1,296 replies per 100,000 in the lying runs) is the same exposure as
   today; the quit-line wording from C-14 ("waiting, not safe") already covers it.
9. **It changes how 5.4 reads.** The design says the register is a hint and `decide` is the truth. Under B the register is the
   authority for exclusivity and the copy rule is the truth for safety. That rewrite touches 5.3, 5.4, 6.2, 6.4 and the Phase 5
   exit line; nothing was edited here.
10. **O27 (delete with a second version unseen)** goes away: a copy is its own chat. Deleting the original leaves the copy,
    which matches his C-10 choice ("leave, labelled").
