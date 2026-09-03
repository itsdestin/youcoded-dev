---
status: active
created: 2026-08-31
kind: state-of-play
supersedes: docs/active/handoffs/2026-08-27-open-work-inventory.md
---

# Open work inventory — 2026-08-31 (03:00)

Every branch, worktree, pull request, unsaved file and unfinished conversation, checked
against what is actually on each repo's `master` today.

Method: `git fetch` + `git rev-list` on all five repos, `gh pr list` on all five,
`git status` in all 13 worktrees, and the chatsearch index (refreshed 16 min before this
run; 1,887 Claude conversations + 161 native). Every "merged" claim below was checked
against a merge commit or a GitHub PR state, not against a memory.

**Totals:** 13 worktrees · 4 feature PRs open · 13 dependency PRs open · 3 sessions
running right now · 15 commits that exist on this laptop only.

---

## 1. Running right now — do not touch these worktrees

Three Claude sessions have been working for the last ~2 hours and are mid-command.

| Conversation | Started | Working in | State |
|---|---|---|---|
| **Chess Board Contrast Review** (`86bb`) | 00:52 | `worktrees/games-arcade` | Just posted a finish summary at 10:06 UTC — found the board's shading never painted, fixed it, added a build-failing guard. Full suite green. |
| **Landing Page Redesign Mockups** (`1471`) | 01:08 | `docs/active/prototypes/landing-redesign-mockups/` + `worktrees/grok-clip` | Mid-verification of the phone/desktop clip pairing in a headless Chrome on port 8901. |
| **Fixing Catalog Service Bugs** (`855f`) | 01:12 | `worktrees/catalog-bugs` (marketplace) | Its PR #77 already merged; now running a live catalog ingest to confirm four fixes in production. |

All three are also writing files in `youcoded-dev` itself. The workspace `master` moved
twice while this inventory was being written.

---

## 2. Finished or nearly finished — the cheap wins

### 2.1 Games arcade — **SHIPPED 2026-08-31, nothing left on disk**

- `youcoded` — merged as `0cacff56` (PR #369); branch and worktree deleted.
- `wecoded-marketplace` — merged as `0987b96` (PR #78); auto-deployed to
  Cloudflare, migration `0007_games.sql` applied. Branch deleted.
- Full record, including the three bugs review caught before merge:
  ROADMAP "Games arcade — Connect 4 becomes four games" `[x]`. Docs archived to
  `docs/archive/specs/2026-08-30-games-arcade-design.md` and siblings.

Playable Flappy, 2048, Connect 4 and full-rules chess (`chess.js` pinned 1.4.0), one
shared end-of-run screen, local + server best scores wired across all five surfaces
including Android, resizable pane. `verify.sh --full` green, Android 200 tests green,
Worker 298 green, 15/15 workbench routes boot, 11 arcade surfaces captured in six themes
with zero misses.

**Merge-ready?** Code yes. Two honest gaps: head-to-head win/loss records are built on the
server but no client has ever sent one, and the chess room relays moves without validating
them (both clients re-check, so nobody can corrupt a board — a cheat can only waste your
time). The spec claims the room validates; that sentence needs correcting or the work
scheduling.

**Effort:** push + two PRs + CI ≈ 30 minutes. Your part: play a few rounds of Flappy to say
whether the pipe gap is fair (it was tuned against a bot). Finishing head-to-head + chess
validation: one more session.

### 2.2 youcoded-admin PR #6 — mergeable now

"Five of seven themes could not be featured at all" — the featuring tool validated theme
names against an April snapshot instead of the live registry. Open, not a draft, no
conflicts, no CI to wait for. **Effort: click merge.**

### 2.3 Window-resize black bars (`fix/resize-paint-race`)

One commit, pushed, no PR, sitting since 2026-08-12 — **19 days**. Stops the black bars and
lagging content while you drag a window edge. It has never been looked at by a human.

**Effort:** launch a dev window, drag an edge once, then rebase (753 commits behind) and PR.
Maybe an hour. It has been the cheapest unfinished work in the workspace for three weeks.

### 2.4 Cleanup-only worktrees

- `worktrees/mp-bugs` — its PR #368 merged this morning. Worktree + branch can go.
- `worktrees/full-auto-reads` — **zero commits**. The plan was approved, nothing was ever
  built. Either build it or delete the worktree.
- `origin/feat/opencode-mvp` — self-labelled "archive branch, superseded", last touched
  2026-07-10. Tag and delete.

---

## 3. Waiting on a decision from you

### 3.1 Assistant settings panel (`feat/assistant-settings-mockup`)

2 commits, pushed. A consolidated provider-first settings mockup. Has been waiting for your
sign-off since 2026-08-26. **Effort: your review; then a backend plan is a fresh session.**

### 3.2 Marketplace featuring recommendations

A 634-line draft investigation written today (`docs/active/investigations/2026-08-31-
marketplace-featuring-recommendations.md`, still untracked). Headline findings: there is no
install data to rank by (highest install count in the entire system is 1), Home Assistant
plugins physically cannot be installed by our installer yet, and **the three most useful
everyday plugins in the 4,156-item catalog are ones you built and none are featured** —
`google-services`, `spotify-services`, `youcoded-chatsearch`. Meanwhile nine currently
featured items show a grey "Not checked" warning on their cards.

**Effort:** your reading time, then editing one `featured.json`. Small change, high impact.

### 3.3 Codex as a session provider

Spec written and independently reviewed today; the review corrected seven factual errors and
added two blocking questions. **Zero code.** Nine questions for you in §9 — naming,
placement, whether Codex shares the app's permission store, whether YouCoded installs Codex
or hands you off.

**Effort:** this is a multi-week feature, not a wrap-up item. Answering §9 is 15 minutes.

### 3.4 The last-used-model bug (`test/last-used-model-pin`)

A deliberately-failing test proving that saving a session's metadata keeps its *old* model.
Pushed. The fix needs one decision from you: is "last used model" a fact this computer owns,
or one that syncs? **Effort: 15 min once decided.**

---

## 4. Half-built — each needs a real session

### 4.1 Landing page redesign

Mockups only; **nothing in the live site has changed**. You have settled on one design: the
page wears the app's own themes, a flank header with mascot theme buttons, a deck-fade
features section, a docked download pill. Headline locked as "An Assistant That's Useful. →
Fun. → Yours."

Left: the deck fade may want to reach three cards instead of two; the demo clip shows too
much empty app and wants re-filming tighter; the sub-headline copy is unresolved; then the
whole thing has to be ported into the real `youcoded/docs/index.html`.

Also here: `worktrees/grok-clip` has **2 unpushed commits** (a softened demo reply and a
writable-artifact workbench fixture) needed to re-film clips.

**Effort:** 1–2 sessions to finish and port.

### 4.2 All-themes site embed (`worktrees/site-themes`)

**40 uncommitted files, on no branch, on one disk.** Four community theme packs vendored in
(~6.5 MB) so the live embed knows all seven themes, plus rebuilt site assets. It also
carries the fix for a real bug: on the current live page, picking Meadow Mist in the embed
blurs the entire window.

**Effort:** small on its own, but it belongs with the landing redesign — do them together.

### 4.3 Session context panel (`feat/context-truncation-notice`)

1 commit, pushed. A tabbed panel showing what the assistant currently knows. The mockup was
approved by eye; there is no backend behind it. **Effort: 1 session.**

---

## 5. Parked — decide whether they live or die

| Branch | Age | Problem |
|---|---|---|
| `feat/permission-ask-timeout` (PR #278) | 31 days | 20 commits, **1,096 behind master**, conflicting. Two of its tasks edit a function that was deleted on 2026-08-22. Needs a plan rewrite, not a rebase. **Effort: 1–2 sessions.** |
| `feat/ask-claude-reference-ux` (draft PR #263) | 34 days | 27 commits, **1,239 behind**. Your own verdict was "janky af". The decision is rework vs. rewrite, and nobody has made it. |
| `feat/session-switch-animation` (draft PR #192) | 42 days | 1 commit, **1,509 behind**. A change on 2026-08-06 probably broke the mechanism it animates. |
| `fix/linux-xwayland-floater` (draft PR #239) | 39 days | Labelled DO NOT MERGE — a proven-then-shelved experiment. Close it, but first rescue the small buddy-window sizing fix trapped on it. |

My recommendation on all four: **close #192 and #239 now** (both are studies, not features),
**decide #263 by looking at it once**, and treat **#278 as a fresh build** if permission
timeouts still matter to you.

---

## 6. Loose files in the workspace

Untracked or unsaved in `youcoded-dev` right now:

- **Keep:** `docs/active/investigations/2026-08-31-marketplace-featuring-recommendations.md`
  (§3.2 above), `scripts/ui-review/scenes/row5-phone-mirror.json` (belongs to the live
  landing session).
- **Delete:** `color-test.html`, `grid-a.html`, `grid-b.html`, `mm.html`, `spacing-test.html`,
  `probe.tmp`, `tmp-test.txt` — render smoke tests, some from 4 days ago.
- **Decide:** `.claude/rules/artifacts.md.recovered-trim.partial.patch` — the salvaged
  fragment of a rule-file edit that got wiped on 08-27; 5 of its 16 lines were lost. Re-apply
  by hand or throw it away.
- **In flight:** `.claude/rules/ipc-bridge.md` (a 22-line wording trim from another session).

---

## 7. Dependency PRs — 13 open, all stale

youcoded #338, #337, #334, #271, #270, #242, #237, #236, #235 · wecoded-themes #26 ·
wecoded-marketplace #63, #61, #60. Oldest is 39 days. Two are major-version jumps that will
need real work (TypeScript 5→7, Android Gradle Plugin 8→9). The rest are routine.

**Effort:** one batching session for the safe ones; the two majors are their own task.

---

## 8. If you only do four things

1. **Push the games arcade.** 15 commits across two repos exist on this laptop only, and it
   is the most finished feature in the workspace.
2. **Merge youcoded-admin #6.** One click, and it unblocks featuring five of your themes.
3. **Drag a window edge** and merge `resize-paint`. 19 days waiting, ~1 hour of work.
4. **Read the featuring recommendations** and pick what goes on the marketplace shelf.
