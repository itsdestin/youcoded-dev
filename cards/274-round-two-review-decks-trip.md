---
id: 274
title: Round-two review decks trip the secrets scan
stage: explore
tags: dev-workspace
branch: 274-round-two-review-decks-trip
finish: A deck whose key ends in -2, -3… pushes without a hand-written .gitleaksignore entry, while real secrets in decks are still caught.
created: 2026-11-18
why: Card #236, 2026-11-18: gitleaks' generic-api-key rule flagged the deck's own name 'claude-sign-in-expiry-questions-2' (its "key" field, in the .json and the built .html) and blocked the backup push until two fingerprints were added to .gitleaksignore. Every later round of any deck can hit the same false alarm.
---
Progress
Done: nothing yet.
Next: plan it.
Blocked: nothing.

Chats
