---
status: active
date: 2026-09-09
---

# Sync UI mockup checkpoint

Stopped at parent's request for an immediate stable checkpoint. No production UI copy edits yet; no backend edits or commits by this specialist.

## Changed

- `youcoded/desktop/src/renderer/dev/workbench/mock-shim.ts`: opt-in `?syncReview=conflict` returns an existing-shape conflict event instead of the default error. No new IPC or backend fields. Default scenario unchanged.
- `scripts/ui-review/plans/sync-safety.json`: one focused real-renderer capture opening Settings → Backup & Sync, with explicit dialog expectation and measurement. Uses `child=1`, avoiding the outer workbench iframe.

## Before evidence

Command:

`YOUCODED_PORT_OFFSET=174 UI_REVIEW_PLANS=sync-safety UI_REVIEW_JOBS=2 bash scripts/ui-review/run-review.sh "$PWD/youcoded" "$PWD/scratch/sync-safety-before" midnight,halftone-dimension`

The pipeline reused the existing isolated :5347 workbench. `scratch/sync-safety-before/coverage.md` reports:

> 1 covered · 0 partial · 0 missed (of 1 planned surfaces; themes: midnight, halftone-dimension)

Read the midnight screenshot: panel genuinely open, healthy fixture plus the existing incorrect orange conflict sentence visible. It still says the OTHER device's copy was preserved. This is a useful BEFORE, not an approved design or backend-success proof. Halftone capture exists but has not received visual readback by this specialist.

Captures: `scratch/sync-safety-before/shots-sync-safety/{midnight,halftone-dimension}/settings-backup-sync.png`.

## Verification

Ran from `youcoded/desktop`:

`npx vitest run tests/workbench-mock-contract.test.ts tests/workbench-channels.test.ts`

Actual output:

```
✓ tests/workbench-channels.test.ts (23 tests) 21ms
✓ tests/workbench-mock-contract.test.ts (14 tests) 91ms
Test Files  2 passed (2)
Tests  37 passed (37)
Duration  1.18s
```

Warnings: Vite native-config-loader compatibility notice; Node localStorage unavailable without a storage file. Read the surviving fixture diff with `git diff -- src/renderer/dev/workbench/mock-shim.ts`.

## Not yet done / continuation

No AFTER, deck spec, deck preview, UI tests, phone/empty/stress/latency captures or full verify.sh run. No claim of UI completion. Fresh UX tester remains parent's gate. The requested immediate checkpoint interrupted implementation, not a confirmed code blocker. Background BashOutput is unavailable to this specialist; reports were read from filesystem instead.

Small next slice: correct both conflict sentences in SyncPanel, using event-device-relative local-copy language; capture info area BEFORE before adding pause/retention/stop explanation. Never describe last-good retention/in-flight cancellation as implemented. Source locations: SyncPanel.tsx lines 31–80 explainer, 1240–1244 conflict notice. Info button selector: `[aria-label='What is this?']`. Broad excluded-file/status/import work explicitly deferred by parent.
