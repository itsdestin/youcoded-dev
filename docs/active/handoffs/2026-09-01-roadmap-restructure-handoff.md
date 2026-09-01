---
date: 2026-09-01
status: active
type: handoff
topic: ROADMAP.md restructure — schema, area taxonomy, anti-staleness tooling
---

# Roadmap restructure — handoff

Design work only. **Nothing has been built, and this work has not modified `ROADMAP.md`.**
(The working tree does carry an unrelated, uncommitted roadmap edit from the landing-redesign
session — two entries near line 1285. Do not mistake it for the start of the migration.)

This document states the problem as measured, the solution agreed with Destin, and how far the
design got. Reviewed and corrected on 2026-09-01 — every number below was re-measured against
the file that day; where the original draft was wrong, the correction is stated rather than
silently replaced, so the next session does not re-derive the same mistake.

---

## 1. The problem, measured

`ROADMAP.md` is the single planning surface for the whole product. As of 2026-09-01:

| | |
|---|---|
| Open items | **258** (150 shipped) |
| Lines | **1,441** |
| Words in open items alone | **~50,400** (half the file's ~100,500 words) |
| Median words per item | **~152** — 41 items exceed 300, longest is 1,249 |
| Section split | Bugs 129 · Features 79 · Someday 31 · v1.3.1 16 · v1.3 3 |

(The earlier draft said Bugs 111 · Features 87 · Someday 42. Those were wrong. "42" also
appeared in the Someday question in §5 — there are 38 items *typed* `idea` across all
sections, and 31 items in the Someday *section*; neither is 42.)

Destin's stated concern was staleness. It was measured three ways, and two intuitive signals
turned out to be worthless:

**Age is a dead signal.** 248 of 258 open items are dated within 60 days. The earlier draft
blamed this on `(added YYYY-MM-DD)` being rewritten on every edit. **That is not what the
history shows**: across the whole git history of the file, only five items ever had their
added date change, and three of those moved *backwards* (the `/audit` dedupe rule keeps the
older date). The real cause is churn — 74 items were filed on 2026-08-26/27/28 alone, and the
file is only a few months old. The conclusion stands either way: sorting or expiring by age
would separate nothing.

**File-path existence is a dead signal.** All file references in open items were checked
against the real `git ls-files` index of every repo. Only **16** items cite an unresolvable
path, and most of those are runtime files (`~/.claude/youcoded-skills.json`), illustrative
examples (`/home/destin/notes.md`) or build outputs. So a path-exists check would pass almost
everything.

**The `/audit` tooling has never read the roadmap at all.** Two facts, both verified:

- The mechanical pass (`scripts/audit-anchors.mjs`, also the daily CI cron) sweeps only
  `docs/`, `youcoded/docs/` and `wecoded-marketplace/docs/` for `<!-- verify: -->` anchors.
  `ROADMAP.md` sits at the workspace root and carries zero anchors. It is out of scope, not
  merely weak. (The earlier draft said the pass "checks path existence and proves nothing" —
  it never looked.)
- `/audit` **does** specify a roadmap check — step 5 of `.claude/commands/audit.md`: "for
  every open item, check whether it already shipped (git log since its added date, or read
  the code it names)". It is a manual, LLM-executed step. No report in `docs/audits/` shows
  it ever ran (the 2026-07-15 audit *filed* items into the roadmap; it did not verify any).
  The cron cannot reach it because the cron only runs the script.

**The signal that works:** *has any file this item describes been edited since the item was
written?*

> **139 of 258 open items — 54% — describe a file that has been modified since the item was
> filed.** Nothing has ever looked at that queue.

Two caveats the earlier draft skipped. First, this signal is **noisy**: a file being touched
does not mean the claim about it rotted, and the app's hottest files (`ipc-handlers.ts`,
`App.tsx`) are edited most weeks, so the 54% will only grow. What fraction of the 139 are
false alarms was not measured. Second, **the script that produced the number was not saved** —
only its output survives (`stale.json` in a session scratch folder, 2026-08-31 18:31), which
can vanish at any time. §4.1 makes committing it the first task.

**And 72 open items cite no file at all**, so no mechanical check can ever reach them.

**Already-resolved entries surfaced in a small spot-check.** The linked ranking doc lists
four; the honest tally is: **two resolved** (the two doc-anchor entry, and the workspace CI
cron entry, pending one confirming run), **one half-resolved** (`curated-defaults.json` fixed
registry-side; the app-side favourites cleanup is still open), and **one worse than filed** —
`desktop/test-engine/conversation-triage.mjs` is not merely untracked, it is **gone from disk
entirely** (526 lines, destroyed by an unrelated `git clean`).

**The tag vocabulary had collapsed.** 76 distinct tags across the open items, dozens used
exactly once, with synonym pairs no search can join (counts measured 2026-09-01):
`#perf` 8 / `#performance` 10 · `#remote` 12 / `#remote-access` 1 · `#android` 26 /
`#android-runtime` 1 · `#ui` 24 / `#ui-consistency` 1 · `#marketplace` 23 /
`#marketplace-ui` 2. Root cause: **one field doing three unrelated jobs** — feature area,
platform, and quality attribute.

### Root cause, in one sentence

**The roadmap has no link back to the code, so nothing in the system is capable of telling it
that it is wrong.** Length, duplication and the already-done entries are all downstream of
that. Shortening the file without fixing the link produces a shorter file that rots at the
same rate.

---

## 2. The agreed solution

### 2.1 The roadmap holds symptoms; reports hold claims

**Destin's rule:** agents do not write code into the roadmap — no file paths, no line numbers,
no mechanism. An agent with an investigation writes it into a **linked report**; the roadmap
entry carries only the *experienced symptom*, so Destin can scan and ask "am I still hitting
that?"

This is not only a length fix. The two halves decay differently, and separating them lets each
get the only checker capable of handling it:

| | Rots? | Who checks it | Cost |
|---|---|---|---|
| **Symptom** — "the chat panel vanished, new sessions showed no text" | The fact never rots. Its *relevance* does — fixed by accident, or no longer cared about. | **Destin only.** Nobody else can say whether it still matters. | One line, in his own words. |
| **Claim** — "this file sets this value" | Constantly, and silently, the moment anyone edits the file. | **Tooling only.** 139 items are in this state; no human keeps up. | Mechanical. |

**Destin checks symptoms. Tooling checks claims. Neither does the other's job.** Today they
are mashed into one blob, which is why neither check has ever happened.

**Be honest about what this buys.** The earlier draft said the roadmap becomes "rot-proof by
construction." It does not. It moves the maintenance from agents (who never did it) to two
parties who can: tooling for claims, and **a periodic pass by Destin over symptoms older than
60 days** — at today's size that is roughly four items a day, or a 20-minute skim every couple
of weeks. That is the cost of the design and it should be sized, not hidden.

**Where reports live:** `docs/active/investigations/` — the folder already exists, already
has the `status:` frontmatter lifecycle, and is already inside the anchor pass's sweep. No new
folder. Filename `YYYY-MM-DD-<slug>.md`. When the item closes, the report follows the normal
rule (`docs/archive/`). The earlier example pointed at a `reports/` folder that does not
exist.

**Constraint from Destin:** a symptom must still be recognisable a month later. Roughly two
lines, naming the platform, what breaks, and when. Terse is not the goal; *perishable-free* is.

### 2.2 Projected effect — corrected arithmetic

The earlier draft projected "~300 lines, ~6,500 words, 258 items visible." Those three
numbers cannot all be true: the example entry in §2.3 is four lines and ~40 words, and 258 of
those is ~1,050 lines and ~10,000 words. The honest projection depends on entry shape:

| Entry shape | Lines | Words in open items |
|---|---|---|
| Today | 1,441 | ~50,400 |
| 4-line entry (two symptom lines, metadata line, link line) | ~1,050 | ~10,000 |
| 2-line entry (symptom line, metadata + link on one line) | ~550 | ~7,500 |

Either way the *word* count drops ~80%, which is the reading-cost that matters. The *line*
count only reaches "much slimmer" if entries are two lines or the file is split per area
(open question 6). Nothing is hidden and no promotion rule is needed.

### 2.3 Entry schema — seven fields (one proposed for removal)

| Field | Required | Values |
|---|---|---|
| **area** | yes | One of the 14 in §3 |
| **surface** | no | Which screen you'd see it on — from `docs/MAP.md` → Hot paths |
| **seen-on** | yes | `desktop` · `android` · `remote` · `all` |
| **source** | yes | `destin` (trusted symptom) · `agent` (a claim, verified before a fix is planned) — **proposed for removal, open question 7** |
| **status** | yes | `confirmed` · `needs-verify` · `in-flight` · `blocked` · `decision` · `parked` |
| **last-checked** | yes | Date the item was last confirmed true |
| **flags** | no | `urgent` · `needs-repro` · `performance` · `security` · `regression` |

Two fields were added late because they were missing and Destin had named the need:

- **status** — he asked for a decision/status surface; there was no status vocabulary at all,
  so most items are "open" in name only with no way to tell which. `decision` earns its own
  value: several items are questions waiting on Destin, not work, and today they sit in the
  same pile as three-week engineering jobs, which is why they are never answered.
- **last-checked** — the field that makes "am I still hitting that?" a 60-day filter instead
  of a 1,441-line reread. `(added …)` cannot serve: it records filing, not confirmation.

**Example entry:**

```
- [ ] Android forgets your skill settings after the first launch — favourites, quick
      chips and overrides all revert to defaults, every launch after the first
      android-only · settings · android · agent · needs-verify · checked 2026-08-28
      → docs/active/investigations/2026-08-28-android-skill-config.md
```

The ~320 words of mechanism this entry carries today move to the linked report.

---

## 3. The area taxonomy — settled

14 areas. Tested against all 258 open items: every one of the 76 existing tags maps, **zero
orphans**. Full version with sublevels: `docs/active/specs/2026-08-31-roadmap-area-taxonomy-draft.md`.

| Area | Open | Filing test |
|---|---|---|
| `native-harness` | 58 | The app's own agent is doing work — a turn, tool call, permission, cost figure, specialist |
| `dev-workspace` | 32 | It's about building the app, not the app. *Could a normal user ever see it?* No → here |
| `android-only` | 25 | *If you fixed this on desktop, would Android still be broken?* Yes → here |
| `marketplace` | 25 | Finding, listing, installing, rating plugins/themes + the Worker behind them |
| `user-interface` | 24 | *Does the fix change more than one screen?* Yes → here |
| `files` | 20 | Documents the user opens, edits or organises — files panel, project files, git surface |
| `sync` | 17 | Moving your stuff between devices, and the GitHub transport under it |
| `other-features` | 14 | A real user-facing feature too small for its own area |
| `chat-data` | 13 | Everything kept about a chat — transcript **plus** title, tags, notes, search, resume |
| `themes` | 9 | How the app looks under a theme — engine, editor, a theme rendering wrong |
| `remote-access` | 9 | Reaching the app from another device — protocol, browser client |
| `local-models` | 5 | *Would this break the same way on a cloud model?* No → here |
| `claude-code` | 4 | The Claude Code integration — terminal, PTY, hooks, prerequisites |
| `games` | 3 | The arcade — games, leaderboards, head-to-head, match relay |

**Sublevels** exist where an area passes ~20 items: `native-harness` (sessions 20 · tools
17 · permissions 9 · cost 5 · specialists 5 · skills-mcp 2), `dev-workspace` (tests · rigs ·
knowledge · release), `marketplace` (catalog · backend · install). **One deliberate exception:**
`other-features` (14) carries sublevels (accounts · buddy · onboarding · misc) *below* the
threshold, because they are the graduation counter — a sublevel past ~8 items becomes its own
area, and you cannot count what you have not labelled. `android-only` and `user-interface` sit
at the threshold but stay flat: their natural split is the `surface` field, which already
exists.

### How the list got here (five rounds of Destin's review)

`git` folded into `files` · `docs` + `dev-tooling` + `build-release` merged into
`dev-workspace` · `website` dropped (the `surface` field already carried it) · `social`
dissolved into `other-features` sublevels · `games` split out **on subsystem complexity, not
item count** · `performance` and `security` demoted from areas to flags, so 18 speed items
stay in the backlogs they belong to instead of being hidden in a "performance" bucket ·
renames `harness`→`native-harness`, `conversations`→`chat-data`, `remote`→`remote-access`,
`ui-system`→`user-interface`, `android-app`→`android-only`.

### Three rules that keep it from sprawling again

These matter more than the names:

1. **Every area carries a filing test, not just a label.** A name cannot stop mis-filing; a
   one-sentence test can. The tests above are the product of Destin identifying genuine
   overlaps (`chat-data` vs `native-harness`, `local-models` vs `native-harness`, `files` vs
   `dev-workspace`) that no renaming would have resolved.
2. **Naming rule:** use the app's own on-screen word where one exists (`remote-access` is the
   app's copy verbatim — "Remote Access" in Settings); otherwise name the job, not the code.
   `chat-data` is a knowing exception, documented as such — the app says *conversations*, but
   the area holds more.
3. **Two self-correcting thresholds:** an area gains sublevels past ~20 open items; an
   `other-features` sublevel graduates to its own area past ~8. The catch-all cannot silently
   become the dump.

### One collision to watch

`android-only` (area) and `seen-on: android` look alike and are not the same. The area means
the bug lives in Android's own code; the field means shared code that only *shows* on a phone
(area would be `user-interface`, `sync`, `chat-data`…). For an `android-only` item, `seen-on`
is always `android` — redundant there, load-bearing everywhere else.

---

## 4. Proposed but NOT designed

Three pieces, in dependency order. Each is its own spec → plan → session.

### 4.1 The anti-staleness machinery — the piece Destin opened with

Agreed in shape, not designed. **Positioning (corrected):** this is not a new idea bolted onto
`/audit`; it is `/audit` step 5 — which already says "check every open item against the code
it names" — made cheap enough to actually run, and run by the cron rather than by an LLM
that has never been asked to.

**First task, before any design:** commit the measurement script. The 139/54% figure that
anchors this whole document is currently unreproducible. The script that produced it is
~80% of the tool; save it as `scripts/roadmap-staleness.mjs` and the "tool must exist before
migration" dependency largely dissolves, because it already works against today's format.

**Two candidate mechanisms** — the choice is open question 8:

| | How it detects rot | False alarms | New code |
|---|---|---|---|
| **Anchors in reports** | Each report carries one `<!-- verify: {"path", "contains"} -->` on its load-bearing claim; the *existing* anchor pass and daily cron check it | Low — fires only when the exact claimed line is gone | **None** for the check itself. Reports just have to live under `docs/` (they do, §2.1) |
| **Modified-since** | Compare each cited file's last-commit date to the item's `last-checked` | High — 54% today, growing; any edit to `App.tsx` flags every item that names it | The committed script plus a `--since` mode, ~30 lines |

Recommendation: **anchors as the check, modified-since as a hint** listed separately in the
audit report. The earlier draft's sentence "the current mechanical pass cannot be extended
into this" was wrong — it can, because the reports are inside its sweep.

Remaining scope, all undesigned:
- Propose **consolidations**: group related items into single larger plans by area.
- Surface items whose `last-checked` is over 60 days for Destin's symptom pass (the sized
  cost in §2.1).
- Sweep `docs/active/` plans and specs the same way (the anchor half of that already happens).

### 4.2 "Where the app stands" — undesigned

Destin wants the file to show where the app is against the long-term vision, not just list
defects. A flat list of 250 one-liners cannot do this at any length; it needs a short section
at the top — a paragraph per product pillar covering what has shipped and what is blocking.
**Undesigned because it was not settled whether this lives in `ROADMAP.md` or beside it** —
and open question 6 (one file or per-area files) largely decides it: if the roadmap becomes an
index over 14 area files, this section *is* the index page.

### 4.3 Migration — Destin's explicit call: its own session

Rewriting 258 entries into the new schema, **including a genuine open-or-resolved cross-check
of every item**. His two constraints:

1. Each item must be verified genuinely still open, not assumed. Justified: already-done
   entries surfaced in a *sample*, and 139 items describe code that has since moved.
2. Symptom text must stay detailed enough to be recognisable a month later.

Migration is also where open question 4 (the `other-features` sublevels) gets answered for
free — the 14 items are classified one by one there; no separate validation pass is needed.

---

## 5. Open questions — all decided 2026-09-01

Every question below was put to Destin on 2026-09-01 and answered. The design as decided is
`docs/active/specs/2026-09-01-roadmap-restructure-design.md`, which supersedes the taxonomy
draft. Decisions: (1) area is named **`claude-code-integration`** — "harness" would name the
agent loop, which for Claude Code is Anthropic's; "integration" names the wrapper the app
owns. (2) Ideas keep their real area with `parked`. (3) `performance`/`security` are flags;
release targeting is a flag too. (4) Answered during migration. (5, 6) **Per-area files**
under `docs/roadmap/` with `ROADMAP.md` as a one-page index that carries "where the app
stands". (7) `source` **dropped**; in exchange the `confirmed` / `needs-verify` definitions
were tightened — see the spec §3.3. (8) **Claim anchors as the check, modified-since as a
hint**, with a `claim:` marker distinct from `verify:` so a rotted claim never turns CI red.

The table as it stood before those answers, for the record:

| # | Question | Recommendation |
|---|---|---|
| 1 | Is `claude-code` the right area name, given the app embeds Claude Code throughout? | Alternative: `cc-sessions`. Undecided. |
| 2 | Do the Someday/ideas items (31 in the section; 38 typed `idea`) keep their real areas with a `parked` status, or get their own bucket? | **Real areas + `parked`** — a sync idea should surface when someone opens the sync backlog, not sit in an ideas ghetto. |
| 3 | Confirm `performance` and `security` as flags rather than areas. | **Flags.** 18 speed items span eight areas; as an area they'd be hidden from all eight. Applied in the draft, unconfirmed by Destin. |
| 4 | Are the four `other-features` sublevels right (`accounts`/`buddy`/`onboarding`/`misc`)? | Answered during migration (§4.3); not a blocker. |
| 5 | Does the "where the app stands" section live in `ROADMAP.md` or beside it? | Follows from 6. |
| 6 | **One file or per-area files?** With honest arithmetic (§2.2) a single file is ~550–1,050 lines. Per-area files (`docs/roadmap/<area>.md`, ~20–60 lines each) with `ROADMAP.md` as a short index + "where the app stands" page hits "much slimmer" and answers 5. Cost: 15 files, and "capture in the same session" means picking a file. | Destin's call. |
| 7 | **Drop `source`?** Every agent-found item starts as `needs-verify`; once anyone verifies it, who first reported it stops mattering. `status` already carries the useful bit. | **Drop it** — six fields. |
| 8 | **Anchors in reports, modified-since, or both** as the staleness check (§4.1)? | **Anchors as the check, modified-since as a hint.** |

---

## 6. Related documents

| Path | What it is |
|---|---|
| `docs/active/specs/2026-09-01-roadmap-restructure-design.md` | **The approved design** — files, entry grammar, vocabularies, status definitions, claim anchors, the tool, the migration procedure, the tag→area map. Start here. |
| `docs/archive/specs/2026-08-31-roadmap-area-taxonomy-draft.md` | The taxonomy draft the spec grew from (superseded; kept for the considered-and-rejected names) |
| `docs/active/reviews/2026-08-31-roadmap-open-item-difficulty-ranking.md` | All 258 open items ranked into six difficulty tiers, plus 18 "fix today" items (top four verified against live code) and the already-resolved entries (see §1 for the honest tally) |
| `.claude/commands/audit.md` → step 5 | The roadmap check that already exists on paper and has never run |
| `ROADMAP.md` | Not modified by this work (see the note at the top) |
