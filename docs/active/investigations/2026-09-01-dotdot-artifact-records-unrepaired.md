---
date: 2026-09-01
status: active
type: investigation
topic: Artifact records whose path escapes the project root with `..` are refused at every resolution site and never repaired
---

# Records that escaped the project root with `..` are refused, never repaired

**Symptom.** A file the agent wrote outside the project via a `../` path shows up in the files
list but is permanently unopenable — refused as an orphan on every platform, with no repair.

**Mechanism (verified against master 2026-09-01).** Older records for such writes hold a
relative `absolutePath`. The 2026-08-12 relative-path repair
(`youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts`) deliberately leaves any
path containing a `..` segment external rather than folding it, so `migrateRelativeExternals`
never touches those records and all five refusal sites keep orphaning them:
<!-- claim: {"path": "youcoded/desktop/src/shared/artifacts/resolve-tracked-path.ts", "contains": "if \\(!fwdPath\\.split\\('/'\\)\\.includes\\('\\.\\.'\\)\\)"} -->

The refusal is pinned by `youcoded/desktop/tests/migrate-relative-externals.test.ts`
("leaves a .. escape external"), the rename guard in `tests/artifacts/artifact-store.test.ts`,
`write-authorization.test.ts` and `projects-index.test.ts`. Those records are also why the
`renameArtifact` guard is permanently load-bearing rather than transitional.

**Why it is not the easy fix it reads as (triage 2026-08-22, still true).** The fold cannot live
in the harness tool's `resolveP` (different layer, no record in scope). A real repair either
adds a `resolveRecordedPath` helper beside `isAbsoluteRecorded` in `write-authorization.ts`
(all five refusal sites convert through it) or, better, drops the `..` exclusion above so
escapees classify external with a folded absolute path and the existing migration repairs
them. Either way: update the pinning tests; avoid silent over-reclassification; a fold landing
outside any project root re-arms the exact escape the `mustStayInRoot=false` externals path was
guarded against; the sidecar never syncs, so a desktop repair leaves other devices damaged; and
Android has only the guard half (`ProjectManager.kt`), no `resolveTrackedPath` /
`migrateRelativeExternals` twin — a third implementation. Design pass first.

**History.** Filed 2026-08-13 (scope cut of the relative-path fix). Re-verified 2026-08-22 and
2026-09-01; no commits to the resolver or the authorizer since 2026-08-13.
