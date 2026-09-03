---
date: 2026-09-01
status: active
type: investigation
topic: The per-project artifacts sidecar's version history grows without bound — nothing prunes, coalesces or rotates it
---

# `versions[]` in the artifacts sidecar grows without bound

**Symptom.** `<project>/.youcoded/artifacts.json` only ever grows. The workspace's own copy was
4.4 MB on 2026-08-15, 6.4 MB / 21,311 versions on 2026-08-27. Every save and every listing
parses the whole file, so a long-lived project gets slower to record and to list, and the file
is what made two out-of-memory crashes reachable.

**Mechanism (verified against master 2026-09-01).** `appendVersion` in
`youcoded/desktop/src/main/artifacts/artifact-store.ts` pushes every event onto the record's
`versions[]` with no cap, no eviction and no pruning; the file is pretty-printed
(`JSON.stringify(next, null, 2)`, ~250–300 bytes per event).
<!-- claim: {"path": "youcoded/desktop/src/main/artifacts/artifact-store.ts", "contains": "existing\\.versions\\.push\\(versionEvent\\)"} -->

**What has changed since filing — the cost per save is mitigated, the growth is not.**
- PR #318 (2026-08-15, `0de7b9dd`) queues appends per project and dedupes replays on
  `(sessionId, toolUseId)`.
- PR #335 (2026-08-27, `289b489f`) shares one parsed copy per project across readers and reads
  the CAS timestamp from a 4 KB head probe instead of a full parse.
- The data decisions — drop old events, coalesce by session, or rotate to a second file — are
  "lever 2" of `docs/archive/specs/2026-08-27-paged-history-and-read-hardening-design.md`
  (status `draft`, paused). Capping or compacting changes the sidecar's on-disk contract and
  needs its own migration story; that is why it was not folded into either PR.

Mitigating asymmetry: the discovered-file save path skips the sidecar entirely, so growth only
hits already-tracked files.

**History.** Filed 2026-07-20 (Tier 1 code-editor consequence review, spec §12.8).
