---
status: active
date: 2026-09-08
---

# Session naming pre-UI design review

Read-only review of the draft policy; not the required post-contract technical design review. Reviewer: fresh specialist. The parent triaged the five findings below. No backend claims are approved by this review.

- P1 accepted — Mode changes had no explicit existing-session policy. Draft now preserves names and rejects bulk generation for inactive history. The exact next eligible AI review when enabled late remains a technical design decision, not a hidden UI promise.
- P2 accepted — Manual ownership must be independent of text equality. UI worker brief now requires saving unchanged text to establish ownership, rejecting blank names, and a separate return-to-automatic action that respects global Off.
- P3 accepted — Cadence origin was ambiguous. Draft and UI brief now state replies 1, 3, 28, 53. Persistence, replay deduplication, interrupted/retried replies and enable-later behavior remain explicit required technical design coverage.
- P4 accepted — Separate-provider disclosure was missing. AI explainer brief now covers conversation excerpts and provider allowance/charges. Draft excludes tool dumps, hidden reasoning and specialist-only content; precise context bounds belong in the backend design.
- P5 accepted — Legacy ownership cannot be inferred from title text. Draft explicitly prohibits destructive guessing and requires a conservative compatibility rule before a cross-device protection claim. No migration or guessed provenance has been implemented.

All five findings are reflected in the in-flight draft or the UI worker brief. Any remaining user-visible decisions must appear in the visual review/contract; compatibility limits must be explicit before backend implementation.
