---
status: shipped
date: 2026-10-06
---

# Custom voice vocabulary — UI review

Destin approved the short route: build a focused UI preview, review it, then connect the speech backend after approval. Scope is desktop vocabulary hints, not forced text replacements. Mock saves are in-memory only and do not change recordings.

## Change ledger

| Number | Change | Rule it locks in | Decision |
|---|---|---|---|
| 1 | Settings → Voice vocabulary below Sound | G-1: existing SettingRow; desktop-only entry | Not retained: S-1 feedback disliked a full Settings card |
| 2 | One phrase per line, count/status and Save | G-1/G-4: shared Textarea/Dialog and one primary; no growing DOM list | Replaced: S-2 requested chips |
| 3 | Microphone right-click → Vocabulary… menu | Existing menu primitives; normal mic click keeps recording behavior | Not retained: S-3 feedback says the menu is ugly |
| 4 | Individual removable chips plus an Add field | Shared primitives; bounded rendering for large vocabularies | Approved: review-2 S-4 and L-5 |
| 6 | Microphone right-click directly opens the chip editor | No intermediate menu; recording click remains unchanged | Approved: review-3 L-6 |

The first review's submitted feedback lives in `voice-custom-vocabulary.review.answers.json`. Destin selected microphone right-click only for the next round; no Sound-settings section and no new Settings menu card. The original deck is preserved unchanged.

The example hints in the workbench are sample data, not automatic defaults. Vocabulary editing uses an Add field and removable chips, not a multiline text box. Production get/save and per-recording speech integration are now implemented; only the workbench continues to simulate saving/recognition. Final checks and native evidence: `docs/archive/reviews/2026-10-06-voice-vocabulary-final.md`. Merged to app master in [youcoded#610](https://github.com/itsdestin/youcoded/pull/610), commit `47db5f4da6dfd73e3c00514128a5ca72963242bd`. Desktop and Android CI passed; no installer release or running-app replacement was performed.

## Backend boundary

See `docs/archive/investigations/2026-10-06-voice-custom-vocabulary.md`. Matching original NVIDIA tokenizer bytes are now bundled with attribution/checksum verification. Conservative native boosting was tested independently of UI approval; tested complete names improved, controls stayed intact, and empty lists keep the original greedy behavior. Exact spelling/casing and every accent are not guaranteed.
