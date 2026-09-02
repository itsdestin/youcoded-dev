---
date: 2026-09-01
status: active
type: investigation
topic: chat-data — no user-rename path for conversations; every surveyed competitor has one
---

# Rename a conversation

**History:** added 2026-08-31 (old ROADMAP.md L1281). Re-checked 2026-09-01: still no `session:set-name` (or `session:rename`) channel anywhere in `desktop/src` or `app/src`; the only rename traffic is the auto-titler's `session:renamed` event.

## The gap

Conversation names are auto-generated only, and the code says so outright in `youcoded/desktop/src/main/conversations/service.ts` (~L445, next to `noteTitleChanged`, the one sanctioned title writer).
<!-- claim: {"path": "youcoded/desktop/src/main/conversations/service.ts", "contains": "No user-rename path exists for conversations yet"} -->

Verified against published docs 2026-08-31 — 8 of 8 surveyed competitors ship rename: Claude Code (`/rename`, `--name`, Ctrl+R), claude.ai, Codex (`/rename`), opencode (Ctrl+R + `PATCH /session/:id`), Cursor CLI (`/rename`), Pi (`/name`), Hermes (`/title`, `hermes sessions rename`), OpenClaw (click-to-rename).

## Why it matters more than it looks

Tags, notes, pin and hide are things **no** competitor has, so the organizing story is close to a clean sweep of the category — and it is undercut by missing the one thing everybody else ships. It is also the first thing a visitor tries.

## Shape

- A `session:set-name` channel on all five surfaces (ipc-handlers, preload, remote-shim, remote-server WS, `SessionService.kt`).
- An edit affordance in `ResumeBrowser`.
- Decide whether a manual name freezes the auto-titler (it should) — today the topic watcher in `ipc-handlers.ts` writes every auto-title change through `noteTitleChanged`, so without a freeze the next retitle would overwrite the user's name.
- Sync: the name is per-conversation metadata, so it wants the same per-field merge `store-core.ts` `mergeRecords` already gives tags/notes/flags, not the whole-record activity-ranked title rule (two real titles → the busier side wins).
