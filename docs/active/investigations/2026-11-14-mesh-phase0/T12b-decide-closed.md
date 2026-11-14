---
status: active
date: 2026-11-14
topic: Mesh sync Phase 0 — T12b: the "who hosts a chat" (`decide`) rules closed against the simulator; replacement text for design 5.4
---

# T12b: closing the `decide` rules

## 1. Verdict

**PASS on the numeric bar, in the simulator; PARTIAL on identifier stability; three decisions still need Destin.**

Pass line asked for: 0 lost finished replies in at least 200,000 random scenarios, 0 in the 4,374 systematic cases, no chat `pending` for ever, no contradictory relations.

| Run (final code, `results/`) | Scenarios | Lost replies | Pending for ever | Contradictory relations | Other property failures (agreement, order, clocks, restore, format, parked) |
|---|---|---|---|---|---|
| Old generator (3 to 5 devices) | 100,000 | **0** | 0 | 0 | 0 |
| Wide generator (2 to 5 devices, mutual removals, restores, deletes, chip switches) | 200,000 | **0** | 0 | 0 | 0 |
| Wide generator, then every removed or unknown device is re-added and everything re-settled | 40,000 | **0** | 0 | 0 | 0 |
| Takeover grid (`t13.mjs`) | 4,374 | **0** | 0 | 0 | 0 |
| The design text as written (`--literal`, old generator) | 20,000 | 4,114 | 781 | 882 | restore 24, format 410 |

So 340,000 random runs plus the grid: no reply lost, nothing pending at the end, no contradiction. Zero exceptions.

**Honesty notes that matter.**

1. The first three campaigns of this work were not clean (6 to 12 lost replies per 200,000 each time). Every residue was traced and fixed (section 3, F2); the table above is from the last code, and the last two fixes were found by the last two campaigns. A different generator could find another corner. Do not read "0" as "proven"; read it as "no reply lost in 340,000 runs designed to collide".
2. A version id that a device has shown **cannot be kept strictly unchanged** by any scheme (section 3, F3). What holds: no shown id becomes unresolvable except when the entry that defined it was itself cancelled or deleted.
3. Everything is judged by my own oracle on my own model of the design; real files, signatures and timing are not involved (section 6).

## 2. What was done

Everything is in `docs/active/prototypes/2026-11-14-mesh-phase0/T12b/` (copied from T12; T12 is untouched). `bash run-all.sh` reproduces every number here (about 30 minutes, at most 4 worker processes at a time).

| File | Role |
|---|---|
| `decide.mjs` | `decide(entries, roster, opts)`; T12's plus: stable ids with aliases, parents as a list, `role` on `released`, parent-owes-on-loss, highest `format`. Every new rule is an `opts` switch so it can be put back. |
| `sim.mjs` | The device simulator, with the new duties and a wider generator (`--wide`: 2 to 5 devices, a "mutual removal" event, more deletes, restores, takeovers, chip switches); oracle properties P1 to P10 and the id properties P7*. |
| `profiles.mjs` | `FIXED` (all new rules on), `LITERAL` (design text), `--revert key`, `--only key` (T12 baseline plus exactly one new rule). |
| `fuzz.mjs`, `par.sh` | Seeded runs; `par.sh N seed [args]` runs N scenarios on 4 workers and merges the tallies. `--wide`, `--readd`. |
| `shrink.mjs`, `dump.mjs`, `why.mjs`, `trace.mjs` | Shrinker; print a minimised case; explain a vanished id; print every device's lines after each event. |
| `seeds3.sh`, `seed-ablation.sh`, `coverage.mjs`, `fmt.mjs`, `t13.mjs` | Single-rule check of the three seeds; per-seed rule ablation; what the generator really produced; the format check; the 4,374-case grid. |
| `results/` | Raw output of every number below. |

Harness self-test (so a zero means something): putting the wall clock into the tie-break fails the clock property in 43 of 500 runs; replacing the sort-by-id with arrival order fails agreement in 72 and permutation in 57 of 500 (`results/mutation-*.txt`). Putting the old "latest wins" format rule back fails the format property in 1,025 of 20,000 wide runs (`results/ablation-wide-20000.txt`).

New oracle properties and what they mean: **P3** no finished reply held by a device that is a member at the end is outside every version, set-aside tail or deleted chat (a device whose own entry is cancelled, or not yet known, is not "remaining"; with `--readd` they are re-added first); **P7** every version id that any device showed still resolves at the end (as a current id or an alias), unless its defining entry was cancelled or deleted (counted separately); **P9** nothing `pending` at the end; **P10** `format` is the highest value.

## 3. Findings

### F1. The three unexplained seeds (item 1)

The previous report said all three were "mutual removal + takeover + restore". That is wrong; they are two different mechanisms, and both shrink to 4 to 6 events (`results/three-seeds.txt`, `results/three-seeds-single-rule.txt`).

**Seeds 113098 and 119763 (same mechanism; 4 and 5 events).** Shrunk sequence for 113098 (device numbers 0, 1, 2):
`d2 writes 3 lines incl. a finished reply` → `d0 removes d2` → `d1 copies d2's lines` → `d1 removes d0`.
Plain steps: d0 introduced d1 and d2 and hosted the chat. d2 had its own copy of the chat and claimed it. d0 removed d2, and at the same moment d1 removed d0 (d1 only knew d0's first act, adding d1). d1's removal cancels everything d0 did after adding d1: d0's claim and d0's adding of d2. With d2's add cancelled, d2 is "unknown" and its claim is not read. Now the chat has **no valid claim at all**, so it has no host and nothing says who may continue. d1 holds d2's finished reply (it copied it before knowing) but no version contains it.
Closed by **D9** (rule 9: a member holding lines for a chat with no valid host entry writes a claim). Proof it is that rule alone: with the T12 baseline plus only D9, both seeds are clean; with every other new rule and not D9, both fail.

**Seed 119382 (6 events).** `d0 writes a reply (6 lines)` → `d0 copies to d1` → `d1 takes over by chip` → `d2 removes d1` → `d1 writes` → `d2 and d0 exchange entries`.
Plain steps: d1 took over from d0 (chip). d2, which holds a longer older copy of its own, removed d1 before hearing of the takeover, so the takeover is cancelled; d2's longer claim wins over d0's, so d0's claim loses and d0 owes a record of its own extra lines. But d0 had copied one line written by d1 on top of its own two lines. The old code judged "are these lines mine" from the **last** line only, found d1's, and wrote an empty tail: d0's finished reply was discarded.
Closed by **D10d** (a device's tail is its lines after the point **up to its own last line**). With T12 baseline plus only that change, clean.

### F2. What the wider generator found, one rule each (all engineering)

`D<n>` below means rule `<n>` (or `<n><letter>`) in section 4.1.

Each row is a real failure seen in a campaign; "alone" means the rule is what removes it when the other new rules are off or on (`results/seed-ablation.txt`, `ablation-wide-20000.txt`). Several failures are masked by neighbouring rules when only one is reverted, which `seed-ablation.txt` shows honestly ("clean" after reverting a single rule).

| Rule | Failure it closes (seed) |
|---|---|
| D4 a takeover also names the author's own host entries that are still tips | A device's later takeover and its own earlier claim competed as two versions of one author; its own finished reply went to a half-set-aside run (125960). |
| D10c `released` carries `role` (`self` / `parent`) | With D4 one device owes two tails for one takeover; a 0-line parent tail was read as the real own tail (114235). Reverting just this brings the loss back. |
| D10a parent of a *losing* takeover still owes its tail | A takeover that lost to a prefix copy hid the split it had cut; second version forgotten (100314). Reverting just this: 9 of 20,000 wide runs show a vanished id. |
| D10d tail = old-era lines for the parent, new-era lines for a losing author | A device's newer lines were released as its old tail, or its old run as its new one (1133515, 172735). Reverting just this brings the loss back. |
| D11b set aside only for a takeover on the winning lineage | Two devices moved their own finished lines aside for a takeover that was `unbacked`; the relation needing them could never be written; chat pending for ever (111374). Reverting just this: pending returns. |
| D11c never overwrite a set-aside run | A 1-line set-aside replaced the 7-line one holding a finished reply (149748). |
| D11d set-aside is reversible | A takeover cancelled for a while (removal not yet witnessed), then valid again, never got its own lines back (108767); lines set aside for a takeover that later became unbacked, unknown, pending or off-lineage never returned (1071905, 1164672; pending for ever in 1008399, 1034646). Reverting just this: 3 lost replies + 2 pending at the seeds. |
| D11e a host never copies lines onto its own chain; reconcile after copying | A taker at point 0 re-copied the old host's lines under its fresh chain and then wrote on them (1144542, 1193904, 1094913). Reverting just this brings the loss back. |
| D12 a device copies lines only from a peer that is a member in its own view | A device copied a finished reply from a not-yet-known device whose claim then stayed unread (307854). 5.2 already says peers are checked; the old simulator did not. |
| D15 a device writes each release once per (takeover, owner, length) and one orphan claim per copy | A release that others saw cancelled was re-written every round; the system never settled (311707). |

### F3. Version ids (item 3)

Design: **D8**. In one line: the main version is called by the chat id as today; every other version is `SHA-256(chat id ‖ "v" ‖ the lowest ROOT id in its cluster)`; a root is a host entry with no parent (a claim, or a null-parent takeover); every root also names its cluster for ever as an alias `SHA-256(chat id ‖ "v" ‖ root)`; tail versions stay `SHA-256(chat id ‖ takeover id ‖ "tail")`. The chain hash in 5.3 changes to **`h[0] = SHA-256(chat id ‖ segment)`** (the version id is removed from it), so a re-named version keeps every line hash, every `claim.head` and `atHash`; the store keys lines by chain and re-keys a version when `decide` says its id changed.

Measured on the final code, on the wide generator (200,000 runs; the old generator and the re-add runs are in `results/`):

| Outcome for a version id that some device showed | Runs |
|---|---|
| Still a current id at the end | all others |
| No longer current, but the alias names the same version (merged into another, or the chat-name row switched sides) | 3,218 |
| Its defining entry was cancelled by a removal's cut-off (or its signer is not yet known): the row legitimately disappears | 7,291 |
| A tail version whose chat was deleted afterwards | 249 |
| A tail version whose winner was later cancelled, so the lines are the host's own again | 91 |
| **Unresolvable for any other reason** | **0** |

So **"0 changes after first observation" is not achievable and I am not claiming it.** The reason, in one example: two devices claim the chat without having heard of each other, each shows "its" version; later they meet and one copy turns out to contain the other. Whatever name each used cannot both remain the current one. What is achievable, and what the aliases give: every id that was shown keeps meaning the same version or the version it was merged into. Without the new scheme 1,212 of 20,000 wide runs end with a shown id that resolves to nothing (`ablation-wide-20000.txt`, "revert stableIds"). Roots must be followed through **every** known entry, including cancelled ones, and through **all** parents of a takeover (two simulator failures taught that).

One known residue by design: the row that keeps the chat's name (the "main" version, the one with the lowest root) can still switch sides when an older copy arrives later (round-15 item 4 in T12). Only the label moves; ids and lines do not.

### F4. The other holes from the T12 report (item 4)

| Hole | Status | By |
|---|---|---|
| A later takeover that saw two diverging claims erases the second version | **Fixed** for the lines: the second version's finished lines now always survive as a tail version; the split row itself can still be merged into the main row when the takeover is at a point both copies share (3,218 alias cases above). | D3 tips, D10a |
| A losing host entry owes no `released` | **Fixed**; also the author-is-its-own-parent case | D10a, D4, D10c |
| A `relation` by a later-removed device leaves the chat pending for ever | **Fixed**; 0 pending in 340,000 runs. Reverting the backing rule brought pending back in T12. | D5 |
| Concurrent removals contradict (two sentences of 5.1) | **Engineering closed, decision still open.** The fixed replay order gives one answer in every run (0 non-convergence; 0 runs where both of two mutually removing devices stand in 20,000 wide runs); which device you did not mean to lose is the user-visible choice still waiting (T12 item 5, round-15 P-10). | D2 |
| `restored` names only one `deleted` | **Fixed**; the literal text fails 24 of 20,000. | D13 |
| Concurrent `format` entries: older minimum can win | **Fixed** here (it was only proposed in T12): highest value wins, never down. Literal rule: 410 of 20,000 fail the check. | D14 |
| Chat `pending` has no way out for the user (F10) | **Still open, needs Destin** (T12 item 1). The simulator keeps `pending` as written; a device refuses to take over a pending chat. | none |
| Delete versus a second version the user never saw (F12) | **Still open, needs Destin** (T12 item 2). | none |

### F5. Assumptions the zeros rest on (so a builder knows what to keep true)

1. **Per-line provenance.** The store records which device wrote each line (5.3 must say this; T12 F5 and F15 asked for it). D10, D11 and D12 depend on it.
2. **A device answers "is my copy a prefix of that version" from 5.3's ask-a-peer protocol.** The simulator reads the answer from the world; the `adoptClaim` extension (a re-added device claims what it holds) is only used in the `--readd` runs and is not part of the rules below.
3. **A member never copies lines from a device it does not yet see as a member** (D12). With this off, seed 307854 loses a reply again (`seed-ablation.txt`).
4. **`decide` still sorts by id first** (T12); the permutation test is the guard.

## 4. What this changes in the design

### 4.1 Replacement text for the `decide` part of 5.4

Replace everything from "**`decide(entries, roster)`**" down to the line before "**Reserving the host role.**", and the "PENDING (T12b ...)" block above it, with the text below. `[=]` unchanged from the current design, `[T12]` already proposed in `T12-T13-decide.md`, `[NEW]` first proposed here. The last column of section 3 F2 names the failing run behind each `[NEW]`.

**`decide(entries, roster)`**: pure; the same answer for the same entries in any order and any duplication; no clock is read (an entry's time is display only). It sorts entries by id first; output per chat: versions, the main version, aliases, tails, `pending`, parked entries.

1. **Order.** [=] An entry that had seen another is later; otherwise concurrent. Entries whose author is not yet known to the roster are parked, not dropped; a parked entry applies as soon as its author is known.
2. **Void and the roster.** [T12] Removals are replayed in the order (tenure of the signer, entry id), tenure being the size of the causal past of the signer's own `add`; an accepted removal is final. A removal is dead if its signer is not a member at its turn, or an earlier accepted removal of its signer does not exempt it. An entry signed by a removed device is void unless it lies inside the cut-off, which is the causal past of the removal's `lastEntry` and of every valid `witness` of it. A witness is an ordinary signed entry with `seen`, taken at the moment the device first holds the removal. Void is not monotone (an unwitnessed device can become valid later); a device can list such an entry as "checking".
3. **Host candidates (tips).** [T12] The host entries (`claim`, `takeover`) that are valid and that no valid takeover names as its `parent` are the tips. `parent` is a list. A tip signed by a removed device counts only if some remaining device vouches in the cut-off or a witness (`backed`) that it holds that entry's head lines; otherwise it is *unbacked*: not a candidate, and no device sets lines aside for it.
4. **Takeover parents.** [NEW] A takeover names, as `parent`, the host entry it takes over **and** every host entry written by its own device that is still a tip. `parent` is empty only for a takeover of a chat whose host entries are all gone (rule 9).
5. **Relations.** [T12] Each pair of tips not related by `parent` needs a `relation` (`prefix`, `identical` or `differ`; T21: compared by conversation chain, extra bookkeeping lines count as a prefix). Until every pair has one the chat is `pending`; the chat shows its last known host, a message typed there goes to that host if reachable, and no notice is raised. Only the author of the longer copy's entry writes it.
6. **Clusters.** [T12] A copy is absorbed only by a copy it is a prefix of, or by an identical one ranked higher (a `claim` marked ran-here, then the lower id). Every copy that is not a prefix of another is its own version. (A prefix is not transitive across versions.)
7. **Host.** [=] The host of a version is the device of its winning host entry. If that device is removed the version has no host and any device may take over.
8. **Version ids.** [NEW] The main version (the cluster with the lowest root) is the chat id. Another version's id is `SHA-256(chat id ‖ "v" ‖ lowest root id of its cluster)`. A root is the host entry reached by following `parent` links through every known entry, valid or not; an unknown parent id is itself a root; a takeover with several parents has the union of their roots. Every root `r` names its cluster for ever as `SHA-256(chat id ‖ "v" ‖ r)`; `decide` returns this as `aliases`. A tail version is `SHA-256(chat id ‖ takeover id ‖ "tail")`; a deliberate fork is `SHA-256(chat id ‖ fork entry id)` as before. An id whose defining entry is itself void disappears; that is the only way a shown id can stop resolving.
9. **A chat with no valid host entry.** [NEW] A member that holds lines for the chat (and the chat is not `pending`) appends a `claim` (not ran-here) for the copy it holds, once per distinct copy. Several members may do so; rules 5 and 6 settle them. (Seeds 113098, 119763.)
10. **The tail and who owes it.** `released {takeover, role, owner, tailLines, tailHash, lastReplyEndInTail}`; keyed by (takeover, owner, role); several valid ones for one key: the longest tail wins, ties by lower id; a removed device's own release counts only if inside its cut-off.
    - a. [NEW, T12 F3 widened] For **every** valid takeover, winning or losing, the author of each parent entry owes `role: parent` for the lines it wrote before the takeover point and beyond it. Every device whose latest host entry is not on the winning lineage of its version owes `role: self` for the lines it wrote under that entry beyond its head.
    - b. [T12] If the owner is removed, any remaining device that holds a longer tail appends a release on its behalf.
    - c. [NEW] `role` distinguishes the two tails one device can owe for one takeover (rule 4 makes this common).
    - d. [NEW] The tail is the lines after the point **up to and including the owner's last own line** (per-line provenance). For `role: parent` it is the lines written before that takeover; for `role: self` the lines written under the losing entry. Of several runs a device holds, the one with the most such lines is used.
    - A tail with a finished reply becomes a second version (`SHA-256(chat ‖ takeover ‖ "tail")`); only an unfinished reply is set aside (the retention rules of 5.4 stay). An unfinished/finished classification fails toward finished.
11. **Setting lines aside.** Lines beyond a takeover point that belong to an older era are set aside on a device only when
    - a. [=] the takeover is valid and the device is not its author;
    - b. [T12] the takeover is on the winning lineage (the resolved host entry or an ancestor of it) — never while the chat is `pending`;
    - c. [NEW] nothing already set aside is overwritten (the longer of two prefix-related runs is kept; unrelated runs are both kept);
    - d. [NEW] it is reversible: whenever the decision changes (the takeover turns void, unbacked, unknown, pending, off-lineage, or valid again) the lines go back to where they belong, and the author's own lines under a void takeover stay with the author's entry. Lines after the point that came from elsewhere stay in the chain;
    - e. [NEW] the host of a version never copies another device's lines onto its own chain, and every copy of lines is followed by a reconcile before the next write.
12. **Copying lines.** [=, enforced] A device copies lines only from a peer that is a member in its own view. Control entries are exchanged regardless.
13. **Deleted.** [T12] Per version. `restored` undoes every `deleted` in its own causal past; a delete concurrent with a restore stays. Tails of a deleted version go with it.
14. **Name, flags, talk-only, segment.** [=] The latest entry of that kind; concurrent ones, the lower id. **Minimum app version (`format`)** [NEW]: the highest of all valid values; it never goes down.
15. **Duties are written once.** [NEW] A device writes at most one release per (takeover, owner, role, tail length) and one rule-9 claim per distinct copy, even when other devices see its entry as void.

### 4.2 Other sections

- **5.3 Identity.** Replace the second bullet ("Other ids are computed ...") with rule 8 above. Replace `h[0] = SHA-256(version id ‖ segment)` with `h[0] = SHA-256(chat id ‖ segment)`. Add: the store records, per line, which device wrote it and under which host entry; it keys lines by chain, and re-keys a version when `decide` renames it.
- **5.1 Roster.** Rule 2 above (replay order, `backed`, witness as an entry); 5.1 keeps its text on keys, pairing and the 30-day offer.
- **5.2.** One sentence: a tie broken by "lower id" depends on the clock text through the id, and that is fine.
- **6.2.** `released` gains `owner` and `role`; `takeover.parent` becomes a list; `claim` may be written by a member for rule 9; `cutoff` and `witness` gain `backed` and `witness` gains `seen`; decide on the unused `version` entry (it is the natural home for `aliases`) or delete it.
- **9, T12/T13 rows.** Add: "no finished reply a remaining member holds is outside every version, set-aside tail or deleted chat", "a shown version id still resolves or its defining entry is void", and "`format` is the highest value". `t13.mjs` and `run-all.sh` are the executable forms.

## 5. Needs Destin

### 5.1 Rule changes a user can see (plain words)

1. **"Two versions" shows up in more situations.** Before, a finished reply could silently vanish when two devices raced (tapping Continue here while another device took over from an older copy; or a newer takeover covering up a split). Now that reply appears as a second version row. Recommend yes: it keeps "never thrown away". Needs a yes.
2. **A chat whose only host record was cancelled gets a new home.** If a device that introduced others was removed early, a chat could end up with nobody allowed to continue it. Now the device that holds the most recent copy quietly becomes its host and the chat shows "on that device". Recommend yes; the alternative is a chat nobody can continue. Needs a yes.
3. **A second-version row can disappear.** If the device that made the only copy of a second version is removed before anyone else received its lines, that row goes away (its record is cancelled by the removal). This was already so in T12; stated here because it was measured in 7,291 of 200,000 stress runs. Needs the removal screen to say so (5.1 already plans that).
4. **Which row keeps the chat's name can still switch** when an older copy turns up later. Only the name and place move; nothing is lost. Same as T12 item 4; no change proposed.
5. **A device is not copied from until it is a trusted member.** A freshly added device whose introducer was removed before the others heard of it shows "checking" and its chats are not copied until it is added again. Already written in 5.2; made strict. Needs the "checking" wording (round-15 C-13).
6. **Chats can require a newer app slightly more often.** Two devices setting the minimum app version at the same time now always give the higher one, so an older app is told to update instead of opening a chat it may misread. Mention in one line.

Still waiting for a decision from before (nothing changed by this work): what a user can do with a chat that is `pending` (T12 item 1), deleting a chat that secretly had a second version (T12 item 2), and which device vanishes when two remove each other at once (T12 item 5 / round-15 P-10).

### 5.2 Pure engineering (no user-visible effect)

Rules 3, 4, 5 (who writes a relation), 6, 8 (ids; the user sees no ids), 10b, 10c, 10d, 11, 12 (already stated in 5.2), 13 (restore, as T12), 15; `h[0]`; per-line provenance; `role`/`owner`/`parent` list.

## 6. Could not test here

- Real stores, signatures, SHA-256 chains over real files, real timing, Android, Windows, Mac, a keeper or relay. Signatures are a field; lines are modelled as in-order runs with an author.
- **Scenario classes the generators do not produce:** more than one chat; segments; talk-only moves; the keeper register; key generations; the 30-day and 90-day rules; a device that never returns (its tail stays "waiting" and was not exercised); writes by non-hosts (terminal use, T3 F11 interleaved lines); a re-paired device whose data survived (only the `--readd` shape of it); a takeover while the chat is `pending` (the simulator refuses it, as the design does today); the chain-comparison of T21 (copies are modelled as exact prefixes); loss of a single message other than by "each sync passes 30%, 70% or 100% of what the sender holds, with duplicates and shuffled order" and by partitions; clock skew beyond five fixed offsets (0, +1 day, +30 days, -1 day, +5 days).
- **What the generator really produced** (`results/coverage-wide.txt`): 50,000 runs each at 2, 3, 4 and 5 devices; on average 54 events per run (about 2.6 million syncs, 0.7 million removals, 0.4 million mutual removals, 0.3 million deletes and 0.3 million restores, 1.6 million takeovers of which 0.65 million chip). In the first 20,000: 17,808 end with a removed device, 16,868 contain a mutual removal, 13,809 a delete, 4,429 a restore, 3,312 more than one version, 1,781 a tail version, 14,629 were `pending` at some moment, 10,339 had parked entries at some moment. **Only 1,976 of 20,000 runs end with a takeover entry** (a takeover needs a device holding lines at that moment), which is why the 4,374-case grid exists and why the takeover rules above are the thinnest-tested part.
- The oracle treats a reply held only by a removed device, or only by a device the roster does not know, as void (5.1). The `--readd` runs check what happens when those devices are re-added.
- The simulator is my reading of the design, and the rules were tuned until my oracle was quiet. Several rules (D11c, D11e) are justified by one to three seeds each; reverting a single rule at 20,000 wide runs mostly shows nothing (`ablation-wide-20000.txt`), because their failures are rare and neighbouring rules overlap. `seed-ablation.txt` shows which seeds each rule rescues and which ones another rule also covers.
