---
date: 2026-09-01
status: active
type: investigation
topic: chat-data — "Welcome back" resume-on-startup, rebuilt on the Conversation Store; blocked on one design decision (device scoping)
---

# Resume-on-startup ("Welcome back") — rebuild on the Conversation Store

**History:** added 2026-07-24 (old ROADMAP.md L1060, from a branch audit; milestone TBD, Destin's call). Originally specced 2026-05-01 (`docs/archive/specs/2026-05-01-resume-active-sessions-on-startup-design.md`). Re-checked 2026-09-01: nothing has been built; the pieces named below all still exist on master.

## The want

On cold start, if YouCoded had sessions live in the strip when it last shut down — window close, crash, OS kill, anything that was not an explicit per-session X — show a "Welcome back" screen listing them with per-session checkboxes, a one-click Resume-all, and a Start-fresh escape. The UX in Task 6 of the archived plan is still the intended shape.

## The dead attempt — do NOT revive its architecture

`feat/resume-on-startup` (3 commits, Tasks 1–2 of 10, never PR'd, deleted 2026-07-24) persisted a second JSON file at `~/.claude/youcoded-active-sessions.json`. That predates the Conversation Store: master's records already carry a superset of its fields (`title`, `lastActive`, `projectName`, `originalPath`, `transcriptRef`, `device`, `lastUsedModel`) plus flags, convergent merges, healing and sync. Reviving it means a second unsynced source of truth for conversation activity, and it is provider-blind — post-M2 a resume needs to know `'claude'` vs `'native'` and, for native, a model binding (`nativeHost.resume(id, cwd, binding)`). The archived plan carries a SUPERSEDED banner explaining this.

## What is actually missing on master is small

A durable *"this was open in the strip at shutdown"* marker. That is session-set membership, not conversation metadata, and `youcoded/desktop/src/main/conversations/store-core.ts` already has the per-flag CRDT shape for it (`FlagState` + `setFlag`).
<!-- claim: {"path": "youcoded/desktop/src/main/conversations/store-core.ts", "contains": "export interface FlagState"} -->

Sketch: set the flag on first turn, clear it on explicit X-close, leave it alone on quit/crash; at startup list flagged records and hand them to the existing provider-aware resume path, which already handles leases, takeover and the native model picker. Reuse `session-browser.ts`'s live-session exclusion rather than reinventing it.

## The decision that blocks it — device scoping

Conversation records SYNC, so a naive boolean flag means the sessions left open on the Z13 pop up as a "Welcome back" screen on the Mac. The flag needs to key on the per-INSTALL `getDeviceIdentity(userData)` id — NOT the per-machine one (`youcoded/docs/conversations.md` → leases, and the "Do NOT swap the lease id" invariant). Same family as the v1.3.1 cross-device native resume deferral. Destin decides the scoping (and the milestone) before anyone builds.
