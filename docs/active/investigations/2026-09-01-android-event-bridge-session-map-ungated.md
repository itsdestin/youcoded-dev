---
date: 2026-09-01
status: active
type: investigation
topic: Android EventBridge repoints the mobile→Claude session-id map on every hook event, with no gate
---

# Android `EventBridge` maps session ids with no gate

**Symptom.** Risk, not yet observed on a device: after a subagent or tool hook fires, the
Android app can come to believe a conversation belongs to a different Claude Code session id
than the one it started — the poisoning that produced the desktop "wrong transcript replays
into chat" bug (youcoded PR #257).

## Mechanism

`youcoded/app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt:94-98` reads
`mobileSessionId` and `session_id` off every incoming hook payload and unconditionally writes
`sessionIdMap[mobileSessionId] = claudeSessionId`. `hook_event_name` is read into `eventName`
at line 91 but is only consulted later for `PermissionRequest`; there is no `source` check and
no equivalent of desktop's `resolveMappingAction` (`youcoded/desktop/src/main/session-id-mapping.ts`),
whose semantics are: adopt on first sighting, ignore a same-id write, remap only on
`SessionStart`, refuse `startup` on an already-mapped session.
<!-- claim: {"path": "youcoded/app/src/main/kotlin/com/youcoded/app/parser/EventBridge.kt", "contains": "sessionIdMap\\[mobileSessionId\\] = claudeSessionId"} -->

This is strictly looser than desktop's behaviour *before* #257. Exposure differs: Android
also stores `transcript_path` straight off the payload (`EventBridge.kt:101-104`,
`transcriptPathMap`) rather than rebuilding `<slug>/<id>.jsonl` from the map, so the desktop
symptom may not reproduce identically — `getClaudeSessionId()` (line 37) is what the
mapping feeds, and that is the consumer to audit.

## Fix shape
Port `resolveMappingAction`'s four rules into `handleClient` and verify on a device before
assuming parity. Deliberately not ported in #257 because it could not be tested on a phone.

## History
- added 2026-07-26 (old ROADMAP L573), found while fixing the desktop wrong-transcript bug.
  Re-checked 2026-09-01: the only commit on `EventBridge.kt` since then (`54f68cab`, dead
  `closeSocket` removal) does not touch the mapping; lines 94-98 are unchanged.
