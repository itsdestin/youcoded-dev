---
date: 2026-09-01
status: active
type: investigation
topic: Two independent transcript-event handlers write artifact state with no ordering; a debounced whole-list replacement can orphan a concurrent selection
---

# Nothing sequences the transcript-event handlers that both write artifact state

**Symptom.** The files panel opens but the file the reply just delivered is not selected — the
list shows instead. Cosmetic, never data loss. One instance was fixed on
`feat/send-user-file-card` (a discovered on-disk record whose id was a relative path); the
class remains.

**Mechanism (verified against master 2026-09-01).** Two renderer modules subscribe to the same
`transcript:event` feed: `artifact-tool-use-tracker.ts` records a version, then fires a
debounced `listSession` that dispatches `SESSION_ARTIFACTS_LOADED`; `deliverable-auto-open.ts`
resolves a path and dispatches `ACTIVE_ARTIFACT_SET`. There is no ordering between them.
`SESSION_ARTIFACTS_LOADED` replaces the session's list wholesale in
`youcoded/desktop/src/renderer/state/artifact-tracker.ts`:
<!-- claim: {"path": "youcoded/desktop/src/renderer/state/artifact-tracker.ts", "contains": "case 'SESSION_ARTIFACTS_LOADED':"} -->
so a selection made against a record absent from the replacement list is silently
invalidated, and `SessionDrawer.tsx` (`showList = !active && !activePreview ? true : listOpen`)
then force-opens the list.

**Fix shapes.** Make `SESSION_ARTIFACTS_LOADED` merge rather than replace, or hold the selection
by path rather than by id so a refresh cannot orphan it. Expect more flickers as more surfaces
hang off `transcript:event`.

**History.** Filed 2026-08-25 (whole-branch review of the Deliverables card).
