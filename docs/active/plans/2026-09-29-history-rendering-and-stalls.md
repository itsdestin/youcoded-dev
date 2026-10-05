---
title: Hidden-history rendering and intermittent switch/resize stalls
status: active
date: 2026-09-29
---

# Paused renderer experiments — not accepted fixes

This implementation attempt was interrupted, then Destin requested a pause, documentation cleanup and merge of verified fixes. These renderer experiments are preserved separately, not accepted into the integration source. Current status and restart authority: `docs/active/investigations/2026-09-29-performance-status.md`. The earlier continuous-investigation/no-shipping instructions below describe that historical phase; the later merge authorization does not establish performance acceptance for unfinished candidates.

## Preserved comparison and fresh diagnosis

Before any new product edit, copied current package to `scratch/perf-lab/history-render-before-app` with its own stamp; asarSHA256 `ba61863669c1e86cbc73a044509565c95dc9abc953b7980f740162fe56649145`, dirty `91a1e4abb6c8`. No upstream rebase.

- `history-input-before-1.json`: complete unprofiled current-build input baseline, control long tasks122/145ms, worst key dispatch122.7ms; streaming input later had no long tasks.
- `history-input-before-profile-1.json` and `scratch/history-input-before-profile-analysis.log`: sampled hidden-history tasks140/170ms; ReactMarkdown87/111ms inclusive, parse46/51ms, run35/53ms. Grammar registration appears under processor freeze in both tasks. Profiled numbers are not before/after benchmarks.
- `switch-current-causal-profile-1.json`: four current-build switch profiles collected; no ≥50ms tasks. Resize21/21/23/20ms; switch11–15ms by existing action clock. These sampled switch timings are diagnostic, not a clean baseline. Earlier sporadic slow runs remain unexplained.

## Smallest first experiment

Every ReactMarkdown creates a processor; rehype-highlight creates a lowlight registry and registers common grammars per attachment. Reuse one lazily initialized, synchronous highlight transform for all existing Markdown modes. Keep parser, AST ownership, other plugins, HTML/security policy, visual components and publication timing unchanged. No task batching, worker, placeholder or history truncation in this experiment.

1. Red test pins highlighter initialization across multiple cold mounts; real output-equivalence tests cover languages, alternating modes, unknown language and existing streaming/security fixtures.
2. Build once in isolated worktree; matched serial before/after input runs with same fixture, plus full-content/immediate switch, settled switch, Find and concurrent histories/Files checks. Reject if work is merely moved or content lost. Accept only observed improvement; residual tasks must remain explicitly unresolved.
3. If residual history cost is still substantial, reprofile remaining stacks before expanding architecture.
4. For intermittent mixed switching/resize, capture causal CPU samples in an opt-in bounded diagnostic lane with per-task timing, retaining normal nonprofiled controls. No guessed app fix from one slow run or incomplete trace.
5. Independent review, desktop verification and relevant cross-platform checks after retained app edits. All reports, including failures, stay preserved; no commits/pushes.

## Progress / measured next cause

- Lazy shared-highlighter implementation passed130 Markdown tests,9 chat-reference tests and types; scoped source review cleared registry ownership/output safety. First unprofiled candidate `history-input-shared-after-1.json` still has98/106ms hidden tasks versus122/145ms before; no completion claim. Preserved shared-only package `scratch/perf-lab/history-shared-only-app`, asar `b11ed8bf896b56e7edfe76264a5c8db3f340464ffd4060e7e512f3b4c887a8f6`.
- Residual profile `history-input-shared-profile-1.json` contains parse/run work and~20ms sampled scrollHeight/reflow stacks. Hidden physical-scroll gating was implemented and measured once with91/91ms residual tasks. Review then removed a redundant added activation pin and fenced queued observer delivery against committed visibility;37 focused tests passed. Runtime activation/Find acceptance after those corrections was not completed. Candidate is paused, not a shipped fix.
- Added reviewed opt-in `--cpu-profile on` to existing mixed runner, requiring protocol logging off. Bounded task records are drained with takeRecords; explicit renderer.phase excludes trailing teardown. `history-shared-mixed-cpu-1.json` is a complete diagnostic with23≥50ms tasks inside the mixed interval,12,793 CPU samples and~2.23ms clock-anchor half-bracket uncertainty. Task sample weights are elapsed sampling intervals, NOT pure CPU time. Stacks repeatedly enter micromark/ReactMarkdown while simple long replies stream; some samples remain unattributed/program/GC.
- Direct plain-paragraph JSX shortcut was rejected/reverted when existing streaming tests caught DOM identity replacement. Revised experiment stays INSIDE the existing ReactMarkdown pipeline: a remark parser attacher returns an equivalent positioned mdast only for provably literal paragraphs (including safe soft line breaks); uncertain syntax/links/filepaths delegate to the original parser. The fixture emits newline-terminated records, not single source lines. No change to component identity, rich-text behavior, content completeness or scheduling; real differential AST/DOM tests precede measurement.
- Revised literal parser passed143 focused tests/types and source review. One sampled mixed run dropped23→0 long tasks and the identified remark-parse stack disappeared; this is narrow fixture evidence, not repeated unprofiled acceptance. An offline ordinary-punctuation proposal was not integrated. Candidate is paused.
- Cooperative first-page mdast preparation was implemented experimentally (not off-thread and not full highlighted-HAST preparation). Initial175 focused tests/types preceded corrections for actual chunk sources, global memory budgets/serialized preparation and test-only API removal. The worker was interrupted during that repair round; final review, build and runtime acceptance were not completed. Preserve existing loading behavior/full page, measure initial content availability and immediate activation, and prove cancellation/ownership/memory bounds before restoring. The rejected partial-DOM approach stays rejected.
