---
date: 2026-09-01
status: active
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
<!-- claim: {"path": "youcoded/desktop/src/main/conversations/conversation-store.ts", "contains": "competes on activity like a normal field"} -->

## Repro

Branch `test/last-used-model-pin` → `desktop/tests/conversation-store-last-used-model-upsert.test.ts`: expected `claude-opus-4-7`, got `claude-sonnet-4-5` (rescued 2026-08-27 from an untracked file that had sat in the main checkout since 08-16).

## Fix shape

Decide whether last-used model is local truth. If yes (the caller just observed the user pick it — the same argument the block makes for `title`), re-apply it post-merge like `title` and flip that test green. If it must stay activity-coupled, the model-swap caller has to send a real `lastActive` instead — but then a swap on an idle device would outrank a busier device's record, which is what the comment was trying to avoid. Either way, one of the two comments is wrong today.
