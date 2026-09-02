---
date: 2026-09-01
status: active
type: investigation
topic: The buddy window's chat forces one layout reflow per streamed token — twin of the ChatView defect fixed in perf cycle 1
---

# Buddy-window chat reflows the document once per streamed token

**Symptom.** While a buddy window is open and a reply is streaming, every token costs a forced
layout. Same shape as the main-chat defect ("N2") fixed in perf cycle 1 on 2026-08-27; this
twin was left in place on purpose. Ranked Tier 2 on 2026-08-31.

## Mechanism (re-checked 2026-09-01)

`youcoded/desktop/src/renderer/components/buddy/BubbleFeed.tsx` pins the feed to the bottom
with an effect whose dependency list includes `state.lastActivityAt`, which the reducer
re-stamps on every delta; the effect then calls `scrollToBottom`, which reads `scrollHeight`
right after the commit — one forced document layout per token.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/buddy/BubbleFeed.tsx", "contains": "state\\.timeline\\.length, state\\.lastActivityAt"} -->

Why it was not fixed with ChatView:
1. the perf rig measures no buddy window (cycle-1 handoff §7, coverage gap), so a change here
   would ship without a KEEP measurement;
2. unlike `ChatView.tsx`, `BubbleFeed.tsx` has **no** `ResizeObserver` on its content wrapper
   (0 matches today) to take over re-pinning — dropping the timestamp dep alone would stop
   auto-scroll during streaming.

**Fix shape.** Port ChatView's `contentRef` ResizeObserver (the "Watch the content wrapper's
size" effect in `youcoded/desktop/src/renderer/components/ChatView.tsx`), then drop the
timestamp dep; guard mirrors `youcoded/desktop/tests/chatview-scroll-pin-deps.test.tsx`.
Measure once the rig has a buddy-window scenario.

## History
Added 2026-08-27 (old ROADMAP.md L435), found while fixing N2 in ChatView. Re-verified
2026-09-01: four commits touched `BubbleFeed.tsx` since (paged history, background Bash card)
but the scroll-pin effect and its `lastActivityAt` dependency are unchanged (now ~line 391).
