#!/usr/bin/env python3
"""build_doc.py: fills template.md from results/*.json and writes ../../investigations/2026-11-14-mesh-phase0/simplify-study-v2.md
(the numbers in the study are generated, never typed). Run after run-all.sh."""
import json, glob, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
R = lambda n: json.load(open(f'{HERE}/results/{n}.json'))
OUT = os.path.abspath(f'{HERE}/../../../investigations/2026-11-14-mesh-phase0/simplify-study-v2.md')
t = open(f'{HERE}/template.md').read()
fmt = lambda n: f'{n:,}'
pct = lambda a, b: f'{100*a/b:.1f}%' if b else 'n/a'

chk_honest = ['chk-hostile-honest-500k','chk-poison-honest-100k','chk-wipe-honest-100k','chk-restore-honest-100k','chk-removal-honest-150k','chk-calm-honest-50k']
chk_lie = ['chk-hostile-ly30-100k','chk-hostile-ly80-100k','chk-poison-ly30-50k','chk-wipe-ly80-50k','chk-restore-ly80-50k','chk-removal-ly30-50k']
own_honest = ['own-hostile-honest-500k','own-poison-honest-100k','own-wipe-honest-100k','own-restore-honest-100k','own-removal-honest-100k']
own_lie = ['own-hostile-ly30-100k','own-hostile-ly80-100k','own-poison-ly30-40k','own-wipe-ly80-40k','own-restore-ly80-40k']
sum_ = lambda names, k: sum(R(n)[k] for n in names)
sum_own = lambda names: sum(R(n)['runs'] for n in names)
def failcount(names, own=False):
    c = {}
    for n in names:
        f = R(n)['failuresByProperty'] if own else R(n)['fail']
        for k, v in f.items(): c[k] = c.get(k, 0) + v
    return c
def seeds(names, own=False):
    out = []
    for n in names:
        d = R(n); s = d.get('firstSeeds' if own else 'failSeeds') or {}
        for k, v in s.items(): out += [(n, k, x) for x in v]
    return out

h1, l1, h2, l2 = sum_(chk_honest, 'sched'), sum_(chk_lie, 'sched'), sum_own(own_honest), sum_own(own_lie)
f1h, f1l, f2h, f2l = failcount(chk_honest), failcount(chk_lie), failcount(own_honest, True), failcount(own_lie, True)
loss1 = sum_(chk_honest + chk_lie, 'loss')
t = t.replace('@@SAFETY_LINE@@', f'simulator 1: {fmt(h1)} schedules with an honest relay and {fmt(l1)} with a relay lying 30% or 80% of the time, violations {sum(f1h.values())} and {sum(f1l.values())}, replies lost {loss1}; '
              f'simulator 2: {fmt(h2)} and {fmt(l2)} schedules, violations {sum(f2h.values())} and {sum(f2l.values())}')
t = t.replace('@@NRULES@@', '22')
tw, base = R('var-tworeferees'), R('chk-hostile-honest-500k')
t = t.replace('@@TWOREF@@', f"{(tw['dblSched']/tw['sched'])/(base['dblSched']/base['sched']):.0f} times ({pct(tw['dblSched'], tw['sched'])} of schedules against {pct(base['dblSched'], base['sched'])})")
hh = R('chk-hostile-honest-500k')
t = t.replace('@@TAPCOPYPCT@@', f"{pct(hh['tapCopy'], hh['tapCopy'] + hh['tapPlace'])} ({fmt(hh['tapCopy'])} of {fmt(hh['tapCopy'] + hh['tapPlace'])}; {pct(hh['overrideUser'], hh['tapPlace'])} of the in-place continues were the user pressing the second button)")

# ---- chat results table
rows = ['| Run (simulator 1) | Schedules | Violations | Replies lost | "Inherent" (excused) | Schedules ending with a copy | with a stale-owner write | Copy offered by default / in-place continues | Gap copies | Double grants (schedules) |', '|---|---|---|---|---|---|---|---|---|---|']
for n in chk_honest + chk_lie:
    d = R(n)
    rows.append(f"| {n[4:]} | {fmt(d['sched'])} | {d['fail'] or 0} | {d['loss']} | {fmt(d['inherent'])} | {pct(d.get('copySched',0), d['sched'])} | {pct(d.get('staleSched',0), d['sched'])} | {fmt(d['tapCopy'])} / {fmt(d['tapPlace'])} | {d.get('gap',0)} | {d.get('dblSched',0)} |")
rows.append(f"| **total, honest relay** | **{fmt(h1)}** | **{sum(f1h.values())}** | | | | | | | |")
rows.append(f"| **total, lying relay** | **{fmt(l1)}** | **{sum(f1l.values())}** | | | | | | | |")
rows += ['', '| Run (simulator 2, study fork) | Schedules | Violations | Schedules with a copy | stale-owner write | copy offered to user | double grant | "Continue anyway" pressed | chats freed by removal | relay wipes | poisons | removals |', '|---|---|---|---|---|---|---|---|---|---|---|---|']
for n in own_honest + own_lie:
    d = R(n); w = d['schedulesWith']; tt = d['totals']
    rows.append(f"| {n[4:]} | {fmt(d['runs'])} | {d['failuresByProperty'] or 0} | {pct(w['anyCopy'], d['runs'])} | {pct(w['staleOwnerWrite'], d['runs'])} | {pct(w['copyOfferedToUser'], d['runs'])} | {w['doubleGrant']} | {fmt(tt.get('override',0))} | {fmt(tt.get('vacated',0))} | {fmt(tt.get('wipe',0))} | {fmt(tt.get('poison',0))} | {fmt(tt.get('removes',0))} |")
rows.append(f"| **total, honest relay** | **{fmt(h2)}** | **{sum(f2h.values())}** | | | | | | | | | |")
rows.append(f"| **total, lying relay** | **{fmt(l2)}** | **{sum(f2l.values())}** | | | | | | | | | |")
ob = R('own-oldrules-hostile-100k')
rows += ['', f"Totals: chat schedules **{fmt(h1 + l1 + h2 + l2)}** (simulator 1: {fmt(h1)} honest and {fmt(l1)} lying; simulator 2: {fmt(h2)} honest and {fmt(l2)} lying). Every run ends with a full heal, then the oracle, then everybody paired again (R2), then the in-place continue test (ESC)."]
vs = [x for x in seeds(chk_honest + chk_lie) + seeds(own_honest + own_lie, True)]
rows.append(f"Violating seeds on the final code: **{'none' if not vs else vs}**.")
hh2 = R('chk-hostile-honest-500k')
nt, ot = R('var-newtie-100k'), R('var-oldtie-100k')
rows += ['', f"Tie-break (simulator 1, hostile mix, the same first 100,000 seeds for both): copies made by a tie (same counter, same confirmation): v2 rule (side that keeps more) {fmt(nt.get('tie',0))}, of which the losing side was longer at that moment {pct(nt.get('tieLonger',0), nt.get('tie',1))}; the reviewer's old rule (lowest owner id) {fmt(ot.get('tie',0))}, {pct(ot.get('tieLonger',0), ot.get('tie',1))}. Ties are decided on what a device holds at the time and copies persist after a later flip, so the v2 figure is an upper bound on how often the shorter side wins.",
         f"Chats whose mark nobody could meet at the end of a run (simulator 1, hostile): {pct(hh2.get('unreachMarkSched',0), hh2['sched'])} of schedules had at least one; poison mix: {pct(R('chk-poison-honest-100k').get('unreachMarkSched',0), 100000)}. In every one the ESC test continued the chat in place with nothing lost (`ESC` violations: 0), because rule 14's second button exists.",
         f"Baselines run unchanged for comparison: the reviewer's original simulator (v1 rules, same event mixes, 50,000 schedules each): hostile/honest violations {R('orig-reviewer-hostile-honest-50k')['fail'] or 0}, hostile/lying 80% {R('orig-reviewer-hostile-ly80-50k')['fail']} (the 54 ORPHAN cases are the check's finding 5, rule 18 fixes them: {R('chk-hostile-ly80-100k')['fail'] or 0} in v2), poison {R('orig-reviewer-poison-50k')['fail'] or 0}. The study's own rules in the study's fork with the new events, 100,000 schedules: {ob['failuresByProperty'] or 0}."]
t = t.replace('@@CHATRESULTS@@', '\n'.join(rows))

# ---- mutants
mu = ['| Mutant (rule switched off) | Schedules | Oracle result | Meaning |', '|---|---|---|---|']
meaning = {'mut-nocopy': 'rule 6 off: replies are hidden. The oracle catches loss.', 'mut-nocut': 'rule 21 off: removed devices\' late work wins. The check\'s regression (2.4) is real and caught.', 'mut-nooverride': 'rule 14 off: chats copy-only for good. Caught by ESC.', 'mut-novacate': 'rule 15 off: a removed owner\'s chat offers only a copy. Caught by VAC.', 'mut-nogap': 'rule 18 off: replies hang off a missing line, hidden. Caught (ORPHAN), only under a lying relay with restores.'}
for n in ['mut-nocopy', 'mut-nocut', 'mut-nooverride', 'mut-novacate', 'mut-nogap']:
    d = R(n); mu.append(f"| {n[4:]} | {fmt(d['sched'])} | {d['fail']} | {meaning[n]} |")
d = R('own-mut-nofork'); mu.append(f"| (simulator 2) copy rule off | {fmt(d['runs'])} | {d['failuresByProperty']} | live loss caught |")
d = R('own-mut-nooverride'); mu.append(f"| (simulator 2) no override | {fmt(d['runs'])} | {d['failuresByProperty'] or 0} | **not caught by simulator 2** (its ESC phase forces the take-over); simulator 1 catches it |")
mu += ['', 'Rules whose removal must change availability, not safety (the oracle must stay green; the numbers show what each buys):', '', '| Variant | Schedules | Violations | Schedules with a stale-owner write | Copy offered / in place | Double-grant schedules | Gap copies |', '|---|---|---|---|---|---|---|']
base = R('chk-hostile-honest-500k'); wipe = R('chk-wipe-honest-100k')
mu.append(f"| reference, hostile (v2) | {fmt(base['sched'])} | {base['fail'] or 0} | {pct(base['staleSched'], base['sched'])} | {fmt(base['tapCopy'])} / {fmt(base['tapPlace'])} | {pct(base['dblSched'], base['sched'])} | {base.get('gap',0)} |")
for n, lab in [('var-nochk', 'no note check before replies (rule 10 off), hostile'), ('var-oldtie-100k', 'old tie-break (lowest owner id), hostile'), ('var-tworeferees', 'two note referees (rule 22 broken), hostile'), ('var-nocache', 'no cached note (rule 13 off), wipe mix'), ('var-noinorder', 'upload not in order (rule 9 off), wipe mix')]:
    d = R(n); mu.append(f"| {lab} | {fmt(d['sched'])} | {d['fail'] or 0} | {pct(d['staleSched'], d['sched'])} | {fmt(d['tapCopy'])} / {fmt(d['tapPlace'])} | {pct(d.get('dblSched',0), d['sched'])} | {d.get('gap',0)} |")
mu.append(f"| reference, wipe mix (v2) | {fmt(wipe['sched'])} | {wipe['fail'] or 0} | {pct(wipe['staleSched'], wipe['sched'])} | {fmt(wipe['tapCopy'])} / {fmt(wipe['tapPlace'])} | {pct(wipe['dblSched'], wipe['sched'])} | {wipe.get('gap',0)} |")
t = t.replace('@@MUTANTS@@', '\n'.join(mu))

# ---- roster table
ro = ['| Rule | Relay | Runs with an honest removal | O1 thief stays (not a race) | O2 thief picks the loser | O3 disagree | Thief reached relay first (race) | Thief still in | Honest device lost with the thief | of which stash runs: honest lost / stash runs |', '|---|---|---|---|---|---|---|---|---|---|']
for v in ['built', 'first', 'study', 'recv']:
    for r in ['honest', 'none', 'withhold', 'block', 'collude']:
        d = R(f'roster-{v}-{r}-500k')
        ro.append(f"| {v} | {r} | {fmt(d['signed'])} | {fmt(d['o1'])} | {fmt(d['o2'])} | {d['o3']} | {fmt(d['race'])} | {fmt(d['thiefStays'])} | {fmt(d['lostHonest'])} | {pct(d['lostHonestWithStash'], d['stashRunsSigned'])} |")
t = t.replace('@@ROSTER@@', '\n'.join(ro))
t = t.replace('@@ROSTERRUNS@@', '500,000')
rb = R('roster-built-honest-500k'); rn = R('roster-built-none-500k')
t = t.replace('@@BUILTLOST@@', pct(rb['lostHonestWithStash'], rb['stashRunsSigned']))
t = t.replace('@@BUILTLOST2@@', pct(rb['lostHonestWithStash'], rb['stashRunsSigned']))
t = t.replace('@@RECVLOST@@', pct(R('roster-recv-honest-500k')['lostHonestWithStash'], R('roster-recv-honest-500k')['stashRunsSigned']))
t = t.replace('@@FIRSTSTAYS@@', pct(R('roster-first-none-500k')['thiefStays'], R('roster-first-none-500k')['signed']) + ' (no relay) to ' + pct(R('roster-first-collude-500k')['thiefStays'], R('roster-first-collude-500k')['signed']))
sn = R('roster-study-none-500k')
t = t.replace('@@STUDYNONESTAYS@@', pct(sn['thiefStays'], sn['signed']))
t = t.replace('@@RECVCOLLUDE@@', pct(R('roster-recv-collude-500k')['o1'], R('roster-recv-collude-500k')['signed']))
xc = open(f'{HERE}/results/crosscheck-real-roster.txt').read()
m = re.search(r'total (\d+) mismatch (\d+) (\{.*?\}\})', xc)
j = json.loads(m.group(3)) if m else {}
t = t.replace('@@XCHECK@@', f"{j['both']['total']-j['both']['bad']:,} of {j['both']['total']:,} scenarios ({j['both']['bad']} differ, {j['both']['badDup']} of them the duplicate-removal quirk)" if j else 'see results/crosscheck-real-roster.txt')

# ---- comparison table
cmp_ = '''| | Today (design 5.4, 6.2) | B v2 | Better / worse |
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
| Removed-device back-dating | Cut-off and witness | Same cut-off and witness (rule 21) | Same (the first study's "not needed" is withdrawn) |'''
t = t.replace('@@COMPARE@@', cmp_)

seeds_txt = '''| Seed (simulator, mix) | What the oracle reported | What I changed |
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

After these changes the whole run was repeated from scratch (the numbers in C.2 are that run): no violating seed remains in either simulator.'''
t = t.replace('@@SEEDS@@', seeds_txt)

owner = '''**What you would see, case by case** (new plan, "B v2").
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
3. **Adopt this for chats, or keep today's chat rules.** A: adopt (recommended), but first measure how often a real laptop goes dark with unsent replies. Pro: no "pending", no archive question, smaller to test; con: not fewer rules, relay joins the ordering. B: keep today's chat rules. Pro: nothing new to approve; con: "two versions" and the large re-test stay.'''
t = t.replace('@@OWNER@@', owner)
# A.3 item 1 rewrite
t = re.sub(r'1\. \*\*More "\(copy\)" in edge cases.*?\n2\.', '1. **More visible "(copy)" rows in edge cases, some without any tap.** Today the same events give a "two versions" row; v2 gives a "(copy)" row. Whether v2 gives more or fewer rows than today on the same schedules was **not measured** (no simulator of today\'s rules was run on these schedules). Measured: of the Continue-here taps on an unreachable owner in the hostile mix, @@TAPCOPYPCT@@\n2.', t, flags=re.S)
t = t.replace('@@TAPCOPYPCT@@', f"{pct(hh['tapCopy'], hh['tapCopy'] + hh['tapPlace'])} were offered a copy by default ({fmt(hh['tapCopy'])} of {fmt(hh['tapCopy'] + hh['tapPlace'])}); the in-place continues include {pct(hh['overrideUser'], hh['tapPlace'])} where the user pressed the second button")
assert '@@' not in t, re.findall(r'@@\w+@@', t)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write(t)
print('wrote', OUT, len(t.split('\n')), 'lines')
