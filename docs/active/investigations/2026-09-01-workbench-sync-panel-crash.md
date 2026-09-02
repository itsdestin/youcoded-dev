---
date: 2026-09-01
status: active
type: investigation
topic: Settings → Backup & Sync takes the whole workbench down — the mock shim has no `sync` namespace and SyncPanel reads `.length` off the catch-all's empty array
---

# Settings → Backup & Sync crashes the workbench to "YouCoded failed to start"

**Symptom.** In `bash scripts/run-workbench.sh`, opening Settings → Backup & Sync throws
`Cannot read properties of undefined (reading 'length')` and the RootErrorBoundary replaces the app
with the full "YouCoded failed to start" screen. Reproduced on a clean master workbench during the
M5 2a session (2026-08-12) — pre-existing, not branch-caused.

**Mechanism (read from source, re-checked 2026-09-01).**
`youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts` still has no `sync` namespace (only
`syncSpaces.*`), so `window.claude.sync.getStatus()` falls through to `withCatchAll`'s proxy, whose
stub answers with an empty array. `[]` is truthy, so the one unguarded status read in
`youcoded/desktop/src/renderer/components/SyncPanel.tsx` dereferences `.length` off `undefined`:
<!-- claim: {"path": "youcoded/desktop/src/renderer/components/SyncPanel.tsx", "contains": "status && status\\.syncedCategories\\.length"} -->
That line is the outlier on its own screen — the neighbouring status reads are `?.`-guarded — so the
product-side hardening is a one-character fix; the real work is a `sync` impl in the shim (and a
`MOCK_ONLY` entry for it).

**Why the rigs did not catch it.** `scripts/workbench-boot-check.mjs` exercises mount only and never
clicks into a Settings sub-panel. The UI review sweep's `settings-backup-sync` plan step accepts
either a dialog *or* a `Retry` button as proof it opened, so an error state passes as covered.

**History.** Filed 2026-08-12 (found while building the permissions screen in the workbench);
re-verified 2026-09-01.
