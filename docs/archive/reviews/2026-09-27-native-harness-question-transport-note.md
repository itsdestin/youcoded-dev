---
status: shipped
---

# D4 implementation preparation — Claude Code question transport

Read-only primary documentation check while A1 implementation runs. Source: https://code.claude.com/docs/en/agent-sdk/user-input#handle-clarifying-questions (fetched this execution session).

The documented Claude Agent SDK response uses the original `questions` array and `answers` keyed by question text; selected values are labels, arrays or comma-joined labels. There is no documented ordered per-question answer field in this response shape. The optional `response` is described as a general freeform reply instead of the structured question list, not a documented duplicate-question identity channel.

Implication for approved D4: request-local UI identities and an ordered native answer representation are justified, but do not send a new native field to the Claude Code lane and assume it is supported. Keep ordinary Claude Code payloads unchanged; actual duplicate-worded Claude Code transport requires separate compatibility evidence. Do not mutate the question wording invisibly merely to invent unique map keys or silently collapse distinct answers. The plan already identifies this limitation as a compatibility checkpoint before completion, not permission to redesign the card.

No production files changed by this investigation. No Claude process was launched or attached; no live state or paid calls were used.
