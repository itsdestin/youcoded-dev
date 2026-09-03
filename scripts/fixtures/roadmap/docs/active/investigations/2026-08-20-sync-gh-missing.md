---
date: 2026-08-20
status: active
type: investigation
topic: Sync setup spins forever when gh is missing
---

# Sync setup spins forever when gh is missing

The setup step shells out to `gh auth status` and waits on a promise that never settles
when the binary is absent.

`sync-service.ts` awaits `gh auth status` with no timeout.
<!-- claim: {"path": "youcoded/desktop/src/main/sync-service.ts", "contains": "execFile\\('gh', \\['auth', 'status'\\]"} -->
