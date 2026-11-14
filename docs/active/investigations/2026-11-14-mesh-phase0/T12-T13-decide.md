---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0 — T12 (control-log fuzz) and T13 (late lines from the old host): `decide` written and fuzzed
---

# T12 / T13: `decide(entries, roster)` executed against the written rules

## 1. Verdict

**PARTIAL.** Pass line (design 9): *identical output, version ids, host and delete dates everywhere; no entry from a not-yet-known signer lost* (T12); *same set-aside or second-version result on all devices, no line lost* (T13).

- **Passes as written:** same answer for any order or duplication of the same entries; no dependence on wall clocks in `decide`; every device agrees once everything is exchanged; a parked entry is applied once its signer arrives (the one exception: an entry whose signer's own `add` was voided by a removal stays unapplied, F7(e)). These hold by construction (the function sorts by id first) and every fuzz run confirms them.
- **Fails as written:** the rules lose finished replies (4,114 of 20,000 random runs; 1,323 of 4,374 T13 cases when a second device also takes over and writes), contradict themselves with three concurrent claims (882 of 20,000), leave chats `pending` for ever (781 of 20,000), and the version ids are not stable (about 7% of runs even after every fix below).
- **With the rule changes in section 4 (all engineering except the items in section 5):** T13 grid 0 of 4,374 fail; random runs 3 of 20,000 lose a reply (all three the same mutual-removal + takeover + restore corner, section 3 F9) and 1,504 of 20,000 show an unstable version id (F6, still open; it needs the 5.3 change).

## 2. What was done

Everything is under `docs/active/prototypes/2026-11-14-mesh-phase0/T12/` (plain Node ESM, no dependencies, about 1,060 lines).

| File | What it is |
|---|---|
| `decide.mjs` | `decide(entries, roster, opts)` from 5.1, 5.3, 5.4, 6.2. Signatures stubbed by the `device` / `by` field; id = SHA-256 of canonical content. `opts` switches each rule between its literal reading and a proposed fix. Every place the text is silent is marked `INTERP:` or `F<n>` in a comment. |
| `sim.mjs` | 3 to 5 devices, each holding a line chain, a pool of entries and set-aside tails. Devices act only from their own `decide` view: write, take over (chip / host-offline / host-removed / no-connection), release, relate, witness, release on behalf, add, remove, rename, flag, talk-only, format, delete, restore, partition, heal, lossy shuffled duplicating sync. Clock skews 0, +1 day, +30 days, -1 day, +5 days. Plus the oracle (properties 1 to 5 and extras). |
| `fuzz.mjs`, `shrink.mjs`, `dump.mjs` | Seeded generator; shrinker (removes events while a named property keeps failing); a printer for one case. |
| `t13.mjs` | The T13 grid: 3 shapes of old-host tail x 4 lengths x taker holding 0..8 lines x third device holding 0..8 lines x third device acts or not x 3 arrival orders = **4,374 cases**, every one run to quiescence. |
| `scenarios.mjs`, `s15.mjs`, `s3check.mjs`, `s5397.mjs`, `fmt.mjs` | Named minimal traces (S1 to S15) run under both rule sets. |
| `profiles.mjs`, `run-all.sh` | `LITERAL` (text as written) and `FIXED` (proposed). `bash run-all.sh` regenerates `results/` in about 6 minutes. |
| `results/` | Raw output of every number quoted below. |

Commands: `node fuzz.mjs --runs 20000 --seed 100000 [--literal | --revert <rule> | --add witnessEntries | --noRemove --len 40]`; `node t13.mjs [--literal]`; `node scenarios.mjs [S3-split-forgotten]`; `node shrink.mjs <seed> <property> [--literal]`; `node dump.mjs <seed> <property>`.

**Harness self-test (so a zero means something):** replacing the id tie-break with the wall clock made the clock property fail 37 of 500 runs; replacing the sort-by-id with arrival order made the permutation property fail 62 and agreement fail 73 of 500 (`results/mutation-*.txt`).

**Coverage of the 20,000-run campaign (`results/fuzz-fixed-20000.txt`):** 8,461 runs had entries parked mid-run; 10,909 had a removal; 560 had concurrent removals both standing; 7,638 ended with more than one version; 5,065 with a tail-version; 5,526 deleted; **only 1,619 had a takeover** (the generator gates takeovers on the device holding the lines), which is why T13 is a separate exhaustive grid.

## 3. Findings

Each finding: where the text is wrong, the smallest trace, evidence, smallest fix, and whether a user can see the change. "Trace" is the event list; `S<n>` names run in `results/scenarios.txt`.

**F1. Concurrent host entries are ordered by "had seen", and a later takeover erases the split.** (5.4 Order, Host; 4.2 ideas 3 and 4.)
Trace S3: devices A and B hold copies that differ (two claims, relation says "differ" so two versions). Device C reads both claims, then takes over A's version. C's takeover has "seen" both claims, so under "an entry that had seen another is later" only C's takeover is left; B's version vanishes.
Evidence: literal reading leaves one version, tips reading leaves two (`results/s3-seenmaximal.txt`).
Fix: host candidates are the lineage tips: host entries that no valid takeover names as its `parent`. `parent` becomes load-bearing. A relation is then needed between each pair of tips that are not parent-related.
User sees: nothing new; avoids a second version silently disappearing. Engineering.

**F2. "Prefix means one chat" is not transitive.** (5.4 Concurrent host entries.)
Trace S2: claims of 4, 6 and 6 lines where the two 6-line copies differ from each other. The 4-line copy is a prefix of both, so pairwise rules join all three into one chat and also say two of them differ.
Evidence: literal: 882 of 20,000 random runs contradict themselves; reverting only this fix: 130 of 3,000.
Fix: a copy is absorbed only by a copy it is a prefix of (or an identical, better-ranked one); every copy that is not a prefix of another is its own version. Engineering.

**F3. A host entry that stops hosting for any reason other than "was the parent of a takeover" owes a release nobody is told to write; its finished replies are lost.** (5.4 takeover point and tail; walk-throughs B, C; table in 5.4.)
Trace S1 (one event): device A claims 4 lines; device B holds a longer copy (6 lines) and claims too; before they meet, A writes a finished reply. B's longer claim wins, A's claim is void, and A's reply is in no version.
Trace S7 (the chip-versus-offline race): host H, phone P taps the chip, so H is fenced and P takes over at H's last reply end; tablet Q, which cannot reach H, takes over from an older copy at the same time and writes a finished reply. P's takeover is the longer, Q's is void, Q's reply is lost.
Also: an entry superseded by a successor that itself loses (identical copies: a `claim` marked ran-here beats a `takeover`) is never a "loser" at all (6 of 3,000 runs when only that part is reverted).
Evidence: literal 4,114 of 20,000 random runs lose a reply; T13 grid 1,323 of 4,374; reverting only the loser-release rule: 584 of 3,000.
Fix: every device whose latest host entry is not on the winning lineage of its version appends `released` for it, naming where its lines depart from the winning chain; `decide` lists that release as expected (per author, the latest such entry). A tail with a finished reply becomes a second version with id `SHA-256(chat id ‖ entry id ‖ "tail")`, as for the old-host tail.
User sees: the existing "Two versions found" row now also appears in these races, where today a reply would silently vanish. Within the spirit of 2.7 ("never thrown away"); mention to Destin in one line (section 5, item 3).

**F4. `released` is keyed only by `takeover`, so one device can owe two different tails under one key.** (6.2.)
A device can be both the author of a losing takeover and the on-behalf releaser for the previous host of that same takeover; both files say `takeover: T`. Found at fuzz seed 245 (the on-behalf release was read as the author's own).
Fix: add `owner` (whose lines are described) to `released`; `decide` matches on `(takeover, owner)`. Engineering.

**F5. "Set aside on every device under the takeover's id" breaks three ways.** (5.4 tail; 5.3 copying.)
(a) While a takeover is `pending`, setting lines aside destroys the very copy the relation needs (the only holder of the longer copy moved it out of its chain; chat stayed pending: seeds 63, 117316).
(b) If the takeover loses a relation, the lines set aside for it must come back, and a later release must find them by chain hash, not by that takeover's id (seeds 161, 100128).
(c) Only lines the previous host wrote are its tail; a device's own copy of a concurrent claim shares the same prefix hash but is not a tail (seed 117316).
Fix wording: set lines aside only for a takeover that is the resolved host entry or an ancestor of it; key set-aside lines by their chain, and give them back if the takeover is void; a tail is the lines the previous host's entry wrote. The store must remember which host entry each line arrived under (5.3 does not say so). Engineering.

**F6. Version ids are not stable, and the chain hash depends on the version id.** (5.3 Identity and The store; 5.4.)
Ids come from the winning and losing host entries, so they change whenever a third concurrent entry arrives or a takeover supersedes one side.
Trace S8 (2 events after the initial claims): three claims; a device sees two of them and shows version id A; when the third arrives the ids are different and A is gone. Trace S3: after the takeover, the chat id itself moves to the other side.
Evidence: a version id that appeared in some device's view is gone at the end in 1,504 of 20,000 runs with every other fix on, 1,110 of 20,000 with no removals at all, 486 of 4,374 in the T13 grid (literal).
Why it matters: 5.3 says `h[0] = SHA-256(version id ‖ segment)`, so every chain hash, every `claim.head`, and every `atHash` changes when the id changes; a `bound` runtime id and a version's stored lines are filed under an id that no longer exists. A removal can also void the entry an id came from after users have seen the second-version row (seed 91: the row appears, then vanishes).
Smallest fix: (1) `h[0]` from the chat id and segment only, never the version id; (2) the store keys lines by chain, and `decide` returns, per version, the host entries that define it, so an id change is a rename, not a new version; (3) decide's output carries `aliases` (old id to new id). Engineering. Which side keeps the chat id is arbitrary today (lower hosting-entry id); see section 5, item 4.

**F7. Cut-off, witness and removed signers.** (5.1 Roster; 6.2 `cutoff`, `witness`; walk-through D.)
(a) `cutoff.lines` and `witness.held.lines` are counts. A count of lines on one chain says nothing about a different chain, and `decide` cannot use it (my oracle first used it and produced false positives). Fix: carry a list `backed` of host-entry ids whose head lines the signer holds.
(b) A `relation` signed by a device that is later removed is void. If that device held the only copy of the longer side, nobody can rewrite it and the chat stays `pending` for ever. Trace S4 (4 events). Evidence: literal 781 of 20,000 end pending; reverting only the `backed` rule: 98 pending and 59 lost replies of 3,000. Fix: a removed device's host entry counts only if a remaining device vouches (`backed`) that it holds its head; otherwise it is void for hosting and its lines are void everywhere, as 5.1 already says.
(c) A witness has no `seen`, so it cannot be ordered against the removal of its own signer: a device being removed concurrently can vouch for the entries that remove it, and an iterate-until-stable implementation I wrote first did not converge on one trace (seed 5397); that code was replaced, so UNVERIFIED against the current code (`s5397.mjs` shows the single answer the fixed replay order now gives). Fix: make the witness an ordinary signed entry with `seen`; it is then cut off like any other entry of its signer. Fuzz result is equal with and without (3 lost replies in 20,000 either way; the witness-as-entry run also ends one chat pending), so choose it for principle (`results/fuzz-witnessentries-20000.txt`).
(d) A witness must be taken at the instant the device first holds the removal. Taken later, it vouches for entries received after learning (my first simulator did this and let a removed device launder entries). 5.1 implies it; state it.
(e) Transient flip. Trace S9: the phone removes the old laptop before it has seen that the laptop paired the tablet. The tablet's add is beyond the cut-off, so the tablet shows as "unknown" and its entries are void until the tablet reconnects and signs its witness; then they become valid. Void is therefore not monotone. Fix: say so, and let the list treat "not yet witnessed" as "checking" rather than gone (section 5, item 6).

**F8. Concurrent removals: two sentences of 5.1 contradict each other.** (5.1 Roster.)
"Removals from two devices at once both stand" versus "a removal voids what the removed device signs beyond the cut-off, including roster entries". In a chain (A removes B while B removes C) both cannot hold. In a cycle of three there is no consistent answer at all; with circular membership (a removal that voids the add of the device that signed the removal that voids it) there can be two. "The one in the set longer" is not defined without clocks.
Fix: replay removals in one fixed order: by (tenure of the signer, entry id), where tenure is the size of the causal past of the signer's own `add`. Each removal is accepted or dead at its turn and an accepted removal is final. A removal is dead if its signer is not a member at that point, or an earlier accepted removal of its signer does not exempt it. That covers the two-device rule and any longer cycle. Effect: in a chain, the removal by the already-removed device stands only if the other removal's cut-off covers it. A device you did not mean to remove can vanish; re-adding it (a fresh `add`) fixes it. Engineering, but see section 5, item 5.
Evidence: the replay gives a single answer on 40,000 removal-heavy runs (no non-convergence); 560 of 20,000 runs had concurrent removals both standing under it.

**F9. Residual (unresolved).** Three of 20,000 random runs (seeds 113098, 119382, 119763 under `--seed 100000`) still lose a reply, and one ends pending (105060 with `witnessEntries`). All four are a 46-event trace of mutual removal + a takeover by a device mid-removal + a restore; the shrinker cannot reduce them, so I could not isolate a cause. Reproduce: `node dump.mjs 113098 P3-reply-lost`.

**F10. `pending` has no way out for the user, and a takeover of a takeover while pending re-opens the question.** (5.4 Concurrent host entries; 2.7.)
Trace S5: a device holds two claims, holds neither longer copy, both holders are away. It shows the last known host, raises no notice, and Continue here cannot be offered, so the chat is stuck until a holder returns. Trace S15: a device that saw host D2 flips to `pending` when an unrelated older claim reaches it, and its Continue here attempt is refused; the relation the longer-copy holder eventually writes concerns only the entries that were tips at that time, so each further takeover on one side asks for a new relation (4 relation entries were written for one decision in S15, because every device that could wrote one).
I tried the obvious shortcut (a takeover naming every pending candidate as `parent`); it is **unsafe**: if the candidates' copies diverge, the old host of the diverged one can never release (3 of 1,000 runs lost a reply when tried, before the later simulator fixes). Not adopted.
Fix needs a decision (section 5, item 1); engineering side: only the author of the longer side's entry writes the relation (avoids duplicates).

**F11. `restored` names one `deleted` id.** (5.4 Deleted; 6.2.)
Trace S10: two devices delete at once, a third sees both and restores; `restored.deleted` names one id, the chat stays deleted. Evidence: literal 24 of 20,000; reverting only this fix 5 of 3,000. Fix: `restored` undoes every `deleted` in its own causal past (keep: a delete concurrent with the restore stays). Engineering.

**F12. Delete versus a second version the user never saw.** (5.4 Deleted; 2.1.)
Trace S6: a device deletes the chat before it has heard that a second, different copy exists. After the meeting, the first version is deleted and the second is live: a deleted chat comes back in the list. `deleted` is per version and 5.3 says deleting one version does not delete another. Delete concurrent with a takeover (S13) is fine: deleted wins and the tail goes with it, as 5.4 says. Needs Destin (section 5, item 2).

**F13. Concurrent `format` entries: the lower id wins, so the older minimum app version wins half the time.** (5.4 "latest wins".)
`results/format-coinflip.txt`: minimum version 1 versus 3 across 40 clock offsets: 1 won 21 times, 3 won 19. An older app may then open a chat in a newer format (T17). Fix: `format` takes the maximum of the concurrent entries and never goes down. Engineering. (Other attributes: concurrent renames or flags pick one arbitrarily but consistently, which is harmless.)

**F14. Clocks.** (5.2.) `decide` never reads `at` (scrambling every `at`, ids kept, never changed an output, 20,000 runs plus mid-run snapshots). But the id includes `at`, so which of two concurrent renames "wins" changes with the clock values; all devices still agree. Say so in 5.2 so nobody "fixes" it.

**F15. `decide` needs no line data, but three duties do, and 6.2 has an unused entry.** (S5 contract.)
Confirmed: the function takes only entries and roster. What depends on lines: writing `relation` (needs the chain hash at any head count, including evicted lines: 5.3 keeps chain values, good), writing `released` (needs the tail and the index of the last reply end in it), releasing on behalf of a removed device (needs to know which device wrote each line: not recorded in 5.3). The `version` entry in 6.2 is never written by any rule in 5.3 or 5.4 and `decide` derives versions without it; either give it a role (it is the natural home for F6's aliases) or delete it. The `segment`, `bound`, `knowing` and talk-only entries were not exercised.

**Ablation (3,000 seeds each, one rule put back to its literal reading; `results/ablation-3000.txt`):**

| Rule reverted | Failures that appear |
|---|---|
| loser release (F3) | 584 lost replies |
| on-behalf release by any holder (F3) | 2 lost replies |
| restore undoes all (F11) | 5 restore failures |
| `backed` (F7) | 98 pending, 59 lost replies |
| tips instead of seen-order (F1) | 1 lost reply (the split loss shows only in S3) |
| off-lineage losers (F3) | 6 lost replies |
| `owner` on release (F4) | 1 lost reply |
| maximal copies (F2) | 130 contradictions |
| everything on | 0 except version-id instability (F6) and 1 residual (F9) |

**Mapping of the cases you listed:**
Three or more concurrent host entries: F1, F2, F6. Takeover of a takeover while pending: F10 (S15). A `relation` by a device later removed: F7(b). Cut-off interplay with entries others built on: F7(c), (e), F8. `released` on behalf versus the device's own later `released`: F4, and the rule "the longest tail wins, ties by id; a removed device's own release counts only if inside the cut-off" (no conflict then; without it the result depends on which arrives last). Delete concurrent with takeover: S13 behaves as written; delete versus split: F12. Version ids when entries are later voided: F6. Chip switch racing a host-offline takeover: F3 (S7). Whether `decide` needs line data: F15.

## 4. What this changes in the design

All except the items marked * are invisible to users.

- **5.4 Order / Host / Concurrent host entries.** Replace "the latest hosts" with: *Host candidates are the valid host entries that no valid takeover names as its `parent` (the tips). A tip pair that is not parent-related needs a `relation`; until it exists the answer is `pending`. A copy is absorbed only by a copy it is a prefix of, or an identical one ranked higher (a ran-here `claim`, then the lower id); every copy that is not a prefix of another is its own version.* (F1, F2)
- **5.4 The takeover point and the tail.** Add: *Every device whose latest host entry is not on the winning lineage of its version appends `released` for that entry. `released` names `owner`. Any remaining device that holds a longer tail than the longest valid release for a removed device's entry appends another on its behalf; `decide` takes the longest tail, ties by id. Lines are set aside only for a takeover that is the resolved host entry or an ancestor of it, are found by chain hash, and go back if the takeover is void.* (F3, F4, F5)
- **5.3 Identity and The store.** *`h[0] = SHA-256(chat id ‖ segment)`. The store records which host entry each line arrived under. A version id is a label; `decide` returns the host entries that define it and an alias list, and the store re-keys on a change.* (F6, F15)
- **5.1 Roster.** *Removals are replayed in order of (tenure of signer, id); tenure is the size of the causal past of the signer's own `add`; an accepted removal is final. `cutoff` and `witness` carry `backed` (host entries whose head the signer holds), not only line counts. A witness is a signed entry with `seen`, taken when the device first holds the removal. A removed device's host entry counts only if a remaining device backs it.* (F7, F8)
- **5.4 Deleted.** *`restored` undoes every `deleted` in its own causal past.* (F11) **`format`**: *the highest of the concurrent values.* (F13)
- **5.2 Clocks.** Add one sentence: a tie broken by "lower id" depends on the clock text through the id, and that is fine. (F14)
- **6.2.** `released` gains `owner`; `takeover.parent` is required and may be null only for `host-removed` with no host entry left; `cutoff` and `witness` gain `backed`; `witness` gains `seen`; decide on `version` entry or delete it. **S5** gains: output also lists `relVoid`, `unbacked` and the expected releasers.
- **9, T12/T13 rows.** Add properties: "no finished reply that a remaining device holds is ever outside every version, a set-aside tail or a deleted chat" and "a version id shown at any time still exists at the end or has an alias". The T13 grid in `t13.mjs` is the executable form.
- *5.4 Pending / 2.7 notice table / F10, F12, F7(e) — need Destin; see below.*

## 5. Needs Destin

1. **A chat that cannot yet be decided ("pending").** Today: the chat keeps showing its last host, no notice appears, and you cannot tap Continue here. That can last until a particular device is switched on. Options: (a) leave it (simple; you may be stuck for days); (b) show "Checking with Desktop before this chat can move" and allow Continue here after a short wait, accepting that it may create a second version (recommend; keeps the promise that you can always continue); (c) always allow Continue here at once (fastest, most second versions). Recommend (b).
2. **Deleting a chat that secretly had a second version.** Today the first version is deleted and the second stays in your list. Options: (a) leave it (nothing you had not seen is ever deleted; a "deleted" chat can reappear); (b) delete it too (no surprise, but replies you never saw are removed). Recommend (a), with the row labelled so it does not look like a ghost.
3. **New place the "Two versions" row appears.** When you tap the chip while another device takes over from an older copy at the same moment, the other device's new reply used to be lost silently; now it becomes a second version. Recommend yes (keeps "never thrown away"); it only needs a yes.
4. **Which of two versions is "the original".** Today the one with the lower hidden id keeps the chat's name and place; that can switch sides when a third device reports. After the fix the id change is invisible, but the row that keeps the chat's name can still switch. Option: keep the version your device most recently ran as the main one (needs a display-only clock). Recommend leaving as is until it is seen to matter.
5. **Two removals at the same time.** If two devices each remove another at the same moment, a device you did not intend to remove can disappear until you add it again. Recommend accepting; very rare in life (it appeared in 560 of 20,000 stress runs, which are built to collide).
6. **After removing a lost device, another device can look "unknown" for a while.** If the device you used to remove it had not yet heard about a newer device, the newer one shows as unknown until it reconnects. Recommend showing "checking" for up to the 30-day window rather than hiding it.

## 6. Could not test here

- Real stores, signatures, SHA-256 chain on real files, real timing, Android, Windows, Mac: none. Signatures are a field; line replication is modelled as in-order prefixes.
- The keeper register, `knowing` forks, talk-only moves, segments, `bound`, multi-chat logs, key generations, the 30-day rules, and a device that never returns (tail stays `waiting`: not discarded, but not shown either; matches 5.4 and was not exercised).
- Not modelled: a device refusing a removed device's data as soon as it holds the removal (5.1); a removed-then-re-added device (rule implemented in `decide`, no events fuzz it: UNVERIFIED); lost messages other than by partition and partial sync.
- The simulator is my reading of the design. The fixes were checked only against my oracle; the oracle for "no reply lost" treats a reply held only by a removed device as void, as 5.1 says. Residual F9 is unexplained.
- Permutation invariance holds because `decide` sorts by id first; Phase 5 must keep that property in the real implementation (the permutation test is the guard).
