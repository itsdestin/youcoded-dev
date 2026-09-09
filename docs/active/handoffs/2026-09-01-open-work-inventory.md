---
status: active
created: 2026-09-01
kind: state-of-play
supersedes: docs/active/handoffs/2026-08-31-open-work-inventory.md
---

# Open work inventory — 2026-09-01 (13:00)

Every open PR, worktree, branch, loose file and unfinished conversation from the last three
weeks (2026-08-11 → 09-01), checked against what is actually on each repo's `master` today.

Method: `git fetch --prune` + `rev-list` on all five sub-repos and the workspace repo,
`gh pr list` + CI status on every open PR, `git status` in all 13 youcoded worktrees, the
chatsearch index (refreshed at 12:40; 1,914 Claude + 164 native conversations), and the
ending of every one of the **199** youcoded-dev conversations since 08-11 read by three
sweep agents and classified (done / handed off / waiting on Destin / cut off / trivial).
Every "merged" or "gone" claim was checked against a merge commit, a PR state, or
`git cat-file`, not against a memory.

**Totals:** 13 worktrees (3 empty) · 5 feature PRs open · 14 dependency PRs open ·
6 Claude sessions running right now · 2 commits recoverable only from git's trash ·
1 set of commits not on this machine at all.

---

## 0. Changed since the 08-31 inventory

| Then | Now |
|---|---|
| Games arcade: 15 commits on this laptop only | **Shipped** — youcoded #369 + #371, marketplace #78, deployed. Worktrees gone. |
| youcoded-admin #6 mergeable | **Merged.** (The admin checkout is still parked on the merged branch — trivial.) |
| Marketplace catalog bugs (#77) | Merged and verified live. Worktree gone. |
| Live review panes: spec only | **Deck half shipped** (youcoded-dev #4). App half is PR #372, opened today, CI still running. |
| Session-strip motion: blocked on live panes | **Unblocked** — but see §2.1: its round-two handoff commit was knocked off `master`. |
| OpenRouter "Connected" bug: spec uncommitted | Spec + ROADMAP entry pushed (`9a937b0`, `81094ca`). **Still zero code.** |
| Brand colours on light themes | Shipped (`6150dfaa`); 25 combos still unreadable, filed as a bug. |
| Roadmap restructure | Designed and handed off today (`2026-09-01-roadmap-restructure-handoff.md`). ROADMAP untouched. |

---

## 1. Running right now — do not touch these

Six `claude` processes, all in `/home/destin/youcoded-dev`: this one, four started
12:27–12:33 today, one from 18:23 yesterday, one from 04:15 today. The transcripts touched in
the last ten minutes are: *Live Review Panes Implementation*, *Session Strip Motion Work*,
*Session Switcher Animation Rebuild*, *Roadmap Restructure Handoff Review*, *Feature Flow
Plan Review*, and *Roadmap Staleness And Redesign*.

They own the 11 modified files in the workspace checkout (all re-touched at 12:31 — a
stash-and-pop). **Do not `git pull` or `setup.sh` the workspace until they commit** — the
pull already refuses, and the checkout is 20 commits behind `origin/master` because of it.

Also live: Destin's real app (port 9900) and its llama-server (9920). Never touch.

---

## 2. Things that are actually LOST or about to be — fix first

### 2.1 Session-strip "round two" handoff was knocked off master (recoverable)

Commit `4e276d4` *"docs(handoff): session-strip motion — round two, and one open defect"*
(+64 lines) was on local `master` this morning and is now **dangling** — the checkout was
reset back to `686f6cf` at 12:31 and the working copy of that handoff is the OLD version.
The round-two notes (the undiagnosed drag-spacing defect, the `[data-motion]` scaffold to
delete, two calmer motion options) exist only in git's unreachable objects.

**Recovery (one command, when the session-strip session is not mid-edit):**
```bash
git checkout 4e276d4 -- docs/active/handoffs/2026-08-31-session-strip-motion-handoff.md
```

### 2.2 The `/wrap-up` skill was written, committed, and never pushed (recoverable)

The 08-31 retrieval-repair session's eighth commit — a `wrap-up` skill + command ("turn each
session into a workspace improvement", 5 files, +215) — was waiting on the word "push" and
never got it. PR #3 merged without it; the branch was deleted; the commit survives only as
dangling `6f6f2e7` (newest of eight amended versions). `git cherry-pick 6f6f2e7` recovers it.
It will be garbage-collected eventually.

### 2.3 Perf cycle 3 — five commits that are NOT on this machine

The 08-31 *Perf Cycle 3 Scrollback Rig* session reported five finished commits on
`perf/evict-offscreen-turns` in `worktrees/evict-turns` (memory after reading a long
conversation 4,346 MB → 1,827 MB; switch 243 → 112 ms; freeze 4,882 → 1,703 ms), unpushed,
never eyeballed. **That branch, worktree, and commit `1c7b830b` do not exist here** — no
ref, no reflog entry, no dangling object. Most likely it lives on the other PC where the perf
lab runs. Its uncommitted ast-grep rule (`observer-ref-returns-cleanup.yml`) is also absent.
**Check the other machine before anything else is done on perf.**

### 2.4 `conversation-triage.mjs` is gone from disk
Already known; 526 lines destroyed by a `git clean`. The ROADMAP entry still says "untracked".
Re-create or drop the entry.

---

## 3. Cheap wins — under an hour each

| # | What | Effort |
|---|---|---|
| 1 | **Recover 2.1 and 2.2** | 2 commands |
| 2 | **Merge youcoded #372** (live pane route, Windows/macOS green, Ubuntu still running). Then the session-strip motion review can finally happen as live panes. | click once CI finishes |
| 3 | **`resize-paint`** — window-resize black bars fix. One commit, pushed, no PR, **20 days**, never seen by a human. 774 behind master. | drag a window edge in a dev window, rebase, PR |
| 4 | **`test/last-used-model-pin`** — a red test proving the bug. Needs one decision: is "last used model" per-device or synced? | 15 min after the decision |
| 5 | **Marketplace featuring** — 634-line recommendation doc, `featured.json` untouched since April. Three of Destin's own plugins are the most useful in the catalog and none is featured. | read + edit one JSON |
| 6 | **Delete 3 empty worktrees** — `full-auto-reads` (0 commits, plan approved, nothing built), `session-motion-before` (detached, only existed to film Before clips), `youcoded-dev/worktrees/deck-live` (PR #4 merged). | 3 commands |
| 7 | **Delete stray refs** — local `pr192` (duplicate of `feat/session-switch-animation`); `origin/feat/opencode-mvp` (self-labelled archive, tag then delete); the youcoded-dev stash from July. | 3 commands |
| 8 | **Delete 8 loose files in the workspace root** — `color-test.html`, `grid-a/b.html`, `mm.html`, `spacing-test.html`, `probe.tmp`, `tmp-test.txt` (render smoke tests, 08-12 → 08-27) and decide on `.claude/rules/artifacts.md.recovered-trim.partial.patch`. | 1 command |
| 9 | **Kill 3 stale dev processes** — a Vite server from a worktree that no longer exists (`trust-chips`, 35 h old), a headless Chrome probe on port 9988, and the landing-mockup `serve.py` on 8901 (37 h). All hold ports the next session will trip on. | 3 kills |
| 10 | **Archive 9 docs already marked shipped/superseded** but still in `docs/active/` (listed in §7). | `git mv` ×9 |
| 11 | **Dependabot: 2 are green** — youcoded #370 (desktop minor/patch group, all 4 checks pass), wecoded-themes #26 (clean). Merge those two now. The other 12 all have at least one failing check (§8). | 2 clicks |
| 12 | **Clean `~/.config/youcoded-*`** — 24 abandoned dev profiles, ~3 GB, oldest from July. Keep `youcoded` (the live app) and `youcoded-dev`. | 1 command |
| 13 | **Tier 0 roadmap items** — the 08-31 ranking verified 18 items as "a handful of lines each" against live code (`docs/active/reviews/2026-08-31-roadmap-open-item-difficulty-ranking.md`). Items 1–4 are one desktop PR; 11–16 are one marketplace PR. | one afternoon, ~14 items closed |

---

## 4. Waiting on a decision from Destin

These have a finished doc or branch and stalled on a question nobody answered.

| Topic | The question | Where |
|---|---|---|
| **Session-strip motion** (14 commits, green, code complete) | Approve the motion via the live-pane deck now that #372 exists; and the drag-spacing defect from round two | `worktrees/session-motion`; handoff (recover it first, §2.1) |
| **Assistant settings panel** (2 commits, since 08-26) | Sign off the provider-first mockup | `feat/assistant-settings-mockup` |
| **Codex as a session provider** | Nine §9 questions: naming, placement, shared permission store, install vs hand-off. Multi-week feature; the answers are 15 min. | `docs/active/specs/2026-08-31-codex-session-provider-design.md` |
| **Roadmap restructure** | Five open questions in the handoff (area name for Claude Code, Someday items, flags, sublevels, where "where the app stands" lives). Then a migration session. | `2026-09-01-roadmap-restructure-handoff.md` |
| **Feature-flow redesign** | Plan is draft; §8 Q1 asks where Destin sits in the loop | `docs/active/plans/2026-09-01-feature-flow-redesign.md` |
| **Status bar In/Out chips** | Spec §13: the chips mean different things for native vs Claude Code sessions | conversation *Status Bar Session Relevance* (08-26) |
| **SendUserFile card spec** | Two unapproved decisions: a new `delivered` version type; fail the whole call on a bad path | conversation 08-26 |
| **Artifact zoom loupe** | A fix landed on a branch; asked whether to clamp the lens; never answered | conversation 08-28 |
| **Friendly greeting starter** | §8: silent retry OK? footer wording? Retry button? | conversation 08-21 |
| **Auto-approve prompt handler** | Options A/B/C (lean B) plus an unconfirmed inside-vs-outside-jail fact | conversation 08-18 |
| **Sync `*.tmp` ignore** | One line if yes (Tier 0 #10) | ROADMAP L93 |
| **"Last used model"** | Per-device fact or synced fact? (§3 #4) | `test/last-used-model-pin` |
| **Four "subagent-driven or inline?" stalls** | UI review tooling (08-27), spec critique (08-23), background Bash plan (08-28), Bash always-allow shape (08-13). Three of the four have since shipped by other routes; the plans just never got a formal answer. | — |

---

## 5. Half-built — each needs a real session

| Work | State | Effort |
|---|---|---|
| **Landing page redesign** | Mockup-only; live site untouched. Design settled (app's own themes, mascot theme buttons, deck-fade features, docked download pill, headline locked). Left: deck fade to 3 cards?, re-film the demo clip tighter, sub-headline copy, then port into `youcoded/docs/index.html`. | 1–2 sessions |
| **`grok-clip` worktree** | 2 unpushed app commits (softened demo reply, writable-artifact fixture) the re-film needs. Must not be deleted. | ships with the landing work |
| **`site-themes` worktree** | **40 uncommitted files on no branch** — four community theme packs vendored (~6.5 MB) so the embed knows all seven themes, plus the fix for Meadow Mist blurring the whole window on the live page. | belongs with the landing work |
| **Session context panel** (`context-truncation`) | Tabbed "what the assistant knows" panel, approved by eye, no backend. | 1 session |
| **Marketplace overhaul remaining work** | Plan `2026-08-30-marketplace-overhaul-remaining-work.md`: catalog scalability, needs a KV namespace + `MARKETPLACE_CATALOG_INGEST_TOKEN` secret from Destin, plus a rebase. | 1 session + 2 secrets |
| **OpenRouter connection trust** | Spec only: four defects, the blue dot was never a sync check. No code, no plan. | 1 session |
| **Head-to-head + chess referee** | Server records exist, no client sends one; the room relays moves without validating (spec says it validates). | 1 session |

---

## 6. Parked — decide whether they live or die

| Branch / PR | Age | Behind | Verdict |
|---|---|---|---|
| `feat/permission-ask-timeout` #278 | 32 d | 1,117, **conflicting** | Two tasks edit a function deleted 08-22. Rewrite the plan, not a rebase. |
| `feat/ask-claude-reference-ux` #263 (draft) | 35 d | 1,260 | Destin's own verdict was "janky af". Rework vs rewrite — look once, decide. |
| `feat/session-switch-animation` #192 (draft) | 43 d | 1,530 | Superseded by the session-strip motion branch. **Close.** |
| `fix/linux-xwayland-floater` #239 (draft) | 40 d | 1,436 | Labelled DO NOT MERGE. **Close**, after rescuing the buddy-window size-pin commit. |
| `origin/feat/opencode-mvp` | 53 d | — | Self-labelled archive. Tag + delete. |
| `youcoded-core` `feature/journal-vault` | Apr | — | Repo is being deprecated. Delete. |
| `wecoded-marketplace` remote `main` | Apr | — | Stale duplicate default branch. Delete. |

---

## 7. Docs to archive (status already says done)

`handoffs/2026-08-28-orientation-block-handoff.md` (shipped) ·
`investigations/2026-08-27-artifacts-sidecar-oom-crash.md` (shipped) ·
`investigations/2026-08-27-terminal-black-glyphs-mipmap-driver.md` (shipped) ·
`plans/2026-07-19-remote-hydration-single-source-of-truth.md` (superseded) ·
`plans/2026-08-23-perf-lab-and-optimization-loop.md` (superseded-in-part) ·
`plans/2026-08-31-workspace-retrieval-repair.md` (implemented) ·
`specs/2026-07-15-phase2-native-harness-design.md` (shipped) ·
`specs/2026-07-19-native-workflow-orchestration-design.md` (superseded) ·
`specs/2026-08-28-quick-chip-edit-surface.md` (shipped).

Also stale by supersession: the three 07-10 handoffs (remote-access review, review
followups, sync completion — all `active` for 7 weeks), `2026-08-26-open-work-state-of-play.md`,
`2026-08-26-open-workstreams.html`, `2026-08-27-open-work-inventory.md`, and the 08-31
inventory this file replaces.

---

## 8. Dependency PRs — 14 open

| Green, merge now | Red (one or more checks failing) |
|---|---|
| youcoded #370 (desktop minor/patch ×21), wecoded-themes #26 (playwright) | youcoded #338, #337, #271, #270, #242 (TS 5→7, all 4 fail), #237 (AGP 8→9), #236, #235 · marketplace #63, #61, #60 (all one failing check each) |

The two majors (TypeScript 7, Android Gradle Plugin 9) are real work. The rest need one
batching session that reads *why* each check fails; some are probably the pre-existing
Windows CI failure, not the bump.

---

## 9. Conversations — the 199 since 08-11, by how they ended (agents tallied 205 rows; a few ids matched twice)

| Ending | Count | What it means |
|---|---|---|
| Done | 114 | Merged, answered, or delivered. Nothing pending. |
| Handed off | 29 | Ended by writing a handoff/plan/spec. All the live pointers appear in §4–5 above. |
| Waiting on Destin | 23 | A question put to him that nobody answered — §4 is the deduplicated list. |
| Cut off mid-thought | 19 | Below. |
| Trivial / smoke test | 20 | The "Color Test HTML Page" ×4, "hi", specialist probes, `tmp-test.txt`. |

**Cut off mid-thought — the ones that were carrying real work:**

- **Roadmap Restructure Handoff Review** (today) — ended mid-read of the taxonomy draft. A
  running session; probably still going.
- **Perf Cycle 3 Scrollback Rig** (08-31) — the §2.3 situation; also 13 dev processes it
  meant to clean up (three are still here, §3 #9).
- **Audit Skill Installation Status** (08-17) — stopped after finding two more doc drifts
  (marketplace cache dir name, toolkit v1.2.1 → v1.2.4) with "let me verify and fix" and no
  result. Probably still wrong.
- **Deliverables Card Plan Review** (08-26) — ended on tool output with no review; the
  feature shipped anyway via another session.
- **Share Icon for Artifact Viewer** (08-13) — Destin interrupted asking to revert and
  rethink drag-out vs share. Never revisited.
- **Chat Session Reference Block** (08-27) — interrupted mid-probe; superseded by the
  chatsearch-refs work that merged 08-28.
- The rest are one-message starts with no reply (a pasted URL, "make flappy bird" ×3, an
  attached file, a news-roundup ask) — nothing to recover.

---

## 10. If you only do five things

1. **Recover the two dangling commits** (§2.1, §2.2) before git collects them.
2. **Look on the other PC** for `perf/evict-offscreen-turns` (§2.3) — it is the biggest
   measured win in the workspace and it is not here.
3. **Merge #372**, then review the session-strip motion in live panes and ship those 14 commits.
4. **Answer the five roadmap-restructure questions** — the feature-flow plan and the
   migration session both wait on them.
5. **Close #192 and #239**, delete the three empty worktrees and the eight loose files —
   twenty minutes that removes half the noise from the next inventory.
