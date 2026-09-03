---
date: 2026-09-01
status: active
type: investigation
topic: Buddy chat's input bar never consults the PTY gate — a typed message can land in a live Ink menu
---

# Buddy chat's input bar bypasses the "menu is open" send gate

**Symptom.** A message typed in the buddy window while a permission prompt, AskUserQuestion or
plan menu is live in Claude Code goes straight to the terminal, and its trailing Enter confirms
whatever option is highlighted. Same class as youcoded#110, which the gate on the main input
bar was built to close. Found by the permission-ask-timeout final review, 2026-07-31. Ranked
Tier 2 on 2026-08-31.

## Mechanism (re-checked 2026-09-01)

`youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx` renders the shared input bar
with only a session id and `compact` — no `getSessionState`, `onSendBlocked`, or `onToast`.
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/buddy/BuddyChat.tsx", "contains": "<InputBar sessionId=\\{viewedSession\\} compact />"} -->

`InputBar.sendMessage` (`youcoded/desktop/src/renderer/components/InputBar.tsx`, ~line 347)
resolves the session through `getSessionState?.(sessionId)`; with the prop absent the whole
guarded block — refusal, toast, and the "Send anyway" affordance — never executes, so the
text reaches the PTY unchecked.

Pre-existing and untouched by the timeout branch, but that branch makes `awaiting-approval`
states long-lived (a 2 h hold instead of a 5-min expiry), which widens the window this is
exposed in.

**Fix.** Wire the three props from the buddy window's state. The harder question is what the
refusal UI should look like in a 320 px-wide overlay.

## History
Added 2026-07-31 (old ROADMAP.md L529; path corrected 2026-08-12). Re-verified 2026-09-01:
`BuddyChat.tsx` has had no commits since 2026-04-21; the bare `<InputBar>` is unchanged
(line 178).
