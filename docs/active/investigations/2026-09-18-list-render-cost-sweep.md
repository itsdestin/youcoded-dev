---
date: 2026-09-18
status: active
type: investigation
topic: Why switching to Project View's Conversations tab freezes, every other surface with the same shape, the app's prior art for each, and a proposed standard + enforcement so it stays fixed
---

# List render cost — the Conversations-tab freeze and its relatives

Destin (2026-09-18): "switching to the conversations tab in project view
freezes/lag heavily for a bit … look for any similar instances … make sure
everything in the app is handled consistently, and create design rules/project
guidance/tooling to enforce this in the future."

The sweep itself was code reading. The "before" numbers were measured afterwards
(render-cost plan, Task 0) and sit in §1 → *Measured before*; per plan decision D4 the
perf-lab row is re-taken after Tasks 3, 4 and 5 and added to the same table.

## 1. Root cause — four stacked costs on one click

Clicking **Conversations** (`youcoded/desktop/src/renderer/components/project-view/ProjectView.tsx:952`):

1. **Every conversation is drawn at once.** `tabs/ConversationsTab.tsx:49` maps
   the whole list, no cap, no memoised row. The youcoded-dev project has 838
   transcripts; the 2026-09-16 redesign made each row a Resume-style card
   (~15–25 DOM nodes, up from ~9 when the 09-09 rig measured 700 rows at 108 ms).
2. **…and drawn from scratch every time.** The tab is conditionally mounted, so
   each visit rebuilds it.
3. **…then drawn a second time.** The tab calls `useTagRegistry()` itself
   (`ConversationsTab.tsx:31`); the `tags.list` answer lands after first paint,
   `byId` changes identity, every row renders again (and tags visibly pop in).
4. **The hidden Files tab redraws too.** `FilesTab` is kept mounted with
   `hidden` (the 09-09 watcher fix — correct) but is **not memoised**
   (`tabs/FilesTab.tsx:181`) and receives inline closures
   (`ProjectView.tsx:950`). ProjectView reads `useArtifact()` (`:169`), so every
   tab click, preview open, and every artifact-context dispatch (any session's
   file writes) re-renders the whole hidden file grid — up to 2,000 cards.

### Measured before (2026-09-18, render-cost plan Task 0)

**perf-lab, Projects phase** — fixture project `gamma`: ~1,600 files, 700 one-turn
conversations, stock theme, Xvfb/llvmpipe (no GPU). Median of 3 passes; the thrash is
8 rounds per pass.

| stage | build | `conversations.ms` | `thrash.toConversations` median / max | Conversations-tab DOM nodes | report |
|---|---|---:|---:|---:|---|
| before | youcoded `950a52c3` | 174.8 ms (passes 191.1 / 174.8 / 163.4) | 181.6 / 198.4 ms | 13,267 (739 rows) | `perf-reports/2026-09-18-0948-950a52c-render-cost-before.md` |
| t3 — transcript-meta cache | youcoded `b502a0f7` | 174.8 ms | 165.9 / 186.2 ms | not re-read | `perf-reports/2026-09-18-1031-b502a0f-render-cost-t3.md` |
| t4 — Conversations tab: 50 at a time, memo rows | youcoded `095de495` | **58.6 ms** | **65.1 / 66.2 ms** | not re-read | `perf-reports/2026-09-18-1044-095de49-render-cost-t4.md` |
| t5 — hidden Files tab memoised, off ArtifactContext; flat results 50 at a time | youcoded `4b206809` | 58.6 ms | 65.2 / 66.7 ms | not re-read | `perf-reports/2026-09-18-1056-4b20680-render-cost-t5.md` |

t3 note: as the plan expected, the tab switch did not move (the 16 ms on the thrash median is
within this rig's pass-to-pass spread). Projects open also held at 161.6 ms median: the
fixture's 700 one-turn transcripts are cheap to read, so the cache's saving is below what
this fixture can show. The first (cold) pass opened in 763 ms, the warm passes in ~161 ms.
No judged metric got worse (`compare.mjs`: open 161.6 → 161.6, thrash IPC stall 0 → 0).
Load was 3.94 for this run against 2.77 for "before".

t4 note: this is the stage that moved the tab. Opening Conversations went 174.8 → 58.6 ms
(−66%), and the rapid Files ↔ Conversations thrash went 181.6 → 65.1 ms median, with thrash
long tasks 959 → 0 ms and worst frame gap 160 → 0 ms. Projects long tasks in total went
1,217 → 51 ms. Load 3.91.

t5 note: the tab switch was already down to about one frame pair after t4, so the thrash did
not move further (65.1 → 65.2 ms). What t5 moved is the Files side: the "Code & configs"
filter 100.4 → 64.7 ms (831 cards / 4,301 nodes → 50 cards / 397 nodes drawn), the first
search keystroke 212 → 86 ms, small → big project switch 300.3 → 164.5 ms, and Projects long
tasks in total 51 → 0 ms. Judged metrics: open 161.6 → 161.1 ms, thrash IPC stall 0 → 0.
Load 3.

Same run, for context: to-Files median / max 65.3 / 85 ms; thrash long tasks 959 ms
total, worst frame gap 160 ms, main process unresponsive 0 ms; Projects open 161.6 ms.

What the clock means: `conversations.ms` and each thrash sample start at the tab click
and stop when Project View's node count first changes, plus two frames
(`scenario-projects.mjs` `h.tab`). A list that mounted in several commits would be
under-counted, so read the node count beside it. And note the rig was blind until this
run: since youcoded `64aa78c2` (2026-09-17) its Project View lookup matched nothing, so
the phase aborted before measuring (fixed in `7816ff4d`); no Projects numbers exist
between 2026-09-09 and this row.

Command (later stages change only `--label`):

    bash scripts/perf-lab/bg-run.sh --only projects \
      --checkout <workspace>/worktrees/sessions/convo-tab-lag/youcoded --label render-cost-before

`--checkout` is required: without it the rig builds `worktrees/perf-lab`, which is not
this branch (and does not exist in this worktree).

**DOM-size sweep** — `node scripts/ui-review/dom-size-sweep.mjs --port <workbench port>`,
workbench `scenario=stress&stressRows=2000`, budget 8,000 elements. Red is expected
before the fixes; this run proves the guard sees all known-unbounded lists.

Rerun 2026-09-18 (fix round 1, review findings on Task 0): the Files surface's `expect`
used to only check the search box's *value*, not that results were on screen, and the
stress scenario didn't scale a project's file count or the preview's timeline. Both are
fixed (`mock-shim.ts` `stressFiles`/`filesIn`, and `TOTAL` in `chatsearch.read`) — see
`youcoded/.superpowers/sdd/task-0-report.md` → "Fix round 1" for what changed and why.

| surface | nodes | budget | result |
|---|---:|---:|---|
| Resume browser | 2,572 | 8,000 | PASS |
| Projects → Conversations | 17,546 | 8,000 | **FAIL** |
| Projects → Files, search "e" | 11,242 | 8,000 | **FAIL** |
| Marketplace | 58,706 | 8,000 | **FAIL** |
| Model picker, search "a" | 24,679 | 8,000 | **FAIL** |
| Conversation preview (opened from Resume) | 2,812 | 8,000 | PASS |
| Side drawer (Session Files) | 1,083 | 8,000 | PASS |

Files now reds too, proven the same way as every other surface: at least 20 rendered
result cards matching the stress fixture's filenames were found on screen before the
count was read (previously the check only proved the search box held "e", which a
broken results list could still satisfy). With the project's file listing stress-scaled
to `?stressRows=` rows, an unfiltered one-letter search draws all of them — FilesTab has
no cap on the flat-results path (Task 5 fixes that).

The preview stays PASS honestly, not by omission: `chatsearch:read`'s fake conversation
is now `stressRows` turns long in `stress` (was a fixed 24), but `SessionPreviewPane.tsx`
reads and mounts ONE PAGE (10 turns) per call and only requests another when the reader
scrolls up past the sentinel — by design, never "load everything". The sweep opens the
preview and reads the count without scrolling, so a longer backing conversation doesn't
change what's on screen at open time; the node count barely moved (2,804 → 2,812, the
turn text is unchanged). This surface is not what Task 6 (preview entry folding) fixes —
that's about the render weight of what's already in one page, not how many pages exist —
so it staying green here says nothing about whether Task 6 is needed.

Adjacent, on Projects **open** (not tab switch): `project:list-conversations`
(`main/project-conversations.ts:21`) and the hero counts
(`main/artifacts/projects-index.ts:133`) each run the global
`listPastSessions()` — a tail-read + parse of every transcript — with no
main-side cache; the renderer cache is cleared on every open
(`ProjectView.tsx:316`). `session:browse` (Resume browser, buddy list) is a third
copy of the same scan.

## 2. Prior art — how the app already solved each shape

| Shape | Precedent | Why that and not the alternative |
|---|---|---|
| Long list of variable-height cards | **Chunked reveal**, `ResumeBrowser.tsx:155-176, 784-845` (REVEAL_CHUNK 50, sentinel, reset-on-query, scroll-to-top) + `RowMemo` (:287). f8ca631b, 2026-07-31: 1,642 rows open 804→96 ms, DOM 37,920→1,585; flat at 4,000 rows | Virtualization rejected: variable heights, rows grow, scroll-fade reads real height (`docs/archive/handoffs/2026-07-31-resume-browser-load-time-handoff.md`) |
| Long scrolling timeline | **Entry folding**, `hooks/use-entry-folding.ts`, `ChatView.tsx:569` (#398): memory 4,346→1,784 MB | `content-visibility:auto` clips theme glows (c3f0b11a, `globals.css:897-905`); dropping entries from the reducer broke readers |
| Collapsed preview of long content | **Real slice**, `CollapsibleBlock` (`tool-views/ToolBody.tsx:67-72`) | — |
| Tab holding costly state | **Keep mounted + `hidden`**, FilesTab (c73e0920, 09-09): 8 clicks cost 7.2–8.0 s before. Guard: `scripts/ast-grep/rules/filestab-mounted-with-hidden-prop.yml` | Half-applied: kept mounted but not memoised (cause 4) |
| Shell re-rendering per event | **Memo + stable props / cached selectors** (#501, 3ad7d4f5): 40 deltas → 0 renders | — |
| Short-but-unbounded list | **"Show all N"**, `PermissionsSection.tsx:728`, `LocalModelsSection.tsx:457` | — |
| Inactive whole view | `content-visibility: hidden`, `ChatView.tsx:1015` (81c9562d) | `display:none` cost 25 ms/switch |

## 3. Every surface with the same problem

Ranked by what a user feels. "Fix" = the precedent above that fits.

| # | Surface | Size | Fix |
|---|---|---|---|
| 1 | Project View → Conversations tab | hundreds–1,000+ | chunked reveal + memo row; registry lifted to ProjectView |
| 2 | Project View → hidden Files tab re-render | up to 2,000 | `React.memo(FilesTab)` + stable props; chunked reveal on flat search results |
| 3 | Transcript scan on Projects open / Resume / buddy (main) | every transcript ×2–3 | one main-side cache keyed on file mtime/size |
| 4 | Conversation preview (`PreviewTimeline` via `SessionPreviewPane`) | grows while scrolling back | entry folding (it MUST mirror ChatView anyway) |
| 5 | Buddy chat (`buddy/BubbleFeed.tsx:516`) | whole live session | entry folding |
| 6 | Collapsed file changes (`diff/UnifiedDiff.tsx:128-143`), file reads (`ToolBody.tsx` ReadView ~600-627) | thousands of lines while "collapsed" | real slice while collapsed (CollapsibleBlock) — **visible change, see Q2** |
| 7 | Marketplace "Explore everything" + results (`MarketplaceScreen.tsx:510,541`) | ~200, growing | chunked reveal + memo card |
| 8 | Model picker while searching (`model/ModelPicker.tsx:818`) | 300+ | chunked reveal |
| 9 | Spreadsheet views (`CsvView.tsx` no column cap; `XlsxView.tsx` 2000×100) | up to 200k cells | CSV column cap to match XLSX; chunked rows |
| 10 | Game chat (`game-reducer.ts:160`) | unbounded | cap in reducer |
| 11 | Tag registry fetched per mount (ConversationsTab, ConversationPreview, SessionDrawer, each chatsearch card) | — | one shared registry store |
| 12 | `SubagentTimeline.tsx:210` inline `content-visibility:auto` | — | remove (retired pattern), memo row |
| 13 | Page-load merges rebuild tool Maps (`chat-reducer.ts:2761-2763`) → every loaded turn re-renders | — | keep Map identity (the reducer rule already says so) |

Deliberately **not** changed (small, or the pattern fits badly): ContextTab,
SessionDrawer list (memo rows only), Library, CommandDrawer (always mounted off
screen + scroll-fade), ChatsearchFindCard.

Android: same renderer, but Project View has no data there
(`SessionService.kt:4107` not-implemented), so items 1–3 are desktop + remote
browser only. Below 640px the tab's scroller is ProjectView's `<main>`, so the
reveal observer root must follow the layout.

## 4. Doc contradictions found

- `.claude/rules/react-renderer.md:36` and `youcoded/docs/renderer-chrome.md:58`
  say "prefer `content-visibility: auto` over virtualization". Code retired it
  for chat entries in April; neither doc mentions folding or chunked reveal.
- Design guide: `G-22` is used twice (find bar :210, expandable rows :313).
- `ResumeBrowser.tsx:175` cites "the 2026-07-31 handoff" without its path.
- `docs/active/investigations/2026-09-01-ui-sluggishness-render-cost.md` still
  says ChatView has no paging/folding.

## 5. Proposed standard (one rule, five techniques)

**Nothing the user can't see is built.** Pick by shape:

1. Card/row list from user data → shared `useChunkedReveal` hook (extracted from
   ResumeBrowser, which moves onto it unchanged) + memoised rows.
2. Scrolling timeline → `useEntryFolding`.
3. Collapsed preview → real slice, full content on Expand.
4. Tab/panel that keeps state while hidden → kept mounted with `hidden` **and**
   memoised with stable props; otherwise conditional.
5. Data many surfaces share → loaded once (shared store / main-side cache), never
   per mount.

`content-visibility: auto` only on self-contained blocks with no glow (code
blocks); `hidden` for whole inactive views.

## 6. Proposed enforcement

> **Superseded in part, 2026-09-18 (plan review).** The `bounded-lists.test.ts` source
> scanner below was dropped: run against the unfixed tree it passed FilesTab,
> MarketplaceScreen and ToolBody and never saw SessionDrawer, CsvView or
> SubagentTimeline. The plan's Task 13 uses per-surface stress tests plus a DOM-size
> sweep instead. Also corrected there: cause 4 in §1 is two causes — FilesTab reads
> `ArtifactContext` itself (`FilesTab.tsx:234`), which `React.memo` cannot stop.

- **Design guide G-29 "Fast at any size"** (+ fix the duplicate G-22) — the
  user-facing promise, citing the guards.
- **`react-renderer.md`** Perf line rewritten to the standard above (fixes the
  contradiction), depth in `renderer-chrome.md`.
- **Guard `tests/bounded-lists.test.ts`** in the `visible-intervals.test.ts`
  shape: scans renderer JSX for `.map(` over list-shaped data and fails unless
  the file uses `useChunkedReveal`/`useEntryFolding`/a slice, or is on a
  reasoned, shrinking allowlist (stale entries fail).
- **Stress tests**: each bounded surface rendered with 2,000 items in jsdom must
  draw ≤ one chunk; a firing IntersectionObserver stub replaces today's no-op
  stubs (`files-tab-list-view.test.tsx:53`) so the fallback can't mask a
  stranded list.
- **Render-count pins** for the tag-registry second render and hidden-FilesTab
  re-render (the `root-selectors-skip-token-rerenders.test.tsx` shape).
- **ast-grep**: a sibling of `filestab-mounted-with-hidden-prop.yml` requiring
  `FilesTab` to be memoised.
- **Reviewer brief** (`scripts/ui-review/code-reviewer.md`): a performance
  check pointing at the rule; UX tester runs the workbench `stress` scenario.
- **perf-lab budget**: Conversations-tab switch in `scenario-projects.mjs`
  judged by `compare.mjs`.
