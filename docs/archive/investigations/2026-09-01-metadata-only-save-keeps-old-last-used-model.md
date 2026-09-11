---
date: 2026-09-01
status: shipped
type: investigation
topic: chat-data — a metadata-only conversation save (the shape sent after a model swap) never lands the new last-used model, so the record keeps the model from before the swap
---

# A metadata-only save keeps a conversation's OLD last-used model

**History:** added 2026-08-27 (old ROADMAP.md L158). Re-verified against `origin/master` 2026-09-01 — no commit has touched `conversation-store.ts` since the item was filed, and the branch `test/last-used-model-pin` (red repro) still exists on origin; its test file is not on master.

## Symptom

After switching models mid-conversation, the app saves `{ id, provider, lastUsedModel }` with no `lastActive`. The conversation record on disk still shows the model from before the swap.

## Mechanism

`upsert` in `youcoded/desktop/src/main/conversations/conversation-store.ts` (~L270–305) builds an overlay of the caller's fields on top of the existing record and hands both to `mergeRecords`, which ranks the two sides by `lastActive`. A metadata-only save carries `lastActive: EPOCH`, so the incoming side loses wholesale — every overlaid field is discarded.

The store knows this, and re-applies the caller's explicit metadata POST-merge as "local truth" (`projectName`, `originalPath`, `transcriptRef`, and a real `title`). `lastUsedModel` is deliberately excluded from that block: it is put in the merge overlay only, with a comment saying it should compete on activity like a normal field. That is exactly why it never lands — a model swap is not activity, so it always loses.
<!-- claim: {"path": "youcoded/desktop/src/main/conversations/conversation-store.ts", "contains": "this explicit local model must land"} -->

## Correctness batch (2026-09-07, landed 2026-09-08)

Reproduced with real filesystem-store tests in both native and Claude lanes: a model-only update expected model B and read back model A. Explicit local `lastUsedModel` now lands in the post-merge local metadata block. Activity/device values, omitted-model behavior, portable representation and cross-device `mergeRecords` ranking remain unchanged. The service still refuses to seed a model-only record. This fixes the immediate update; historically the next transcript activity could repair the stale model later.

`conversation-store.test.ts` checks the returned record and reopened on-disk store. Both new cases failed before the change; the focused nine-suite chat/store run passed 249 tests afterward, and desktop `scripts/verify.sh` passed. No live app or Android runtime testing. Earlier mechanism/fix-shape sections are historical; keep the roadmap item in-flight (now landed).

## Repro

Branch `test/last-used-model-pin` → `desktop/tests/conversation-store-last-used-model-upsert.test.ts`: expected `claude-opus-4-7`, got `claude-sonnet-4-5` (rescued 2026-08-27 from an untracked file that had sat in the main checkout since 08-16).

## Fix shape

Decide whether last-used model is local truth. If yes (the caller just observed the user pick it — the same argument the block makes for `title`), re-apply it post-merge like `title` and flip that test green. If it must stay activity-coupled, the model-swap caller has to send a real `lastActive` instead — but then a swap on an idle device would outrank a busier device's record, which is what the comment was trying to avoid. Either way, one of the two comments is wrong today.

## Landing

App fixes landed on origin/master as `03faf5e4` on 2026-09-08. Roadmap closures are in shipped.md; historical branch-local descriptions above record pre-landing evidence. No release tag was created.
