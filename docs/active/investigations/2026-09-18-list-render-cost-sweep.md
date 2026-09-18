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

Read-only sweep: code reading only, **nothing measured yet in this session.**
Numbers below are from earlier, cited runs. Measure before/after with
`bash scripts/perf-lab/bg-run.sh --only projects` — `scenario-projects.mjs`
already times the Conversations tab and the Files↔Conversations thrash.

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
