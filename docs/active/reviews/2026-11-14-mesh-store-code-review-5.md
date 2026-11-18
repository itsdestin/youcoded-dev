---
status: active
date: 2026-11-14
topic: mesh chat store, fifth independent code review (IN PROGRESS: machine rebooted mid-review, scratch lost, rebuilding)
---

# Mesh store review 5 (in progress)

Nothing established yet beyond: store last changed at 54e70f4b6; scratch folder was wiped by a reboot; harness being rebuilt. This file is updated as results land.

## Established so far (RAN)
- Own virtual disk (per-file unsynced-write log with random surviving subsequences = cross-file reordering and in-place reverts; global unsynced directory-operation log with per-directory prefix survival = directory-entry loss and rename-not-atomic-with-content) plus own generator and oracle, rebuilt after the reboot.
- 300 seeds with every offline fault kind except whole-folder rollback, plus up to three nested crashes inside repair: zero violations. Whole-folder rollback of one chat: silent loss in every sequence (see findings).

## Run log 2 (RAN, before a second scratch wipe)
- 32,000 seeds (2001-34000) with my fuzz, all offline fault kinds except whole-folder rollback, up to 3 nested crashes inside repair. After fixing three oracle mistakes of my own (an eviction that crashed half way; checking lines the store had not actually evicted; counting a typed read error on evicted-region lines as silence), the re-run of seeds 2001-6000 left ONLY cases with 2 or more offline faults (see below), and no crash-only or single-fault case.
- Single-fault runs that looked like bugs (seeds 7812, 23318, 32425) were my oracle skipping lines 0-4 after an "evict 5" that the store had rightly not applied (chunk boundary), so a body flip there went unnoticed and was later reported by the store as damage: store correct.
- Multi-fault leftovers worth a look (cannot tell excused from real without minimal repros; not reduced before the wipe): seed 4671 (zero body A, delete body B, truncrec index: later a different-bytes append at an acked position answered ok, and WRONG-BYTES line 37), seed 5844 (truncrec body, truncrec index, swap checkpoint+replaced-index: HEAD-HASH-WRONG lines=9), seed 2947 (swap checkpoint/meta, delete FORMAT, truncate index, 3 crashes in repair: 19 lines unserved with head=3, 5 lines with no copy anywhere).
