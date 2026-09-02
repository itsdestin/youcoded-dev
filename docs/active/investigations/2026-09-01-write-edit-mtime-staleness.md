---
date: 2026-09-01
status: active
type: investigation
topic: Write and Edit detect outside changes by mtime, which both false-positives (touch/checkout) and false-negatives (same-second edits)
---

# Write/Edit staleness check is mtime, not content

**Symptom.** The native Write and Edit tools refuse to change a file that was "modified since you read
it" — but the check is a modification-time comparison, so a `touch` or a git checkout with unchanged
bytes wrongly rejects the edit, and on filesystems with coarse clock resolution a real outside edit
in the same second is missed.

## Mechanism (re-checked against master 2026-09-01, `f2d229e4`)

Both `youcoded/desktop/src/main/harness/tools/write.ts` and `tools/edit.ts` compare
`fs.statSync(abs).mtimeMs` against the mtime recorded in `ctx.readRegistry` at read time. They were
made consistent with each other in the 2026-08-10 harness-tool-honesty work (Write previously had no
freshness check at all — `docs/archive/investigations/2026-08-10-review-claims-verified.md` claim 2).
The 2026-08-27/28 polish batches (`12145f64`, `31675ba6`, `c008a069`) reworded the gate's message and
did not change the primitive.
<!-- claim: {"path": "youcoded/desktop/src/main/harness/tools/write.ts", "contains": "exists && fs\\.statSync\\(abs\\)\\.mtimeMs !== readMtime"} -->

## Fix shape

Content hash. Two real precedents (`docs/archive/investigations/2026-08-10-harness-mutation-safety-prior-art.md`
§1): Gemini CLI's Edit hashes with SHA-256 at read time and compares before applying; OpenCode V2's
`FileMutation.writeIfUnchanged` does a raw byte comparison under a per-path mutex. **Move both tools
together**, never one at a time — the in-code WHY comment in `write.ts` says the same and flags this as
deferred-not-forgotten. Re-archive the mutation-safety doc once this ships.

History: filed 2026-08-10. Re-verified 2026-09-01.
