---
status: draft
---
# Conversation healing: preserve unincorporated evidence

## Scope and verified defect

Plan only in this step. Implementation stays in `youcoded/desktop/src/main/conversations/conversation-store.ts` and `youcoded/desktop/tests/conversation-store.test.ts`; no UI, transcript ancestry, global deletion policy, transport, commits or live-app work.

Verified in `heal()` (lines 181–254): unreadable/unparseable originals fall through to claiming; parsed copies lose their path association; cleanup unlinks all claimed paths, including invalid or wrong-id adopted files and even when no merge ran. Claims use a reusable PID-only destination, so preserving an old claim without changing claim naming would allow a later rename to overwrite it. Identity checks currently omit provider. The existing corrupt-copy test explicitly expects deletion.

## Exact minimal patch

1. **Keep unsuccessful originals untouched.** In the original-copy preflight, distinguish read failure (including transient EACCES/EIO, not labelled corruption), parse rejection (malformed JSON or unsupported/invalid record), and identity mismatch. Skip claiming in all three cases. Require both `record.id === id` and `record.provider === provider`. Use the existing parser unchanged; no new schema policy or diagnostic UI.
2. **Make claims non-reusable.** Replace PID-only claim names with PID plus a fresh UUID nonce for every claim. Preserve the existing `.healing-` marker and original conflict filename prefix so list/discovery still work. Never deliberately reuse an existing destination. Apply the same unique quarantine-rename to pre-existing claims before reading them, rather than adopting someone else's pathname for later unlink. Derive the new name from the original prefix (do not accumulate healing suffixes). Rename failure leaves the source alone and skips that candidate.
3. **Validate the actual claimed bytes.** Preflight is not proof: reread and parse after rename, including recovered claims. Keep `{ path, record }` together only for successfully read, parsed, same-id AND same-provider records. A failed read, parse rejection or mismatch after claim leaves the claimed evidence untouched for subsequent retry/investigation. Never rename it back over a possibly recreated original.
4. **Commit first, clean only incorporated claims.** If the validated set is empty, return without canonical writes or unlinks. Otherwise pass exactly its records into the existing `mutateRecord` / `foldConflictCopies` path, preserving the original-input field merge and copies-only seeding. Only after the awaited canonical commit succeeds, unlink the corresponding validated private paths. On lock timeout/write failure, retain every claim; on unlink failure, leave it retryable. Add a WHY comment explaining that failure to parse/read is not proof of disposable data.
5. **Protect the canonical evidence during heal only.** `mutateRecord` currently converts invalid existing JSON to null. Add a narrowly scoped heal-only strict-existing option, checked against the raw canonical bytes inside the existing locked callback: use `onDisk !== null` so a present empty, unparseable or wrong-id/provider canonical explicitly blocks healing instead of being replaced by copies. The canonical read helper already throws except for ENOENT (confirmed by the requester); preserve that behavior. Simply abort the heal: leave canonical bytes and claims intact without creating another canonical copy, and keep all ordinary setter/upsert semantics unchanged. Only genuinely absent canonical files permit copies-only seeding. Add invalid/empty canonical, wrong identity, and injected canonical-read-error tests asserting no overwrite or claim cleanup.
6. **Preserve live-healer safety and recovery.** Reclaiming an existing claim must not depend on PID liveness or an age cutoff. A concurrent healer that already read it may still commit those bytes under the canonical lock; its later unlink of the old name cannot delete our new private claim. A healer that has not read it gets ENOENT and must not clean it. The next pass can recover retained valid claims; valid healing remains enabled. This patch does not claim to repair destructive behavior in an already-running older binary or defend against arbitrary external writers modifying private nonce paths.

Here “commit succeeds” means the existing locked canonical-write operation has completed successfully; do not introduce a new journal or claim new power-loss durability guarantees for the shared writer.

## Focused tests (real temporary directories; narrow fault spies)

- Replace the corrupt-copy deletion expectation with byte-for-byte original preservation while a valid sibling still merges and is cleaned. Repeat with only invalid copies: no canonical seeded.
- Original wrong id and wrong provider remain unchanged and do not contribute fields.
- Original transient read failure leaves its original name and bytes; remove the fault and verify a later get heals it normally.
- Replace a valid original after its preflight peek but before claim; post-claim malformed/invalid, wrong-id, wrong-provider and transient-read failures retain claimed bytes; valid siblings still merge. Include pre-existing `.healing-<pid>` fixtures. Retry the transient case successfully.
- Retained PID-only claim plus newly recreated original of the same basename: neither overwrites the other; valid contributions survive and invalid evidence stays byte-identical. Assert new claims have distinct nonce paths.
- Deterministic concurrent/reentrant healing: pause one canonical commit, recreate the original, run a second healer, then release. Assert both contributions on disk, no unincorporated evidence deleted, and original-name recreation survives the first healer's cleanup. Exercise recovery of a claim already read by another healer and ENOENT for a healer that has not read it. Use barriers/fault hooks, not sleeps.
- Canonical write/rename failure and existing lock-timeout case: assert claims survive before retry, then verify recovery and cleanup after successful persistence. Assert on-disk canonical contents before successful-claim unlink.
- Keep existing valid fold, copies-only seed, stale-claim recovery, list/get availability, provider-directory isolation and core convergence tests green. Do not change `remove()` or its policy tests.

## Verification and handoff

Baseline run from `youcoded/desktop` on the unchanged app source:

```text
npx vitest run tests/conversation-store.test.ts tests/conversation-store-core.test.ts
✓ tests/conversation-store-core.test.ts (34 tests) 14ms
✓ tests/conversation-store.test.ts (32 tests) 6085ms
Test Files  2 passed (2)
     Tests  66 passed (66)
Duration  6.39s
```

This baseline includes the unsafe corrupt-copy expectation; it is not evidence that the fix exists. After implementation, run the same focused command, demonstrate the new preservation guards fail against the old cleanup/claim behavior in an isolated mutation check, then run `bash scripts/verify.sh` from the workspace root. Read the diff and conduct a focused audit of every heal unlink against its validated input and successful commit. Report exact outputs and any limitations. No Android/IPC changes are planned; no live runtime verification is needed.
