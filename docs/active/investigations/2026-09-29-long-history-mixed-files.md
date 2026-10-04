---
title: Long histories, concurrent activity and session Files switching
status: active
date: 2026-09-29
---

# Long-history mixed activity and Session Files

User approved the six-role mixed workload on long histories and switching with the session Files panel open. No commits, publishing or production-app interaction. Source and fixture work remains in performance-history-audit.

## Completed coverage

Six native conversations each have 200 completed seed turns / 400 authored messages, about 30,000 characters of deterministic short prose/code/diffs. At least 240 authored message rows are loaded through real history paging in each chat before measurement; many offscreen bodies are folded, so this is NOT 240 fully rendered bodies per pane. Three sessions stream 1,500 deltas each at 50/sec, two execute actual private Bash/Node tools, and one is idle. All original event identities/body hashes and measured outputs/results are checked.

Panel-open condition opens the actual session Files drawer on stream-1 and tool-1. Each has two different role-named project files. Repeated switching checks correct files/session/project association, preserved open state on return, and closed state for the other sessions. Panel width is intentionally part of this condition; it is not a matched chat-width comparison.

## Product defect reproduced and fixed

A pinned conversation could stop ~289px above its actual bottom after content grew and then shrank. Scroll anchoring changed scrollTop during the shrink; ChatView's existing content ResizeObserver only corrected growth. The sticky flag remained true, hiding Jump-to-bottom while the latest tool acknowledgment/card were below the viewport.

Retained fix in ChatView: re-pin on either direction of actual content-height change ONLY while bottom-stick is active. No polling, new scroll listener or per-token layout read. User wheel/touch/Find escape remains intact. Mounted regression was red before the fix; focused 36 tests plus types passed after it. Independent source review found no blocker. Full desktop verification passed (`scratch/long-history-bottom-full-verify.log`). Detailed causal setter sequence and packages: `scratch/long-history-bottom-arrival-fix.md`.

## Matched current-build closed/open results

Both parent runs used official build dirty `91a1e4abb6c8`, built `2026-09-29T07:07:55.725Z`, in private real-display instances with a temporary idle/sleep inhibitor. No tests/builds overlapped timing.

| Condition | Report | 12 mixed switch click→rAF proxies (ms) | Renderer tasks ≥50ms |
|---|---|---|---|
| Session Files open on stream-1/tool-1 | `scratch/perf-lab/mixed-bottom-files-open-1.json` | 17,14,13,13,10,8,18,16,17,9,8,8 | 0 |
| All Session Files closed | `scratch/perf-lab/mixed-bottom-files-closed-1.json` | 20,13,13,10,10,8,17,17,16,8,9,8 | 0 |

Both reports are measured with no validity reasons: all target histories and files states passed, exact streams/tools passed, final results/card viewport gates passed, and all six owned sessions/app stopped. IPC maxima 12ms open / 10ms closed. Callback cadence during workload was 166.9/s open / 167.3/s closed; these are rAF observations, NOT displayed frame rates. One successful pair does not establish that opening Files improves speed, only that this tested condition did not show an added large stall.

Parent inspected the open stream-1 and tool-1 screenshots: correct Session Files rows, final stream marker, tool acknowledgement and completed command card are visible above the composer. Automated arrival checks intersect the containing timeline row/card with the scroller; they do not independently prove precise marker glyph visibility or first presented frame. Parent screenshot review supplements them after timing.

Final scoped fixture/controller review found no blocker. Parent reran mixed-diagnostics/history-files/activity/provider tests successfully (`scratch/mixed-history-final-unit-tests.log`). Real-renderer Find acceptance after the product fix passed (`scratch/perf-lab/long-bottom-find-acceptance.json`): 1,020 loaded entries, exact Turn 3250 result stable, visible and uncovered. Native OS dragging, Android motion and first displayed-frame timing are not validated here.

## Excluded attempts and unresolved limits

- Original 200-turn realistic large-body seeds were ~1MB each. The private custom provider has an assumed 32,768-token context; the app correctly refused before any HTTP request. Normal compaction could not fit that already-oversized plain-message seed either. No guard was bypassed and no source history silently trimmed. The bounded-body profile above is separate; million-character history+streaming remains unmeasured with this provider setup.
- An early parser included the JSONL metadata header as an event and incorrectly reported seed integrity false. It was fixed; retained transcript reconstruction found prefixes intact.
- Earlier long runs degraded from normal rAF cadence to ~1Hz as conversations resumed, before producers/paging. They had responsive IPC and little renderer CPU work. A complete browser scheduling trace did not identify the underlying Chromium/XWayland cause. Bringing the private page forward and an idle inhibitor did not consistently fix it. Those runs are not accepted latency baselines. Later normal-cadence runs above do NOT prove the bottom-arrival fix caused that scheduling change; the low-cadence cause remains open.
- Earlier screenshots stayed on old history. The rig now uses real Jump-to-bottom after timing and waits for actual final marker/card and bottom position; it does not change scrolling during timed switches. This stronger check exposed the actual growth/shrink product defect above.
- Moderate bounded history bodies, paced tools rather than repeated expensive tool churn, stock Midnight, six roles, short cycles only. Heavy themes, sustained native resize, real remote/mobile devices and long soak remain separate work.
