---
id: 71
title: Helpers: permissions, reports, cost and leftover records
stage: planning
priority: P2
tags: native-harness, specialists, desktop, performance, bug
branch: 71-helpers-permissions-reports-and-cost
roadmap: native-harness: Helpers: permissions, reports and cost — 4 things.
created: 2026-10-15
summary: Helpers can run commands without asking, reports always interrupt, each start costs full price, and finished helpers leave chat records behind.
area: Chat
side: both
platform: Desktop only
vision: chat.steer.specialists, agents.added.helpers
---
Progress
Done: nothing recorded.
Next: not decided.
Blocked: nothing recorded.

See also #137: 71's unreadable amber 'Needs you' label on pale themes is one instance of 137's fixed-amber warning text that vanishes on pale themes.

Chats

From the old roadmap (native-harness › specialists, status confirmed, seen on desktop, last checked 2026-09-05)
Helpers: permissions, reports and cost — 4 things. (a) In Auto-edit, a hired helper runs any shell command not on the always-ask list with no prompt, though the main assistant would ask; direction (2026-09-16): helpers ask whenever the main assistant would, at the cost of more prompts. Destin chose to leave it for now. (b) A finished helper's report should be able to arrive quietly, read with your next message, unless the assistant asked to be woken; needs a default decided. (c) Helpers pay full price for their opening each time; investigate starting from the main conversation's stored opening (likely to be dropped). (d) The amber "Needs you" label in the helpers popup is nearly unreadable on the three pale themes (1.52:1, 1.41:1, 1.19:1 against 4.5:1).

Merged in #73 "Clean up leftover helper chat records"
Progress
Done: nothing recorded.
Next: not decided.
Blocked: yes — the old roadmap marked it blocked; see below.

Chats

From the old roadmap (native-harness › specialists, status blocked, seen on desktop, last checked 2026-09-01)
Helper (specialist) transcripts pile up in the sessions folder forever — no way to delete one, and closing the parent conversation leaves its helpers' files behind. Blocked on a general delete-conversation feature, which does not exist yet Destin 2026-10-05 triage (roadmap-triage-2026-10-05#17): postponed with the delete-a-conversation feature it waits on; no longer a 1.3.1 item
