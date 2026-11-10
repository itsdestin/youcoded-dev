---
status: draft
date: 2026-09-09
---
# Checked conflict handling — design checkpoint

Authority: approved safety-first existing-behavior answers. This is not implementation-ready; no product transport changes yet.

## Confirmed failures

Scratch validation (results-final.log) proves failed checkout can publish marker text, stage-3 probe failure can publish deletion, stage-2 read failure can omit the local conflict copy. Local bytes may remain in Git history. Next-cycle staging after a partial failure must be part of any fix.

## Required core

- Check unfinished merge state before `add -A` in BOTH pull and push. Read failure is not absence. MERGE_HEAD with zero unmerged entries is still an unfinished merge.
- Enumerate `ls-files --unmerged -z` successfully; parse mode/OID/stage/path at first tab with NUL boundaries. Only successful enumeration establishes absent stages.
- Read present stage blobs byte-faithfully with checked errors; never null on operational failure. Read all versions before mutations. Handle empty blobs independently of absence.
- Preserve remote canonical/local named copy behavior, modify/delete conflicts, binary bytes and legitimate unrelated-first-setup merges.
- Check each exclusive conflict-copy allocation/write/add, canonical checkout/add/rm, no-unmerged state and final commit. Use literal pathspec handling; paths beginning dash and pathspec metacharacters are data.
- Non-conflict merge failure must surface original cause; never commit merely because conflict enumeration returned empty.
- A failed operation must leave a retry-safe state. No blind abort/reset over editor writes. Repair cannot discard unfinished-resolution evidence.

## Review concern to resolve before building

Reviewer proposed a durable merge fence and blocking exceptional types/unfinished work. A permanent fence with no safe retry/recovery path would regress reliability and existing conflict handling; do not implement it as the final behavior. Need a small journaled resolution state machine or equivalent checked in-place resume that can establish what is already preserved/applied, capture subsequent edits, and clear the fence only after verified completion. Do not guess success from MERGE_HEAD absence. Fence placement outside replaceable sync.git must survive repair/restart.

Regular/executable files, symlinks and directory/file conflicts need explicit compatibility tests, not silent conversion to regular files. Cross-process transaction lock is separate from arbitrary external-editor safety. Compare/check alone is not atomic replacement; do not claim it is. Keep preserved bytes recoverable on any uncertainty.

## Test sequence for eventual implementation

1. Convert scratch fault cases to red regression assertions, including second pull and direct push after failure.
2. Test failed stage enumeration/read, empty blobs, checkout-success/add-failure, copy collision and final-commit failure.
3. Test interruption before/after each durable boundary across fresh transport instances.
4. Test successful resumed convergence without duplicate-copy explosion or published conflict markers.
5. Test pending merge corruption never enters destructive repair.
6. Retain real two-device binary, modify/delete, unrelated-setup, unusual paths and mode parity contract cases.

No automatic erasure, global tombstones or new UI controls authorized. If automatic reconciliation cannot establish safe intent, preserve evidence and use reviewed existing error presentation; any new recovery decision UI needs its own deck.
