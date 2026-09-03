---
date: 2026-09-01
status: active
type: investigation
topic: The chat view's floating strips coordinate by offset, not z-index — only the reported pair was fixed
---

# Chat floats collide — the second half of the "Jump to bottom" fix

**Reported (Destin, 2026-07-22):** the floating "Jump to bottom" button that appears when
scrolled up overlapped other floating UI — the "Model unloaded" notice, permission prompts.

## What was fixed, what was not

The reported pair is fixed (youcoded `7cecca1a`, PR #260, 2026-07-28): `.jump-to-bottom` now
offsets by a measured `--model-status-height` plus `--queued-strip-height`, so the two bands
stack (queued strip → model-status strip → jump button) instead of sharing one offset.
<!-- claim: {"path": "youcoded/desktop/src/renderer/styles/globals.css", "contains": "instead of jump-to-bottom sharing model-status-strip"} -->

That fix does not generalise: the strips coordinate **by offset, not z-index**, so every
other float in the chat view — attention-classifier toast, permission gates, model-loading
spinners, sync status — is still positioned independently, and any two of them can land on the
same pixels. Nothing has been reported since, so this is a latent audit, not a live repro.

## Next step

Inventory every absolutely/fixed-positioned element inside `ChatView` and decide one rule:
either every bottom float joins the measured-offset stack, or the stack gets a real
`z-index` ladder with a documented order.

## History
Filed 2026-07-22; partially fixed 2026-07-28. Re-verified 2026-09-01.
