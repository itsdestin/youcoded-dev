---
date: 2026-09-01
status: active
type: investigation
topic: "Last synced" counts sync-loop iterations, not contact with GitHub
---

# "Last synced" counts loop iterations, not contact with the remote

**Symptom.** A device that has been offline for days shows "Synced just now" / "Last synced 2 minutes ago" on the Backup & Sync panel's self row and the Settings row.

**Mechanism.** `youcoded/desktop/src/main/sync-spaces/engine.ts` emits `{type:'synced'}` at the end of every *completed* cycle. Offline is silent by design: an offline `push()` fails, the recovery `pull()`'s fetch fails silently, the retry push fails, `isNetworkFailureStderr` says "benign", nothing throws — and the engine still emits `synced`. `service.ts` turns every `synced` event into `manager.recordSyncSuccess(spaceId, at)`, which stamps `lastSync`. A device offline for three days polls every 120 s and re-stamps recency every cycle. PR #276 surfaced that value on the devices-list self row and corrected the `getSelfLastSyncEpochMs` docstring ("read it as 'sync last ran', not 'sync last succeeded'") rather than the behaviour.

The unconditional emit at the end of the cycle:
<!-- claim: {"path": "youcoded/desktop/src/main/sync-spaces/engine.ts", "contains": "this\\.onEvent\\(\\{ type: 'synced'"} -->

**Two related semantics to close at the same time.**
- `getSelfLastSyncEpochMs` (`service.ts`) takes the **max** across spaces, so one healthy space and two broken ones still reads "just synced".
- Self recency is derived twice with the same rule — `service.getSelfLastSyncEpochMs` and the `lastSyncEpoch` handling in `youcoded/desktop/src/renderer/components/SyncPanel.tsx` — and they agree by coincidence, not construction.

**Fix shape.** Stamp recency only when the cycle actually reached the remote (fetch or push exited 0), so "Last synced" means contact; decide min-vs-max across spaces; derive self recency in one place.

**History.** Added 2026-07-30 (PR #276 whole-branch review). Re-checked 2026-09-01: emit and stamping unchanged, still open.
